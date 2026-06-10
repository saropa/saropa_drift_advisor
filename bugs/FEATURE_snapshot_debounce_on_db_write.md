# Feature Request — Debounce the snapshot/re-dump so a single DB write can't trigger a full physical-table re-scan

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
