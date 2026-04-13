# BUG: False-Positive DateTime Index Suggestions Bypass Low-Priority Filter

**Created:** 2026-04-12
**Severity:** Medium (noise pollution in Problems panel)
**Component:** Index Analyzer + Diagnostic Pipeline

---

## Summary

The `drift_advisor_index_suggestion` diagnostic fires on **every** `DateTimeColumn` whose SQL name matches the `reDateTimeSuffix` regex (`created_at`, `updated_at`, `_at$`, `date$`, `timestamp$`), regardless of whether the column is actually used in WHERE, ORDER BY, or range queries. In a real project with 20+ Drift tables, this produces **40+ false-positive warnings** that bury legitimate diagnostics.

Two separate suppression mechanisms exist (`issue-mapper.ts:46` and `index-checker.ts:54`), both filtering `priority === 'low'`. Despite this, the diagnostics are reaching the user's Problems panel with `code: "drift_advisor_index_suggestion"` and `owner: "Saropa Drift Advisor"` — a code string that does not appear anywhere in the current source, suggesting a third diagnostic code path or a stale build artifact.

---

## Reproduction

Any Drift project with tables containing `created_at`, `updated_at`, or other `_at`-suffixed `DateTimeColumn` fields will trigger mass suggestions. Example from a real project (48 diagnostics):

| Table | Column | Actually Queried? |
|-------|--------|-------------------|
| `currency_rates` | `created_at` | No — store/read only |
| `provider_auths` | `created_at` | No — store/read only |
| `provider_auths` | `updated_at` | No — store/read only |
| `public_holidays` | `created_at` | No — store/read only |
| `public_holidays` | `updated_at` | No — store/read only |
| `user_permissions` | `created_at` | No — store/read only |
| `user_permissions` | `updated_at` | No — store/read only |
| `wikipedia_articles` | `created_at` | No — store/read only |
| `wikipedia_articles` | `updated_at` | No — store/read only |
| `wikimedia_births` | `fetched_at` | No — store/read only |
| `calendar_events` | `created_at` | No — store/read only |
| `coaching_sessions` | `created_at` | No — store/read only |
| `connections` | `created_at` | No — store/read only |
| `connections` | `last_shared_at` | No — store/read only |
| `contact_points` | `created_at` | No — store/read only |
| `contact_groups` | `favorite_at` | No — already indexed via `@TableIndex` |
| `contact_groups` | `emergency_at` | No — already indexed via `@TableIndex` |
| `contact_groups` | `created_at` | No — store/read only |
| `contact_groups` | `updated_at` | No — store/read only |
| `family_groups` | `favorite_at` | No — already indexed via `@TableIndex` |
| `family_groups` | `emergency_at` | No — already indexed via `@TableIndex` |
| `family_groups` | `created_at` | No — store/read only |
| `family_groups` | `updated_at` | No — store/read only |
| `organizations` | `favorite_at` | No — already indexed via `@TableIndex` |
| `organizations` | `emergency_at` | No — already indexed via `@TableIndex` |
| `organizations` | `created_at` | No — store/read only |
| `organizations` | `updated_at` | No — store/read only |
| `contacts` | `native_last_updated_timestamp` | No — store/read only |
| `contacts` | `last_native_read_timestamp` | No — store/read only |
| `contacts` | `un_favorite_at` | No — store/read only |
| `contacts` | `sync_prompt_state_changed_at` | No — store/read only |
| `contacts` | `updated_at` | No — store/read only |
| `user_env_overrides` | `created_at` | No — store/read only |
| `user_env_overrides` | `updated_at` | No — store/read only |
| `user_preferences` | `created_at` | No — store/read only |
| `user_preferences` | `updated_at` | No — store/read only |
| `user_public_private_keys` | `created_at` | No — store/read only |
| `user_public_private_keys` | `updated_at` | No — store/read only |
| `you_tube_api_cache` | `publish_date` | No — store/read only |
| `you_tube_api_cache` | `viewed_at` | No — store/read only |
| `you_tube_api_cache` | `hidden_at` | No — store/read only |
| `you_tube_api_cache` | `favorite_at` | No — store/read only |
| `you_tube_api_cache` | `emergency_at` | No — store/read only |
| `emergency_services` | `created_at` | No — store/read only |
| `grid_menu_shortcuts` | `added_at` | No — store/read only |
| `quick_launch_orders` | `added_at` | No — store/read only |
| `contact_avatar_history` | `saved_at` | **Yes** — used in ORDER BY desc |
| `user_badges` | `notified_at` | **Yes** — filtered with `.isNull()` |

**Result:** 46 of 48 suggestions are false positives. Only 2 are legitimate.

---

## Root Cause Analysis

### 1. Blanket heuristic with no query awareness

**File:** `lib/src/server/index_analyzer.dart`, lines 125-140

```dart
// 3. Date/time columns — often used in ORDER BY or range queries.
if (!alreadySuggested &&
    ServerConstants.reDateTimeSuffix.hasMatch(colName)) {
  suggestions.add(<String, dynamic>{
    ...
    'priority': 'low',
  });
}
```

The regex `reDateTimeSuffix` (`server_constants.dart:297-300`) matches any column ending in `created`, `updated`, `deleted`, `date`, `timestamp`, or `_at`. There is **no cross-reference** with captured query patterns to check if the column actually appears in a WHERE clause, ORDER BY, or range filter.

### 2. `alreadySuggested` check is incomplete

The `alreadySuggested` guard (line 127) checks if a suggestion was already emitted for this column by heuristic 1 (FK) or heuristic 2 (`_id` suffix). It does **not** check whether the column already has an existing index in the schema — so columns like `contact_groups.favorite_at` that already have a `@TableIndex` annotation still get flagged.

### 3. Low-priority filter exists but diagnostics still appear

Two independent filters suppress `priority === 'low'`:

- **Legacy path:** `extension/src/linter/issue-mapper.ts:46` — `if (s.priority === 'low') continue;`
- **New path:** `extension/src/diagnostics/checkers/index-checker.ts:54` — `return undefined;`

Despite both filters, the user sees diagnostics with `code: "drift_advisor_index_suggestion"`. This code string does not exist anywhere in the current source tree (verified via full-text search). This suggests either:

- A third diagnostic emission path not covered by the filters
- A stale/cached build artifact producing diagnostics with the old code format
- The diagnostic code is being dynamically constructed (e.g., `DIAGNOSTIC_PREFIX + '_index_suggestion'`) in a path not found by literal search

---

## Proposed Fixes

### Fix A: Check existing indexes before suggesting (server-side)

In `index_analyzer.dart`, query `PRAGMA index_list("tableName")` and `PRAGMA index_info(indexName)` to build a set of already-indexed columns. Skip suggestions for columns that already have an index. This eliminates false positives for columns with `@TableIndex` annotations (e.g., `contacts.favoriteAt`, `contacts.emergencyAt`).

### Fix B: Cross-reference with captured query patterns (server-side)

The server already captures query patterns via the debug protocol. Before emitting a datetime index suggestion, check whether the column appears in any captured `WHERE`, `ORDER BY`, or `GROUP BY` clause. Only suggest indexes for columns with evidence of being filtered or sorted. The comment at `index-checker.ts:9` references an `'unindexed-where-clause'` diagnostic that does this — datetime suggestions should be fully deferred to that system.

### Fix C: Find and eliminate the phantom diagnostic path

Search for any code that:
- Concatenates `'drift_advisor'` + `'_index_suggestion'`
- Sets `diag.code` to a value constructed from the suggestion type
- Emits diagnostics outside the two known filter checkpoints

Check whether the built extension JS bundle matches the current source (stale build producing diagnostics with old code names).

### Fix D: Remove the datetime heuristic entirely

Given that:
- The `'unindexed-where-clause'` diagnostic already handles evidence-based index suggestions
- The blanket heuristic has a 96% false-positive rate (46/48 in the test project)
- Two suppression filters were added specifically to silence it

The simplest fix is to remove heuristic 3 from `index_analyzer.dart` entirely and rely on query-pattern-based detection.

---

## Impact

- **User experience:** 40+ yellow warnings per project obscure legitimate issues in the Problems panel
- **Trust erosion:** Users learn to ignore Drift Advisor diagnostics because most are noise
- **Write performance:** If users act on the suggestions and add indexes to all datetime columns, they degrade INSERT/UPDATE performance for no query benefit (these columns are never filtered or sorted)

---

## Files Referenced

| File | Lines | Role |
|------|-------|------|
| `lib/src/server/index_analyzer.dart` | 125-140 | Blanket datetime heuristic |
| `lib/src/server/server_constants.dart` | 297-300 | `reDateTimeSuffix` regex |
| `extension/src/linter/issue-mapper.ts` | 42-46 | Legacy low-priority filter |
| `extension/src/diagnostics/checkers/index-checker.ts` | 29-56 | New low-priority filter |
| `extension/src/diagnostics/diagnostic-types.ts` | 136-142 | `DIAGNOSTIC_PREFIX`, `DIAGNOSTIC_SOURCE`, `DIAGNOSTIC_COLLECTION_NAME` |
| `extension/src/linter/schema-diagnostics.ts` | 17-94 | Legacy diagnostic system (still registered) |
| `extension/src/diagnostics/diagnostic-manager.ts` | 23-218 | New diagnostic system |
