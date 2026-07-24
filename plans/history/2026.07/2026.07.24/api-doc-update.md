# API Doc Update — Fill Missing Endpoint Sections + `/api/docs` Endpoint

`doc/API.md` was stale at version 4.1.8 and missing documentation for 15 endpoints that had been added to the router over multiple releases. The doc also lacked HTTP 403 in its status code table and was missing several query parameters from the reference table. Additionally, there was no mechanism to serve the API reference from the running server or to prevent the version string from drifting.

## Finish Report (2026-07-24)

### Phase 1 — Documentation gap fill

**Version bump**: all 6 occurrences of `4.1.8` updated to `4.2.3` (the current `ServerConstants.packageVersion`).

**HTTP status codes**: added `403 Forbidden` row for the monitoring kill-switch gate.

**Query Parameters Reference**: expanded with 6 entries — `since` (broadened to cover activity/mutations), `table`, `sources`, `tables`, `maxRows`, `cursor`, `direction`.

**16 new endpoint sections** added, each verified against handler source code:

| Section | Endpoints | Handler |
|---------|-----------|---------|
| Views | `GET /api/views` | `schema_handler.dart` |
| Declared Schema | `GET /api/schema/declared` | `schema_handler.dart` |
| Relationships | `GET /api/schema/relationships` | `schema_handler.dart` |
| Report | `GET /api/report` | `report_handler.dart` |
| Snapshots (list) | `GET /api/snapshots` | `snapshot_handler.dart` |
| Snapshot (delete one) | `DELETE /api/snapshot/{id}` | `snapshot_handler.dart` |
| Snapshot (rename) | `PUT /api/snapshot/{id}` | `snapshot_handler.dart` |
| Cell Update | `POST /api/cell/update` | `cell_update_handler.dart` |
| Index Preview | `POST /api/indexes/preview` | `index_batch_handler.dart` |
| Index Apply | `POST /api/indexes/apply` | `index_batch_handler.dart` |
| Soft Relationships | `GET /api/issues/soft-relationships` | `soft_relationship_detector.dart` |
| Query History | `GET /api/history`, `DELETE /api/history` | `performance_handler.dart` |
| DVR | 6 endpoints under `/api/dvr/*` | `dvr_handler.dart` |
| Mutations | `GET /api/mutations` | `mutation_handler.dart` |
| API Docs | `GET /api/docs` | `generation_handler.dart` |

**Structural change**: the former "Import" section was renamed to "Write Endpoints" and now groups `POST /api/cell/update`, `POST /api/import`, `POST /api/edits/apply`, `POST /api/indexes/preview`, and `POST /api/indexes/apply` under one heading with a shared preamble about the `writeQuery` requirement.

### Phase 2 — Hardening

Each of the 9 items from the handoff reflection was verified against source code:

1. **DVR envelope**: confirmed `{schemaVersion: 1, generatedAt, data}` in all 6 handler methods. The 404 response adds `error`/`message` siblings alongside `data` — doc updated to show the full envelope in the error example.
2. **Report query params**: confirmed `!= 'false'` comparison via `ServerConstants.valueFalse` — doc accurate.
3. **Soft relationship rule constants**: confirmed exactly `'noun_id'` and `'shared_uuid'` — doc accurate.
4. **Cell update BLOB rejection**: confirmed non-null non-blank values rejected with "cannot be edited as text" — doc accurate.
5. **Snapshot rename optional body**: confirmed null/empty body clears label — doc accurate.
6. **MutationType enum**: confirmed exactly `{insert, update, delete}` — doc accurate.
7. **Long-poll timeout**: confirmed `Duration(seconds: 30)` — doc accurate.
8. **DVR envelope uniformity**: success responses are uniform; the 404 adds extra keys — doc corrected.
9. **No version sync test**: gap addressed, see below.

### Phase 3 — New endpoint and guard

**`GET /api/docs`**: new route in `_routePreQuery` (pre-gate, no DB dependency) serving `doc/API.md` as `text/markdown; charset=utf-8` via the existing `_sendWebAsset` file-serving pipeline. Path constants added to `ServerConstants`; endpoint listed in `healthEndpoints` and `apiIndexEndpoints`.

**Version sync test**: `test/version_sync_test.dart` gains a test that asserts `doc/API.md`'s `**API version:**` header matches `ServerConstants.packageVersion`. This prevents the version string from drifting on future releases.

### Verification method

Each handler's source file was read to extract: HTTP method, path, request body fields, query parameters, response JSON shape (field names, types, nesting), and error responses. The `toJson()` methods on `QueryTiming`, `RecordedQuery`, `MutationEvent`, and `SoftRelationshipEdge` were read to verify field-level accuracy. The long-poll timeout was confirmed as `Duration(seconds: 30)` from `ServerConstants.longPollTimeout`. All 4 version sync tests pass.
