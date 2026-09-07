# BUG: ServerManager keeps a dead server active when the replacement QuickPick is dismissed, leaving the client pointed at a port that is gone

**Status: Open**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Extension
File: `extension/src/server-manager.ts` (line ~163)
Severity: UX

---

## Summary

When the active server dies and two or more alternatives remain,
`_onServersChanged` fires `void this.selectServer()` and returns without
touching `_activeServer`. If the user dismisses the QuickPick (Esc, or clicking
away — the common reaction to an unexpected dialog), `_activeServer` keeps
pointing at the **dead** server and `DriftApiClient` is never reconfigured.
Discovery has already removed that port, so no further `onDidChangeServers`
event fires and nothing ever corrects it: the status bar reads
`Drift: N servers`, `driftViewer.serverConnected` stays `true`, and every API
call goes to a port with nothing listening until the user manually re-runs
**Select Server**.

---

## Attribution Evidence

Server selection is TypeScript-only.

```bash
# Positive — the un-cleared active server lives here
grep -n "_onServersChanged" -A 30 extension/src/server-manager.ts
# 152:  private _onServersChanged(servers: IServerInfo[]): void {
# 163:    if (this._activeServer && !activeStillAlive) {
# 166:      if (servers.length === 1) {
# 167:        this._setActive(servers[0]);
# 168:      } else if (servers.length > 1) {
# 169:        void this.selectServer();        <-- fire-and-forget; _activeServer untouched
# 170:      } else {
# 171:        this._setActive(undefined);      <-- only the zero-server branch clears it
# 172:      }
# 173:      return;
# 174:    }

grep -n "showQuickPick" -A 6 extension/src/server-manager.ts
# 129:      const picked = await vscode.window.showQuickPick(items, {
# 130:        placeHolder: 'Select a Drift debug server',
# 131:      });
# 132:      if (picked) {
# 133:        this._setActive(picked.server);   <-- no else branch for dismissal
# 134:      }

# Negative — no server-selection logic in the Dart tree
grep -rn "ServerManager" lib/src/
# Expected: 0 matches
```

**Emit site(s) — list ALL:**
- `extension/src/server-manager.ts:169` (fire-and-forget `selectServer()` that
  leaves the dead server active)
- `extension/src/server-manager.ts:132-134` (`showQuickPick` with no dismissal
  branch)

**Diagnostic `source` / `owner` as seen in Problems panel:** n/a — runtime behavior.

---

## Environment

- OS: any
- VS Code version: any
- Extension version: 4.2.5
- Dart SDK version: any
- Flutter SDK version: any
- Database type and version: SQLite (any)
- Connection method: HTTP discovery
- Relevant non-default settings: none — a default port range of 8642–8649
  already allows three concurrent servers
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Start three apps with Drift debug servers on ports 8642, 8643 and 8644.
2. Let discovery find all three. The QuickPick appears (initial multi-server
   case) — pick `:8642`. Status bar shows `Drift: 3 servers`, active `:8642`.
3. Stop the app on **8642** (the active one).
4. Within ~20 s (two missed polls at the 10 s connected interval) discovery drops
   8642 and fires `onDidChangeServers` with `[8643, 8644]`.
5. The "Select a Drift debug server" QuickPick appears. **Press Esc.**
6. Open the Database tree and click refresh; run any command that hits the API.

Deterministic — 10 out of 10 when the QuickPick is dismissed.

---

## Expected Behavior

Dismissing the replacement prompt must not leave the extension pointed at a
server that is provably gone. Either:

- clear the active server (`_setActive(undefined)`) so the UI honestly shows
  disconnected and the user can pick when ready; or
- auto-adopt the first survivor and say so in the connection log, leaving
  **Select Server** available to change it.

Whichever is chosen, `_activeServer` must never name a port discovery has
already removed.

---

## Actual Behavior

`_activeServer` still holds `{ port: 8642, … }` and `_client._baseUrl` is still
`http://127.0.0.1:8642`. Downstream:

- `updateStatusBar` takes the `active && count > 1` branch and renders
  `$(database) Drift: 2 servers`, tooltip `Active: :8642 (2 servers found)` —
  naming a port that no longer exists.
- `isDriftUiConnected` returns `true` (`serverManager.activeServer !== undefined`),
  so `ConnectionStateMachine` computes `connected`/`connecting` and pushes
  `driftViewer.serverConnected = true`. Every sidebar action stays enabled.
- Every API call fails with `ECONNREFUSED` until the `sql`/`schema`/… circuit
  breakers trip open, after which they fail instantly with
  "Circuit breaker is open — server unreachable, request suppressed".
- `ConnectionTelemetry` records no flap, because the phase never left
  `connected` — so the session's own instrumentation under-reports the outage.

Crucially, **the state never self-corrects**: `updateServersFromScan` sets
`changed` only on an add, a removal, or a state transition. With 8643/8644
steady and 8642 already removed, no further event fires. The user must notice
the failures and run **Select Server** by hand.

---

## Error Output

### VS Code Developer Tools Console

Nothing.

### Extension Output Channel

```
[…] Discovery: Scan #21 complete — server(s) on port(s): 8643, 8644
[…] Discovery: State: connected → connected
```

No line recording that the active server died and was not replaced — the
`setLog` sink only reports `Selected server :N`, which never runs on the
dismissal path.

### Terminal / Command Output

n/a

### Stack Traces

Only downstream ones, e.g. `Error: fetch failed` / `CircuitBreakerOpenError`
from whichever command the user runs next.

---

## Duplicate-Emission Check

Single language path. `grep -rn "ServerManager" lib/src/` returns nothing.

---

## Screenshots / Recordings

A recording is the ideal artifact here (timing-dependent multi-step
interaction): kill the active server, Esc the QuickPick, then show the status
bar still claiming a connection while a tree refresh fails.

---

## Minimal Reproducible Example

Two servers suffice — `servers.length > 1` is the only condition:

1. Servers on 8642 and 8643; adopt 8642.
2. Kill 8642, dismiss the QuickPick.
3. `activeServer.port` is still 8642 while `servers` is `[8643]`.

```ts
// The invariant that is violated, expressed as an assertion:
assert(manager.servers.some((s) => s.port === manager.activeServer?.port));
```

---

## What I Already Tried

- [x] Confirmed the zero-server branch (`servers.length === 0`) DOES call
      `_setActive(undefined)` — the gap is specific to the 2+ branch.
- [x] Confirmed the single-survivor branch auto-switches correctly, so only the
      multi-survivor + dismissal combination is affected.
- [x] Checked whether a later scan repairs it — `updateServersFromScan` returns
      `changed: false` for a steady list, so no repair event is emitted.
- [x] Read `extension/src/test/server-manager.test.ts` — it covers
      `'should auto-switch when active dies and 1 remains'` and
      `'should guard against concurrent QuickPick when several servers appear'`,
      but has **no** case for "active dies, 2+ remain, user dismisses", which is
      why this survived.

---

## Regression Info

- Last working version: never — the branch has always returned without clearing.
- First broken version: the release that introduced the 4-case state machine in
  `_onServersChanged`.
- What changed: n/a.

---

## Root Cause

`_onServersChanged` treats "asked the user" as equivalent to "resolved the
state". `selectServer()` is fired with `void`, so its outcome — including the
`undefined` that `showQuickPick` returns on dismissal — is discarded, and the
stale `_activeServer` is left as the fallback.

Fix sketch:

```ts
if (this._activeServer && !activeStillAlive) {
  if (servers.length === 1) {
    this._setActive(servers[0]);
  } else if (servers.length > 1) {
    // Clear FIRST, then prompt. The dead port must not stay active while the
    // QuickPick is open (or after the user dismisses it): discovery has already
    // removed it, no further onDidChangeServers will fire for a steady list, so
    // nothing would ever correct the stale selection and every API call would
    // keep going to a port with nothing listening.
    this._setActive(undefined);
    void this.selectServer();
  } else {
    this._setActive(undefined);
  }
  return;
}
```

Clearing before prompting also makes the UI honest while the dialog is open, and
`selectServer()`'s single-server branch still auto-picks if the list shrinks
further while the dialog is up. If the "one prompt only" behavior matters,
consider also logging one connection line on dismissal
(`this._log?.('Replacement server not chosen — disconnected')`) so the Output
channel records the decision.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: anyone running more than one Drift server at a time —
  app + integration tests, two flavors of the same app, or a device plus a
  desktop build.
- What is blocked: every server-backed feature, silently. The status bar and
  every `when: driftViewer.serverConnected` affordance claim a live connection
  that does not exist, so the user has no signal pointing at the real cause.
- Data risk: none — reads and writes both simply fail to connect.
- Frequency: every time the active server dies with 2+ alternatives and the user
  dismisses the prompt.
