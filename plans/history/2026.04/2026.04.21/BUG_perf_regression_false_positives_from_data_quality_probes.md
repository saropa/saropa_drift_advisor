## Title

Perf regression detector reports false positives from the extension's own data-quality null-count probes

## Environment

- OS: Windows 11 Pro 10.0.22631 x64
- VS Code version: not captured — extension was loaded from the active workspace build; reproducer does not depend on VS Code version
- Extension version: saropa_drift_advisor 3.3.3 (from `extension/package.json`)
- Dart SDK version: not captured (irrelevant — bug is entirely inside the extension's TS path)
- Database type and version: SQLite (via Drift), as shipped by the `saropa` contacts app (`lib/database/drift/`)
- Connection method: Drift debug server over HTTP (Dart debug session, type `dart`/`flutter`)
- Relevant non-default settings: `driftViewer.perfRegression.enabled = true` (default), `driftViewer.perfRegression.threshold = 2.0` (default)
- Other potentially conflicting extensions: none relevant — reproduces with the drift-advisor extension alone

## Steps to Reproduce

1. Open the `d:\src\contacts` workspace in VS Code with `saropa_drift_advisor` 3.3.3 active.
2. Ensure `driftViewer.perfRegression.enabled` is at its default (`true`) and threshold at default (`2.0`).
3. Launch the Flutter app in debug mode so `DriftDebugServer.start()` runs and the extension connects.
4. Let the app complete its normal cold-start sequence. During that sequence the app imports static data into multiple tables (e.g. `affirmations`, `curious_facts`, `interesting_vocabulary`, `medical_conditions`, `emergency_tips`, …), causing row counts in those tables to jump from whatever the prior session left them at.
5. With the connection established, open the Drift Advisor diagnostics (or otherwise allow the Data Quality provider to run its pass) so the extension issues its `SUM(CASE WHEN "col" IS NULL THEN 1 ELSE 0 END) … FROM "<table>"` probe against each user table.
6. Stop the debug session (e.g. Shift+F5 or the VS Code stop button) so `vscode.debug.onDidTerminateDebugSession` fires. This is the trigger for regression analysis at [debug-commands-vm.ts:177-194](../extension/src/debug/debug-commands-vm.ts#L177-L194).
7. Observe the VS Code warning notification fired by `showRegressionWarning` at [perf-regression-detector.ts:88](../extension/src/debug/perf-regression-detector.ts#L88).

## Expected Behavior

Either:

- (Preferred) The extension's **own** introspection queries — null-count scans issued by `DataQualityProvider._queryNullCounts` ([data-quality-provider.ts:172-198](../extension/src/diagnostics/providers/data-quality-provider.ts#L172-L198)) and the equivalent scan in `health-metrics.ts` — are excluded from the perf pool consumed by `detectRegressions`. The detector should only flag regressions in **app** queries, not in diagnostics the extension itself injects.
- Or: the detector normalizes for row-count growth and cold-vs-warm cache state so that a full-table aggregate scan over a larger table is not compared 1:1 against a baseline recorded when the table held fewer rows or was warm in the page cache.

## Actual Behavior

Every debug session ends with a warning of the form:

```
Drift: 14 query regression(s) detected:
  "SELECT SUM(CASE WHEN "id" IS NULL THE...": 55ms vs baseline 6ms (9.17x)
  "SELECT SUM(CASE WHEN "id" IS NULL THE...": 27ms vs baseline 5ms (5.4x)
  "SELECT SUM(CASE WHEN "id" IS NULL THE...": 64ms vs baseline 16ms (4x)
  ...and 11 more
```

Inspecting the session log (`d:/src/contacts/reports/20260421/20260421_100205_contacts.log`) confirms:

- 46 total null-count `SUM(CASE WHEN …)` queries were issued during the session.
- All of them originated from the extension's own data-quality probe — the exact SQL shape generated at [data-quality-provider.ts:179](../extension/src/diagnostics/providers/data-quality-provider.ts#L179).
- None of the flagged queries are written anywhere in the `contacts` app source tree (grepped `lib/` for `SUM(CASE WHEN` and `_nulls` — zero matches).

So the "regression" is the extension's own probe running over tables whose row counts changed between sessions, compared against a baseline the extension recorded of itself on a prior run.

## Error Output

No exception or stack trace. The failure mode is a semantically wrong warning notification, not an error. The SQL is logged through Drift's normal SELECT logging channel at `[console] [log] Drift SELECT: …` and is picked up by the perf provider.

Representative log lines (timestamps from the 2026-04-21 10:02:05 session):

```
[10:04:04.610] Drift SELECT: SELECT SUM(CASE WHEN "id" IS NULL THEN 1 ELSE 0 END) AS "id_nulls", … FROM "affirmations"
[10:04:05.039] Drift SELECT: SELECT SUM(CASE WHEN "id" IS NULL THEN 1 ELSE 0 END) AS "id_nulls", … FROM "curious_facts"
[10:04:05.394] Drift SELECT: SELECT SUM(CASE WHEN "id" IS NULL THEN 1 ELSE 0 END) AS "id_nulls", … FROM "interesting_vocabulary"
[10:04:49.041] Drift SELECT: … FROM "affirmations"    (second pass)
[10:04:49.396] Drift SELECT: … FROM "curious_facts"   (second pass)
[10:04:49.738] Drift SELECT: … FROM "interesting_vocabulary" (second pass)
```

Both passes are the same shape — indicating the diagnostic pass runs more than once per session, which compounds the noise because the detector averages current-session durations across all occurrences before comparing to baseline.

## Minimal Reproducible Example

Any Drift/SQLite workspace where:

1. The extension's data-quality pass runs at least twice across two separate debug sessions, AND
2. At least one table's row count changes between those two sessions (either growth or cold-vs-warm cache state changes).

The contacts app reproduces this trivially because static-data import on first run populates multiple tables; subsequent runs either re-verify or incrementally extend them. But any app where a seed/migration step writes rows between sessions will hit it.

## What I Already Tried

- Confirmed the SQL does not originate in the `saropa` contacts app: grepped `d:\src\contacts\lib` for both `SUM(CASE WHEN` and `_nulls` — zero matches.
- Traced the SQL back to the extension: `SUM(CASE WHEN "<col>" IS NULL THEN 1 ELSE 0 END) AS "<col>_nulls"` is generated at [data-quality-provider.ts:179](../extension/src/diagnostics/providers/data-quality-provider.ts#L179); a near-duplicate (without the `_nulls` aliases) is generated at [health-metrics.ts:121-125](../extension/src/health/health-metrics.ts#L121-L125).
- Traced the warning itself to `showRegressionWarning` at [perf-regression-detector.ts:75-91](../extension/src/debug/perf-regression-detector.ts#L75-L91), invoked from `onDidTerminateDebugSession` at [debug-commands-vm.ts:184-194](../extension/src/debug/debug-commands-vm.ts#L184-L194).
- Raising `driftViewer.perfRegression.threshold` from 2.0 to a higher value suppresses the warning but also blinds the detector to genuine app-query regressions, so it is not an acceptable workaround.
- Disabling `driftViewer.perfRegression.enabled` suppresses the warning entirely — same problem.

## Regression Info

- Last working version: unknown. The null-count probe and the regression detector both exist in 3.3.3; I did not bisect earlier versions.
- First broken version: 3.3.3 confirmed. The bug is structural (extension-generated queries share the perf pool with app queries), so it likely exists in every version that shipped both the `DataQualityProvider` and the `perf-regression-detector`.
- What changed: N/A — appears to be an original design gap, not a regression.

## Impact

- Who is affected: any user who (a) has `driftViewer.perfRegression.enabled` at the default and (b) runs any app whose tables grow between debug sessions. That is the normal case for any app with migrations, seeding, or user-driven data growth.
- What is blocked: nothing is **blocked**, but the signal-to-noise ratio of the regression warning is effectively zero. Every session fires a warning for queries the user cannot fix because the user did not write them. Legitimate regressions in the user's own app queries are indistinguishable from this noise.
- Data risk: none.
- Frequency: every debug session where any probed table's row count or cache warmth differs from the last run — i.e., effectively every session.

## Suggested Fix (for triage, not prescriptive)

Lowest-cost fix: tag queries issued by the extension's own introspection paths (data-quality, health-metrics, profiler) with an internal marker and have `aggregateQueries` / `detectRegressions` skip them. One place to thread the marker through is the `QueryEntry` type in `api-types.ts`; the perf provider already stamps each entry, so adding an `origin: 'app' | 'extension'` field and filtering at the top of `detectRegressions` would isolate the fix to two files.

A more complete fix would also record row count alongside the baseline and either (a) skip comparison when row count changed materially, or (b) compare `avgMs / rowCount` rather than raw `avgMs`. That is strictly better but larger in scope.

## Checklist Before Submitting

- [x] Title names the specific broken behavior, not a vague category
- [x] Environment section is fully filled in (unknowns called out explicitly)
- [x] Steps to reproduce start from a clean state and are numbered
- [x] Expected vs. actual behavior are both stated explicitly
- [x] Error output is full text, not truncated or paraphrased
- [ ] Screenshots — not attached; the warning is textual and fully quoted above
- [x] Minimal reproducible example is actually minimal
- [x] Checked for existing bug reports covering the same issue — none found in `D:\src\saropa_drift_advisor\bugs\`
- [x] Sensitive data redacted — none present (SQL shape only, no data values)

## Resolution

**Status:** Fixed on 2026-04-21. Shipped by extending the v3.2.1 `isInternal`-tagging infrastructure from server-originated probes to extension-originated probes.

**Approach taken:** The preferred fix from the triage section — tag extension-owned diagnostic queries with an internal marker and have `detectRegressions` skip them — plumbed end-to-end:

1. **Extension → wire.** `DriftApiClient.sql()` accepts `{ internal?: boolean }` and threads it through both transports. HTTP `httpSql` emits `{"sql": ..., "internal": true}` in the POST body; VM-service `apiRunSql` sends `"internal": "1"` in the flat params map. The key is omitted entirely when false, so the wire payload stays byte-identical to 3.3.3 for every existing caller.
2. **Wire → timing record.** `SqlRequestBody` now carries the flag with strict `== true` parsing (strings `"1"`/`"true"` and numbers are rejected to prevent a browser client from opportunistically silencing its own slow queries). `SqlHandler.handleRunSql` routes internal requests through `ServerContext.internalQuery`, which stamps `QueryTiming.isInternal = true`. The VM bridge follows the same path via `Router.runSqlResult(sql, isInternal: ...)`.
3. **Callers marked internal.** `DataQualityProvider._queryNullCounts`, `scoreNullDensity` in `health-metrics.ts`, and the column profiler in `debug-commands-perf.ts` all pass `{ internal: true }` — these are the three extension-owned introspection paths named in this bug's triage section.
4. **Detector skips internal.** `aggregateQueries` in `perf-regression-detector.ts` drops any `QueryEntry` with `isInternal === true`. Since it is called by both `detectRegressions` and `recordSessionBaselines`, internal probes neither trigger false warnings on the current session nor poison future baselines.

**Explicitly not fixed in this change:** Suggestion #2 from the triage section — normalizing comparisons for row count or cold-vs-warm cache — was left for a future change. User-app queries that scan a growing table will still look "slower" than their prior-session baseline. This bug only resolves the feedback loop where the extension flagged *its own* probes.

**Test coverage added:**
- `extension/src/test/perf-baseline-store.test.ts` — "should skip isInternal=true queries (extension-owned probes)" exercises the detector path with the exact SQL shape from this bug's Actual Behavior section.
- `test/server_types_test.dart` — "fromJson captures internal flag when true" and "fromJson treats non-bool internal values as false" lock in the wire-format boundary.
- Existing `test/performance_handler_test.dart` already validates server-side `isInternal` filtering from `slowQueries` — no new tests needed there.

**Verification:** `dart analyze` clean on changed files (16 pre-existing warnings in unrelated files); `tsc --noEmit` clean; 48 Dart tests + 2501 extension mocha tests pass.

## Finish Report (2026-06-12)

Closes Suggestion #2 from the triage section above — the half of the original
fix that was explicitly deferred on 2026-04-21. The end-of-session perf
regression check previously compared a query's raw average wall-time against its
stored baseline. A query whose table grew between debug sessions returns more
rows and therefore costs proportionally more time, so it tripped the threshold
and produced a regression warning the developer could not act on (the slowdown
was table growth, not a code change). The same effect appeared when a result set
that was warm in the page cache on the baseline run came back cold on the next
run. With the extension's own `isInternal` probes already excluded, this
table-growth/cache noise was the remaining false-positive source in genuine app
queries.

**Approach.** The detector now compares *per-row* cost — current ms/row against
baseline ms/row — whenever it has a row count for both sides. Table growth
cancels out (more rows at the same per-row cost is not a regression); a real
per-row slowdown still crosses the threshold, including the case where the query
returns *fewer* rows now and raw timing would have read as "faster" and hidden
it. Baselines recorded before row-count tracking carry no count and fall back to
the unchanged raw comparison, so behavior shifts gradually as baselines refresh
rather than all at once.

**What changed.**

- **`extension/src/debug/perf-baseline-store.ts`** — `IPerfBaseline` gained an
  optional `avgRowCount`. `record(normalizedSql, durationMs, rowCount?)` takes an
  optional third argument and blends the row count into a rolling average with
  the same 20-sample EMA cap as the duration. The third argument is optional so
  every existing two-arg caller and test is untouched; the EMA seeds from the
  first observed count so a pre-existing baseline is not diluted against a
  phantom zero.
- **`extension/src/debug/perf-regression-detector.ts`** — `aggregateQueries`
  sums result rows per normalized key (`IAggregateEntry.totalRows`, non-finite
  counts coerced to 0). `detectRegressions` divides by row count on both sides
  when the baseline has a tracked count and both counts are positive, else uses
  the raw ratio; `IRegressionResult` exposes `currentRowCount`,
  `baselineRowCount`, and `rowCountNormalized`. `recordSessionBaselines` and
  `recordDvrQueriesIntoPerfBaselines` thread the per-query row count
  (`resultRowCount` for selects, `affectedRowCount` for writes) into the store.
  `showRegressionWarning` renders normalized findings as "Nx slower per row" with
  both row counts shown, so the figure is not misread next to raw millisecond
  values.

**Safety.** Every division is guarded (`baselineRows > 0`, `currentRows > 0`,
`basePerRow > 0`); a zero-row session (writes, empty results) falls back to the
raw ratio. The new fields are additive and optional, so persisted baselines from
prior releases deserialize cleanly.

**Test coverage added** (`extension/src/test/perf-baseline-store.test.ts`, 6
cases): pure table growth at constant per-row cost is not flagged; a genuine
per-row slowdown at constant row count is flagged with `rowCountNormalized`
true; a per-row slowdown that raw timing would hide (fewer rows, lower total
time) is flagged; a baseline with no row count falls back to the raw ratio; a
zero-row session falls back to the raw ratio; `recordSessionBaselines` persists a
rolling `avgRowCount`.

**Verification:** `npm run compile` clean (tsc + NLS checks); the
`perf-baseline-store.test.ts` file is fully green; full mocha suite 2707 passing.
Four failures in unrelated toolbar `data-tool` tests pre-exist this change (a
separate web-viewer workstream) and touch none of the perf files modified here.
