# Feature 80 — Heartbeat / Watch Screen (live table activity board)

Status: PHASE 1 IMPLEMENTED (server tracker + /api/activity + heartbeat screen with ECG monitor; untouched tables hidden). Phase 2 (host statement reporting with on-screen capture toggle) NOT started — separate decision.

## Purpose

A live dashboard screen in the web viewer showing every table in the connected
database as a card. When a table is read or written, its card border glows and
a per-table counter increments. The glow decays quickly (sub-second) and gets
brighter under rapid traffic, so the screen reads like a heartbeat monitor of
the database.

Ships in the localhost web viewer (`http://127.0.0.1:8642`, served by the Dart
in-app server from `lib/src/server/html_content.dart` + `assets/web/`), and —
because the VS Code webview loads the exact same document (`extension/src/panel.ts`)
— appears in the editor for free. Invariant honored: one REST API, no
client-specific server behavior (architecture contract §1).

## What activity the server can actually see (honest scope)

The server never imports drift and has no query interceptor in the host app,
so visibility is limited to three existing signals:

| Signal | Source | Covers | Granularity |
| --- | --- | --- | --- |
| Reads through the advisor | `ServerContext.timedQuery` (`lib/src/server/server_context.dart:460`) — every table browse, SQL-runner query, extension probe | Advisor-driven reads only | Per query, immediate |
| Writes through the advisor | `writeQuery` path in `lib/src/drift_debug_server_io.dart:335` → `MutationTracker` (table + type already inferred) | Cell edits, batch edits, write SQL via API | Per statement, immediate |
| Host-app writes (indirect) | `checkDataChange` per-table row counts (`_cachedTableCounts`, `server_context.dart`) — diff counts between cycles | The app's own INSERT/DELETE traffic | ≥ 2 s (`ServerConstants.changeDetectionMinInterval`); misses UPDATE-in-place and balanced insert+delete (row count unchanged) |

**Not visible in phase 1:** the host app's own reads, and host writes that
don't change a row count. The screen must label host-write activity as
"detected changes," not claim full traffic capture. A phase 2 ingestion hook
(below) closes the gap if wanted — it is a separate decision.

## Phase 1 — build on existing signals

### Dart server

1. **New `lib/src/server/table_activity_tracker.dart`** — in-memory per-table
   counters. Shape per table:
   `{reads, writes, hostChanges, lastReadAt, lastWriteAt, lastHostChangeAt}`.
   - Bounded: cap the map at the table count (tables are finite); no ring
     buffer needed because this stores aggregates, not events (contract §7
     satisfied — the store cannot grow per-query).
   - A monotonic `activityGeneration` int bumps on every recorded event so
     clients can cheap-poll ("anything new since N?").
   - Also keep a small fixed-size recent-event ring (e.g. 100 entries of
     `{table, kind, at}`) so a client that polls every ~750 ms can render
     one glow pulse per event, not just counter deltas. `ListQueue`, O(1)
     eviction, per contract §7.
2. **Feed points (all three already exist — no new capture paths):**
   - `timedQuery` records a read for the table(s) in the SQL. Table-name
     extraction: reuse the same best-effort regex approach as
     `MutationTracker` (FROM/JOIN clause scan over the already-masked SQL —
     the tokenizer's `_maskCommentsAndLiterals` from `sql_validator.dart`
     prevents literal-string false matches). Best-effort by design; a
     complex query that defeats extraction records nothing rather than
     something wrong.
   - **`isInternal == true` queries are NEVER recorded** (contract §9): the
     change-detection COUNT sweep, extension probes, and the heartbeat
     screen's own polling must not light up the board. This is the
     load-bearing rule of the whole feature — without it the screen glows
     from watching itself.
   - The `writeQuery` path records a write using the table name
     `MutationTracker` already inferred.
   - `checkDataChange` compares the new per-table counts against the previous
     `_cachedTableCounts` and records a `hostChange` per table whose count
     moved. Zero extra queries — the sweep already runs.
   - Kill switch: when `monitoringEnabled == false`, record nothing and the
     endpoint returns the structured 403 like the other data-inspection
     endpoints.
3. **New endpoint `GET /api/activity?since=N`** — returns
   `{activityGeneration, tables: [...], recentEvents: [...]}` where
   `recentEvents` is filtered to events after `N`. Plain poll (no long-poll):
   the screen wants a steady ~750 ms cadence while visible, and long-poll
   plumbing buys nothing at that rate. Handler follows router rules: own
   try/catch is fine, nothing rethrows past `onRequest`, response always
   closed (contract §5). Route constant in `server_constants.dart`; endpoint
   documented in `doc/API.md`; additive-only payload (contract §14 discipline
   even though this is a new endpoint).
4. **No public API change** on `DriftDebugServer` in phase 1 → no stub-parity
   work (contract §4) and no new start() parameter (config skill untouched).

### Web viewer (`assets/web/`)

5. **New screen following the `views-screen.ts` pattern:**
   - `heartbeat-screen.ts` — fetches `/api/tables` once for the card grid
     (name + row count), then polls `/api/activity?since=lastGen` every
     ~750 ms **only while the tab is active AND `document.visibilityState`
     is visible** (stop on tab switch / hidden — no background polling).
     The poll request carries the `internal` marker so the server does not
     record it (see feed-point rule above).
   - Tab id `heartbeat`, registered in `tabs.ts` id list, tab button + panel
     markup added to the HTML shell in `html_content.dart`, entry wiring in
     `index.js` mirroring how `views-screen` is wired.
   - `_heartbeat-screen.scss` partial, imported from `style.scss`; rebuild
     generates `style.css` + `bundle.js` (never hand-edit generated files).
6. **Glow model (the "decays quickly, brighter under rapid traffic" ask):**
   - Each card holds a heat scalar per channel: `readHeat`, `writeHeat`,
     both 0..1. On each event: `heat = min(1, heat + 0.35)` — so a burst of
     3+ quick events saturates to full brightness, a lone event gives a
     visible-but-modest pulse.
   - Decay in a single `requestAnimationFrame` loop over all cards:
     `heat *= exp(-dt / 450ms)` — exponential decay, ~1.5 s to visually dark
     after a lone event, instant re-brighten under sustained traffic.
   - Rendering: heat drives a CSS custom property per card
     (`--read-heat`, `--write-heat`); the SCSS maps it to `box-shadow`
     blur/alpha and border-color mix. Two distinguishable channels: reads
     glow in the theme accent (cool), writes in the warning hue (warm);
     host-detected changes render as the write channel with a distinct
     badge, since they are inferred, not observed. All colors come from the
     existing theme tokens in `_themes.scss` — no raw hex (design-system
     rule); verify midnight + showcase themes both resolve.
   - rAF loop suspends entirely when the tab is inactive/hidden (no idle CPU).
   - Counters: reads / writes / detected-changes rendered on the card;
     row count updates from the activity payload's cached counts.
   - Since one poll can deliver several events for one table, each poll tick
     applies at most 3 impulses per table per channel — enough to saturate,
     avoids wasted work on a 100-event burst.
7. **Empty/edge states:** no tables → reuse the standard empty-state pattern;
   server monitoring disabled → show the 403's structured message with the
   existing kill-switch messaging; poll failure → pause + surface the
   standard connection banner, resume on reconnect.
8. **l10n:** all card labels, counters, legend ("Reads", "Writes",
   "Detected changes", tooltips, empty states) as new keys in the viewer
   catalog (`assets/web/l10n/`, accessed via `vt(...)`) — no hardcoded
   strings. Adding keys is routine write-time work, not a gate.

### Tests

9. Dart: unit tests for `TableActivityTracker` (counter increments, internal
   queries excluded, host-change diffing, recent-event ring eviction,
   generation monotonicity) + router test for `/api/activity` (shape, `since`
   filtering, 403 under kill switch). Scoped runs only
   (`dart test --no-pub test/<file>`, backgrounded).
10. Web: `assets/web/test/` node:test for the pure heat math (impulse clamp,
    exponential decay over a synthetic dt sequence, per-tick impulse cap) —
    keep the math in an exported pure function so it is testable without DOM.

### Docs / bookkeeping

11. `doc/API.md` — `/api/activity` entry. `CHANGELOG.md` — feature entry (no
    dates). `roadmap.md` — row added to Tier 2 table (done alongside this
    plan file).

## Phase 2 — host-app statement reporting, gated by an on-screen toggle

True host-app traffic (reads and all writes) requires the host to report
statements. The overhead concern is resolved by making capture OFF by
default and armed only from the heartbeat screen, only while that screen is
active. Design, consistent with the callback contract (§2):

### Host wiring (one-time, passive)

- New optional typedef in `server_typedefs.dart`; `DriftDebugServer` exposes a
  `reportActivity(String sql)`-style method the host wires to drift's
  `QueryInterceptor` or `logStatements`. Absent → phase 1 behavior (graceful
  degradation, contract §12).
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

### Tests (phase 2 additions)

- Armed/disarmed branch: disarmed `reportActivity` records nothing and does
  minimal work; armed records reads AND writes with table attribution.
- Lease expiry: no poll for > lease window ⇒ next `reportActivity` call
  self-disarms and records nothing.
- Router: capture endpoint shape, 403 under kill switch, arm→poll→renewal.

This still changes the package's per-query overhead profile (one branch per
statement even when disarmed), so it goes through change-control review
before implementation — but the armed-only design bounds the real cost to
exactly the window where the user is watching the screen.

## Risks / constraints checklist

- [ ] Internal-query exclusion verified end-to-end (the board must not glow
      from its own polling) — regression test required.
- [ ] Read attribution is best-effort regex (same accepted weakness as
      `MutationTracker`, contract §15) — unattributable SQL records nothing.
- [ ] Host-write detection is count-delta only; UPDATE-in-place invisible in
      phase 1 — UI copy must say "detected changes," never "all writes."
- [ ] No new pubspec dependencies; no top-level side effects (tree-shaking,
      contract §3).
- [ ] Generated files (`bundle.js`, `style.css`) rebuilt, never hand-edited.
- [ ] Both viewer themes + the VS Code webview render the glow correctly
      (webview CSP already allows the server origin; CSS custom properties
      need no new CSP surface).
- [ ] Phase 2 only: capture can never stay armed without a live heartbeat
      screen — lease expiry test is mandatory, and the disarmed path stays
      one-branch cheap.
