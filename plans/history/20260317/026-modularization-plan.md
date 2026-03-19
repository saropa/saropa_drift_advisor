# Modularization Plan

Tracking all identified modularity issues across the Dart server codebase.

---

## HIGH Priority

### 1. Split server_context.dart (god object)

**Status: COMPLETE**

Implemented in commit `3a0c245`. The 793-line god object was split into three focused modules:

| File | Responsibility | Lines |
|------|---------------|-------|
| `server_typedefs.dart` | 5 callback typedefs (single source of truth) | 31 |
| `server_utils.dart` | 16 static utility methods (pure functions) | 368 |
| `server_context.dart` | Instance state, auth, CORS, logging, timing, change detection | 423 |

All 283 tests pass. Zero analyzer issues from our changes.

### 2. Extract html_content.dart (3,680 lines) — Bloated Constant

**Status: COMPLETE**

CSS and JS moved to `assets/web/style.css` and `assets/web/app.js`; served via jsDelivr CDN. `html_content.dart` is now a ~227-line HTML shell with version-pinned CDN `<link>`/`<script>` tags. See `bugs/history/20250317/001-monolithic-html-payload.md`.

### 3. Deduplicate typedefs

**Status: COMPLETE**

Resolved as part of issue #1. `DriftDebugQuery`, `DriftDebugOnLog`, `DriftDebugOnError`,
`DriftDebugGetDatabaseBytes`, and `DriftDebugWriteQuery` are now defined once in
`server_typedefs.dart` and re-exported through the barrel chain. Zero duplication confirmed.

---

## MEDIUM Priority

### 4. Extract SQL validator from sql_handler.dart

**Status: COMPLETE**

`isReadOnlySql()` extracted from `SqlHandler` into `abstract final class SqlValidator`
in `sql_validator.dart`. The method is now a static pure function — tests call it directly
without constructing a throwaway `ServerContext`. `sql_handler.dart` dropped from 258 to 193 lines.

**Files changed:**
- `lib/src/server/sql_validator.dart` — NEW (140 lines)
- `lib/src/server/sql_handler.dart` — removed method, 3 call sites updated
- `test/sql_validation_test.dart` — `handler.isReadOnlySql(...)` → `SqlValidator.isReadOnlySql(...)`

### 5. Refactor router.dart — group routes by domain

**Status: COMPLETE**

Option C selected: extracted 10 private `_route*` methods from the 341-line `onRequest()` method.
Each method handles one handler's endpoints and returns `Future<bool>` (true = route matched).
`onRequest()` is now a ~40-line dispatcher; total file length unchanged but the main method
is easy to scan.

| Route group | Handler | Endpoints |
|-------------|---------|-----------|
| `_routePreQuery` | GenerationHandler + inline | health, generation, change-detection |
| `_routeTableApi` | TableHandler | table list, table data/count/columns/fk-meta |
| `_routeSqlApi` | SqlHandler | sql run, sql explain |
| `_routeSchemaApi` | SchemaHandler | schema, diagram, metadata, dump, database |
| `_routeSnapshotApi` | SnapshotHandler | snapshot create/get/compare/delete |
| `_routeCompareApi` | CompareHandler | compare report, migration preview |
| `_routeAnalyticsApi` | AnalyticsHandler | index suggestions, anomalies, size |
| `_routeImportApi` | ImportHandler | import |
| `_routeSessionApi` | SessionHandler | session share/get/extend/annotate |
| `_routePerformanceApi` | PerformanceHandler | performance get/clear |

VM service delegates and change-detection handlers unchanged.

### 6. Split analytics_handler.dart (507 lines)

**Status: COMPLETE**

Extracted two `abstract final class` modules (matching `SqlValidator`/`ServerUtils` pattern)
containing pure static logic. `AnalyticsHandler` kept as HTTP wrapper + size analytics.

| File | Responsibility | Lines |
|------|---------------|-------|
| `index_analyzer.dart` | `IndexAnalyzer.getIndexSuggestionsList()` — FK, _id, date/time heuristics | ~135 |
| `anomaly_detector.dart` | `AnomalyDetector.getAnomaliesResult()` + 5 private detectors | ~275 |
| `analytics_handler.dart` | HTTP wrappers, error logging, size analytics, delegations | ~195 |

Router unchanged — `_analytics.*` public API preserved via thin delegations.

---

## LOW Priority

### 7. Convert import_handler.dart from extension type to plain class

**Status: COMPLETE**

Converted `extension type ImportHandler(ServerContext _ctx) implements Object` to
`final class ImportHandler` with a constructor and `_ctx` field, matching all other handlers.
One-line declaration change; zero behavioral difference.

### 8. Standardize import ordering across all files

**Status: COMPLETE**

All handler files already follow a consistent pattern:
```
dart: imports
package: imports
local server_* imports
```

Verified across auth_handler, schema_handler, table_handler, import_handler, router,
and analytics_handler. No action needed.

---

## Summary

| # | Issue | Priority | Status |
|---|-------|----------|--------|
| 1 | Split server_context.dart | HIGH | COMPLETE |
| 2 | Extract html_content.dart | HIGH | COMPLETE |
| 3 | Deduplicate typedefs | HIGH | COMPLETE |
| 4 | Extract SQL validator | MEDIUM | COMPLETE |
| 5 | Refactor router.dart | MEDIUM | COMPLETE |
| 6 | Split analytics_handler.dart | MEDIUM | COMPLETE |
| 7 | Convert import_handler extension type | LOW | COMPLETE |
| 8 | Standardize import ordering | LOW | COMPLETE |

**Completed:** 8 of 8
**Remaining:** 0
