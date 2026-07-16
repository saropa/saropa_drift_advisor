# Saropa Drift Advisor — REST API Reference

**API version:** 4.1.8 (synced with `ServerConstants.packageVersion`)
**Base URL:** `http://localhost:{port}` (default port: **8642**)

> **Finding a running server (non-UI clients):** on startup the server writes a
> discovery manifest to `~/.saropa_drift_advisor/server.json` (host, port,
> version, flags, pid, workspace, endpoints). Read it to learn the port without
> guessing, then call `GET /api/` for the endpoint catalog. See
> [Server Discovery](#server-discovery).

---

## Table of Contents

- [Server Discovery](#server-discovery)
- [Common Conventions](#common-conventions)
- [Authentication](#authentication)
- [Error Format](#error-format)
- [HTTP Status Codes](#http-status-codes)
- [Query Parameters Reference](#query-parameters-reference)
- **Endpoints**
  - [API Index (`GET /api/`)](#api-index)
  - [Health & Generation](#health--generation)
  - [Table Activity](#table-activity)
  - [Tables](#tables)
  - [SQL](#sql)
    - [Web viewer (`GET /?sql=`)](#api-sql-web-viewer)
    - [`POST /api/sql`](#api-post-sql)
    - [`POST /api/sql/explain`](#api-post-sql-explain)
  - [Schema & Export](#schema--export)
  - [Snapshots](#snapshots)
  - [Compare](#compare)
  - [Analytics](#analytics)
  - [Issues](#issues)
  - [Performance](#performance)
  - [Sessions](#sessions)
  - [Import](#import)
  - [Change Detection](#change-detection)
  - [Monitoring Kill Switch](#monitoring-kill-switch)
  - [Special Routes](#special-routes)

---

## Server Discovery

Two mechanisms let a non-UI client (AI coding agent, CLI script, CI check) find
and understand the server without being handed the URL or reading the source.

### Discovery manifest file

On startup the server writes a JSON manifest to a well-known path under the
user's home directory:

- **Windows:** `%USERPROFILE%\.saropa_drift_advisor\server.json`
- **macOS / Linux:** `$HOME/.saropa_drift_advisor/server.json`

```json
{
  "host": "127.0.0.1",
  "port": 8642,
  "version": "4.1.8",
  "schemaVersion": 1,
  "writeEnabled": false,
  "loopbackOnly": true,
  "monitoring": "enabled",
  "pid": 12345,
  "workspace": "d:/src/contacts",
  "startedAt": "2026-06-24T12:00:00.000Z",
  "endpoints": ["/api/health", "/api/", "/api/sql", "..."]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `host` | string | Loopback host to connect to (`127.0.0.1`) |
| `port` | int | The actually-bound port (matters when the app started with `port: 0`) |
| `version` | string | Package version |
| `schemaVersion` | int | Saropa Diagnostic Envelope version |
| `writeEnabled` | boolean | Whether write endpoints are configured |
| `loopbackOnly` | boolean | Whether the server bound 127.0.0.1 only |
| `monitoring` | string | `"enabled"` or `"disabled"` — the global kill-switch state (see [Monitoring Kill Switch](#monitoring-kill-switch)). Rewritten on runtime flips so external tools can tell a deliberately dormant server from a broken one |
| `pid` | int | Host process id (used to clean up the manifest on shutdown) |
| `workspace` | string | The host process's working directory |
| `startedAt` | string | ISO 8601 UTC start time |
| `endpoints` | array | Compact list of read endpoint paths |

Notes:

- **Best-effort and desktop-only.** When no home directory is resolvable (e.g. a
  mobile embedder), the manifest is silently skipped — it never blocks startup.
- **Removed on shutdown** (only when the file's `pid` matches the stopping
  process, so a second server in another process keeps its own manifest). A
  stale manifest left by a crash is harmless: a client that connects gets a
  connection refused on the dead port and should re-check the manifest or scan.
- **Single file, last writer wins.** If multiple apps run servers, the manifest
  reflects the most recently started one; read `port` and confirm with
  `GET /api/health` before relying on it.

### `GET /api/`

See [API Index (`GET /api/`)](#api-index) below.

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
| `sql` | `GET /` (HTML viewer) | string | — | — | URL-encoded read-only SQL to prefill **Run SQL**; does not auto-execute. See [Web viewer (`GET /?sql=`)](#api-sql-web-viewer). |

---

<a id="api-index"></a>

## API Index

### `GET /api/`

A self-describing index of the read API for non-UI clients. Also matched at
`GET /api` (no trailing slash). Returns the product name, version, key flags, a
link to this reference, and a `{method, path, description}` list of the
endpoints an external agent uses to inspect a live database.

**Response** `200 OK`

```json
{
  "name": "Saropa Drift Advisor",
  "version": "4.1.8",
  "schemaVersion": 1,
  "writeEnabled": false,
  "loopbackOnly": true,
  "docs": "https://cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@v4.1.8/doc/API.md",
  "endpoints": [
    { "method": "GET", "path": "/api/health", "description": "Liveness probe; reports version, flags, capabilities, endpoints." },
    { "method": "POST", "path": "/api/sql", "description": "Run read-only SQL. Body {\"sql\":\"SELECT ...\"}; returns {\"rows\":[...]}." }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Product display name |
| `version` | string | Package version |
| `schemaVersion` | int | Saropa Diagnostic Envelope version |
| `writeEnabled` | boolean | Whether write endpoints are configured |
| `loopbackOnly` | boolean | Whether the server bound 127.0.0.1 only |
| `docs` | string | URL to this full REST reference (version-pinned on the CDN) |
| `endpoints` | array | `{ method, path, description }` for each read endpoint |

---

## Health & Generation

### `GET /api/health`

Health check. Always succeeds when the server is running.

**Response** `200 OK`

```json
{
  "ok": true,
  "extensionConnected": false,
  "version": "4.1.8",
  "schemaVersion": 1,
  "writeEnabled": false,
  "compareEnabled": false,
  "monitoringEnabled": true,
  "loopbackOnly": true,
  "capabilities": ["issues"],
  "endpoints": ["/api/health", "/api/", "/api/sql", "/api/sql/explain", "/api/tables", "/api/table/", "/api/schema", "/api/schema/metadata", "/api/views", "/api/issues", "/api/generation"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ok` | boolean | Always `true` |
| `extensionConnected` | boolean | Whether a VS Code extension client has connected recently (detected via `X-Drift-Client: vscode` header) |
| `version` | string | Package version from `pubspec.yaml` |
| `schemaVersion` | int | Saropa Diagnostic Envelope version (see [`GET /api/issues`](#get-apiissues)). Lets a suite client (Saropa Lints, Saropa Log Capture) confirm the issue shape before parsing. Bumped only on a breaking change; consumers ignore unknown fields and refuse a higher major. |
| `writeEnabled` | boolean | Whether write endpoints (`/api/cell/update`, `/api/edits/apply`, `/api/import`) are configured |
| `compareEnabled` | boolean | Whether a comparison database (`queryCompare`) is configured |
| `monitoringEnabled` | boolean | Global monitoring & logging kill-switch state. `false` = the server is deliberately dormant: no query recording, timing capture, or change-detection sweeps, and every data-inspection endpoint answers `403 Forbidden`. Health keeps answering so probes can tell "dormant" from "gone". Toggle via [`POST /api/monitoring`](#post-apimonitoring). |
| `loopbackOnly` | boolean | Whether the server bound 127.0.0.1 only. Lets a remote probe tell "up but loopback-only" from "absent" |
| `capabilities` | array of strings | Server feature flags. Contains `"issues"` when `GET /api/issues` is supported; clients can use this to prefer the merged issues endpoint over separate index-suggestions and anomalies calls. |
| `endpoints` | array of strings | Compact list of read endpoint paths (the richer form is at [`GET /api/`](#api-index)) |

**Note:** The VS Code extension’s **port discovery** treats a host as a Saropa Drift server only when **`ok` is true and `version` is a non-empty string**, so it does not need a follow-up schema request per port.

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

## Table Activity

### `GET /api/activity`

Live per-table activity aggregates plus a ring of recent events, powering the Heartbeat / Watch screen. Served entirely from in-memory state — the endpoint never queries the database, so polling it cannot generate activity of its own.

Activity is fed by three signals: reads executed through the advisor (table browsing, SQL runner), writes executed through the advisor (cell edits, batch edits, import), and host-app changes **detected** as row-count deltas between change-detection sweeps. By default the server does not see the host app's own reads, or host writes that leave a row count unchanged (e.g. UPDATE-in-place) — `hostChanges` means "detected changes", never "all writes". A fourth, opt-in signal exists when the host wires `DriftDebugServer.reportActivity` and a viewer arms capture (see [`POST /api/activity/capture`](#post-apiactivitycapture)): the host's own SELECT/WITH statements then record reads and INSERT/UPDATE/DELETE/REPLACE record writes. Internal server/extension probes (change-detection sweeps, diagnostic queries, this endpoint's own polling) are never recorded.

While capture is armed, every request to this endpoint renews the capture lease (see below).

Returns `403 Forbidden` with the standard structured error while the [monitoring kill switch](#monitoring-kill-switch) is engaged.

**Query Parameters**

| Param | Type | Description |
|-------|------|-------------|
| `since` | int (optional, default 0) | Filters `recentEvents` to events with `gen > since`. Malformed values degrade to 0 (full ring). Does not filter `tables`. |

**Response** `200 OK`

```json
{
  "activityGeneration": 12,
  "captureArmed": false,
  "tables": [
    {
      "table": "items",
      "reads": 4,
      "writes": 1,
      "hostChanges": 2,
      "rowCount": 42,
      "lastReadAt": "2026-07-16T10:15:00.000Z",
      "lastWriteAt": "2026-07-16T10:14:20.000Z",
      "lastHostChangeAt": "2026-07-16T10:13:05.000Z"
    }
  ],
  "recentEvents": [
    { "table": "items", "kind": "read", "at": "2026-07-16T10:15:00.000Z", "gen": 12 }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `activityGeneration` | int | Monotonic counter; bumps on every recorded event. Poll with `?since=` against it. |
| `captureArmed` | bool | Whether host-statement capture is currently armed. The server is the authority — a lease can expire, or another viewer can disarm, between a client's own toggles. |
| `tables` | array | Only tables with at least one recorded event this session — untouched tables are never listed (seed the full grid from [`GET /api/tables`](#get-apitables)). Sorted by table name. |
| `tables[].table` | string | Table name. |
| `tables[].reads` / `writes` / `hostChanges` | int | Per-kind counters since server start (not capped by the event ring). |
| `tables[].rowCount` | int | Latest cached row count from change detection. **Omitted** when unknown (no sweep has run yet). |
| `tables[].lastReadAt` / `lastWriteAt` / `lastHostChangeAt` | string | ISO8601 UTC timestamp of the most recent event of that kind. **Omitted** when that kind never occurred. |
| `recentEvents` | array | Bounded ring of the most recent 200 events, oldest first, filtered to `gen > since`. |
| `recentEvents[].kind` | string | `"read"` \| `"write"` \| `"hostChange"`. |
| `recentEvents[].gen` | int | The `activityGeneration` value stamped when the event was recorded (use as the next `since`). |

### `POST /api/activity/capture`

Arms or disarms host-statement capture for the Heartbeat screen. While armed, statements the host app reports via `DriftDebugServer.reportActivity(sql)` are classified and recorded: `SELECT`/`WITH` as per-table reads, `INSERT`/`UPDATE`/`DELETE`/`REPLACE` as writes (leading SQL comments are skipped before the head word is read); everything else (DDL, `PRAGMA`, transaction framing) records nothing. A per-second cap (~200 statements) drops burst overflow before any parsing, protecting the host app's CPU — capture is a live visualization, not an audit. Recorded statements also feed the per-table statement rings served by [`GET /api/activity/statements`](#get-apiactivitystatements). If the host never wired `reportActivity`, arming succeeds but produces no data — the server cannot detect whether the hook is wired.

Capture is a session-scoped observation tool, never configuration: it always starts **disarmed** on server start, is never persisted, and arming grants a **lease**, not a latch. Every `GET /api/activity` poll renews the lease; if no poll arrives within ~5 s (the screen polls every ~750 ms, so this tolerates several missed polls), the server disarms itself on the next reported statement. A killed browser tab, a dropped adb forward, or a crashed webview can therefore never leave the host's per-query hook hot. While disarmed, `reportActivity` costs one field read and a branch — no parsing, no allocation.

Multi-client semantics: any polling heartbeat screen renews the lease; a disarm from one viewer disarms for all.

Returns `403 Forbidden` with the standard structured error while the [monitoring kill switch](#monitoring-kill-switch) is engaged; disabling monitoring also force-disarms an armed capture.

**Request Body**

```json
{ "enabled": true }
```

**Response** `200 OK`

```json
{ "captureArmed": true }
```

| Field | Type | Description |
|-------|------|-------------|
| `captureArmed` | bool | The **resulting** state (arming can be refused, so the request value is not echoed). |

Returns `400 Bad Request` when the body is missing `enabled` or it is not a boolean.

### `GET /api/activity/statements`

The "statement tap" ring: the most recent host statements captured for one table, newest first — the Heartbeat screen's card flyout uses it as a live query inspector. Served entirely from in-memory state (never a DB query). The ring fills only while capture is armed (see [`POST /api/activity/capture`](#post-apiactivitycapture)) and is bounded to the last 10 statements per table, with stored SQL truncated to ~300 characters (a truncated entry ends with `…`). A statement that touches several tables (a JOIN) appears in each table's ring.

Returns `403 Forbidden` with the standard structured error while the [monitoring kill switch](#monitoring-kill-switch) is engaged.

**Query Parameters**

| Param | Type | Description |
|-------|------|-------------|
| `table` | string (required) | The table whose ring to return. Missing/empty → `400 Bad Request`. An unknown table returns an empty list, not an error. |

**Response** `200 OK`

```json
{
  "table": "items",
  "captureArmed": true,
  "statements": [
    { "sql": "SELECT * FROM items WHERE id = ?", "kind": "read", "at": "2026-07-16T10:15:00.000Z" }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `captureArmed` | bool | Whether capture is currently armed — an empty list with `false` here means "turn capture on", not "no traffic". |
| `statements` | array | Newest first, at most 10. |
| `statements[].sql` | string | The captured statement, truncated to ~300 chars. |
| `statements[].kind` | string | `"read"` \| `"write"` (same channel names as `recentEvents[].kind`). |
| `statements[].at` | string | ISO8601 UTC capture timestamp. |

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

The debug **web viewer** can prefill the Run SQL editor from the landing URL; **REST** clients execute read-only SQL via `POST` (below).

<a id="api-sql-web-viewer"></a>

### Web viewer deep link

Loading the viewer in a browser with a **`sql`** query parameter opens the **Run SQL** tab and fills the textarea:

`http://127.0.0.1:{port}/?sql=<url-encoded-sql>`

| Behavior | Detail |
|----------|--------|
| Execution | Does **not** run the query; the user clicks **Run** (same as manual entry). |
| After load | The client removes `sql` from the URL with `history.replaceState` so refresh does not re-apply the same text. |
| Validation on run | When executed, the statement must pass the same read-only rules as `POST /api/sql` (`SqlValidator.isReadOnlySql`). |

**Privacy / limits:** The query string may appear in the address bar and browser history until stripped; avoid secrets in `?sql=`. Very long SQL may exceed browser or proxy URL limits—use **`POST /api/sql`** for programmatic execution instead.

**Implementation:** `assets/web/app.js` (`applySqlFromQueryString` inside `initSqlRunner`).

<a id="api-post-sql"></a>

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

<a id="api-post-sql-explain"></a>

### `POST /api/sql/explain`

Returns the EXPLAIN QUERY PLAN for a read-only SQL query.

**Request** same as `POST /api/sql`.

**Response** `200 OK`

```json
{
  "rows": [
    { "id": 0, "parent": 0, "notused": 0, "detail": "SCAN TABLE items" }
  ],
  "sql": "EXPLAIN QUERY PLAN SELECT * FROM items WHERE id > 10",
  "indexes": {
    "items": [
      { "name": "idx_items_category_id", "columns": ["category_id"], "unique": false }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `rows` | array | EXPLAIN QUERY PLAN result rows |
| `sql` | string | The actual SQL executed (with `EXPLAIN QUERY PLAN` prepended) |
| `indexes` | object | Map of table name → list of indexes. Each index has `name` (string), `columns` (string array), and `unique` (boolean). Only tables referenced in the query plan are included. |

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
| `tables[].foreignKeys` | array (optional) | Present when `includeForeignKeys` is set; list of `{ "fromColumn", "toTable", "toColumn" }` |

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

### `GET /api/analytics/orphan-tables`

Flags **orphan physical tables**: tables that physically exist in the SQLite file but have no corresponding definition in the app's Drift schema. This is the inverse of the usual "schema declares a table the DB lacks" check — it starts from the physical side (enumerate `sqlite_master`, subtract the declared set), so it catches tables left behind by a migration whose Drift definition was later removed or renamed.

The check is **report-only**: it suggests a `DROP TABLE` but never executes it. It runs only when the server was given the set of Drift-declared table names — automatically via `startDriftViewer`, or via the `declaredTableNames` parameter of `DriftDebugServer.start`. Without that set, `declaredSchemaAvailable` is `false` and `orphans` is always empty (no false positives). Android's `android_metadata` bookkeeping table is excluded by default.

**Response** `200 OK`

```json
{
  "orphans": [
    {
      "table": "leftover_v33",
      "severity": "warning",
      "type": "orphan_table",
      "message": "Orphan physical table 'leftover_v33' — present in the database but not declared in the Drift schema. Left by a prior migration? Drop it or restore its definition.",
      "suggestedSql": "DROP TABLE \"leftover_v33\";"
    }
  ],
  "declaredSchemaAvailable": true,
  "physicalTablesScanned": 6,
  "declaredTableCount": 5,
  "analyzedAt": "2026-06-10T00:00:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `orphans` | array | Orphan findings; empty when the schema is fully declared or no declared set was supplied |
| `orphans[].table` | string | Physical table name, as stored in `sqlite_master` |
| `orphans[].severity` | string | Always `"warning"` |
| `orphans[].type` | string | Always `"orphan_table"` |
| `orphans[].message` | string | Names the table, the likely cause, and the remedy |
| `orphans[].suggestedSql` | string | Ready-to-run `DROP TABLE` (run manually — never auto-executed) |
| `declaredSchemaAvailable` | bool | Whether a declared table set was supplied; `false` ⇒ check is report-only |
| `physicalTablesScanned` | int | Count of physical tables enumerated (excludes `sqlite_%`) |
| `declaredTableCount` | int | Size of the declared set (0 when unavailable) |
| `analyzedAt` | string | ISO 8601 timestamp |

---

## Issues

### `GET /api/issues`

Returns a single merged list of index suggestions, data-quality anomalies, and orphan physical tables in a stable issue shape. Intended for IDE integrations (e.g. Saropa Lints) and scripts that want one request instead of calling `GET /api/index-suggestions`, `GET /api/analytics/anomalies`, and `GET /api/analytics/orphan-tables` separately.

The list is wrapped in the **Saropa Diagnostic Envelope** — the shared cross-tool protocol used across Saropa Lints, Saropa Drift Advisor, and Saropa Log Capture. The envelope adds top-level `schemaVersion`, `producer`, and `generatedAt`, and each issue carries `id`, `category`, and `title` in addition to its existing fields. The envelope is **additive**: every previously documented field is unchanged, so existing consumers need no update.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `sources` | string (optional) | all | Comma-separated: `index-suggestions`, `anomalies`, `orphan-tables`. When present, only issues from the listed sources are included. Example: `?sources=anomalies` returns only anomaly issues. An unrecognized value falls back to all sources rather than an empty result. |

**Response** `200 OK`

```json
{
  "schemaVersion": 1,
  "producer": { "name": "saropa_drift_advisor", "version": "3.7.3" },
  "generatedAt": "2026-06-13T10:15:00.000Z",
  "issues": [
    {
      "id": "saropa_drift_advisor:index-suggestion:orders:user_id",
      "source": "index-suggestion",
      "category": "performance",
      "severity": "warning",
      "table": "orders",
      "column": "user_id",
      "title": "orders.user_id: Foreign key without index (references users.id)",
      "message": "orders.user_id: Foreign key without index (references users.id)",
      "suggestedSql": "CREATE INDEX idx_orders_user_id ON \"orders\"(\"user_id\");",
      "priority": "high"
    },
    {
      "id": "saropa_drift_advisor:anomaly:orders:user_id:orphaned_fk",
      "source": "anomaly",
      "category": "data",
      "severity": "error",
      "table": "orders",
      "column": "user_id",
      "title": "3 orphaned FK(s): orders.user_id -> users.id",
      "message": "3 orphaned FK(s): orders.user_id -> users.id",
      "type": "orphaned_fk",
      "count": 3
    },
    {
      "id": "saropa_drift_advisor:orphan-table:leftover_v33:orphan_table",
      "source": "orphan-table",
      "category": "schema",
      "severity": "warning",
      "table": "leftover_v33",
      "title": "Orphan physical table 'leftover_v33' — present in the database but not declared in the Drift schema. Left by a prior migration? Drop it or restore its definition.",
      "message": "Orphan physical table 'leftover_v33' — present in the database but not declared in the Drift schema. Left by a prior migration? Drop it or restore its definition.",
      "type": "orphan_table",
      "suggestedSql": "DROP TABLE \"leftover_v33\";"
    }
  ]
}
```

**Envelope fields** (Saropa Diagnostic Envelope, shared across the Saropa suite)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaVersion` | int | yes | Envelope version. Bumped only on a breaking change; consumers ignore unknown fields and refuse a higher major. |
| `producer` | object | yes | `{ "name": "saropa_drift_advisor", "version": "<package semver>" }` — attributes the issues when merged into a multi-tool list. |
| `generatedAt` | string | yes | ISO 8601 UTC timestamp of when the list was produced. |
| `issues` | array | yes | The merged issue list (envelope carrier key; equivalent to `diagnostics` in the shared spec). |

**Issue object fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Stable, locale-independent dedupe key built from semantic fields only (`producer:source:table:column:type[:fkTo...]`). Never contains `message`/`title`, so it is consistent across UI languages. |
| `source` | string | yes | `"index-suggestion"`, `"anomaly"`, `"orphan-table"`, or `"soft-relationship"` (the detector that produced the issue) |
| `category` | string | yes | Shared taxonomy: `"performance"` (index suggestions), `"data"` (anomalies), `"schema"` (orphan tables, inferred relationships), or `"other"` |
| `severity` | string | yes | `"error"`, `"warning"`, or `"info"` |
| `table` | string | yes | SQL table name |
| `column` | string | no | Column name when applicable; omitted for table-level issues (e.g. `duplicate_rows`, orphan tables) |
| `title` | string | yes | Localized one-line summary. Same text as `message` today; emitted as the suite-standard field so cross-tool consumers read one key. |
| `message` | string | yes | Human-readable description (retained for backward compatibility; alias of `title`) |
| `suggestedSql` | string | no | Ready-to-run SQL: `CREATE INDEX` for index suggestions, `DROP TABLE` for orphan tables |
| `type` | string | no | Anomalies: `null_values`, `empty_strings`, `orphaned_fk`, `duplicate_rows`, `potential_outlier`. Orphan tables: `orphan_table` |
| `count` | int | no | Anomalies only: number of affected rows (not present for `potential_outlier`) |
| `priority` | string | no | Index suggestions only: `"high"`, `"medium"`, or `"low"` |
| `fix` | object | no | Primary action for a table-scoped issue: `{ "kind": "command", "command": "driftViewer.goToDefinitionForTable", "args": [{ "table": "<name>" }], "title": "Go to table definition" }`. A consumer renders this as a button (gated on the command being registered). Absent on issues with no table. |

> **Orphan-table issues appear only when the server has the Drift-declared table set** (via `startDriftViewer` or the `declaredTableNames` parameter). See [`GET /api/analytics/orphan-tables`](#get-apianalyticsorphan-tables) for details.

**Errors**: Same as other API routes: 401 when auth is required, 429 when rate limited, 500 on server error.

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

### `POST /api/edits/apply`

Applies a batch of **validated** data-mutation statements in a **single SQLite transaction** (`BEGIN IMMEDIATE` / `COMMIT`). Intended for the VS Code extension when applying the pending-edit queue. Requires `writeQuery` to be configured (same as import and cell update).

**Request** `Content-Type: application/json`

```json
{
  "statements": [
    "UPDATE \"users\" SET \"name\" = 'Ada' WHERE \"id\" = 1",
    "INSERT INTO \"posts\" (\"title\") VALUES ('Hello')"
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `statements` | array of string | Yes | Non-empty. Each element must be a **single** SQL statement and pass server-side validation: must begin as `UPDATE …`, `INSERT INTO …`, or `DELETE FROM …` only (no `SELECT`, DDL, `PRAGMA`, multi-statement strings, etc.). |

**Response** `200 OK`

```json
{
  "ok": true,
  "count": 2
}
```

| Status | Meaning |
|--------|---------|
| `501 Not Implemented` | `writeQuery` not configured |
| `400 Bad Request` | Invalid JSON, missing `statements`, empty array, non-string entry, or more than 500 statements |
| `500 Internal Server Error` | Validation failed for a statement, or `writeQuery` raised (body includes `{ "error": "…" }`) |

Validation runs **before** any transaction begins, so invalid input does not leave an open transaction.

The same batch semantics are available over the Dart VM Service as **`ext.saropa.drift.applyEditsBatch`** with parameter **`statements`** set to a **JSON-encoded array** of strings (same content as the HTTP body field).

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

## Monitoring Kill Switch

The global monitoring & logging kill switch makes the server deliberately
dormant without stopping it: query recording, timing capture, and
change-detection sweeps halt entirely, and every data-inspection endpoint
answers a structured `403 Forbidden`:

```json
{
  "error": "Access Denied: All monitoring and data inspection has been halted by the global kill switch."
}
```

Endpoints that survive the kill: `GET /api/health` (reports
`"monitoringEnabled": false`), `GET /api/` (API index), `GET /api/generation`
(long-poll; it issues no queries while killed), `GET/POST
/api/change-detection`, the web-viewer assets, and the `/api/monitoring`
endpoint itself — the path back to a live server. `GET /api/mutations` is
explicitly 403-gated: its buffer holds full SQL plus before/after row data
captured before the kill, which must not be readable while killed (the
buffer is retained and becomes readable again on resume).

The same gate applies over the Dart VM Service transport: every
`ext.saropa.drift.*` data-inspection RPC (including `runSql` and
`applyEditsBatch`) refuses with the same message while killed, and
`ext.saropa.drift.getMonitoring` / `setMonitoring` mirror the HTTP endpoint.

The discovery manifest (`server.json`) carries the same state as
`"monitoring": "enabled" | "disabled"` and is rewritten on runtime flips.
Initial state comes from the `monitoringEnabled` parameter of
`DriftDebugServer.start()` (default `true`); Dart hosts can also flip it via
`DriftDebugServer.setMonitoringEnabled(bool)`.

### `GET /api/monitoring`

Returns the current kill-switch state. Reachable while killed.

**Response** `200 OK`

```json
{
  "monitoringEnabled": true
}
```

---

### `POST /api/monitoring`

Engages or releases the global kill switch. Reachable while killed (this is
the resume path).

**Request** `Content-Type: application/json`

```json
{
  "enabled": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enabled` | boolean | Yes | `false` engages the kill switch; `true` resumes monitoring |

**Response** `200 OK`

```json
{
  "monitoringEnabled": false
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

Returns the single-page web UI (HTML). The viewer supports an optional **`sql`** query parameter on this URL to prefill the Run SQL editor; see [Web viewer (`GET /?sql=`)](#api-sql-web-viewer).

**Response** `200 OK` — `Content-Type: text/html`

---

### `GET /favicon.ico`

Returns the favicon or no content.

**Response** `200 OK` (SVG favicon) or `204 No Content`

---

### Unknown routes

Any unmatched route returns `404 Not Found`.
