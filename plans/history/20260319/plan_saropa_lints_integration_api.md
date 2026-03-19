# Plan: Saropa Lints integration — API and data exposure

## Status: Implemented

## Implementation summary (2026-03-19)

- **GET /api/issues**: Merged index suggestions and anomalies in stable issue shape; optional `sources` query param. Router, AnalyticsHandler (`getIssuesList`, `handleIssues`), single `_parseSourcesFilter` for filter logic.
- **Health capabilities**: `capabilities: ["issues"]` in HTTP and VM health responses (GenerationHandler, VmServiceBridge).
- **VM RPC**: `ext.saropa.drift.getIssues` with optional `sources` param; same envelope as HTTP.
- **Docs**: doc/API.md (Issues section, health capabilities), README (Saropa Lints line). CHANGELOG [Unreleased] entry.
- **Tests**: handler_integration_test (health capabilities, GET /api/issues shape, `?sources=anomalies` / `?sources=index-suggestions`). Existing index-suggestions and anomalies endpoints unchanged.

## Severity: Enhancement

## Component: Server (Dart package), API documentation

## Motivation

The **Saropa Lints** VS Code extension (and potentially other consumers) can optionally integrate with Drift Advisor by discovering the debug server and fetching "lint-like" issues: **index suggestions** and **anomalies**. Today that requires two requests: `GET /api/index-suggestions` and `GET /api/analytics/anomalies`, plus client-side merging and a duplicated understanding of both response shapes.

To enable **optional but tighter** integration without hard dependencies:

1. **Single issues endpoint** — One `GET /api/issues` that returns a merged, stable list so consumers (Saropa Lints extension, Drift Advisor extension, scripts, CI) can use one request.
2. **Stable issue payload** — A single JSON shape for each issue (index-suggestion vs anomaly) so all clients share one contract.
3. **Capability discovery** — Extend `GET /api/health` with a `capabilities` array so clients can detect support for `/api/issues` and fall back to the two existing endpoints on older servers.

This document specifies **only what the Drift Advisor repository must implement**. Consumer-side work (e.g. Saropa Lints extension) is described elsewhere.

---

## 1. Stable issue payload (JSON shape)

Define one **issue** object used for both index suggestions and anomalies. All fields use existing server semantics; the union is documented and stable.

### 1.1 Field specification

| Field           | Type    | Required | Description |
|----------------|---------|----------|-------------|
| `source`       | string  | yes      | Either `"index-suggestion"` or `"anomaly"`. |
| `severity`     | string  | yes      | `"error"`, `"warning"`, or `"info"`. |
| `table`        | string  | yes      | SQL table name (e.g. `orders`, `items`). |
| `column`       | string? | no       | Column name when applicable. Omit or `null` for e.g. `duplicate_rows` (table-level). |
| `message`      | string  | yes      | Human-readable description. |
| `suggestedSql` | string? | no       | Present only for index suggestions: ready-to-run `CREATE INDEX` SQL. |
| `type`         | string? | no       | For anomalies only: `null_values`, `empty_strings`, `orphaned_fk`, `duplicate_rows`, `potential_outlier`. Omit for index suggestions. |
| `count`        | int?    | no       | For anomalies: number of affected rows (not present for `potential_outlier`). Omit for index suggestions. |
| `priority`     | string? | no       | For index suggestions only: `"high"`, `"medium"`, or `"low"`. Omit for anomalies. |

- **Index suggestion** → `source: "index-suggestion"`, `table`, `column`, `message` (from current `reason`), `suggestedSql` (from current `sql`), `priority`. Map `priority` to `severity`: high→warning, medium/low→info.
- **Anomaly** → `source: "anomaly"`, `table`, `column` (omit for `duplicate_rows`), `message`, `type`, `severity`, and `count` when applicable.

### 1.2 Response envelope for GET /api/issues

```json
{
  "issues": [
    {
      "source": "index-suggestion",
      "severity": "warning",
      "table": "orders",
      "column": "user_id",
      "message": "orders.user_id: Foreign key without index (references users.id)",
      "suggestedSql": "CREATE INDEX idx_orders_user_id ON \"orders\"(\"user_id\");",
      "priority": "high"
    },
    {
      "source": "anomaly",
      "severity": "error",
      "table": "orders",
      "column": "user_id",
      "message": "3 orphaned FK(s): orders.user_id -> users.id",
      "type": "orphaned_fk",
      "count": 3
    }
  ]
}
```

- **Ordering**: Keep index suggestions first (existing order from `IndexAnalyzer`), then anomalies (existing order from `AnomalyDetector`, already sorted by severity). No need to interleave by table/severity unless product decision changes.

---

## 2. New endpoint: GET /api/issues

### 2.1 Route and method

- **Path**: `/api/issues` (and alt form `api/issues` for consistency with other routes).
- **Method**: GET only.
- **Auth**: Same as other `/api/*` routes (Bearer or Basic when configured).
- **Rate limiting**: Subject to same rate limits as other API routes; **not** exempt like `/api/health` and `/api/generation`.

### 2.2 Query parameters (optional)

| Parameter | Type   | Default | Description |
|-----------|--------|---------|-------------|
| `sources` | string | (both)  | Comma-separated: `index-suggestions`, `anomalies`. If present, only include issues from the listed sources. Invalid or unknown values can be ignored (include both) or return 400; recommend ignore and include both for simplicity. |

Example: `GET /api/issues?sources=anomalies` → only anomaly issues.

### 2.3 Implementation steps (Dart)

1. **Constants** (`lib/src/server/server_constants.dart`)
   - Add `pathApiIssues = '/api/issues'` and `pathApiIssuesAlt = 'api/issues'`.
   - Add JSON keys used only by this endpoint if desired (e.g. `jsonKeyIssues = 'issues'`, `jsonKeySource = 'source'`, `jsonKeySuggestedSql = 'suggestedSql'`), or reuse existing keys where they exist (`jsonKeyTable`, `jsonKeyMessage`, etc.).

2. **AnalyticsHandler** (`lib/src/server/analytics_handler.dart`)
   - Add a new method, e.g. `Future<Map<String, dynamic>> getIssuesList(DriftDebugQuery query, {String? sources})`.
   - Implementation:
     - Call `IndexAnalyzer.getIndexSuggestionsList(query)` and `AnomalyDetector.getAnomaliesResult(query)` (reuse existing methods; no new analysis logic).
     - Parse `sources` query param if present: split by comma, trim; if `sources` is null or empty, include both.
     - Build a list of issue maps in the stable shape:
       - For each suggestion: `source: 'index-suggestion'`, `severity: suggestion['priority'] == 'high' ? 'warning' : 'info'`, `table`, `column`, `message: '${table}.${column}: ${reason}'`, `suggestedSql: suggestion['sql']`, `priority`; omit `type` and `count`.
       - For each anomaly: `source: 'anomaly'`, `severity`, `table`, `column` (omit if anomaly has no column, e.g. duplicate_rows), `message`, `type`; add `count` when present in the anomaly map; omit `suggestedSql` and `priority`.
     - Return `{ 'issues': list }`. On error from either analysis, follow existing pattern (e.g. log and return error map or 500; prefer returning partial results if one of the two calls fails is acceptable, or all-or-nothing; document choice).
   - Add `Future<void> handleIssues(HttpRequest request, HttpResponse response, DriftDebugQuery query)` that:
     - Reads `sources` from `request.uri.queryParameters['sources']`.
     - Calls `getIssuesList(query, sources: ...)`.
     - If result contains `ServerConstants.jsonKeyError`, respond with 500 and error body; otherwise set JSON headers and write `jsonEncode(result)`.

3. **Router** (`lib/src/server/router.dart`)
   - In the analytics route group (e.g. `_routeAnalyticsApi`), add handling for `path == pathApiIssues || path == pathApiIssuesAlt` (GET only): call `_analytics.handleIssues(request, response, query)` and return true.
   - Ensure the new route is reached (same auth and rate-limit path as other analytics routes).

4. **Tests**
   - **Handler / integration**: Add test(s) that start server, call `GET /api/issues`, and assert response is 200, body has `issues` array, and at least one entry has `source`, `severity`, `table`, `message`. Optionally assert shape for a known fixture (e.g. one index suggestion and one anomaly).
   - **Query param**: Test `GET /api/issues?sources=anomalies` returns only anomalies; `?sources=index-suggestions` only index suggestions.

### 2.4 VM Service (optional)

If the VM Service bridge currently exposes index-suggestions and anomalies RPCs, consider adding an RPC that returns the same merged `issues` list for consistency. Document in the same plan or a follow-up. Not strictly required for Saropa Lints (HTTP is sufficient).

**Implemented:** `ext.saropa.drift.getIssues` RPC added. Optional param `sources` (comma-separated `index-suggestions`, `anomalies`). Returns the same `{ "issues": [ ... ] }` envelope as GET /api/issues.

---

## 3. Health endpoint: add `capabilities`

### 3.1 Goal

Clients (e.g. Saropa Lints extension) can call `GET /api/health` and, if `capabilities` includes `"issues"`, use `GET /api/issues` in one request; otherwise fall back to `GET /api/index-suggestions` and `GET /api/analytics/anomalies`.

### 3.2 Response change

Current health response:

```json
{
  "ok": true,
  "extensionConnected": false,
  "version": "2.6.0"
}
```

New (add one field):

```json
{
  "ok": true,
  "extensionConnected": false,
  "version": "2.6.0",
  "capabilities": ["issues"]
}
```

- **Field**: `capabilities` — array of strings. Currently exactly `["issues"]` when the server supports `GET /api/issues`. Future capabilities (e.g. `migration-preview`, `sessions`) can be appended without breaking older clients.

### 3.3 Implementation steps (Dart)

1. **Constants** (`lib/src/server/server_constants.dart`)
   - Add `jsonKeyCapabilities = 'capabilities'`.
   - Optional: `capabilityIssues = 'issues'` for consistency.

2. **GenerationHandler** (`lib/src/server/generation_handler.dart`)
   - In `sendHealth`, add to the map: `ServerConstants.jsonKeyCapabilities: <String>['issues']` (or a static const list in ServerConstants if preferred).

3. **VM Service** (if health is exposed via VM): Add `capabilities` to the health response in `lib/src/server/vm_service_bridge.dart` so VM clients see the same.

4. **Tests**
   - Assert `GET /api/health` response contains `capabilities` and that `"issues"` is in the array.

---

## 4. API documentation

### 4.1 doc/API.md

- **Table of contents**: Add an entry for "Issues" (or "Lint / Issues") under Endpoints.
- **New section**: "Issues" with:
  - **GET /api/issues**
    - Description: Returns a single merged list of index suggestions and data-quality anomalies in a stable issue shape. Intended for IDE integrations (e.g. Saropa Lints) and scripts that want one request instead of two.
    - Query parameters: `sources` (optional), as in §2.2.
    - Response 200: Document the envelope `{ "issues": [ ... ] }` and the issue object fields (§1.1). Include a small example.
    - Errors: Same as other API routes (401 when auth required, 429 when rate limited, 500 on server error).
  - **Health**: In the existing "GET /api/health" section, add the `capabilities` field and state that `"issues"` indicates support for `GET /api/issues`.

### 4.2 README / consumer mention

- In the main README or "Consumers" section, add a short line: e.g. "The Saropa Lints VS Code extension can optionally show Drift Advisor issues (index suggestions and anomalies) when the debug server is running; it uses `GET /api/issues` when available."

---

## 5. Optional: Export issue types / helpers (Dart public API)

**Goal**: Allow Dart code (e.g. a future CLI or another package) to run the same "issues" logic without HTTP. This is **optional** and can be a follow-up.

### 5.1 Options

- **A. No export (recommended for v1)**  
  Keep the HTTP API as the only contract. Saropa Lints extension is TypeScript and will use HTTP. Reduces public API surface and maintenance.

- **B. Export a single entry point**  
  In `lib/saropa_drift_advisor.dart` (or a new file re-exported from it), expose something like:
  - `Future<List<Map<String, dynamic>>> getDriftIssues(DriftDebugQuery query, {bool includeIndexSuggestions = true, bool includeAnomalies = true})`.
  - Implementation: call `IndexAnalyzer.getIndexSuggestionsList` and `AnomalyDetector.getAnomaliesResult`, then merge into the same list-of-maps shape as GET /api/issues. Return the list (no envelope).
  - Document that the map keys match the issue object in API.md.

- **C. Export a typed class**  
  Define `class DriftIssue { final String source; final String severity; final String table; final String? column; final String message; final String? suggestedSql; final String? type; final int? count; final String? priority; ... }` and return `List<DriftIssue>`. More type-safe but adds a public type to maintain.

**Recommendation**: Implement **A** for the first iteration; add **B** or **C** only if a Dart consumer appears.

---

## 6. What Drift Advisor will NOT do (scope boundaries)

- **No file paths or line numbers** in the server. The server does not know about the workspace or Dart files. Mapping (table, column) → (file, range) stays in clients (Drift Advisor extension, Saropa Lints extension).
- **No new analysis logic** in this plan. Reuse `IndexAnalyzer.getIndexSuggestionsList` and `AnomalyDetector.getAnomaliesResult` as-is.
- **No change** to existing endpoints: `GET /api/index-suggestions` and `GET /api/analytics/anomalies` remain unchanged for backward compatibility.

---

## 7. Implementation order (recommended)

1. **Constants**: Add path and JSON key constants for `/api/issues` and `capabilities`.
2. **AnalyticsHandler**: Implement `getIssuesList` and `handleIssues`; add tests.
3. **Router**: Register GET /api/issues in the analytics route group; ensure auth and rate limit apply.
4. **GenerationHandler**: Add `capabilities` to health response; update VM health if applicable; add test.
5. **doc/API.md**: Document GET /api/issues, issue shape, and health `capabilities`.
6. **README**: Add one sentence on Saropa Lints (and other consumers) using GET /api/issues.
7. **(Optional later)** Public Dart API for `getDriftIssues` if needed.

---

## 8. Files to touch (summary)

| File | Changes |
|------|---------|
| `lib/src/server/server_constants.dart` | Path and optional JSON keys for issues; `jsonKeyCapabilities`; optional `capabilityIssues`. |
| `lib/src/server/analytics_handler.dart` | `getIssuesList()`, `handleIssues()`; merge logic and query param `sources`. |
| `lib/src/server/router.dart` | Route GET /api/issues to `_analytics.handleIssues`. |
| `lib/src/server/generation_handler.dart` | Add `capabilities: ['issues']` to health JSON. |
| `lib/src/server/vm_service_bridge.dart` | (Optional) Add `capabilities` to health in VM response. |
| `doc/API.md` | New "Issues" section; health `capabilities` field. |
| `README.md` (or equivalent) | One line on consumers using GET /api/issues. |
| `test/` | Integration/unit tests for GET /api/issues and health capabilities. |

---

## 9. Acceptance criteria

- [x] `GET /api/issues` returns 200 with `{ "issues": [ ... ] }`; each element has at least `source`, `severity`, `table`, `message`; index suggestions include `suggestedSql` and `priority`; anomalies include `type` and `count` when applicable.
- [x] `GET /api/issues?sources=anomalies` returns only issues with `source: "anomaly"`; `?sources=index-suggestions` only index suggestions.
- [x] `GET /api/health` includes `"capabilities": ["issues"]`.
- [x] doc/API.md documents the endpoint, issue shape, and capabilities.
- [x] Existing `GET /api/index-suggestions` and `GET /api/analytics/anomalies` behavior unchanged.
- [x] Tests added and passing.
- [x] VM Service: `ext.saropa.drift.getIssues` RPC returns merged issues (optional param `sources`).
