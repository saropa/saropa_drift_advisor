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

### 2. Extract html_content.dart (3,180 lines) — Bloated Constant

**Status: OPEN**

Single `HtmlContent` abstract final class with one massive `static const String indexHtml`
containing the entire embedded web UI (HTML + CSS + JavaScript) in a single string literal.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Move to `assets/index.html`, load at build time or embed via codegen | Clean separation, IDE tooling for HTML/CSS/JS | Requires build step or runtime file loading |
| B | Split into `html_layout.dart`, `html_styles.dart`, `html_scripts.dart` string constants | No build step, simple concatenation | Still string literals, no IDE HTML support |
| C | Leave as-is | Zero effort, it's pure data with no logic | 3,180 lines of grep noise, hard to maintain |

**Related:** `bugs/001-monolithic-html-payload.md`

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

### 5. Refactor router.dart (528 lines)

**Status: OPEN**

The `onRequest()` method is 348 lines routing ~20+ HTTP paths. The method is well-structured
(each route is a clear if-block delegating to a handler), but the sheer length makes it
hard to scan.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Route table/registry | Map of `(method, path)` → handler; declarative | Loses type safety on handler signatures |
| B | Split into `HttpRouter` + `VmServiceRouter` | Clear separation of transport concerns | Two files to maintain |
| C | Group routes by domain (table, schema, analytics) | Logical grouping, smaller methods | Still one Router class |

**VM Service delegates** (lines 401-528) are already clean, short one-liners. The HTTP routing
in `onRequest()` is the main target.

### 6. Split analytics_handler.dart (507 lines)

**Status: OPEN**

Three distinct concerns in one handler:

| Concern | Methods | Lines |
|---------|---------|-------|
| Index suggestions | `getIndexSuggestionsList()`, `handleIndexSuggestions()` | ~110 |
| Size analytics | `handleSizeAnalytics()` | ~100 |
| Anomaly detection | `getAnomaliesResult()`, `handleAnomalyDetection()`, 5 private detectors | ~260 |

**Suggested split:**
- `index_analyzer.dart` — index suggestion heuristics
- `anomaly_detector.dart` — anomaly scanning (null values, empty strings, outliers, orphaned FKs, duplicates)
- `analytics_handler.dart` (remaining) — size analytics + HTTP routing for all three

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
| 2 | Extract html_content.dart | HIGH | OPEN |
| 3 | Deduplicate typedefs | HIGH | COMPLETE |
| 4 | Extract SQL validator | MEDIUM | COMPLETE |
| 5 | Refactor router.dart | MEDIUM | OPEN |
| 6 | Split analytics_handler.dart | MEDIUM | OPEN |
| 7 | Convert import_handler extension type | LOW | COMPLETE |
| 8 | Standardize import ordering | LOW | COMPLETE |

**Completed:** 5 of 8
**Remaining:** 3 issues (1 HIGH, 2 MEDIUM)
