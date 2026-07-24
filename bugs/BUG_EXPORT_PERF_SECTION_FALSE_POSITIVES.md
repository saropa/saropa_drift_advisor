# Exported drift-advisor reports carry no usable performance data — empty stats, self-generated PRAGMA noise, and static-data anomaly false positives

Status: Partially fixed — Findings 2, 3, 4 resolved; Finding 1 deferred to `plans/61-app-query-timing-ingest.md` (design written, not implemented). Kept open until Finding 1 lands.

Filed 2026-07-23 from the Saropa Contacts log-triage campaign (`d:\src\contacts\docs\PLAN_REPORTS_ERROR_CATALOG.md`). Evidence base: all 153 `*_contacts.drift-advisor.json` exports under `d:\src\contacts\reports\`.

## Environment

| Field | Value |
|---|---|
| OS | Windows 11 Pro 10.0.22631 x64 (host); Android physical device (Motorola) running the app |
| Consumer project | Saropa Contacts (`d:\src\contacts`), Drift over SQLite |
| Advisor endpoint | `http://127.0.0.1:8642` (per `baseUrl` in every export) |
| Extension version | Not recorded in the exports — the export JSON has no version field (see Finding 4) |
| Sample size | 153 exported reports, 2026-06 through 2026-07-23 |

## Steps to Reproduce

1. Run Saropa Contacts in debug with the advisor connected; use the app normally (contact list, detail panels — hundreds of Drift queries execute).
2. Open the advisor browser UI and browse the schema.
3. Export the report (produces `<ts>_contacts.drift-advisor.json`).
4. Inspect `performance` and `anomalies` in the export.

## Expected Behavior

- `performance.totalQueries` reflects the app's Drift traffic for the session.
- `recentQueries` / `slowQueries` contain app-issued SQL only.
- `anomalies` flags data problems a developer can act on.

## Actual Behavior — four findings

1. **146 of 153 exports have `totalQueries: 0`** — the entire `performance` block is empty (`slowQueries: []`, `recentQueries: []`) for real app sessions that demonstrably executed queries. Only 7 of 153 exports captured any query stats. Whatever resets or scopes the stats (per-connection counters? export-after-disconnect? app restart clearing state?) makes the perf section absent from >95% of exports.
2. **The 7 exports that DO have data are self-polluted.** Example `20260722_162811` (`totalQueries: 201, avgDurationMs: 6`): all 50 `recentQueries` entries are `PRAGMA table_info("<table>")` with `"source": "browser"` — the advisor's own schema-browser introspection, one per table, evicting every actual app query from the ring buffer. The advisor is measuring itself.
3. **`anomalies` flags immutable bundled static data as outliers.** Recurring info-severity entries: `star_trek_characters.weight_kilograms`, `image_blur_metas.byte_size/width/height`, `currency_rates.exchange_rate`, `you_tube_api_cache.duration_seconds`, `contact_points.points`. These tables are seed/static content; a max-vs-mean outlier heuristic on them can never indicate a defect, and the entries recur in every export that includes anomalies.
4. **Exports are unversioned** — no extension/server version field in the JSON, so regressions can't be correlated with releases (this report can't name the version that produced each export).

## Error Output

No errors — the defect is silently wrong/empty data. Representative rows:

```json
"performance": { "totalQueries": 0, "totalDurationMs": 0, "avgDurationMs": 0, "slowQueries": [], "recentQueries": [] }

{ "sql": "PRAGMA table_info(\"user_preferences\")", "durationMs": 0, "rowCount": 6, "at": "2026-07-22T21:01:51.453815Z", "source": "browser" }

{ "column": "weight_kilograms", "message": "Potential outlier in star_trek_characters.weight_kilograms: max value ... from mean ...", "severity": "info" }
```

## Minimal Reproducible Example

Any Saropa Contacts debug session + advisor export reproduces Finding 1. Opening the schema browser before exporting reproduces Finding 2 deterministically (50 PRAGMAs = ring-buffer size).

## What I Already Tried

- Swept all 153 exports programmatically (`d:\src\contacts\scripts\audit\catalog_report_findings.py`): zero non-PRAGMA slow queries exist in ANY export. Confirmed the "drift perf noise" seen during triage is 100% advisor-generated, not app queries.

## Regression Info

Unknown — exports span 2026-06 → 2026-07-23 with the same behavior throughout; no version fields to bisect with.

## Impact

Medium. The perf export is the artifact used for offline query triage in the consumer project; today it is either empty (95%) or self-measurement (5%), so real slow-query regressions are invisible. Proposed fixes, smallest first:

1. Exclude `source: "browser"` (and any `PRAGMA`) rows from `recentQueries`/`slowQueries`, or track them in a separate bucket.
2. Persist/accumulate app query stats so an export taken at any point in the session carries them (fix the `totalQueries: 0` scoping).
3. Skip anomaly scanning for tables matching the static bundle (or let the consumer project mark tables as static); at minimum stop re-reporting identical outliers every export.
4. Stamp exports with extension + server version.

## Resolution status

**Fixed (v4.2.4 / [Unreleased]):**

- **Finding 2 — self-pollution.** `PerformanceHandler.getPerformanceData` now excludes any `PRAGMA` statement from query totals, slow queries, patterns, AND `recentQueries` (`lib/src/server/performance_handler.dart`, `_isIntrospection`). The schema browser's `PRAGMA table_info` sweep no longer appears as application workload in the perf endpoint or the export. Regression test: `test/performance_handler_test.dart` ("PRAGMA introspection excluded from aggregates, slow, and recent"). Scope note: legitimate manual SQL-console queries (`source:"browser"`, non-PRAGMA) are retained deliberately — only introspection PRAGMAs are the demonstrated noise. If full `source:"browser"` exclusion is wanted, it is a one-line follow-up.
- **Finding 4 — unversioned exports.** The `.drift-advisor.json` sidecar now carries `versions: { extension, server }` (`extension/src/debug/log-capture-session-builder.ts`). Server version comes from `/api/health` (`HealthResponse.version`, already emitted); extension version from the manifest. Test updated: `log-capture-bridge.test.ts`.
- **Finding 3 — anomaly false positives on static/seed tables.** New `staticTables:` param on `startDriftViewer` / `DriftDebugServer.start`, threaded to `ServerContext.staticTables` and into `AnomalyDetector.getAnomaliesResult`, which auto-suppresses `potential_outlier` for those tables. Only the outlier kind is suppressed — NULL-in-NOT-NULL and orphan FKs still surface (a constraint violation in seed data is still a real bug). **Discoverability** (answering "how will any project know to use it?"): when an outlier is found on a table NOT marked static, the result carries one `outlier_check_hint` anomaly naming the table(s) and the exact `startDriftViewer(db, staticTables: [...])` snippet — the noise now advertises its own cure. **Auto-suggest ranking:** the hint distinguishes likely-static candidates (outlier tables with no observed mutation this session) from tables the app actively changed (`writes` or `hostChange` row-count deltas in `TableActivityTracker`), and puts only the candidates in the snippet — see `TableActivityTracker.tablesWithObservedMutations`, threaded into the detector. This signal is directional, not definitive (the advisor does not see app read/row-preserving-UPDATE traffic — the Finding 1 gap — so "no mutation observed" ≠ "never written"); it becomes reliable once app query-timing ingest lands (plans/61). When no activity data exists, every outlier table is offered as a candidate. Tests: `test/anomaly_detector_test.dart` (suppression, hint-present, hint-absent, mutated-table-excluded, all-mutated-no-candidate). Deliberately NOT done: an extension quick-fix that auto-writes the config — locating the `startDriftViewer(` call site across a monorepo is fragile, and the snippet is already copy-pasteable from the finding. Follow-up candidate.

**Not fixed — requires a feature (design written):**

- **Finding 1 — `totalQueries: 0` in 95% of exports.** This is NOT a scoping/reset bug. The advisor only records queries that flow through its own instrumented HTTP path (`ServerContext.timedQuery`). The app's Drift queries execute directly in the app process and never reach the advisor unless the app wires its query executor through `recordTiming` (noted at `server_context.dart:610-612`). Saropa Contacts does not. Making `totalQueries` reflect app traffic requires a query-timing ingest channel. Design written: `plans/61-app-query-timing-ingest.md` — the key correction to the bug's premise is that the server is in-process, so an in-process ingest hook + Drift `QueryInterceptor` helper is the right shape, not an HTTP push. Three decisions listed in the plan before coding.

## Finish Report (2026-07-23)

Three of the four findings were resolved; the fourth was reframed and deferred to a written design because it requires a new feature, not a fix.

### Defect and change

The exported `*_contacts.drift-advisor.json` report carried unusable performance data and recurring false-positive anomalies. Three independent defects were addressed:

- **Self-measurement in the performance block (Finding 2).** The performance endpoint aggregated every recorded timing, including the schema browser's `PRAGMA table_info(...)` introspection sweep (one per table). On a browsed schema these PRAGMAs filled the 50-entry `recentQueries` window and dominated the aggregates, so the report showed the advisor measuring its own introspection. `PerformanceHandler.getPerformanceData` now filters any statement whose text (trimmed, upper-cased) begins with `PRAGMA` out of the totals, slow-query list, pattern grouping, and `recentQueries`, via a new `_isIntrospection` predicate. PRAGMA is the only statement kind reaching `queryTimings` that is pure introspection — the read-only SQL validator rejects PRAGMA on the public `/api/sql` endpoint, so the prefix match is exhaustive, not heuristic. Internal-query handling is unchanged (still excluded from aggregates, still retained in `recentQueries`).

- **Outlier false positives on static/seed data (Finding 3).** The numeric-outlier scan (max-vs-mean 3σ) ran on immutable bundled tables, where an outlier can never indicate a defect, and recurred as info-level noise in every export. A `staticTables` parameter was added to `startDriftViewer` and `DriftDebugServer.start` (and the web stub, to preserve compile parity), stored on `ServerContext.staticTables`, and passed into `AnomalyDetector.getAnomaliesResult`. The detector derives one `AnomalySuppression(table, type: 'potential_outlier')` per static table and merges it with any caller-supplied suppressions before the existing `removeWhere` pass. Only the outlier kind is suppressed; NULL-in-NOT-NULL and orphan-FK checks still run on static tables, since a constraint violation in seed data remains a real defect. To make the parameter discoverable, the detector emits a single `outlier_check_hint` anomaly per scan whenever an unsuppressed outlier remains, naming the affected tables and embedding the exact `startDriftViewer(db, staticTables: [...])` snippet — the finding advertises its own remedy. The suppression plumbing (`AnomalySuppression`, threaded through `analytics_handler`) already existed but had no populating caller; this change is the first source that feeds it.

- **Unversioned exports (Finding 4).** Neither the session sidecar nor the public snapshot recorded which release produced them. The `DriftAdvisorSidecar` type gained an optional `versions: { extension, server }` block, populated in both `buildSessionEndContributions` (session-end path) and `buildSessionSnapshot` (the `getSessionSnapshot()` sibling-extension API). Extension version comes from the manifest via `getExtension('saropa.drift-viewer')`; server version from the `/api/health` payload, whose response already carried `version` — the `HealthResponse` type gained the matching optional field.

### Why Finding 1 was not fixed

`totalQueries: 0` is not a scoping or reset bug: the advisor server records only queries issued through its own instrumented callback, and the consuming app's Drift queries execute in the app isolate without passing through it. No server-side filter can surface data the server never receives. The remedy is a query-timing ingest channel; because the debug server runs in-process inside the app, the correct shape is an in-process ingest hook plus a Drift `QueryInterceptor` helper, not the HTTP push the bug assumed. This is captured as a design in `plans/61-app-query-timing-ingest.md` with three open decisions, and the bug remains open pending that work.

### Verification

Scoped Dart tests executed and passing: `performance_handler_test` (19), `anomaly_detector_test` (59, including three new static-table/hint tests), `handler_integration_test` (87), `drift_debug_server_test` (65). New assertions pin: PRAGMA exclusion across all four performance outputs; static-table suppression; hint presence with the exact snippet; hint absence when no outliers exist. The TypeScript suite (`log-capture-bridge.test.ts`, updated with a server-version assertion) is not runnable in this environment and is unverified by execution. `doc/API.md` was updated to document the `outlier_check_hint` type in both anomaly enumerations.
