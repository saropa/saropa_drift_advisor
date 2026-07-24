# API Doc Update — Fill Missing Endpoint Sections

`doc/API.md` was stale at version 4.1.8 and missing documentation for 15 endpoints that had been added to the router over multiple releases. The doc also lacked HTTP 403 in its status code table and was missing several query parameters from the reference table.

## Finish Report (2026-07-24)

### Changes

**Version bump**: all 6 occurrences of `4.1.8` updated to `4.2.3` (the current `ServerConstants.packageVersion`).

**HTTP status codes**: added `403 Forbidden` row for the monitoring kill-switch gate.

**Query Parameters Reference**: expanded with 6 entries — `since` (broadened to cover activity/mutations), `table`, `sources`, `tables`, `maxRows`, `cursor`, `direction`.

**15 new endpoint sections** added, each verified against handler source code:

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

**Structural change**: the former "Import" section was renamed to "Write Endpoints" and now groups `POST /api/cell/update`, `POST /api/import`, `POST /api/edits/apply`, `POST /api/indexes/preview`, and `POST /api/indexes/apply` under one heading with a shared preamble about the `writeQuery` requirement.

### Verification method

Each handler's source file was read to extract: HTTP method, path, request body fields, query parameters, response JSON shape (field names, types, nesting), and error responses. The `toJson()` methods on `QueryTiming`, `RecordedQuery`, `MutationEvent`, and `SoftRelationshipEdge` were read to verify field-level accuracy.

### Not changed

- No Dart code modified.
- No test files modified.
- Response JSON examples use representative data; actual field values depend on database state.
- The `GET /api/mutations` event `toJson()` shape was documented from `mutation_tracker.dart`; the exact long-poll timeout was read from `ServerConstants.longPollTimeout` references but documented as "up to 30 s" consistent with the generation endpoint's existing doc.
