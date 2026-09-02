# PROPOSAL: Close the five test-coverage gaps that let the current batch of write-path and security bugs ship

**Status: Open**

Created: 2026-09-02
Type: Infrastructure
Related diagnostics: n/a (server test suite)

---

## Summary

The Dart suite has 45 test files and covers most endpoints at least once, but five specific
*scenario shapes* are absent - and each absent shape is exactly what hid one of the bugs filed
alongside this proposal. This is a request for five targeted test additions, not for broad coverage.

---

## Motivation

Every bug below is real, filed, and reproducible; each one survived because the suite never
exercised the scenario, not because the endpoint was untested.

| Missing scenario | Bug it let through |
|---|---|
| A POST with a non-JSON `Content-Type` | `003_infra_post_endpoints_missing_content_type_check_csrf.md` |
| Two overlapping write requests | `011_infra_edits_batch_transaction_race.md` |
| A host wiring *distinct* read and write callbacks | `043_infra_cell_update_rows_affected_unreliable.md` |
| A table or column name containing `"` reaching a handler | `012_infra_schema_handler_raw_identifier_interpolation.md` |
| `format: "sql"` import carrying DDL rather than INSERT | `002_infra_import_sql_format_executes_arbitrary_sql.md` |

The evidence that each shape is missing:

```bash
# 1. Content-Type is asserted nowhere in the suite for the non-/api/sql endpoints
grep -rn "contentType" test/ | grep -i "415\|must be application/json"
# (0 matches)

# 2. No test issues two overlapping writes
grep -rn "Future.wait\|unawaited" test/handler_integration_test.dart test/server_robustness_test.dart \
  | grep -i "edit\|cell\|import\|write"
# (0 matches)

# 3. The shared test helper exposes ONE write callback and no separate read connection,
#    so a split-connection host is unrepresentable in tests
grep -n "writeQuery" test/helpers/test_helpers.dart
# 30:  DriftDebugWriteQuery? writeQuery,
# 51:    writeQuery: writeQuery,

# 4. quoteIdent is unit-tested in isolation, but no HANDLER test ever sees a quoted name -
#    which is why schema_handler.dart's eight raw-interpolation sites went unnoticed
grep -rn 'quoteIdent' test/
# test/server_context_test.dart:194:      test('quoteIdent wraps and doubles embedded double-quotes (H2)', () {
# test/server_context_test.dart:195:        expect(ServerUtils.quoteIdent('users'), '"users"');
# test/server_context_test.dart:197:        expect(ServerUtils.quoteIdent('a"b'), '"a""b"');
# test/server_context_test.dart:199:          ServerUtils.quoteIdent('x" = 1 OR "1"="1'),

# 5. Every SQL-format import test feeds INSERT statements and asserts they EXECUTE;
#    none asserts that DDL is refused
grep -n "format: 'sql'" -A 4 test/drift_debug_import_test.dart | grep "data:"
#   data: 'INSERT INTO items (id) VALUES (1); INSERT INTO items (id) VALUES (2)',
#   data: 'INSERT INTO items VALUES (1); INSERT INTO items VALUES (2)',
#   data: 'INSERT INTO items VALUES (1);;;',
#   data: "INSERT INTO items (note) VALUES ('a;b'); ..."
```

---

## Detection / Behavior

### Should flag (problematic)

Each proposed test fails against the tree as it stands today, and passes once the corresponding fix
lands. That is the acceptance criterion - a test that passes before the fix is not testing the bug.

1. **Content-Type enforcement.** Parameterize over every mutating endpoint
   (`/api/import`, `/api/cell/update`, `/api/edits/apply`, `/api/indexes/apply`, `/api/snapshot`,
   `/api/session/share`, `/api/monitoring`, `/api/change-detection`, `/api/activity/capture`).
   POST a well-formed JSON body with `Content-Type: text/plain`; assert `415` (or `400`) **and**
   that the fake `writeQuery` recorded nothing.

2. **Concurrent writes.** Drive two `runValidatedBatchStatements` futures at once against a fake
   `writeQuery` that appends each statement to a list. Assert no `BEGIN` appears between another
   request's `BEGIN` and its matching `COMMIT`, and that no `ROLLBACK` is emitted by a request that
   never successfully opened a transaction.

3. **Split read/write connections.** Extend `test/helpers/test_helpers.dart` so a test can supply a
   `query` and a `writeQuery` backed by *different* fakes. Then assert `/api/cell/update` reports the
   real affected-row count - today the `changes()` probe runs on the read fake and returns 0.

4. **Quoted identifiers end-to-end.** Add a fixture table named `say"hi` with a column named
   `we"ird`, and drive `/api/schema/metadata`, `/api/schema/diagram`, `/api/dump`,
   `/api/table/{name}`, `/api/snapshot` and the anomaly scan over it. Assert every one succeeds and
   that the dump round-trips. This is the test that would have caught the eight raw-interpolation
   sites.

5. **SQL-format import rejects DDL.** Assert `format: "sql"` with
   `data: "DROP TABLE items"` (and with `ATTACH`, `PRAGMA`, and a cross-table `DELETE`) executes
   nothing and reports a rejection.

### Should pass (correct)

Existing behavior must not regress: a legitimate `application/json` POST, a single batch apply, a
shared read/write callback, plain identifiers, and an INSERT-only SQL import all keep working exactly
as they do today.

---

## Edge Cases

1. **`Content-Type: application/json; charset=utf-8`** - must be ACCEPTED. `parseSqlBody` already
   compares `contentType?.mimeType`, which strips parameters; the new shared guard must do the same,
   and a test should pin it.
2. **Missing `Content-Type` entirely** - needs discussion. Rejecting is safer (a cross-origin form
   always sends one of the three safelisted types), but some CLI clients omit it; recommend rejecting
   and documenting.
3. **Concurrency test flakiness** - drive it through the fake callback rather than real HTTP so the
   interleaving is deterministic; a wall-clock race would be flaky in CI.
4. **Quoted-identifier fixture on hosts without DDL** - the fixture needs a real SQLite instance;
   `test/helpers/test_helpers.dart` fakes return canned rows, so this one test needs an in-memory
   database rather than a fake.
5. **Runtime budget** - per the project's testing guidance these must be scoped so a targeted run
   stays fast; keep the quoted-identifier fixture to two tables.

---

## Alternatives Considered

- **Broad coverage push.** Rejected as padding: the suite's breadth is fine; five specific shapes are
  missing. Coverage percentage would not have caught any of these.
- **A lint rule instead of a test for gap 4.** Worth doing *as well* (proposed inside
  `012_infra_schema_handler_raw_identifier_interpolation.md` as a grep-based unit test), but a static
  check cannot prove the handlers behave correctly end-to-end.
- **Relying on the extension's mocha suite.** It cannot reach any of these - all five live entirely
  in `lib/src/`.

---

## Decision

<!-- Fill in when the proposal is accepted or declined -->

---

## Implementation Notes

Land each test in the same commit as its corresponding fix, so the "fails before, passes after"
property is verifiable in review. Gaps 1 and 3 also need small changes to
`test/helpers/test_helpers.dart` (a content-type parameter on the request builder; distinct read and
write fakes); do those first, since gaps 2 and 5 reuse them.

---

## Commits

<!-- Add commit hashes as implementation lands -->
