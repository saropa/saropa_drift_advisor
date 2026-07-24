# 62 — Instrumentation status signal ("app timing wired?" indicator)

Status: proposed (design only; no code yet)
Origin: handoff reflection on Feature 61 (app query-timing ingest,
`plans/history/2026.07/2026.07.24/61-app-query-timing-ingest.md`). Turns the
passive `performance.hint` into an active, glanceable setup indicator.

## Problem

Feature 61 lets an app report its own query timings via
`DriftDebugServer.reportAppQuery` (usually through the example
`AdvisorTimingInterceptor`). When it is NOT wired, `performance.totalQueries`
is 0 and a `hint` string is attached to the performance payload. That hint only
appears if someone opens the Performance tab or the export and reads it — it is
easy to miss, and there is no positive confirmation of the healthy state
("app timing is wired and working"). A developer cannot tell at a glance
whether empty stats mean "not wired" or "wired but idle".

## Goal

A single, cheap, always-available signal — `app timing: wired | not seen` —
surfaced everywhere a client already shows connection state (web UI badge,
VS Code status bar, `/api/health`), so the wiring state is obvious without
digging into performance data. No new heavy machinery; reuse the existing
`source: "app"` detection.

## Signal definition

One derived boolean plus a count, computed from the existing `queryTimings`
ring buffer — no new capture path:

- `appQueriesSeen: bool` — true once any recorded timing has
  `source == "app"` (i.e. `appReported`). Monotonic within a server run:
  never flips back to false after the first app query, so a momentarily idle
  app does not drop the badge to red. (Store a latched bool on `ServerContext`,
  set in `recordAppTiming`, rather than rescanning the ring — the ring evicts,
  and the latch must survive eviction of the first app query.)
- `appQueryCount: int` — number of `source == "app"` timings currently in the
  ring (advisory; may undercount after eviction — label it "recent").

State the badge derives:

| appQueriesSeen | Meaning | Badge |
| --- | --- | --- |
| true | App timings are arriving | green "app timing: on" |
| false | No app query reported yet | amber "app timing: not wired" |

Amber, never red: "not wired" is a setup gap, not an error, and a brand-new
session that simply has not run a query yet is legitimately amber for a moment.

## Surfaces (all additive)

1. **`GET /api/health`** — add `appQueriesSeen` (bool) next to the existing
   `monitoringEnabled` / `extensionConnected` / `capabilities` fields. This is
   the machine-readable source of truth every client already polls. Additive
   to the Saropa Diagnostic Envelope (Contract §14) — no schemaVersion bump;
   consumers ignore unknown fields. Mirror it into the VM-service health JSON
   (`healthJsonForVmExtension`) so the VM path advertises the same field.
2. **Web viewer badge** — a small pill near the connection indicator: green
   "app timing" when `appQueriesSeen`, else amber "app timing: not wired" with
   a tooltip/click linking to the interceptor recipe. Reads `/api/health`,
   which the UI already polls.
3. **VS Code status bar** — extend the existing discovery/health status item to
   append an "app timing" segment with the same two states; the amber state's
   command opens the README section / the example interceptor file.
4. **`performance.hint`** — keep as-is; the badge is the discoverable front
   end, the hint is the detailed fix at the point of the empty data. When
   `appQueriesSeen` is true, the hint is already absent (same predicate), so
   the two never contradict.

## Why a latched bool (not "count > 0 in the ring")

The ring buffer (`maxQueryTimings = 500`) evicts oldest-first. An app that
reports one query at startup then goes idle would, after 500 advisor/browser
queries, have its only app timing evicted — flipping a naive "any app in ring"
check back to amber and making the badge flap. The latch (`bool _appSeen` set
once in `recordAppTiming`, exposed as `appQueriesSeen`) is monotonic for the
server's lifetime, which matches the question being asked ("is the app wired?"
not "is the app busy right now?"). `clearPerformance()` / DELETE
`/api/analytics/performance` should NOT reset the latch — clearing timings is
not un-wiring the interceptor.

## Implementation sketch

- `ServerContext`: add `bool _appQueriesSeen = false;` + getter; set it at the
  top of `recordAppTiming` (before the kill-switch return? — after: a killed
  server observes nothing, so only latch when actually recording). Decide: latch
  should reflect "we have proof the interceptor is installed", which is true
  even under the kill switch since a report ARRIVED — but recording is
  suppressed. Lean: latch only when a timing is actually recorded (post
  kill-switch), so the badge tracks observable data, and document it.
- `GenerationHandler.sendHealth` + `Router.healthJsonForVmExtension`: add the
  field from `_ctx.appQueriesSeen`.
- `api-types.ts` `HealthResponse`: add `appQueriesSeen?: boolean`.
- Web + status-bar rendering: additive, gated on the field being present
  (older servers omit it → treat as unknown, render nothing rather than red).

## Invariants to honor

- Additive-only health/envelope fields (Contract §14) — no removals, no
  schemaVersion bump.
- No new capture path or per-query cost — the latch is one boolean write inside
  the existing `recordAppTiming`.
- Older-server compatibility: clients must treat a MISSING `appQueriesSeen` as
  "unknown / don't show", never as "not wired" (which would false-alarm against
  a server built before this feature).

## Out of scope / follow-ups

- Per-table "instrumented?" breakdown.
- Distinguishing "interceptor installed but on a background isolate we can't
  see" from "not installed at all" — both present as amber; the isolate caveat
  stays a doc note on `reportAppQuery`.
- Persisting the latch across restarts (a fresh server run legitimately starts
  amber until the first query).

## Open questions before coding

1. Latch under the kill switch: reflect "report arrived" (proves wiring) or
   "timing recorded" (observable data)? (Leaning: recorded.)
2. Badge copy: "app timing" vs "instrumentation" vs "app queries" — pick the
   term the web UI/status bar already use for related state.
3. Does the VS Code status bar have room, or should this be a tooltip line on
   the existing item rather than a new segment?
