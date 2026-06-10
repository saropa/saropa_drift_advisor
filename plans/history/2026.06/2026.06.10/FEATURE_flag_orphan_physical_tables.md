# Feature Request — Flag orphan PHYSICAL tables (present in the DB, absent from the Drift schema)

> Status: **Implemented** (2026-06-10). See the Finish Report at the end of
> this file for the shipped design, files, and tests.

> Filed from the Saropa Contacts repo following an ANR / schema-drift
> investigation (2026-06-06).
> Origin item: `contacts/docs/PLAN_STARTUP_PERFORMANCE_ANR_FOLLOWUP.md` **T15(a)**.

---

## Summary

Add an Advisor check that detects **orphan physical tables**: a table that
physically exists in the SQLite file but has **no** corresponding definition in
the app's Drift schema (the generated `*.g.dart` / `@DriftDatabase` table set).
This is the inverse of the usual "schema declares a table the DB lacks" check.

This check would have caught the **v33 orphan** in Saropa Contacts — a physical
table left in the database by a migration whose Drift definition had since been
removed/renamed, which sat undetected because nothing in the schema pointed at
it.

## Why it matters

- Orphan physical tables silently bloat the DB file and can shadow a re-created
  table on the next migration (a re-`CREATE TABLE` against an existing physical
  name behaves differently than against a clean slate).
- They are invisible to a schema-first audit: the Drift classes are the source
  of truth, so a table absent from them is never inspected. Only a check that
  starts from the **physical** side (enumerate `sqlite_schema`, subtract the
  Drift-declared set) can surface them.
- Saropa Contacts is mid-migration from Isar→Drift with a hand-written
  `build_static_data.py` path **plus** Drift migrations as a dual schema source
  (see `contacts` memory `project_drift_migration_collapse_at_freeze`), which is
  exactly the condition that produces orphans.

## Proposed Behavior

1. Enumerate physical tables from `sqlite_schema`
   (`WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).
2. Subtract Drift-internal bookkeeping tables (e.g. the migration/version table)
   from consideration.
3. Compare against the set of tables the connected Drift schema declares.
4. Any physical table not in the declared set → emit a diagnostic:
   "Orphan physical table `<name>` — present in the database but not declared in
   the Drift schema. Left by a prior migration? Drop it or restore its
   definition."

## Proposed Acceptance Criteria

- [x] A physical table with no Drift declaration is flagged.
- [x] Drift's own internal/version table is **not** flagged.
- [x] A normal, fully-declared schema produces zero orphan findings (no false
      positives on the healthy case).
- [x] The finding names the exact table and states the likely cause + remedy.
- [x] The check is opt-in or report-only first (does not auto-drop anything —
      dropping a table is destructive and must stay a human decision).

## Environment

| Field | Value |
|---|---|
| Repo | `saropa_drift_advisor` (this repo) — likely the analyzer side under `lib/src/` |
| Motivating case | Saropa Contacts v33 orphan physical table (Drift, SQLite) |
| Severity | Low–Medium (data-integrity guard; prevents a class of silent migration drift) |

## Related / companion items (NOT this repo — pointers only)

The same ANR follow-up (T15) names two sibling-repo items, recorded here only so
the thread isn't lost. They are **not** filed in this repo because their
emitters live elsewhere; each needs filing in its own repo:

- **T15(b)** — a signal template for repeated native platform-channel calls
  (the real N+1 the log analyzer can't see) → belongs in `saropa-log-capture`.
- **T15(c)** — an optional equivalent `saropa_lints` rule → belongs in
  `saropa_lints`.

Do not implement T15(b)/(c) from this repo.

---

## Finish Report (2026-06-10)

This work will be reviewed by another AI.

### Scope

(A) Dart package code (`lib/`, `test/`) + (C) docs (`CHANGELOG.md`, `doc/API.md`). No VS Code extension (TypeScript) changes.

### What shipped

An **orphan physical-table check**: detects tables that physically exist in the SQLite file but have no definition in the connected Drift schema — the inverse of Drift's own "schema declares a table the DB lacks" verification, which never inspects the physical side.

Core constraint and its resolution: the advisor is runtime-only — it sees physical tables via SQL but has no inherent knowledge of what the Drift schema *declares*. The declared set is therefore supplied to the server:

- `startDriftViewer` duck-types the Drift database's `allTables` → `actualTableName` to derive it automatically (returns null on any failure; never breaks startup).
- The callback API (`DriftDebugServer.start`) accepts a new optional `declaredTableNames` parameter.

When no declared set is available the check is **report-only and silent** (`declaredSchemaAvailable: false`, zero findings). That gating is what guarantees no false positives — the acceptance criterion "fully-declared schema produces zero findings" and "opt-in / report-only first" are satisfied by construction. The check never executes DDL; it only suggests a `DROP TABLE` the developer runs by hand.

### Files changed

- `lib/src/server/orphan_table_detector.dart` — **new.** `OrphanTableDetector` (static, stateless, mirrors `AnomalyDetector`): enumerates physical tables via `ServerUtils.getTableNames` (already excludes `sqlite_%`), subtracts the declared set + internal tables, case-insensitive match, emits findings with `table`/`severity`/`type`/`message`/`suggestedSql`. Default internal exclusion: `android_metadata` (Android `SQLiteOpenHelper` table).
- `lib/src/server/analytics_handler.dart` — added `getOrphanTablesResult` + `handleOrphanTables`; merged `orphan-table` source into `getIssuesList`; rewrote `_parseSourcesFilter` to a three-source record (`index-suggestions`, `anomalies`, `orphan-tables`) with all-on default and unrecognized-token fallback to all.
- `lib/src/server/router.dart` — `GET /api/analytics/orphan-tables` route + `getOrphanTablesResult` VM-service delegate.
- `lib/src/server/server_context.dart` — new `declaredTableNames` field.
- `lib/src/server/server_constants.dart` — `pathApiAnalyticsOrphanTables` (+ `Alt`).
- `lib/src/drift_debug_server_io.dart` — `declaredTableNames` param on impl `start` + mixin `start`, threaded into `ServerContext`.
- `lib/src/drift_debug_server_stub.dart` — matching `declaredTableNames` param (web stub signature parity).
- `lib/src/start_drift_viewer_extension.dart` — `_deriveDeclaredTableNames` helper + auto-wire.
- `test/orphan_table_detector_test.dart` — **new**, 8 cases.
- `test/orphan_table_issues_test.dart` — **new**, 4 cases.
- `test/helpers/test_helpers.dart` — `declaredTableNames` on `createTestContext`.
- `test/handler_integration_test.dart` — added `orphan-table` to the `/api/issues` stable-shape `anyOf` assertion.
- `CHANGELOG.md`, `doc/API.md` — endpoint + issues-shape documentation.

### Testing

- Audited existing tests referencing touched symbols: `anomaly_detector_test` matches were the unrelated `orphaned_fk` anomaly type (no overlap). The `sources=anomalies` / `sources=index-suggestions` integration tests were verified preserved by the `_parseSourcesFilter` rewrite (both still pass). The no-filter `/api/issues` stable-shape assertion was updated to include `orphan-table`.
- `dart analyze` — clean (0 issues).
- `dart test` — full suite 560 passing; affected-file subset (handler_integration, orphan detector, orphan issues, start_drift_viewer_extension, server_context) 190 passing.

### Implementation note (git)

The `lib/` and `test/` files for this feature were swept into commit `33b73da` (titled for an unrelated timeline-coalescing workstream) by another session committing the shared working tree. The docs (`CHANGELOG.md`, `doc/API.md`), the `handler_integration_test.dart` assertion update, and this archived spec are committed separately with an expressive orphan-table message. Functionality is intact and fully tested; the split is a history-cosmetic artifact only.

### Outstanding

None. All five acceptance criteria are met and test-covered.
