# Migration preview dropped view-backed "new" tables

The views support change (GitHub issue #32) made `ServerUtils.getTableNames`
return views alongside base tables, but `CompareHandler._migrationNewTables`
still filtered its single-object `sqlite_master` lookup to `type='table'`. As a
result a view that appeared as a "new" object in the compare database returned no
CREATE statement and was silently omitted from the generated migration DDL.

## Finish Report (2026-06-19)

### Defect
- Endpoint `GET /api/migration/preview` (`CompareHandler.handleMigrationPreview`)
  builds its new/dropped/modified table sets from `getTableNames`, which after
  issue #32 selects `type IN ('table','view')` (`ServerConstants.sqlTableNames`).
- The per-object CREATE lookup inside `_migrationNewTables` was left at
  `SELECT sql FROM sqlite_master WHERE type='table' AND name='<table>'`. For any
  entry sourced from the now view-inclusive list, the filter excluded views, so
  `firstOrNull?['sql']` was null and the entire `-- NEW TABLE:` / `CREATE …`
  block was skipped.
- The same issue #32 commit updated the test mock's single-object lookup branch
  in `test/helpers/test_helpers.dart` to match `type IN ('table','view')`. Once
  that branch no longer matched the handler's `type='table'` query, the mock fell
  through to its empty default, so `compare_handler_test` received an empty
  `migrationSql` and the `contains('NEW TABLE: orders')` assertion failed.

### Fix
- `lib/src/server/compare_handler.dart`: the new-table lookup now selects
  `type IN ('table','view')`, matching `getTableNames`. A comment records why the
  filter must stay view-inclusive (issue #32) to avoid silently dropping a
  view-backed new object.

### Verification
- `dart test test/compare_handler_test.dart` → 12/12 passed.
- `dart analyze lib/src/server/compare_handler.dart test/compare_handler_test.dart`
  → no issues.
- Repo-wide grep confirmed no other test depends on the old single-object
  `type='table'` lookup; the two remaining `type='table'` test mocks key off the
  orphan-check base-table list (`ORDER BY name`), which is intentionally
  base-tables-only and unaffected.

### Related
- Follows `plans/history/2026.06/2026.06.19/views-support-and-screen.md` (issue
  #32); this closes a call site missed by that change.
