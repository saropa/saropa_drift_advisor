# Bug Report

## Title

The "Drift debug server detected on port 8642" information toast re-fires on every wireless-debugging reconnect (every 1–few minutes on a flaky link), instead of the intended once-per-session, because `tryAdbForwardAndRetry` calls `discovery.retry()` which resets the once-per-session de-dup latch.

## Environment

- OS: Windows 11 Pro 10.0.22631 x64
- VS Code version: 1.126.0
- Extension version: saropa_drift_advisor ext-v4.1.14 (pubspec 4.1.14)
- Dart-Code (Dart/Flutter) extension: 3.136.1
- Dart SDK version: bundled with Flutter at `D:\tools\flutter\bin\cache\dart-sdk`
- Database type and version: SQLite (Drift) — Drift debug server hosted **inside the running Flutter app on a physical device**
- Connection method: Android 11+ **Wireless Debugging** (device `192.168.1.151:39557`, an ephemeral re-rolling connect port). Extension reaches the in-app server on `127.0.0.1:8642` via `adb forward` (transport `adb-forward`, because a live Flutter/Dart debug session is present).
- Relevant non-default settings: `driftViewer.host` = `127.0.0.1` (default); discovery enabled (default). Drift Advisor enabled in the app (`EnvType.DriftAdvisorEnabled` default-on in debug).
- Other potentially conflicting extensions: Dart-Code (provides the debug session whose start/stop drives `adb forward`); saropa-log-capture v9.0.9 (log capture only — not involved in the toast).

## Steps to Reproduce

1. Open the `saropa_contacts` workspace (a Drift project) in VS Code with the Drift Advisor extension active.
2. Connect a physical Android device over **Android 11+ Wireless Debugging** (not USB, not fixed-port 5555) — e.g. a Motorola edge 2022. The connect port is an ephemeral high port that Android re-rolls and that drops in Doze.
3. Launch the app with the "contacts (debug mode)" launch config so a Dart/Flutter debug session is live and the in-app Drift debug server binds `localhost:8642` (forwarded to host `127.0.0.1:8642`).
4. Observe the first information toast: **"Drift debug server detected on port 8642"** — this one is correct/expected.
5. Leave the app running and interact normally. Let the wireless link flap (idle screen → Doze, Wi-Fi power-save, or roaming all do it).
6. Watch the bottom-right notifications.

Intermittent by nature of the link. On a flapping wireless connection it recurs roughly every 1–few minutes; on a stable USB connection it never recurs (correct behavior).

## Expected Behavior

The "detected" toast is shown **once per discovery session**. The discovery layer is explicitly designed to collapse flapping on unreliable links to at most one toast — `LOST_NOTIFY_GRACE_MS` (35s grace) plus a once-per-session latch (`ServerLostDebouncer._notifiedThisSession`). A wireless link that drops and recovers repeatedly should produce **no** repeated "detected" toasts; the sidebar/status-bar disconnect indicator is the intended surface for ongoing flap state.

## Actual Behavior

On a flaky wireless link the **"Drift debug server detected on port 8642"** information toast re-appears on every reconnect (observed ~every 1–few minutes). Each toast carries the `Open URL` / `Copy URL` / `Dismiss` actions and must be dismissed. The once-per-session de-dup is defeated.

### Root cause (traced)

1. Discovery polls `127.0.0.1:8642/api/health` every `CONNECTED_INTERVAL` (10s). After `MISS_THRESHOLD` (2) consecutive misses (~20s) the server is removed from the map and `onDidChangeServers([])` fires (`server-discovery-core.ts:258–271`).
2. The empty-servers handler in the bootstrap, **when a Flutter/Dart debug session is live**, calls `tryAdbForwardAndRetry(client.port, …)` (`extension-bootstrap.ts:203–204`).
3. `tryAdbForwardAndRetry` runs `adb forward tcp:8642 tcp:8642` and then calls `discovery.retry()` (`android-forward.ts:62–66`).
4. `ServerDiscovery.retry()` does `stop()` then `start()`; `start()` calls `this._lostDebouncer.reset()` (`server-discovery-core.ts:94`), clearing `_notifiedThisSession`.
5. With the latch reset, the next successful scan re-adds the port and `_updateServers` fires `maybeNotifyServerEvent(..., 'found', ...)` again (`server-discovery-core.ts:246–254`) → a fresh "detected" toast.
6. `tryAdbForwardAndRetry` is throttled to once per 60s per workspace (`android-forward.ts:13`, `THROTTLE_MS = 60_000`), which is why the repeat cadence is ~1+ minute rather than every scan.

The grace-window / latch machinery (designed in `server-discovery-lost-debounce.ts` and `server-discovery-constants.ts` precisely for "Wi-Fi debugging on a physical device" flapping — see the `LOST_NOTIFY_GRACE_MS` doc comment at `server-discovery-constants.ts:16–28`) is correct in isolation; the `retry()`-driven `reset()` on the adb-forward recovery path bypasses it within a single user session.

## Error Output

No error is thrown — this is a notification-behavior bug, not a crash. The relevant evidence is in the "Saropa Drift Advisor" / connection Output channel: a repeating cycle of `Scan #N complete — no server found` → (server delete) → `Retry requested — resetting to searching state` (from `retry()` at `server-discovery-core.ts:130`) → `Starting — scanning 127.0.0.1 ports …` → `Scan complete — server(s) on port(s): 8642`, with a "detected" toast each time the second-to-last step latches a fresh session.

## Emitter Attribution

This is a behavioral (notification) bug, not a VS Code diagnostic. There is no `(owner, code)` diagnostic payload. The toast emit chain, proven by grep:

- Toast string + emit: `extension/src/server-discovery-notify.ts:35` — `showInformationMessage(\`Drift debug server detected on port ${port}\`, …)` inside `maybeNotifyServerEvent(... event === 'found' ...)`.
- "found" emit call site: `extension/src/server-discovery-core.ts:246–254` (`_updateServers`, in the new-port branch).
- Latch that should suppress repeats: `extension/src/server-discovery-lost-debounce.ts:42` (`_notifiedThisSession`), gate read at `server-discovery-core.ts:242` (`!this._lostDebouncer.hasNotified`).
- Latch reset (the defect): `extension/src/server-discovery-core.ts:94` (`this._lostDebouncer.reset()` inside `start()`), reached via `retry()` at `server-discovery-core.ts:129–136`.
- `retry()` caller: `extension/src/android-forward.ts:65` (`discovery.retry()` inside `tryAdbForwardAndRetry`), invoked from `extension/src/extension-bootstrap.ts:204`.

Grep commands used (run from `D:\src\saropa_drift_advisor`):

```
grep -rn "detected on port" extension/src/        -> server-discovery-notify.ts:35  (only match)
grep -rn "\.retry()" extension/src/               -> android-forward.ts:65 ; server-discovery-core.ts (def)
grep -rn "_lostDebouncer.reset()" extension/src/  -> server-discovery-core.ts:94
grep -rn "tryAdbForwardAndRetry" extension/src/   -> android-forward.ts:51 ; extension-bootstrap.ts:204, :242
```

Sibling-repo negative grep (confirms the toast is not emitted from a sibling repo):

```
grep -rn "detected on port" ../saropa_lints/        -> 0 matches
grep -rn "detected on port" ../contacts/lib/        -> 0 matches  (app only prints "listening on localhost:8642")
```

Mixed-language note: the toast and the discovery state machine are TypeScript-only (`extension/src/`). The Dart side (`lib/src/`) hosts the server and prints the app-side "listening on localhost:8642" banner but does **not** emit the "detected" toast — `grep -rn "detected on port" lib/` → 0 matches. No Dart emit path is involved.

## Screenshots / Recordings

Not attached. The toast text is verbatim above; the bug is the repetition cadence, observable in the notification history and the connection Output channel log lines listed under Error Output.

## Minimal Reproducible Example

Conceptual minimal repro (no UI fixture needed — the state machine alone shows it):

1. `discovery.start()` → first scan finds port 8642 → one "detected" toast (latch still false, correct).
2. Simulate 2 consecutive empty scans for port 8642 → server deleted, `onDidChangeServers([])`.
3. With `hasFlutterOrDartDebugSession()` true, the bootstrap calls `tryAdbForwardAndRetry(8642, discovery, …)` (let `adb forward` succeed) → `discovery.retry()` → `reset()`.
4. Next scan finds 8642 again → **second "detected" toast** (latch was reset). Repeat → unbounded toasts, gated only by the 60s adb-forward throttle.

A unit-style test could assert: across a delete→retry→rediscover cycle driven through `ServerDiscovery` with a stubbed `scanPorts`, `showInformationMessage` is called exactly once for the 'found' event. Today it is called once per retry cycle.

## What I Already Tried

- [x] Confirmed the app side only prints "listening on localhost:8642" — the "**detected** on port" wording is extension-side, proven by grep (above).
- [x] Traced the full chain delete → `tryAdbForwardAndRetry` → `retry()` → `reset()` → re-`found` → toast.
- [x] Confirmed it does NOT recur on a stable USB transport (no link flap → no empty-scan → no retry → latch stays set). Switching Saropa Contacts' Express debug-connect default to prefer USB when a cable is present was done on the contacts side as the workaround for the underlying flap; it does not fix this extension behavior for users who stay on wireless.
- [ ] Did not modify any `saropa_drift_advisor` code (cross-repo — filing this report instead).

## Regression Info

- Last working version: unknown / not bisected. The grace-window + once-per-session latch design (`server-discovery-lost-debounce.ts`, `LOST_NOTIFY_GRACE_MS`) was introduced specifically to suppress flap toasts; this bug is the `retry()`-path interaction defeating that latch, so it has likely existed since the adb-forward auto-retry and the debouncer coexisted.
- First broken version: not bisected.
- What changed: not a recent regression as far as traced — structural interaction between two features (auto adb-forward retry on empty discovery, and the once-per-session toast latch).

## Impact

- Who is affected: any user running the Drift debug server inside an app on a **physical device over wireless debugging** (or any flaky `adb forward` link) with a live Dart/Flutter debug session. Emulator/USB users are unaffected (stable transport → no retry cycles).
- What is blocked: nothing functional — the server reconnects each time and the viewer/queries work. The harm is repeated, attention-stealing toasts (each with action buttons) that must be dismissed, and the false impression that "discovery just succeeded" when it actually keeps flapping.
- Data risk: none.
- Frequency: intermittent; on a flapping wireless link roughly every 1–few minutes (floored by the 60s adb-forward throttle); never on a stable transport.

## Suggested Fix (for the maintainer — not applied here)

Do not blanket-`reset()` the once-per-session latch on the `retry()` recovery path. Options, lightest first:

1. Distinguish a **user-initiated** retry (the "Retry Discovery" command / button — should reset and re-announce) from an **automatic** `tryAdbForwardAndRetry` recovery (should preserve the latch). E.g. `retry({ resetNotifyLatch = true })`, with the adb-forward caller passing `false`; only `reset()` the latch when `resetNotifyLatch`.
2. Have the empty-servers recovery path re-`adb forward` **without** tearing down discovery — i.e. don't call `retry()` (stop+start) at all; just run `adb forward` and let the already-running poll loop re-discover the port (which, with the latch intact, stays silent on a flap).
3. Separate the latch's lifetime from the discovery `start()`/`stop()` cycle so an internal restart does not re-arm the toast, while a genuinely new session (extension activate / explicit user retry) does.

Pick (1) or (2): both keep the legitimate single initial "detected" toast and the single "no longer responding" warning, while silencing the per-reconnect repeats on flaky links — the exact behavior the grace-window design already intends.

## Resolution (fixed)

Applied option (1) — distinguish user-initiated retry from automatic adb-forward recovery:

- `ServerDiscovery.retry(options)` now takes `{ resetNotifyLatch?: boolean }`, defaulting to `true` (preserves the existing re-announce behavior for every user-initiated caller: the "Retry Discovery" command/button, the "No servers found" warning's Retry action, and the new-debug-session recovery in `debug-commands-vm.ts`). `server-discovery-core.ts`.
- `ServerDiscovery.start(reArmLostLatch = true)` only calls `_lostDebouncer.reset()` when `reArmLostLatch` is true. `retry()` threads its `resetNotifyLatch` through to `start()`. The latch survives `stop()` (only the pending grace timers are cleared there), so skipping the re-arm preserves it across an internal restart. `server-discovery-core.ts`.
- `tryAdbForwardAndRetry` (the automatic recovery path) now calls `discovery.retry({ resetNotifyLatch: false })`, so a wireless-debugging flap re-forwards and re-discovers the port without re-firing a "detected" toast. `android-forward.ts`.

Test added in `server-discovery.test.ts`: "auto-recovery retry (resetNotifyLatch:false) must not re-announce on a flap" — asserts that after the once-per-session warning fires, an auto-recovery `retry({ resetNotifyLatch: false })` re-finds the port with no extra "detected" toast and no second "lost" warning. The existing "warn at most once per session" test continues to cover the user-initiated `retry()` re-arm. Full discovery suite passes.
