# BUG: Five row-bearing endpoints encode JSON without `jsonEncodeFallback`, reproducing the "empty 200, no rows, no error" body

**Status: Fixed**

Created: 2026-09-02
Component: Server
File: `lib/src/server/table_handler.dart` (line 199), `lib/src/server/schema_handler.dart` (line 286), `lib/src/server/snapshot_handler.dart` (lines 283, 286), `lib/src/server/compare_handler.dart` (lines 135, 138)
Severity: Crash

---

## Summary

`ServerContext.writeJsonResponse` exists specifically so a response body can never fail to encode
after headers are committed - it routes `jsonEncode` through `ServerUtils.jsonEncodeFallback`, which
turns a `DateTime` / `BigInt` / custom host type into a string instead of throwing. Its own doc
comment names the symptom it was created to eliminate: the "empty 200, no rows, no error" body from
`plans/history/2026.06/2026.06.24/BUG_loopback_server_wedges_and_hard_to_discover_for_agents.md`.

Only `SqlHandler` and two `Router` sites actually use it. The five other endpoints that serialize
**raw database row values** call `const JsonEncoder.withIndent('  ').convert(...)` with no
`toEncodable`, after `setJsonHeaders(res)` has already committed a 200. A single unencodable column
value therefore throws mid-encode and the client receives a truncated or empty 200 - exactly the
failure the fallback was written to prevent, on the endpoints most likely to hit it.

---

## Attribution Evidence

```bash
# Positive - the encode-safe helper and the fallback it uses
grep -n "jsonEncodeFallback" lib/src/server/server_context.dart lib/src/server/server_utils.dart
# lib/src/server/server_context.dart:783:      jsonEncode(body, toEncodable: ServerUtils.jsonEncodeFallback),
# lib/src/server/server_utils.dart:66:  static Object jsonEncodeFallback(Object? value) {

# Who actually uses it - only 3 call sites, all in sql_handler / router
grep -arn "writeJsonResponse(" lib/src/server/ | grep -v "server_context.dart"
# lib/src/server/router.dart:434:      await _ctx.writeJsonResponse(
# lib/src/server/router.dart:481:      await _ctx.writeJsonResponse(response, <String, dynamic>{
# lib/src/server/sql_handler.dart:143:    await _ctx.writeJsonResponse(
# lib/src/server/sql_handler.dart:259:    await _ctx.writeJsonResponse(

# The row-bearing endpoints that bypass it - no toEncodable anywhere on these calls
grep -arn "JsonEncoder.withIndent" lib/src/
# lib/src/drift_debug_server_io.dart:762:        const JsonEncoder.withIndent('  ').convert(manifest),   <- manifest, all primitives: safe
# lib/src/server/compare_handler.dart:135:        res.write(const JsonEncoder.withIndent('  ').convert(report));
# lib/src/server/compare_handler.dart:138:        res.write(const JsonEncoder.withIndent('  ').convert(report));
# lib/src/server/schema_handler.dart:286:      res.write(const JsonEncoder.withIndent('  ').convert(data));
# lib/src/server/snapshot_handler.dart:283:        res.write(const JsonEncoder.withIndent('  ').convert(body));
# lib/src/server/snapshot_handler.dart:286:        res.write(const JsonEncoder.withIndent('  ').convert(body));
# lib/src/server/table_handler.dart:199:    res.write(const JsonEncoder.withIndent('  ').convert(data));

# Headers are committed BEFORE the encode at every one of those sites, e.g.
sed -n '196,201p' lib/src/server/table_handler.dart
#     final List<Map<String, dynamic>> data = ServerUtils.normalizeRows(raw);
#     _ctx.setJsonHeaders(res);
#     res.write(const JsonEncoder.withIndent('  ').convert(data));
#     await res.close();

# The codebase's own statement that row values can be unencodable
sed -n '/jsonEncode` throws `JsonUnsupportedObjectError`/,+3p' lib/src/server/server_utils.dart
#   /// `jsonEncode` throws `JsonUnsupportedObjectError` the moment it meets a
#   /// value outside its built-in set (num, String, bool, null, List, Map). A
#   /// query result can carry such a value - most commonly a `DateTime` (Drift
#   /// `DateTimeColumn` rows), but also `BigInt`, `Duration`, or any custom type
```

**Emit site(s) - list ALL:** `lib/src/server/table_handler.dart:199` (`GET /api/table/{name}`),
`lib/src/server/schema_handler.dart:286` (`GET /api/schema/metadata`),
`lib/src/server/snapshot_handler.dart:283` and `:286` (`GET /api/snapshot/compare`),
`lib/src/server/compare_handler.dart:135` and `:138` (`GET /api/compare/{id}`).
`drift_debug_server_io.dart:762` is the discovery manifest - all primitives, not affected.
**Diagnostic `source` / `owner` as seen in Problems panel:** n/a (runtime server behavior).

---

## Environment

- OS:
- VS Code version:
- Extension version:
- Dart SDK version:
- Flutter SDK version (if applicable):
- Database type and version: SQLite (any)
- Connection method: HTTP loopback
- Relevant non-default settings: a host `query` callback that maps rows itself (the documented
  callback API) rather than passing Drift's raw `QueryRow.data` through
- Other potentially conflicting extensions:

---

## Minimal Reproducible Example

Wire the server with a callback that returns a `DateTime` - the shape
`ServerUtils.jsonEncodeFallback` documents as the common case:

```dart
await DriftDebugServer.start(
  query: (sql) async => [
    <String, dynamic>{'id': 1, 'created': DateTime.utc(2026, 1, 1)},
  ],
);
```

```bash
curl -sv http://127.0.0.1:8642/api/table/events
# < HTTP/1.1 200 OK
# < content-type: application/json; charset=utf-8
# (body: empty)

curl -s -X POST http://127.0.0.1:8642/api/sql \
  -H 'Content-Type: application/json' -d '{"sql":"SELECT * FROM events"}'
# {"rows":[{"id":1,"created":"2026-01-01T00:00:00.000Z"}]}      <- works, uses writeJsonResponse
```

The same query returns correct data through `/api/sql` and an empty 200 through
`/api/table/{name}`. That inconsistency is the tell.

---

## Expected Behavior

Every JSON response carrying database row values goes through `ServerContext.writeJsonResponse`, so
an unencodable value degrades to a string and the body is always well-formed - the invariant that
helper was added to establish.

---

## Actual Behavior

`JsonUnsupportedObjectError` is thrown inside `res.write(...)`'s argument evaluation. Because
`setJsonHeaders(res)` already ran, the 200 status and content type are on the wire; the exception
propagates to `Router.onRequest`'s outer catch, which tries `sendErrorResponse` - that call then
throws too (headers already committed) and is swallowed by the inner catch. The client is left with
a committed 200 and an empty body, and the connection is closed with no error surfaced anywhere the
client can see.

Secondary defect on the same lines: `JsonEncoder.withIndent('  ')` pretty-prints these payloads.
`/api/table/{name}` returns up to `ServerConstants.maxLimit` (1000) rows and is the viewer's
highest-frequency data endpoint; indentation inflates that body roughly two- to three-fold in bytes
and CPU for a machine-read response that no human reads.

---

## Error Output

```
JsonUnsupportedObjectError: Converting object to an encodable object failed: Instance of 'DateTime'
```

logged via `ServerContext.logError` from `Router.onRequest`, followed by a second logged error from
the failed `sendErrorResponse`. Nothing reaches the HTTP client.

---

## Duplicate-Emission Check

Dart-only. The extension and web viewer consume these endpoints and surface an empty table with no
error message, which is why the symptom was originally reported as "connected but no data" rather
than as an encoding failure.

---

## What I Already Tried

- [x] Enumerated every `JsonEncoder.withIndent` site and classified which carry row data vs
      primitives
- [x] Confirmed `writeJsonResponse` has only three call sites, none of them the five above
- [x] Confirmed `setJsonHeaders` precedes the encode at each site, so the throw is always
      post-commit
- [x] Confirmed `Router.onRequest`'s recovery path cannot help once headers are committed - its own
      comment says so

---

## Regression Info

- Last working version: n/a
- First broken version:
- What changed: `writeJsonResponse` + `jsonEncodeFallback` were introduced to fix the empty-200
  symptom on `/api/sql`; the other five row-bearing endpoints were not converted in that pass

---

## Root Cause

The fix was applied at the endpoint where the bug was reported rather than to the class of
endpoints that share the hazard. Nothing prevents a handler from calling `jsonEncode` directly.

**Proposed fix sketch:**

1. Convert all six sites to `await _ctx.writeJsonResponse(res, data)`. That also removes the
   duplicated `setJsonHeaders` + `res.write` + `res.close` sequence and picks up the guarded
   `close()` (socket-race tolerant) those sites currently lack.
2. Drop `JsonEncoder.withIndent` for API responses - keep compact encoding for machine consumers.
   If a human-readable variant is wanted, gate it behind `?pretty=1`.
3. Make the invariant mechanical: a unit test that greps `lib/src/server/*.dart` for
   `jsonEncode(` / `JsonEncoder` outside `server_context.dart` and `server_utils.dart` and fails on
   any match that is not encoding a literal `Map<String, String>` error envelope. This class of bug
   has now recurred once; a convention alone did not hold it.
4. Regression test: a fake `query` returning a `DateTime` value, asserting
   `GET /api/table/{name}`, `/api/schema/metadata`, `/api/snapshot/compare` and `/api/compare/{id}`
   all return a parseable body with the ISO-8601 string.

---

## Changes Made

Added `toEncodable: ServerUtils.jsonEncodeFallback` (as the second positional argument —
`JsonEncoder.withIndent` takes `toEncodable` positionally, not as a named parameter) to all five
identified `JsonEncoder.withIndent('  ').convert(...)` call sites, matching the fallback already used
by `ServerContext.writeJsonResponse`. `const` was dropped from each constructor call since a non-null
`toEncodable` closure makes the constructor non-const.

- `lib/src/server/table_handler.dart:199` (`sendTableData`, GET `/api/table/<name>`)
- `lib/src/server/schema_handler.dart:286` (`sendSchemaDiagram`, GET `/api/schema/diagram` — the bug
  doc's "GET /api/schema/metadata" label was a naming slip; this is the diagram endpoint, the only
  `JsonEncoder.withIndent` site in that file)
- `lib/src/server/snapshot_handler.dart:283` and `:286` (both branches of the snapshot-compare
  response, download and inline)
- `lib/src/server/compare_handler.dart:135` and `:138` (both branches of the DB-compare report
  response, download and inline)

All four files already imported `server_utils.dart`, so no import changes were needed. Left the
broader recommendations from the fix sketch (converting these sites to `writeJsonResponse` outright,
dropping pretty-printing for API responses, adding a grep-based regression test) out of scope — this
change addresses only the crash, not the secondary pretty-print performance note or the "make it
mechanical" test.

Not run: `dart analyze` / `dart test` (per task instructions — analyzer/build runs excluded from this
fix).

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- Who is affected: any host whose `query` callback yields a non-primitive column value - explicitly
  including Drift `DateTimeColumn` rows, which `server_utils.dart` names as the common case.
- What is blocked: table browsing, schema metadata, and both compare views return empty 200s. The
  viewer shows an empty grid with no error, so the user reads it as "no data" rather than "failure".
- Data risk: none - reads only.
- Frequency: deterministic per affected column; every request touching such a table fails
  identically.
