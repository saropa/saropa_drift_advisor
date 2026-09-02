# BUG: Host discovery manifest is not removed on deactivation, leaving agents pointed at a dead port

**Status: Open**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Extension
File: `extension/src/extension-bootstrap.ts` (line ~209)
Severity: UX

---

## Summary

The extension writes a HOST discovery manifest to
`~/.saropa_drift_advisor/server.json` so an external agent (CLI, `curl`, Claude
Code) can find the adb-forwarded server without port scanning. It registers a
disposable whose stated purpose is to remove that file on deactivation — but the
disposable calls an `async` function with `void`, and `deactivate()` returns
`void` rather than the pending promise, so VS Code has nothing to await. The
manifest routinely survives the session and advertises a `host:port` that is no
longer forwarded.

---

## Attribution Evidence

Manifest writing/removal is TypeScript-only; the in-app Dart manifest is a
separate concern with its own pid-checked removal.

```bash
# Positive — the fire-and-forget removal on the deactivation path
grep -n "removeHostManifest" extension/src/extension-bootstrap.ts
# 14:import { removeHostManifest, writeHostManifest } from './host-discovery-manifest';
# 202:        void removeHostManifest({ log: (msg) => gatedConnectionLog.appendLine(msg) });
# 212:      void removeHostManifest({ log: (msg) => gatedConnectionLog.appendLine(msg) });

# The stated intent, immediately above line 212:
sed -n '208,215p' extension/src/extension-bootstrap.ts
#   // Remove the host manifest on deactivation so it does not outlive the session
#   // and point an agent at a server that is no longer forwarded.
#   context.subscriptions.push({
#     dispose: () => {
#       void removeHostManifest({ log: (msg) => gatedConnectionLog.appendLine(msg) });
#     },
#   });

# Positive — deactivate() returns void, so nothing is awaited
grep -n "export function deactivate" -A 3 extension/src/extension-main.ts
# 291:export function deactivate(): void {
# 292:  return;
# 293:}

# Positive — the removal really is async (two filesystem awaits before the unlink)
grep -n "export async function removeHostManifest" -A 12 extension/src/host-discovery-manifest.ts
# 224:export async function removeHostManifest(deps: ManifestDeps = {}): Promise<void> {
# 229:    const existing = await readManifest(path, readFile);   <-- await #1 (fs.readFile)
# 230:    if (existing === null || isAppOwned(existing)) return;
# 233:    await unlink(path);                                    <-- await #2 (fs.unlink)
```

**Emit site(s) — list ALL:**
- `extension/src/extension-bootstrap.ts:212` (the `void`-ed removal inside a
  synchronous `dispose`)
- `extension/src/extension-main.ts:291` (`deactivate()` returns `void`, so the
  host cannot wait for it)
- `extension/src/host-discovery-manifest.ts:224` (`removeHostManifest` needs two
  filesystem round-trips before the file is gone)

**Diagnostic `source` / `owner` as seen in Problems panel:** n/a — runtime behavior.

---

## Environment

- OS: any; most visible on Windows/macOS where `~` / `%USERPROFILE%` persists
  between VS Code sessions
- VS Code version: any
- Extension version: 4.2.5
- Dart SDK version: any
- Flutter SDK version: any
- Database type and version: SQLite (any)
- Connection method: adb-forward (device/emulator) — the case the host manifest
  exists to serve
- Relevant non-default settings: none
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Start a Flutter app on a device/emulator with `DriftDebugServer.start()`.
2. Let the extension discover it and establish `adb forward tcp:8642 tcp:8642`.
   Confirm the manifest was written — the connection log shows
   `Host manifest written: …/.saropa_drift_advisor/server.json (port 8642, transport adb-forward).`
3. Close VS Code (or run **Developer: Reload Window**).
4. Stop the app and run `adb forward --remove-all` so port 8642 is genuinely
   dead.
5. Read the manifest:
   ```bash
   cat ~/.saropa_drift_advisor/server.json
   ```

Intermittent by construction — it is a race between the unlink and extension-host
teardown. On a window reload the host is torn down promptly and the file survives
most attempts; on a clean quit the unlink occasionally wins.

---

## Expected Behavior

Deactivation removes the extension-owned manifest before the host finishes
tearing down, as the comment at `extension-bootstrap.ts:208-209` promises. An
agent reading the file after the session either finds no file, or finds one that
still describes a reachable server.

---

## Actual Behavior

`dispose()` starts `removeHostManifest()` and returns immediately. The function
then needs two filesystem round-trips (`readFile` for the ownership check, then
`unlink`) before the file is gone. VS Code disposes subscriptions and then calls
`deactivate()`, which returns `void` — the host is told the extension is done and
may terminate the extension host before either await settles.

The manifest is left on disk containing:

```json
{
  "host": "127.0.0.1",
  "port": 8642,
  "source": "vscode-extension",
  "transport": "adb-forward",
  "startedAt": "2026-09-02T…",
  "version": "4.2.5",
  "writeEnabled": true
}
```

An agent that trusts this file connects to a port with no listener and no adb
forward. That is not fatal — `host-discovery-manifest.ts:220-222` correctly
argues a stale manifest is "harmless: a probing client gets connection-refused on
the dead port and moves on" — but it defeats the file's entire purpose, which is
to let an agent *skip* probing. The agent's most likely reading of a refused
connection on an explicitly advertised port is "the server crashed", not "the
manifest is stale".

The same `void`-ed call at line 202 (fired when discovery drops to zero servers)
is NOT affected: there the extension host stays alive, so the promise completes.
Only the deactivation path is broken.

---

## Error Output

### VS Code Developer Tools Console

Nothing.

### Extension Output Channel

The `Host manifest removed: …` line that `removeHostManifest` emits on success is
absent — the channel is already disposed by then, so even when the unlink does
land there is no record either way.

### Terminal / Command Output

```bash
$ cat ~/.saropa_drift_advisor/server.json     # after VS Code has exited
{ "host": "127.0.0.1", "port": 8642, "source": "vscode-extension", ... }
$ curl -s -m 2 http://127.0.0.1:8642/api/health ; echo "exit=$?"
exit=7          # connection refused — the advertised server does not exist
```

### Stack Traces

None — no exception; the promise is simply abandoned.

---

## Duplicate-Emission Check

Two manifest writers exist and they are deliberately distinct:

- Dart (`lib/src/`): `_writeDiscoveryManifest` / `_removeDiscoveryManifest` in
  `lib/src/drift_debug_server_io.dart` — the **in-app** manifest, removed
  synchronously in `stop()` under a pid check. Not affected by this bug.
- TypeScript (`extension/src/`): `writeHostManifest` / `removeHostManifest` —
  the **host** manifest, stamped `source: "vscode-extension"`. This is the
  affected one.

They share a path, and the `source` ownership guard
(`host-discovery-manifest.ts:141-143`) keeps them from deleting each other, so
only the TypeScript path needs to change.

---

## Screenshots / Recordings

n/a — the `cat` + `curl` pair above is the artifact.

---

## Minimal Reproducible Example

```bash
# 1. Connect the extension to a device-hosted server; confirm the file exists:
cat ~/.saropa_drift_advisor/server.json
# 2. Quit VS Code.
# 3. The file is still there, advertising a port that is no longer forwarded:
cat ~/.saropa_drift_advisor/server.json
```

---

## What I Already Tried

- [x] Confirmed `removeHostManifest` itself is correct — it reads, checks
      ownership, unlinks, and swallows failures. The bug is purely that nobody
      waits for it.
- [x] Confirmed the ownership guard means a fix cannot accidentally delete an
      app-owned manifest, so making the removal reliable is safe.
- [x] Checked the in-session removal at line 202 — that one completes, because
      the extension host is still running. Only deactivation is affected.
- [x] Read `extension/src/test/host-discovery-manifest.test.ts` — it covers
      `buildHostManifest`, the app-owned skip, and write/remove in isolation, but
      nothing exercises the deactivation wiring.

---

## Regression Info

- Last working version: never worked — the disposable has been fire-and-forget
  since the host manifest was introduced (Finding 1 / Enhancement E1+E3 of
  `BUG_agent_discovery_and_resilience_for_device_hosted_server.md`).
- First broken version: the release that added `writeHostManifest`.
- What changed: n/a.

---

## Root Cause

`vscode.Disposable.dispose()` is synchronous by contract, so async cleanup
registered there is unobservable by the host. The only hook VS Code awaits is
`deactivate()`, which may return a `Thenable` — and this extension's
`deactivate()` returns `void`.

Fix sketch — move the async cleanup to `deactivate()` and return the promise:

```ts
// extension-bootstrap.ts — hand the cleanup work to activate()'s caller instead
// of burying it in a synchronous dispose(). Disposable.dispose() is sync by
// contract, so a promise started there is abandoned when the extension host
// tears down; deactivate() is the only hook VS Code awaits.
export interface ExtensionBootstrapResult {
  …
  /** Async teardown VS Code must await — see deactivate(). */
  finalize: () => Promise<void>;
}

// …in bootstrapExtension:
const finalize = async (): Promise<void> => {
  await removeHostManifest({ log: (msg) => gatedConnectionLog.appendLine(msg) });
};
```

```ts
// extension-main.ts
let _finalize: (() => Promise<void>) | undefined;   // assigned in phase 1

/**
 * Returning the promise is load-bearing: VS Code awaits a Thenable from
 * deactivate(), which is the only point at which async cleanup (removing the
 * host discovery manifest so it cannot outlive the forwarded port) is
 * guaranteed to finish before the extension host exits.
 */
export function deactivate(): Thenable<void> | void {
  return _finalize?.();
}
```

Belt and braces worth considering in the same change: readers should treat a
manifest whose port refuses a connection as stale rather than as a crashed
server. No `deactivate()` hook can cover the crash case, and the file already
carries `startedAt` to support an age check.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: external agents and CLI users relying on the host manifest —
  the device-hosted (adb-forward) workflow the file was built for.
- What is blocked: agent auto-discovery degrades to a confusing failure. The
  agent connects to an advertised port, is refused, and has no signal
  distinguishing "manifest is stale" from "server crashed".
- Data risk: none — the file carries no credentials (`authToken` is not among
  `HEALTH_PASSTHROUGH_KEYS`).
- Frequency: most window reloads and most VS Code quits while a manifest exists.
