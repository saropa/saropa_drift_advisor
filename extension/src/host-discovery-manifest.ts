/**
 * Host-side discovery manifest writer.
 *
 * The in-app server writes its discovery manifest
 * (`~/.saropa_drift_advisor/server.json`) using the *device's* filesystem,
 * pid, and port. When the app runs on a physical device / emulator that file
 * lands on the device and never appears on the developer's host, so an external
 * host agent (a CLI, a `curl` client, Claude Code) cannot find the server — it
 * has to port-scan or run `adb forward` by hand.
 *
 * This module closes that gap from the host side: once the extension confirms a
 * Drift server is reachable on host loopback (after its own `adb forward`), it
 * writes a HOST manifest with the host-reachable port and `transport`. An agent
 * then reads one well-known file and connects, no scanning or manual forward.
 *
 * Schema: mirrors the in-app manifest keys so a reader parses ONE format, plus
 * two host-only fields:
 *   - `source: "vscode-extension"` — marks the file as extension-owned so we
 *     only ever overwrite / delete our own manifest, never an app-written one.
 *   - `transport: "adb-forward" | "loopback"` — how the host reaches the port.
 *
 * See Finding 1 / Enhancement E1+E3 in
 * plans/history/2026.06/2026.06.24/BUG_agent_discovery_and_resilience_for_device_hosted_server.md.
 */
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { fetchWithTimeout, HEALTH_PROBE_TIMEOUT_MS } from './transport/fetch-utils';

/** Directory under the user's home that holds the discovery manifest. */
export const DISCOVERY_DIR_NAME = '.saropa_drift_advisor';
/** Manifest filename inside [DISCOVERY_DIR_NAME]. */
export const DISCOVERY_FILE_NAME = 'server.json';

/**
 * `source` value stamped on manifests this extension writes. Used as the
 * ownership guard: the writer refuses to overwrite, and the remover refuses to
 * delete, any manifest whose `source` is not this value — that file belongs to
 * an in-app (desktop/emulator-on-host) server that is authoritative for its own
 * path. Without this guard the extension would clobber a same-machine app's own
 * reachable manifest.
 */
export const MANIFEST_SOURCE_EXTENSION = 'vscode-extension';

/** How the host reaches the advertised port. */
export type ManifestTransport = 'adb-forward' | 'loopback';

/** Outcome of [writeHostManifest], surfaced for logging/tests. */
export type WriteManifestResult =
  | 'written'
  | 'skipped-app-owned'
  | 'failed';

/**
 * Injectable IO + environment so unit tests never touch the real disk, network,
 * or home directory. All optional; production callers pass nothing and get the
 * real `fs`/`fetch`/`os.homedir` implementations.
 */
export interface ManifestDeps {
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, data: string) => Promise<void>;
  mkdir?: (dir: string) => Promise<void>;
  unlink?: (path: string) => Promise<void>;
  /** Returns the parsed `/api/health` body, or undefined when unreachable. */
  fetchHealth?: (host: string, port: number) => Promise<Record<string, unknown> | undefined>;
  /** Overrides the resolved home directory. */
  home?: string;
  log?: (msg: string) => void;
}

/** Absolute path of the discovery manifest under the (optionally overridden) home dir. */
export function hostManifestPath(home?: string): string {
  return join(home ?? homedir(), DISCOVERY_DIR_NAME, DISCOVERY_FILE_NAME);
}

/** Health fields copied verbatim into the manifest when present on the payload. */
const HEALTH_PASSTHROUGH_KEYS = [
  'version',
  'schemaVersion',
  'writeEnabled',
  'loopbackOnly',
  'capabilities',
  'endpoints',
] as const;

/**
 * Builds the host manifest object. Pure (no IO): copies a known subset of the
 * `/api/health` payload so the file carries the same version/flags an agent
 * would get from the endpoint, then stamps the host-only fields.
 */
export function buildHostManifest(input: {
  host: string;
  port: number;
  transport: ManifestTransport;
  health?: Record<string, unknown>;
  writtenAtIso: string;
}): Record<string, unknown> {
  const manifest: Record<string, unknown> = {
    host: input.host,
    port: input.port,
    source: MANIFEST_SOURCE_EXTENSION,
    transport: input.transport,
    startedAt: input.writtenAtIso,
  };
  const health = input.health;
  if (health) {
    for (const key of HEALTH_PASSTHROUGH_KEYS) {
      if (health[key] !== undefined) {
        manifest[key] = health[key];
      }
    }
  }
  return manifest;
}

/** Reads + parses the manifest at [path], or null when absent / unparseable. */
async function readManifest(
  path: string,
  readFile: (p: string) => Promise<string>,
): Promise<Record<string, unknown> | null> {
  let raw: string;
  try {
    raw = await readFile(path);
  } catch {
    // Absent file is the normal device-hosted case; treat as "no manifest".
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    // A corrupt/non-JSON file is not app-owned in any meaningful sense; the
    // caller may overwrite it.
    return null;
  }
}

/** True when [manifest] was written by an in-app server (not this extension). */
function isAppOwned(manifest: Record<string, unknown> | null): boolean {
  return manifest !== null && manifest.source !== MANIFEST_SOURCE_EXTENSION;
}

/** Default health probe: GET /api/health, parsed, undefined on any failure. */
async function defaultFetchHealth(
  host: string,
  port: number,
): Promise<Record<string, unknown> | undefined> {
  try {
    const resp = await fetchWithTimeout(`http://${host}:${port}/api/health`, {
      timeoutMs: HEALTH_PROBE_TIMEOUT_MS,
    });
    if (!resp.ok) return undefined;
    const body: unknown = await resp.json();
    return typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Writes the host discovery manifest for a server reachable at [host]:[port].
 *
 * Refuses to overwrite an app-owned manifest (one without our `source` stamp):
 * on the same-machine desktop/emulator case the in-app server already wrote a
 * reachable manifest at this path and owns it. Best-effort throughout — a disk
 * or permission failure is logged and swallowed so it never breaks the
 * extension. The health payload is fetched best-effort to enrich the file;
 * absence of health still produces a valid (host, port, transport) manifest.
 *
 * @param writtenAtIso — ISO timestamp; injected (not `new Date()` inline) so
 *   tests are deterministic.
 */
export async function writeHostManifest(
  host: string,
  port: number,
  transport: ManifestTransport,
  writtenAtIso: string,
  deps: ManifestDeps = {},
): Promise<WriteManifestResult> {
  const path = hostManifestPath(deps.home);
  const readFile = deps.readFile ?? ((p) => fs.readFile(p, 'utf8'));
  const writeFile = deps.writeFile ?? ((p, d) => fs.writeFile(p, d, 'utf8'));
  const mkdir = deps.mkdir ?? (async (d) => { await fs.mkdir(d, { recursive: true }); });
  const fetchHealth = deps.fetchHealth ?? defaultFetchHealth;

  try {
    const existing = await readManifest(path, readFile);
    if (isAppOwned(existing)) {
      // The in-app server owns this path (desktop/emulator-on-host). Leaving it
      // untouched preserves the authoritative manifest the app maintains.
      deps.log?.(
        `Host manifest left untouched — an in-app server owns ${path}; ` +
          'not overwriting with an extension manifest.',
      );
      return 'skipped-app-owned';
    }
    const health = await fetchHealth(host, port);
    const manifest = buildHostManifest({ host, port, transport, health, writtenAtIso });
    await mkdir(join(deps.home ?? homedir(), DISCOVERY_DIR_NAME));
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
    deps.log?.(
      `Host manifest written: ${path} (port ${port}, transport ${transport}).`,
    );
    return 'written';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log?.(`Host manifest write failed (ignored): ${msg}`);
    return 'failed';
  }
}

/**
 * Removes the host discovery manifest, but only when it carries this
 * extension's `source` stamp. An app-owned manifest is left in place so a
 * still-running same-machine server keeps advertising itself. Best-effort: a
 * missing file or delete failure is swallowed (a stale manifest is harmless —
 * a probing client gets connection-refused on the dead port and moves on).
 */
export async function removeHostManifest(deps: ManifestDeps = {}): Promise<void> {
  const path = hostManifestPath(deps.home);
  const readFile = deps.readFile ?? ((p) => fs.readFile(p, 'utf8'));
  const unlink = deps.unlink ?? ((p) => fs.unlink(p));
  try {
    const existing = await readManifest(path, readFile);
    if (existing === null || isAppOwned(existing)) {
      return;
    }
    await unlink(path);
    deps.log?.(`Host manifest removed: ${path}.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log?.(`Host manifest remove failed (ignored): ${msg}`);
  }
}
