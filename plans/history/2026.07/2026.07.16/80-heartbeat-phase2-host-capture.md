# Feature 80, Phase 2 — Host-app statement reporting for the Heartbeat screen

Status: SHIPPED — authorized and built 2026-07-16 (see Finish Report below).

Phase 1 (the Heartbeat screen itself: `TableActivityTracker`, `GET
/api/activity`, glow card grid, ECG monitor) is shipped — see
`plans/history/2026.07/2026.07.16/80-heartbeat-watch-screen.md` for the full
feature plan and its finish report. This file carries only the remaining
open work.

## Gap this closes

Phase 1 cannot see the host app's own reads at all, and detects host writes
only via row-count deltas (≥ 2 s granularity; UPDATE-in-place and balanced
insert+delete are invisible). True live traffic requires the host to report
statements.

## Design (agreed shape — implement exactly this)

### Host wiring (one-time, passive)

- New optional typedef in `server_typedefs.dart`; `DriftDebugServer` exposes a
  `reportActivity(String sql)`-style method the host wires to drift's
  `QueryInterceptor` or `logStatements`. Absent → phase 1 behavior (graceful
  degradation, architecture contract §12).
- The wired hook is a permanent, cheap forwarder: its FIRST statement is a
  single boolean check on `activityCaptureArmed` — when disarmed it returns
  immediately. Cost per query while disarmed: one field read + branch. No
  SQL parsing, no allocation, no table extraction happens unless armed.
- `startDriftViewer` could attempt duck-typed auto-wiring only if drift
  exposes a safe hook; otherwise document the two-line manual wiring.
- Public API addition → stub parity required (`drift_debug_server_stub.dart`).

### Capture toggle — owned by the heartbeat screen, never ambient

- Server holds `activityCaptureArmed` (default FALSE on every server start —
  never persisted, never a start() parameter; capture is a session-scoped
  observation tool, not a configuration).
- New `POST /api/activity/capture {enabled}` endpoint; the heartbeat screen
  renders the toggle and is the only UI surface that arms it. Toggle state
  and a "capturing live app traffic" indicator are visible on the screen so
  the user always knows the hook is hot.
- **Screen-inactive ⇒ capture off, enforced twice:**
  1. Client side: the screen disarms capture on tab switch, on
     `visibilitychange` → hidden, and on `pagehide`/`beforeunload` (same
     lifecycle points that already stop the poll loop and rAF).
  2. Server side (the guarantee): arming grants a LEASE, not a latch. Each
     `/api/activity` poll from the heartbeat screen renews it; if no poll
     arrives within ~5 s (poll cadence is ~750 ms, so this tolerates several
     missed polls), the server disarms itself. A killed browser tab, a
     dropped adb forward, or a crashed webview can therefore never leave the
     interceptor hot. The lease check is a timestamp compare inside
     `reportActivity`'s armed branch — no timer needed.
- Kill switch precedence: `monitoringEnabled == false` refuses arming and
  force-disarms, same as every other data-inspection surface.
- Multi-client note: the lease renews on ANY heartbeat-screen poll, so two
  open viewers behave sanely (either keeps it alive); disarm from one
  disarms for all — acceptable for a debug tool, documented on the screen.

## Tests

- Armed/disarmed branch: disarmed `reportActivity` records nothing and does
  minimal work; armed records reads AND writes with table attribution.
- Lease expiry: no poll for > lease window ⇒ next `reportActivity` call
  self-disarms and records nothing.
- Router: capture endpoint shape, 403 under kill switch, arm→poll→renewal.

## Risks

- [x] Capture can never stay armed without a live heartbeat screen — lease
      expiry test is mandatory, and the disarmed path stays one-branch cheap.
- [x] Public API + stub parity + change-control review before implementation.

## Finish Report (2026-07-16)

Phase 2 shipped exactly per the design above. The heartbeat screen can now
show the host app's own live reads and writes when the host wires
`DriftDebugServer.reportActivity(sql)` into drift's `logStatements` or a
`QueryInterceptor`; without the wiring, phase 1 behavior is unchanged.

### Server (Dart)

- `TableActivityTracker` gained the capture state machine:
  `captureArmed` / `armCapture()` / `disarmCapture()` / `renewCaptureLease()`
  / `recordHostStatement(sql)`, with an injectable millisecond clock so the
  lease-expiry test advances time instead of sleeping. Capture defaults
  disarmed on every construction; the lease is a timestamp compare inside the
  armed branch (no timer). Statement heads classify: `SELECT`/`WITH` →
  per-table reads, `INSERT`/`UPDATE`/`DELETE`/`REPLACE` → writes via the
  existing `TableNameExtractor`; DDL/PRAGMA/transaction framing record
  nothing. All recording routes through the phase 1 `recordRead`/`recordWrite`
  paths so generation, the event ring, and aggregates behave identically.
- Kill-switch precedence: a late-bound `monitoringEnabledProbe` (wired by
  `ServerContext` to `monitoringEnabled`) refuses arming and force-disarms on
  the next reported statement when monitoring is disabled — checked inside
  the armed branch so the disarmed path stays one field read + one branch.
- `DriftDebugServer.reportActivity(String sql)` added to the VM
  implementation (delegating to the tracker only when armed) and as a silent
  no-op on the web stub — deliberately not a throw, because the host may wire
  it unconditionally into a per-query hook. `DriftDebugReportActivity`
  typedef documents the hook shape in `server_typedefs.dart`.
- Router: `POST /api/activity/capture` (`{"enabled": bool}` →
  `{"captureArmed": bool}`, 400 on malformed body, structured 403 under the
  kill switch via the existing global gate); `GET /api/activity` renews the
  lease while armed and carries an additive top-level `captureArmed` field.
  Constants: `pathApiActivityCapture(/Alt)`, `jsonKeyCaptureArmed`,
  `activityCaptureLeaseMs = 5000`.

### Viewer (web / VS Code webview)

- New `heartbeat-capture.ts` (DOM + network) and
  `heartbeat-capture-logic.ts` (pure, unit-tested render decisions): the
  toggle renders strictly from availability × server-armed × in-flight-POST
  state, so it can never drift from what the server last said. Hidden
  entirely on older servers without the field; off + disabled under the kill
  switch; a warm pulsing "Capturing" badge (reduced-motion drops the pulse,
  keeps the badge) while armed.
- Screen-inactive ⇒ disarm, client side: tab switch and hidden visibility
  disarm through the screen's existing suspension path in `updateRunState`;
  `pagehide`/`beforeunload` fire a best-effort disarm via `sendBeacon`
  (token-less) or `fetch keepalive` (with auth header). The server lease
  remains the actual guarantee.
- Wiring-honesty caption: the server cannot detect whether the host wired
  `reportActivity`, so the toggle's caption states the requirement instead of
  implying an armed toggle captures everything. Multi-client semantics (any
  viewer's poll renews; one disarm disarms all) surface as the tooltip.
  Six new l10n keys under `viewer.heartbeat.capture.*`.

### Tests

- Dart (`test/table_activity_tracker_test.dart`, 28 passing): disarmed
  records nothing; armed records reads AND writes with quoted-identifier
  attribution while framing/DDL record nothing; lease expiry self-disarms and
  stays disarmed until re-arm; renewal never arms; kill switch refuses arm
  and force-disarms; HTTP round-trip (arm → report → disarm), 400/403 shapes;
  `reportActivity` is a safe no-op with no server running.
- Web (`assets/web/test/heartbeat-capture-logic.test.mjs`, 5 cases; 28 web
  tests total passing): the full render decision table, including the
  optimistic in-flight window and the lifecycle-disarm gate.

### Accepted limits (unchanged from the design)

- The server cannot report whether the host wired the hook; an armed toggle
  with an unwired host shows no capture data (caption explains).
- Statement classification is head-word only; a comment-prefixed statement
  records nothing (drift emits bare statements).
- One capture flag per server: viewers share arm/disarm state by design.
