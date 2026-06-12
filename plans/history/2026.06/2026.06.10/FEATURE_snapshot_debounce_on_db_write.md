# Feature Request — Debounce the snapshot/re-dump so a single DB write can't trigger a full physical-table re-scan

> Status: Fixed
> Filed from the Saropa Contacts repo following an ANR investigation (2026-06-06).
> Origin item: `contacts/docs/PLAN_STARTUP_PERFORMANCE_ANR_FOLLOWUP.md` **T14**.

---

## Summary

When an Advisor browser/inspection page is open against a live Drift database,
a **single** application DB write fans out into a full physical-table re-dump —
the contacts ANR trace captured a flood of **~1,400 queries** triggered off one
write while a page was open. The re-dump is correct in content but
disproportionate in cost: each individual write does not need a complete
re-scan of every physical table.

This is **dev-QoL only** — the Advisor is already release-gated, so it never
runs in a shipped build. It does, however, make local profiling noisy and can
itself contribute to perceived jank during debugging (the very thing the dev
was trying to measure).

## Expected Behavior

A burst of writes (or a single write) coalesces into **one** snapshot/re-dump
after a short quiet period, rather than one full re-scan per write. Concretely:

1. A DB write marks the snapshot dirty and (re)starts a debounce timer.
2. Further writes within the debounce window reset the timer; they do **not**
   each kick off their own re-dump.
3. When the window elapses with no new write, a single re-dump runs.
4. The visible Advisor page updates once, reflecting the coalesced final state.

## Actual Behavior

Each observed write while a page is open appears to drive a fresh full
physical-table dump, producing the ~1,400-query burst seen in the contacts ANR
log for what was a small number of logical writes.

## Evidence / Source

- Contacts ANR log, 2026-06-06 (debug emulator). The avatar-preload storm was
  the primary ANR cause and was fixed in the contacts repo; the Advisor
  re-dump flood was a **secondary** amplifier visible in the same trace whenever
  an Advisor page was open during startup.
- The flood is query-count dominated (many small reads against
  `sqlite_schema` / per-table `SELECT`s), not a single expensive query.

## Proposed Acceptance Criteria

- [ ] A configurable debounce interval (default in the 150–300 ms range) gates
      the re-dump; exact value is the implementer's call.
- [ ] N writes inside one debounce window produce exactly **one** re-dump, not N.
- [ ] The open page still reflects the latest committed state after the window
      (no stale view, no missed final write).
- [ ] No behavior change when no Advisor page is open (nothing to re-dump).
- [ ] Debounce is observable in logs (one "re-dump (coalesced K writes)" line
      instead of K dump lines) so the fix is verifiable from a trace.

## Environment

| Field | Value |
|---|---|
| Repo | `saropa_drift_advisor` (this repo) — Dart analyzer under `lib/src/` and/or VS Code extension under `extension/src/` |
| Observed from | Saropa Contacts (Flutter app), debug build on Android emulator |
| Trigger | App DB write while an Advisor inspection/browser page is open |
| Severity | Low (dev-QoL; release-gated, never ships) |
| Frequency | Every write while a page is open |

## Notes for the implementer

- The emit path for the re-dump needs locating in this repo (Dart `lib/src/`
  vs TypeScript `extension/src/`); grep both trees per the mixed-language note
  in `BUG_REPORT_GUIDE.md` §6e before deciding where the debounce lives.
- Coalescing logic should sit at the snapshot/dump boundary, not at each
  individual table read, so it covers all current and future callers.

---

## Finish Report (2026-06-10)

### Scope

**(B) VS Code extension (`extension/`, TypeScript)** only. No Dart (`lib/`,
`test/`) changes. The coalescing lives entirely in the extension's timeline
snapshot store; the Dart server's generation/write-detection path is unchanged.

### Root cause (corrected from the report's framing)

The report said "each write triggers a full re-dump." The literal mechanism was
subtler: `SnapshotStore.capture()` already had a **leading-edge** `minIntervalMs`
guard (10 s). Leading-edge means it fired the full physical-table scan on the
**first** write of a burst — the worst possible moment, mid write-storm at
startup — then silently returned `null` for the rest. That both amplified the
ANR (the 1k-query scan landed inside the busy window) and could leave the open
panel **stale** if the final committed write arrived inside the 10 s window
(violating the report's own acceptance criterion #3).

### Fix

Trailing-edge coalescing debounce at the snapshot/dump boundary
(`extension/src/timeline/snapshot-store.ts`), per the implementer note:

- New `requestCapture(client)`: each write increments a coalesced counter, stores
  the latest client, and resets a quiet-period timer. One `capture()` runs only
  after the writes settle.
- `_fireCoalescedCapture()`: bypasses the coarse `minIntervalMs` floor (so the
  final write is never dropped), **re-arms** the timer if a prior capture is
  still in flight (so an in-progress 1k-query scan never causes a lost burst),
  then logs `timeline: re-dump (coalesced K writes)`.
- `dispose()` clears the pending timer so it can't fire into a disposed store.
- `extension/src/extension-activation-final.ts`: the generation-watcher
  auto-capture now calls `requestCapture()` instead of `capture()`.
- `extension/src/extension-providers.ts`: passes the new `captureDebounceMs` and
  a timestamped logger into the store.
- `extension/package.json`: new `driftViewer.timeline.captureDebounceMs`
  (default 200 ms).
- The explicit immediate paths — bulk-apply (`editing-commands.ts`) and the
  manual snapshot command (`snapshot-commands.ts`) — are unchanged; they keep
  calling `capture(..., { bypassDebounce: true })`.

### Race-safety review

`capture()` sets `_capturing = true` synchronously before its first `await`, and
`_fireCoalescedCapture` checks `_capturing` with no interleaving `await` before
that, so there is no double-capture window. Writes arriving during an in-flight
capture re-increment the (reset) counter and re-arm; the re-arm fires once the
scan finishes, so no write is lost and the panel cannot be left stale. On a
transient capture error the counter is dropped, but the next generation bump
re-triggers, so there is no permanent stale state.

### Tests

- `extension/src/test/snapshot-store.test.ts`: added a `requestCapture()` block
  with 4 cases — burst coalesces to one capture after the quiet window, the
  coalesced-count log line ("3 writes"), singular wording ("1 write"), and the
  `minIntervalMs`-floor bypass (final write not dropped).
- Existing-test audit: grepped for `new SnapshotStore` and `.capture(` callers.
  The constructor change is backward-compatible (new params have defaults), so
  the existing 12 SnapshotStore tests and the timeline-provider test were
  unaffected.
- Command: `node --max-old-space-size=4096 node_modules/mocha/bin/mocha.js` →
  **2617 passing**. Type-check (`tsc --noEmit -p ./`) clean.

### Acceptance criteria

| Criterion | Status |
|---|---|
| Configurable debounce, default 150–300 ms | Done — `captureDebounceMs`, default 200 |
| N writes in one window → exactly 1 re-dump | Done — tested |
| Page reflects latest committed state, no missed final write | Done — floor-bypass + re-arm, tested |
| No change when no Advisor page open | Done — gated on `timeline.autoCapture` + providers present |
| Observable in logs (one coalesced line) | Done — `re-dump (coalesced K writes)`, tested |

### Scope notes

The implementing commit (`33b73da`) also swept in another workstream's untracked
`orphan_table_detector` files plus a pre-commit `dart format` pass on three
unrelated Dart files; those are not part of this task.
