/**
 * Port scanning and health validation for server discovery.
 */

import { fetchWithTimeout, HEALTH_PROBE_TIMEOUT_MS } from './transport/fetch-utils';

/**
 * Check /api/health and validate schema metadata for a single host:port.
 * Returns true if the server is a valid Drift debug server.
 */
export async function checkHealth(
  host: string,
  port: number,
  logLine?: (msg: string) => void,
): Promise<boolean> {
  try {
    const resp = await fetchWithTimeout(`http://${host}:${port}/api/health`, {
      timeoutMs: HEALTH_PROBE_TIMEOUT_MS,
    });
    const body = (await resp.json()) as { ok?: boolean };
    if (body?.ok !== true) {
      logLine?.(`Port ${port}: health responded but ok=${body?.ok}`);
      return false;
    }
    return validateServer(host, port, logLine);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('ECONNREFUSED')) {
      logLine?.(`Port ${port}: ${msg}`);
    }
    return false;
  }
}

/**
 * Secondary validation: confirm /api/schema/metadata returns expected shape.
 */
export async function validateServer(
  host: string,
  port: number,
  logLine?: (msg: string) => void,
): Promise<boolean> {
  try {
    const resp = await fetchWithTimeout(
      `http://${host}:${port}/api/schema/metadata`,
      { timeoutMs: HEALTH_PROBE_TIMEOUT_MS },
    );
    const data: unknown = await resp.json();
    const tables = Array.isArray(data)
      ? data
      : (data as Record<string, unknown>)?.tables;
    if (!Array.isArray(tables)) {
      logLine?.(`Port ${port}: schema/metadata returned unexpected shape (${typeof data})`);
      return false;
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logLine?.(`Port ${port}: schema/metadata validation failed: ${msg}`);
    return false;
  }
}

export interface ScanPortsConfig {
  host: string;
  portRangeStart: number;
  portRangeEnd: number;
  additionalPorts?: number[];
}

/**
 * Scan configured ports and return list of ports where a Drift server responded.
 */
export async function scanPorts(
  config: ScanPortsConfig,
  logLine?: (msg: string) => void,
): Promise<number[]> {
  const { host, portRangeStart, portRangeEnd, additionalPorts } = config;
  const portSet = new Set<number>();
  for (let p = portRangeStart; p <= portRangeEnd; p++) {
    portSet.add(p);
  }
  if (additionalPorts) {
    for (const p of additionalPorts) portSet.add(p);
  }
  const ports = [...portSet];
  const extra = ports.length - (portRangeEnd - portRangeStart + 1);
  logLine?.(
    `Scanning ${ports.length} port${ports.length === 1 ? '' : 's'} on ${host} (${portRangeStart}-${portRangeEnd}${extra > 0 ? ` +${extra} remembered` : ''})`,
  );

  const results = await Promise.allSettled(
    ports.map((port) => checkHealth(host, port, logLine)),
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
