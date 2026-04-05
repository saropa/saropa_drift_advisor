# BUG: missing-id-index and missing-datetime-index fire on columns not used in queries

**Date:** 2026-04-05
**Severity:** Medium
**Component:** Diagnostics / Index suggestion
**Codes:** `missing-id-index`, `missing-datetime-index`
**Affects:** Every table with a column name ending in `_id` or typed as `DateTimeColumn`

---

## Summary

The index suggestion diagnostics use name-based heuristics (`*_id` suffix) and type-based heuristics (`DateTimeColumn`) to recommend indexes. These fire unconditionally on every matching column without checking whether the column is actually used in WHERE, ORDER BY, or JOIN clauses. This produces a high volume of false positives — 50+ warnings in a medium-sized project — that obscure real issues.

## Observed false positives

### `missing-id-index`: Columns ending in `_id` that are not foreign keys or lookup targets

| Table | Column | Why it's a false positive |
|-------|--------|--------------------------|
| `rick_and_morty_characters` | `api_id` | External API identifier stored for reference only. Static data, never queried by this column. |
| `star_wars_characters` | `swapi_id` | Same — SWAPI external reference ID, not used in WHERE clauses. |
| `superhero_dc_characters` | `wikidata_id` | Wikidata Q-identifier for provenance tracking, not queried locally. |
| `superhero_marvel_characters` | `wikidata_id` | Same as above. |
| `emergency_services` | `external_id` | External reference ID from data import, not used as a lookup key. |
| `calendar_events` | `start_tz_id` | IANA timezone identifier string (e.g., "America/New_York"), not a foreign key. |
| `calendar_events` | `end_tz_id` | Same — timezone name, not a joinable ID. |
| `calendar_events` | `google_event_id` | Google Calendar event ID for sync deduplication — already covered by the table's UNIQUE constraint on `saropaUUID`. |
| `native_contact_rollbacks` | `native_phone_contact_id` | Phone's native contact identifier, stored for rollback correlation, not queried in isolation. |
| `you_tube_api_cache` | `you_tube_a_p_i_id` | YouTube video ID, stored for reference. |
| `you_tube_api_cache` | `channel_id` | YouTube channel ID. |
| `you_tube_api_cache` | `service_supabase_id` | Supabase reference ID. |
| `you_tube_api_cache` | `emergency_education_id` | Internal reference ID linking to emergency education content. |

### `missing-datetime-index`: Audit timestamps never used in queries

The advisor flags every `DateTimeColumn` with "may benefit from an index if used in ORDER BY or WHERE." In practice, the vast majority of `created_at` and `updated_at` columns in this project are audit timestamps — they are written once and never queried, filtered, or sorted on. The same applies to `favorite_at`, `emergency_at`, `notified_at`, `added_at`, etc.

**Affected tables (partial list — 30+ false positives total):**

| Table | Column | Why it's a false positive |
|-------|--------|--------------------------|
| `emergency_services` | `created_at` | Audit timestamp on static reference data |
| `provider_auths` | `created_at`, `updated_at` | Audit only — queried by provider name, not date |
| `public_holidays` | `created_at`, `updated_at` | Audit only — queried by country and date range, already indexed |
| `user_permissions` | `created_at`, `updated_at` | Queried by permission key, not timestamp |
| `wikimedia_births` | `fetched_at` | Cache freshness marker, compared in code after fetch, not in SQL WHERE |
| `wikipedia_articles` | `created_at`, `updated_at` | Audit timestamps |
| `coaching_sessions` | `created_at` | Audit timestamp |
| `connections` | `created_at`, `last_shared_at` | Audit timestamps |
| `contact_groups` | `favorite_at`, `emergency_at`, `created_at`, `updated_at` | Nullable flag timestamps used as booleans (non-null = true), not queried with date ranges |
| `contact_points` | `created_at` | Audit timestamp |
| `contacts` | `un_favorite_at`, `sync_prompt_state_changed_at`, `updated_at` | State timestamps, not query predicates |
| `family_groups` | `favorite_at`, `emergency_at`, `created_at`, `updated_at` | Same pattern as contact_groups |
| `grid_menu_shortcuts` | `added_at` | Audit timestamp |
| `organizations` | `favorite_at`, `emergency_at`, `created_at`, `updated_at` | Same pattern |
| `quick_launch_orders` | `added_at` | Sort is by explicit `sortOrder` column, not by date |
| `user_badges` | `created_at`, `notified_at` | Small table, queried by badge key |
| `user_env_overrides` | `created_at`, `updated_at` | Audit timestamps on a tiny config table |
| `user_preferences` | `created_at`, `updated_at` | Audit timestamps on a tiny config table |
| `user_public_private_keys` | `created_at`, `updated_at` | Single-row table |
| `you_tube_api_cache` | `publish_date`, `viewed_at`, `hidden_at`, `favorite_at`, `emergency_at` | Low-row-count cache table |

### `missing-datetime-index` on a non-datetime column

| Table | Column | Dart type | Issue |
|-------|--------|-----------|-------|
| `calendar_events` | `is_free_time` | `BoolColumn` (`boolean().nullable()()`) | The advisor misidentifies this as a datetime column and suggests a datetime index. It is a boolean. |

## Root cause

### For `missing-id-index`

The heuristic `column name ends in _id → suggest index` does not distinguish between:

- **Foreign key columns** used in JOINs (where an index genuinely helps)
- **External reference IDs** stored for provenance/sync tracking but never used as query predicates
- **Timezone identifiers** (IANA tz names like "America/New_York" that happen to end in `_id`)

### For `missing-datetime-index`

The heuristic `column is DateTimeColumn → suggest index` fires unconditionally without checking:

- Whether the column appears in any query's WHERE or ORDER BY clause
- Whether the table is small enough that a full scan is faster than an index lookup
- Whether the column is used as a nullable boolean flag (non-null = true) rather than as a date range predicate

### For the `is_free_time` misidentification

The column type detection logic appears to misread `BoolColumn` as `DateTimeColumn`, possibly because:
- The column name or some other heuristic is overriding the actual Dart type
- The Dart type parser has a bug that misclassifies `boolean().nullable()()`

## Expected behavior

1. **`missing-id-index`:** Only suggest indexes on `_id` columns that are actually used in WHERE, JOIN, or ORDER BY clauses in the project's query code — or at minimum, only on columns that appear to be foreign keys (i.e., referencing another table's primary key)
2. **`missing-datetime-index`:** Only suggest indexes on datetime columns that are used in range queries or sorting in actual Dart query code
3. **`is_free_time`:** Should not be flagged at all — it is a `BoolColumn`, not a `DateTimeColumn`

## Impact

- **50+ false positives** in a medium-sized project (this report documents ~40 from a single workspace)
- Developers cannot meaningfully use the Problems panel when it is flooded with index suggestions for columns that are never queried
- Adding the suggested indexes would waste disk space, slow down writes, and provide zero query benefit
- The `is_free_time` misidentification undermines confidence in the type analysis

## Suggested fixes

### Option A: Query-aware analysis (ideal)

Parse the project's Dart query code (e.g., `.where()`, `.filter()`, `.orderBy()` calls) to determine which columns are actually used as predicates. Only suggest indexes on columns that appear in queries.

### Option B: Confidence levels

Instead of Information-severity diagnostics, emit Hint-severity suggestions with clear language:

```
"Column ends in _id — consider adding an index IF this column is used in WHERE or JOIN clauses"
```

### Option C: Allow suppression

Provide a way to suppress specific index suggestions per column, e.g.:

```yaml
# .saropa/drift_advisor.yaml
suppress:
  missing-id-index:
    - calendar_events.start_tz_id
    - calendar_events.end_tz_id
    - rick_and_morty_characters.api_id
  missing-datetime-index:
    - "*_at"  # Suppress all audit timestamps
```

### Option D: Fix `is_free_time` type detection

The column type parser must correctly identify `boolean().nullable()()` as `BoolColumn`, not `DateTimeColumn`. This is a separate bug from the heuristic issue.

## Reproduction steps

1. Open a Drift project with 15+ tables, each having `created_at`/`updated_at` audit timestamps
2. Include tables with external reference ID columns (`api_id`, `swapi_id`, `wikidata_id`, etc.)
3. Include a `BoolColumn` named `is_free_time` or similar
4. Observe 50+ index suggestions in the Problems panel, none of which correspond to actual query predicates

## Files likely involved

| File | Role |
|------|------|
| `extension/src/diagnostics/checkers/index-checker.ts` (or equivalent) | Heuristic-based index suggestion logic |
| `extension/src/schema-diff/dart-parser.ts` | Column type extraction — may misidentify BoolColumn |
| `extension/src/diagnostics/codes/` | Defines `missing-id-index` and `missing-datetime-index` codes |
