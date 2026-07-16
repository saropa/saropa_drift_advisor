# Feature 80, Phase 2 — Host-app statement reporting for the Heartbeat screen

Status: PLANNED — NOT authorized to start; requires an explicit go-ahead and
change-control review (per-query overhead in the host app).

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

- [ ] Capture can never stay armed without a live heartbeat screen — lease
      expiry test is mandatory, and the disarmed path stays one-branch cheap.
- [ ] Public API + stub parity + change-control review before implementation.
