# BUG-017: Handler classes have no dedicated unit tests

## Status: Resolved

## Severity: Significant

## Component: Dart Tests

## Files

- `lib/src/server/analytics_handler.dart`
- `lib/src/server/auth_handler.dart`
- `lib/src/server/compare_handler.dart`
- `lib/src/server/generation_handler.dart`
- `lib/src/server/html_content.dart`
- `lib/src/server/import_handler.dart`
- `lib/src/server/performance_handler.dart`
- `lib/src/server/schema_handler.dart`
- `lib/src/server/session_handler.dart`
- `lib/src/server/snapshot_handler.dart`
- `lib/src/server/table_handler.dart`
- `lib/src/server/vm_service_bridge.dart`

## Description

All 12 handler files in `lib/src/server/` lack dedicated unit tests. The
integration test in `test/handler_integration_test.dart` covers happy-path HTTP
requests but does not test:

1. Edge cases (empty tables, null values, very long strings)
2. Error scenarios (database query failures, malformed requests)
3. Boundary conditions (max limit, max offset, empty schema)
4. Concurrent request handling
5. Large dataset handling
6. Handler-specific business logic in isolation

## Impact

- Regressions in handler logic may not be caught by the test suite
- Edge cases discovered in production require manual debugging
- Refactoring handlers is risky without unit test coverage
- New contributors cannot verify handler behavior without reading source

## Steps to Reproduce

1. Run `dart test` — all tests pass
2. Examine test files — no files named `*_handler_test.dart`
3. Review `handler_integration_test.dart` — only covers HTTP round-trips, not
   handler internals

## Expected Behavior

- Create dedicated test files for each handler:
  - `test/analytics_handler_test.dart`
  - `test/auth_handler_test.dart`
  - `test/compare_handler_test.dart`
  - etc.
- Test edge cases: empty results, null columns, large row counts
- Test error cases: query callback throws, malformed JSON body
- Test boundary cases: limit=0, offset=maxInt, table name with special chars
- Test handler logic in isolation (mock ServerContext)

## Resolution (2025-03-17)

Added 8 dedicated test files with ~100 unit tests covering handler business
logic in isolation:

- `test/index_analyzer_test.dart` — FK detection, `_id` suffix, datetime
  suffix heuristics, priority sorting, deduplication
- `test/anomaly_detector_test.dart` — null detection, empty strings, numeric
  outliers, orphaned FKs, duplicate rows, severity sorting
- `test/performance_handler_test.dart` — aggregation math, slow query
  threshold, pattern grouping/truncation, caps
- `test/schema_handler_test.dart` — `getDiagramData`, `getSchemaMetadataList`,
  `getFullDumpSql`
- `test/compare_handler_test.dart` — migration DDL generation (new/dropped/
  modified tables, column changes, nullability changes, index add/drop,
  sqlite_ auto-index filtering)
- `test/snapshot_handler_test.dart` — snapshot CRUD, row-level diff with PK
  extraction, added/removed/changed row detection
- `test/table_handler_test.dart` — `getTableFkMetaList` filtering
- `test/generation_handler_test.dart` — `getCurrentGeneration` semantics

Handlers skipped (already covered or not unit-testable):
- `HtmlContent` — static string (covered by integration test)
- `ImportHandler` — delegates to `DriftDebugImportProcessor` (already tested)
- `SessionHandler` — delegates to `DriftDebugSessionStore` (already tested)
- `AuthHandler` — auth logic tested via integration tests (requires `HttpRequest` fakes)
- `VmServiceBridge` — requires VM service runtime

Also added `createTestContext()` factory to `test/helpers/test_helpers.dart`
and enhanced `mockQueryWithTables()` to support single-table schema lookups.
