# Saropa Drift Advisor — REST API Reference

**API version:** 1.6.1 (synced with `ServerConstants.packageVersion`)
**Base URL:** `http://localhost:{port}` (default port: **8642**)

---

## Table of Contents

- [Common Conventions](#common-conventions)
- [Authentication](#authentication)
- [Error Format](#error-format)
- [HTTP Status Codes](#http-status-codes)
- [Query Parameters Reference](#query-parameters-reference)
- **Endpoints**
  - [Health & Generation](#health--generation)
  - [Tables](#tables)
  - [SQL](#sql)
  - [Schema & Export](#schema--export)
  - [Snapshots](#snapshots)
  - [Compare](#compare)
  - [Analytics](#analytics)
  - [Performance](#performance)
  - [Sessions](#sessions)
  - [Import](#import)
  - [Change Detection](#change-detection)
  - [Special Routes](#special-routes)

---

## Common Conventions

- All JSON responses use `Content-Type: application/json`.
- Every `/api/...` path also works without the leading `/` (e.g., `api/health`).
- The `X-Drift-Client: vscode` header identifies requests from the VS Code extension.
- File download responses set `Content-Disposition: attachment; filename="..."`.
- CORS headers are set when a `corsOrigin` is passed to `DriftDebugServer.start()`.
- Rate limiting (HTTP 429) applies when `maxRequestsPerSecond` is configured; `/api/health` and `/api/generation` are exempt.

---

## Authentication

Authentication is **optional**. When `authToken` or `basicAuthUser`/`basicAuthPassword` are passed to `DriftDebugServer.start()`, **all** requests require one of:

| Scheme | Header |
|--------|--------|
| Bearer token | `Authorization: Bearer <token>` |
| HTTP Basic | `Authorization: Basic <base64(user:password)>` |

**401 Unauthorized** response when auth fails:

```json
{
  "error": "Authentication required. Use Authorization header with Bearer scheme or HTTP Basic."
}
```

When HTTP Basic is configured, the response includes:

```
WWW-Authenticate: Basic realm="Saropa Drift Advisor"
```

---

## Error Format

All error responses use a consistent JSON shape:

```json
{
  "error": "Human-readable error message"
}
```

The `error` field is always a string. The HTTP status code indicates the error category.

---

## HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| 200 | OK | Successful request |
| 204 | No Content | Favicon request |
| 400 | Bad Request | Invalid input, missing fields, unknown table, non-read-only SQL |
| 401 | Unauthorized | Authentication required but missing/invalid |
| 404 | Not Found | Unknown route, session not found or expired |
| 429 | Too Many Requests | Rate limit exceeded (when configured) |
| 500 | Internal Server Error | Query execution error, unhandled exception |
| 501 | Not Implemented | Optional feature not configured (`getDatabaseBytes`, `queryCompare`, `writeQuery`) |

---

## Query Parameters Reference

| Parameter | Used By | Type | Default | Range | Description |
|-----------|---------|------|---------|-------|-------------|
| `limit` | `GET /api/table/{name}` | int | 200 | 1–1000 | Maximum rows to return |
| `offset` | `GET /api/table/{name}` | int | 0 | 0–2,000,000 | Number of rows to skip |
| `since` | `GET /api/generation` | int | — | ≥ 0 | Long-poll: block until generation > since |
| `format` | `GET /api/snapshot/compare`, `GET /api/compare/report` | string | — | `download` | Return as downloadable JSON attachment |
| `detail` | `GET /api/snapshot/compare` | string | — | `rows` | Include row-level diffs |

---

## Health & Generation

### `GET /api/health`

Health check. Always succeeds when the server is running.

**Response** `200 OK`

```json
{
  "ok": true,
  "extensionConnected": false,
  "version": "1.6.1"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | Always `true` |
| `extensionConnected` | boolean | Whether a VS Code extension client has connected recently (detected via `X-Drift-Client: vscode` header) |
| `version` | string | Package version from `pubspec.yaml` |

---

### `GET /api/generation`

Returns the current data-change generation number. Supports long-polling with the `since` query parameter.

**Query Parameters**

| Param | Type | Description |
|-------|------|-------------|
| `since` | int (optional) | When provided, blocks up to 30 seconds until `generation > since`, polling every 300 ms internally |

**Response** `200 OK`

```json
{
  "generation": 5
}
```

| Field | Type | Description |
|-------|------|-------------|
| `generation` | int | Monotonically increasing counter; increments when table data changes |

---

## Tables

### `GET /api/tables`

Returns a list of all user table names in the database.

**Response** `200 OK`

```json
["items", "users", "orders"]
```

The response is a JSON array of strings (table names), sorted alphabetically.

---

### `GET /api/table/{name}`

Returns row data for a specific table with pagination.

**Path Parameters**

| Param | Description |
|-------|-------------|
| `name` | Table name (must exist in the database) |

**Query Parameters**

| Param | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| `limit` | int | 200 | 1–1000 | Maximum rows to return |
| `offset` | int | 0 | 0–2,000,000 | Number of rows to skip |

**Response** `200 OK`

```json
[
  { "id": 1, "title": "First", "createdAt": "2025-01-01" },
  { "id": 2, "title": "Second", "createdAt": "2025-01-02" }
]
```

The response is a JSON array of row objects. Each object maps column names to their values.

**Error** `400 Bad Request` — unknown table

```json
{
  "error": "Unknown table: nonexistent"
}
```

---

### `GET /api/table/{name}/count`

Returns the row count for a table.

**Response** `200 OK`

```json
{
  "count": 42
}
```

**Error** `400 Bad Request` — unknown table (same as above).

---

### `GET /api/table/{name}/columns`

Returns column names for a table.

**Response** `200 OK`

```json
["id", "title", "createdAt"]
```

The response is a JSON array of strings (column names).

**Error** `400 Bad Request` — unknown table (same as above).

---

### `GET /api/table/{name}/fk-meta`

Returns foreign key metadata for a table.

**Response** `200 OK`

```json
[
  {
    "fromColumn": "user_id",
    "toTable": "users",
    "toColumn": "id"
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `fromColumn` | string | Column in this table that references another table |
| `toTable` | string | Referenced table name |
| `toColumn` | string | Referenced column name |

Returns an empty array `[]` if the table has no foreign keys.

**Error** `400 Bad Request` — unknown table (same as above).

---

## SQL

### `POST /api/sql`

Executes a read-only SQL query against the database.

**Request** `Content-Type: application/json`

```json
{
  "sql": "SELECT * FROM items WHERE id > 10"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sql` | string | Yes | SQL query to execute. Must be `SELECT` or `WITH ... SELECT`. |

**Response** `200 OK` — success

```json
{
  "rows": [
    { "id": 11, "title": "Example" }
  ]
}
```

**Error** `400 Bad Request` — validation errors

| Condition | Error message |
|-----------|---------------|
| Wrong Content-Type | `"Content-Type must be application/json"` |
| Malformed JSON | `"Invalid JSON"` |
| Missing/empty `sql` field | `"Missing or empty sql"` |
| Non-read-only SQL | `"Only read-only SQL is allowed (SELECT or WITH ... SELECT). INSERT/UPDATE/DELETE and DDL are rejected."` |

**Error** `500 Internal Server Error` — query execution failure

```json
{
  "error": "near \"SELCT\": syntax error"
}
```

---

### `POST /api/sql/explain`

Returns the EXPLAIN QUERY PLAN for a read-only SQL query.

**Request** same as `POST /api/sql`.

**Response** `200 OK`

```json
{
  "rows": [
    { "id": 0, "parent": 0, "notused": 0, "detail": "SCAN TABLE items" }
  ],
  "sql": "EXPLAIN QUERY PLAN SELECT * FROM items WHERE id > 10"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `rows` | array | EXPLAIN QUERY PLAN result rows |
| `sql` | string | The actual SQL executed (with `EXPLAIN QUERY PLAN` prepended) |

**Errors** same as `POST /api/sql`.

---

## Schema & Export

### `GET /api/schema`

Returns all CREATE TABLE statements as a plain-text SQL file.

**Response** `200 OK`

```
Content-Type: text/plain; charset=utf-8
Content-Disposition: attachment; filename="schema.sql"
```

```sql
CREATE TABLE items (id INTEGER PRIMARY KEY, title TEXT, createdAt TEXT);
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
```

---

### `GET /api/schema/diagram`

Returns structured table and foreign key data for rendering an ER diagram. When change detection is disabled, the response is `200` with empty `tables`, empty `foreignKeys`, and `changeDetection: false` (no schema queries run).

**Response** `200 OK`

```json
{
  "tables": [
    {
      "name": "items",
      "columns": [
        { "name": "id", "type": "INTEGER", "pk": true },
        { "name": "title", "type": "TEXT", "pk": false }
      ]
    }
  ],
  "foreignKeys": [
    {
      "fromTable": "orders",
      "fromColumn": "user_id",
      "toTable": "users",
      "toColumn": "id"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tables` | array | List of table objects with `name` and `columns` |
| `tables[].columns[].pk` | boolean | `true` if the column is (part of) the primary key |
| `foreignKeys` | array | List of foreign key relationships |

---

### `GET /api/schema/metadata`

Returns table metadata including column info and row counts. When change detection is disabled, the response is `200` with empty `tables` and `changeDetection: false` (no schema or count queries run).

**Response** `200 OK`

```json
{
  "tables": [
    {
      "name": "items",
      "columns": [
        { "name": "id", "type": "INTEGER", "pk": true },
        { "name": "title", "type": "TEXT", "pk": false }
      ],
      "rowCount": 42
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tables[].name` | string | Table name |
| `tables[].columns` | array | Column definitions (`name`, `type`, `pk`) |
| `tables[].rowCount` | int | Current row count |

---

### `GET /api/dump`

Returns full SQL dump (schema + INSERT statements for all data) as a downloadable text file.

**Response** `200 OK`

```
Content-Type: text/plain; charset=utf-8
Content-Disposition: attachment; filename="dump.sql"
```

```sql
CREATE TABLE items (id INTEGER, title TEXT);
-- Data dump
INSERT INTO "items" ("id", "title") VALUES (1, 'First');
INSERT INTO "items" ("id", "title") VALUES (2, 'Second');
```

---

### `GET /api/database`

Downloads the raw SQLite database file. Requires `getDatabaseBytes` to be configured.

**Response** `200 OK`

```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename="database.sqlite"
```

Body: raw SQLite binary bytes.

**Error** `501 Not Implemented` — not configured

```json
{
  "error": "Database download not configured. Pass getDatabaseBytes to DriftDebugServer.start (e.g. () => File(dbPath).readAsBytes())."
}
```

---

## Snapshots

### `POST /api/snapshot`

Captures the current state of all tables into an in-memory snapshot for later comparison.

**Response** `200 OK`

```json
{
  "id": "2025-06-15T10:30:00.000Z",
  "createdAt": "2025-06-15T10:30:00.000Z",
  "tableCount": 3,
  "tables": ["items", "users", "orders"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Snapshot identifier (ISO 8601 timestamp) |
| `createdAt` | string | When the snapshot was taken (ISO 8601 UTC) |
| `tableCount` | int | Number of tables captured |
| `tables` | array | List of table names included |

---

### `GET /api/snapshot`

Returns the current snapshot metadata, or `null` if none exists.

**Response** `200 OK` — snapshot exists

```json
{
  "snapshot": {
    "id": "2025-06-15T10:30:00.000Z",
    "createdAt": "2025-06-15T10:30:00.000Z",
    "tables": ["items", "users"],
    "counts": {
      "items": 42,
      "users": 10
    }
  }
}
```

**Response** `200 OK` — no snapshot

```json
{
  "snapshot": null
}
```

---

### `GET /api/snapshot/compare`

Diffs the current database state against the stored snapshot.

**Query Parameters**

| Param | Value | Description |
|-------|-------|-------------|
| `detail` | `rows` | Include row-level diffs (added, removed, changed rows). Requires primary keys. |
| `format` | `download` | Return as downloadable JSON file (`snapshot-diff.json`) |

**Response** `200 OK`

```json
{
  "snapshotId": "2025-06-15T10:30:00.000Z",
  "snapshotCreatedAt": "2025-06-15T10:30:00.000Z",
  "comparedAt": "2025-06-15T11:00:00.000Z",
  "tables": [
    {
      "table": "items",
      "countThen": 40,
      "countNow": 42,
      "added": 3,
      "removed": 1,
      "unchanged": 39
    }
  ]
}
```

**With `?detail=rows`**, each table entry also includes:

```json
{
  "hasPk": true,
  "addedRows": [{ "id": 43, "title": "New" }],
  "removedRows": [{ "id": 5, "title": "Deleted" }],
  "changedRows": [
    {
      "pk": "7",
      "then": { "id": 7, "title": "Old" },
      "now": { "id": 7, "title": "Updated" },
      "changedColumns": ["title"]
    }
  ]
}
```

**Error** `400 Bad Request` — no snapshot

```json
{
  "error": "No snapshot. POST /api/snapshot first to capture state."
}
```

---

### `DELETE /api/snapshot`

Clears the in-memory snapshot.

**Response** `200 OK`

```json
{
  "ok": "Snapshot cleared."
}
```

---

## Compare

### `GET /api/compare/report`

Compares the main database against a secondary database (provided via `queryCompare`). Returns schema and row-count diffs.

**Query Parameters**

| Param | Value | Description |
|-------|-------|-------------|
| `format` | `download` | Return as downloadable JSON file (`diff-report.json`) |

**Response** `200 OK`

```json
{
  "schemaSame": false,
  "schemaDiff": {
    "a": "CREATE TABLE items (id INTEGER, title TEXT);",
    "b": "CREATE TABLE items (id INTEGER, title TEXT, status TEXT);"
  },
  "tablesOnlyInA": ["legacy_data"],
  "tablesOnlyInB": ["new_feature"],
  "tableCounts": [
    {
      "table": "items",
      "countA": 42,
      "countB": 50,
      "diff": -8,
      "onlyInA": false,
      "onlyInB": false
    }
  ],
  "generatedAt": "2025-06-15T10:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `schemaSame` | boolean | `true` if schemas are identical |
| `schemaDiff` | object or null | `{a, b}` with full schema SQL when different; `null` when identical |
| `tablesOnlyInA` | array | Tables only in the main database |
| `tablesOnlyInB` | array | Tables only in the comparison database |
| `tableCounts` | array | Per-table row count comparison |
| `generatedAt` | string | ISO 8601 UTC timestamp |

**Error** `501 Not Implemented`

```json
{
  "error": "Database compare not configured. Pass queryCompare to DriftDebugServer.start."
}
```

---

### `GET /api/migration/preview`

Generates DDL migration statements to transform the main database schema into the comparison database schema.

**Response** `200 OK`

```json
{
  "migrationSql": "-- NEW TABLE: new_feature\nCREATE TABLE new_feature (...);\n",
  "changeCount": 3,
  "hasWarnings": true,
  "generatedAt": "2025-06-15T10:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `migrationSql` | string | Full DDL migration script |
| `changeCount` | int | Number of DDL statements (excluding comments) |
| `hasWarnings` | boolean | `true` if any statements contain WARNING comments |
| `generatedAt` | string | ISO 8601 UTC timestamp |

**Error** `501 Not Implemented`

```json
{
  "error": "Migration preview requires queryCompare. Pass queryCompare to DriftDebugServer.start()."
}
```

---

## Analytics

### `GET /api/index-suggestions`

Analyzes tables and suggests missing indexes based on foreign keys, naming patterns (`_id`, `_at`), and column usage heuristics.

**Response** `200 OK`

```json
{
  "suggestions": [
    {
      "table": "orders",
      "column": "user_id",
      "reason": "Foreign key without index (references users.id)",
      "sql": "CREATE INDEX idx_orders_user_id ON \"orders\"(\"user_id\");",
      "priority": "high"
    }
  ],
  "tablesAnalyzed": 5
}
```

| Field | Type | Description |
|-------|------|-------------|
| `suggestions` | array | List of index suggestions, sorted by priority |
| `suggestions[].priority` | string | `"high"`, `"medium"`, or `"low"` |
| `suggestions[].sql` | string | Ready-to-execute CREATE INDEX statement |
| `tablesAnalyzed` | int | Number of tables scanned |

---

### `GET /api/analytics/anomalies`

Scans all tables for data quality anomalies: NULL values, empty strings, orphaned foreign keys, duplicate rows, and numeric outliers.

**Response** `200 OK`

```json
{
  "anomalies": [
    {
      "table": "orders",
      "column": "user_id",
      "type": "orphaned_fk",
      "severity": "error",
      "count": 3,
      "message": "3 orphaned FK(s): orders.user_id -> users.id"
    },
    {
      "table": "items",
      "column": "title",
      "type": "empty_strings",
      "severity": "warning",
      "count": 5,
      "message": "5 empty string(s) in items.title"
    }
  ],
  "tablesScanned": 5,
  "analyzedAt": "2025-06-15T10:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `anomalies[].type` | string | `"null_values"`, `"empty_strings"`, `"orphaned_fk"`, `"duplicate_rows"`, or `"potential_outlier"` |
| `anomalies[].severity` | string | `"error"`, `"warning"`, or `"info"` |
| `anomalies[].count` | int | Number of affected rows (not present for `potential_outlier`) |
| `anomalies[].column` | string | Affected column (not present for `duplicate_rows`) |
| `tablesScanned` | int | Number of tables analyzed |
| `analyzedAt` | string | ISO 8601 UTC timestamp |

---

### `GET /api/analytics/size`

Returns database-level and per-table storage metrics.

**Response** `200 OK`

```json
{
  "pageSize": 4096,
  "pageCount": 128,
  "freelistCount": 2,
  "totalSizeBytes": 524288,
  "freeSpaceBytes": 8192,
  "usedSizeBytes": 516096,
  "journalMode": "wal",
  "tableCount": 5,
  "tables": [
    {
      "table": "items",
      "rowCount": 1000,
      "columnCount": 5,
      "indexCount": 2,
      "indexes": ["idx_items_title", "sqlite_autoindex_items_1"]
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `pageSize` | int | SQLite page size in bytes |
| `pageCount` | int | Total number of pages |
| `freelistCount` | int | Number of free (unused) pages |
| `totalSizeBytes` | int | `pageSize × pageCount` |
| `freeSpaceBytes` | int | `pageSize × freelistCount` |
| `usedSizeBytes` | int | `totalSizeBytes - freeSpaceBytes` |
| `journalMode` | string | SQLite journal mode (e.g., `"wal"`, `"delete"`) |
| `tableCount` | int | Number of user tables |
| `tables` | array | Per-table stats, sorted by `rowCount` descending |

---

## Performance

### `GET /api/analytics/performance`

Returns query performance statistics collected since server start (or last clear).

**Response** `200 OK`

```json
{
  "totalQueries": 150,
  "totalDurationMs": 2340,
  "avgDurationMs": 16,
  "slowQueries": [
    {
      "sql": "SELECT * FROM large_table",
      "durationMs": 450,
      "rowCount": 10000,
      "at": "2025-06-15T10:29:00.000Z"
    }
  ],
  "queryPatterns": [
    {
      "pattern": "SELECT * FROM items WHERE id = ?",
      "count": 50,
      "avgMs": 2,
      "maxMs": 15,
      "totalMs": 100
    }
  ],
  "recentQueries": [
    {
      "sql": "SELECT COUNT(*) AS c FROM items",
      "durationMs": 1,
      "rowCount": 1,
      "at": "2025-06-15T10:30:00.000Z"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `totalQueries` | int | Total number of queries recorded |
| `totalDurationMs` | int | Sum of all query durations |
| `avgDurationMs` | int | Average duration (rounded) |
| `slowQueries` | array | Queries exceeding 100 ms, sorted by duration desc (max 20) |
| `queryPatterns` | array | Grouped query patterns, sorted by total duration desc (max 20) |
| `recentQueries` | array | Most recent queries in reverse chronological order (max 50) |

---

### `DELETE /api/analytics/performance`

Clears all recorded query timing data.

**Response** `200 OK`

```json
{
  "status": "cleared"
}
```

---

## Sessions

### `POST /api/session/share`

Creates a collaborative debug session with a shareable URL.

**Request** `Content-Type: application/json`

```json
{
  "state": {
    "currentTable": "items",
    "sql": "SELECT * FROM items"
  }
}
```

The entire request body is stored as the session state.

**Response** `200 OK`

```json
{
  "id": "a1b2c3d4",
  "url": "http://localhost:8642/?session=a1b2c3d4",
  "expiresAt": "2025-06-15T11:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Session identifier |
| `url` | string | Full URL to access the session |
| `expiresAt` | string | ISO 8601 UTC expiry timestamp (default: 1 hour from creation) |

**Error** `400 Bad Request` — invalid JSON body

```json
{
  "error": "Invalid JSON body"
}
```

---

### `GET /api/session/{id}`

Retrieves a session by its ID.

**Response** `200 OK`

```json
{
  "state": {
    "currentTable": "items"
  },
  "createdAt": "2025-06-15T10:30:00.000Z",
  "expiresAt": "2025-06-15T11:30:00.000Z",
  "annotations": [
    {
      "text": "Found issue with users table",
      "author": "dev@example.com",
      "at": "2025-06-15T10:35:00.000Z"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `state` | object | The session state object (from the original POST body) |
| `createdAt` | string | ISO 8601 UTC creation timestamp |
| `expiresAt` | string | ISO 8601 UTC expiry timestamp |
| `annotations` | array | List of annotations added to this session |

**Error** `404 Not Found` — session not found or expired

```json
{
  "error": "Session not found or expired"
}
```

---

### `POST /api/session/{id}/extend`

Extends a session's expiry by another session duration (default 1 hour).

**Request** body can be empty.

**Response** `200 OK`

```json
{
  "expiresAt": "2025-06-15T12:30:00.000Z"
}
```

**Error** `404 Not Found` — session not found or expired (same as above).

---

### `POST /api/session/{id}/annotate`

Adds a text annotation to a session.

**Request** `Content-Type: application/json`

```json
{
  "text": "Found issue with users table",
  "author": "dev@example.com"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `text` | string | No | `""` | Annotation text |
| `author` | string | No | `"anonymous"` | Author identifier |

**Response** `200 OK`

```json
{
  "status": "added"
}
```

**Error** `404 Not Found` — session not found or expired (same as above).

---

## Import

### `POST /api/import`

Imports data into a table. Requires `writeQuery` to be configured.

**Request** `Content-Type: application/json`

```json
{
  "format": "csv",
  "data": "id,name,email\n1,Alice,alice@example.com\n2,Bob,bob@example.com",
  "table": "users"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `format` | string | Yes | Import format: `"csv"`, `"json"`, or `"sql"` |
| `data` | string | Yes | The data to import (CSV text, JSON array string, or SQL statements) |
| `table` | string | Yes | Target table name (must exist) |
| `columnMapping` | object | No | For CSV only: map from CSV header name to table column name (e.g. `{"user_id": "id", "full_name": "name"}`). Unmapped CSV columns are skipped. |

**Response** `200 OK`

```json
{
  "imported": 2,
  "errors": [],
  "format": "csv",
  "table": "users"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `imported` | int | Number of rows successfully imported |
| `errors` | array | List of per-row error messages (strings) |
| `format` | string | The format that was used |
| `table` | string | The target table name |

**Error** `501 Not Implemented` — not configured

```json
{
  "error": "Import not configured. Pass writeQuery to DriftDebugServer.start()."
}
```

**Error** `400 Bad Request`

| Condition | Error message |
|-----------|---------------|
| Invalid JSON body | `"Invalid JSON body"` |
| Missing fields | `"Missing required fields: format, data, table"` |
| Unknown table | `"Table \"users\" not found."` |

---

## Change Detection

### `GET /api/change-detection`

Returns whether automatic change detection is enabled.

**Response** `200 OK`

```json
{
  "changeDetection": true
}
```

---

### `POST /api/change-detection`

Enables or disables automatic change detection.

**Request** `Content-Type: application/json`

```json
{
  "enabled": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | boolean | Yes | `true` to enable, `false` to disable |

**Response** `200 OK`

```json
{
  "changeDetection": false
}
```

**Error** `400 Bad Request`

```json
{
  "error": "Expected JSON body with \"enabled\": true|false"
}
```

---

## Special Routes

### `GET /`

Returns the single-page web UI (HTML).

**Response** `200 OK` — `Content-Type: text/html`

---

### `GET /favicon.ico`

Returns the favicon or no content.

**Response** `200 OK` (SVG favicon) or `204 No Content`

---

### Unknown routes

Any unmatched route returns `404 Not Found`.
