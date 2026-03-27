/**
 * Port scanning and health validation for server discovery.
 *
 * Probes must send the same [Authorization] header as [DriftApiClient] when the
 * debug server is configured with Bearer auth; otherwise every request returns
 * 401 and discovery stays empty while the browser UI still works.
 *
 * Validation uses GET `/api/health` only. A second `/api/schema/metadata` probe
 * used to run PRAGMA/COUNT work per open port and saturated SQLite; Saropa
 * servers always expose `version` on the health payload for identification.
 */

import { fetchWithTimeout, HEALTH_PROBE_TIMEOUT_MS } from './transport/fetch-utils';

/** Optional fetch init shared by discovery probes (e.g. Bearer token). */
function probeInit(authHeaders?: Record<string, string>): {
  timeoutMs: number;
  headers?: Record<string, string>;
} {
  return {
    timeoutMs: HEALTH_PROBE_TIMEOUT_MS,
    ...(authHeaders ? { headers: authHeaders } : {}),
  };
}

/**
 * Confirms JSON from `/api/health` is a Saropa Drift debug server response.
 * Requires `ok: true` and a non-empty `version` string (package semver).
 */
export function isValidDriftHealthPayload(body: unknown): boolean {
  if (body === null || typeof body !== 'object') {
    return false;
  }
  const b = body as Record<string, unknown>;
  if (b.ok !== true) {
    return false;
  }
  return typeof b.version === 'string' && b.version.length > 0;
}

/**
 * Check /api/health for a single host:port.
 * Returns true if the server is a valid Drift debug server.
 */
export async function checkHealth(
  host: string,
  port: number,
  logLine?: (msg: string) => void,
  authHeaders?: Record<string, string>,
): Promise<boolean> {
  try {
    const resp = await fetchWithTimeout(
      `http://${host}:${port}/api/health`,
      probeInit(authHeaders),
    );
    if (!resp.ok) {
      logLine?.(`Port ${port}: health HTTP ${resp.status}`);
      return false;
    }
    const body: unknown = await resp.json();
    if (!isValidDriftHealthPayload(body)) {
      const b = body as Record<string, unknown> | null;
      logLine?.(
        `Port ${port}: health response not a Saropa Drift server (ok=${b?.ok}, version=${typeof b?.version})`,
      );
      return false;
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Both 'ECONNREFUSED' (direct) and 'fetch failed' (Node undici wrapper
    // for connection-refused) are expected for ports with no server running.
    // Only log genuinely unexpected errors to avoid log noise.
    if (!msg.includes('ECONNREFUSED') && !msg.includes('fetch failed')) {
      logLine?.(`Port ${port}: ${msg}`);
    }
    return false;
  }
}

export interface ScanPortsConfig {
  host: string;
  portRangeStart: number;
  portRangeEnd: number;
  additionalPorts?: number[];
  /** Same headers as [DriftApiClient] when the server requires Bearer auth. */
  authHeaders?: Record<string, string>;
}

/**
 * Scan configured ports and return list of ports where a Drift server responded.
 */
export async function scanPorts(
  config: ScanPortsConfig,
  logLine?: (msg: string) => void,
): Promise<number[]> {
  const { host, portRangeStart, portRangeEnd, additionalPorts, authHeaders } =
    config;
  const portSet = new Set<number>();
  for (let p = portRangeStart; p <= portRangeEnd; p++) {
    portSet.add(p);
  }
  if (additionalPorts) {
    for (const p of additionalPorts) portSet.add(p);
  }
  const ports = [...portSet];

  const results = await Promise.allSettled(
    ports.map((port) => checkHealth(host, port, logLine, authHeaders)),
  );

  const alive: number[] = [];
  for (let i = 0; i < ports.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      alive.push(ports[i]);
    }
  }
  if (alive.length > 0) {
    logLine?.(`Found servers on ports: ${alive.join(', ')}`);
  }
  return alive;
}
