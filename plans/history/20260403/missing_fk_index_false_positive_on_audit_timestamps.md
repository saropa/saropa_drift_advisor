# Bug: `missing-fk-index` fires on plain audit timestamp columns that are not foreign keys

**Created:** 2026-04-01
**Severity:** Medium — misleading diagnostic label erodes trust in the Problems panel
**Component:** `lib/src/server/index_analyzer.dart` (Heuristic 3) + `extension/src/diagnostics/checkers/fk-checker.ts`

---

## Summary

The `missing-fk-index` diagnostic fires on `created_at` and `updated_at` columns that are plain audit timestamps with no foreign key relationship. The server-side `IndexAnalyzer` generates three tiers of index suggestions (true FK, `_id` suffix, date/time suffix), but the extension funnels all three through a single `checkMissingFkIndexes()` function that labels every suggestion as `FK column "{table}.{column}" lacks an index`. Columns matched by the date/time heuristic (Heuristic 3) are not FK columns, yet the diagnostic tells the developer they are.

## Reproduction

1. Define a Drift table with audit timestamps and no foreign keys:

```dart
@DataClassName('UserPublicPrivateKeysDriftModel')
class UserPublicPrivateKeys extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get version => integer().withDefault(const Constant<int>(1))();
  TextColumn get privateKey => text().nullable()();
  TextColumn get publicKey => text().nullable()();
  DateTimeColumn get createdAt => dateTime().nullable()();
  DateTimeColumn get updatedAt => dateTime().nullable()();
}
```

2. Open the file in VS Code with Drift Advisor connected to the running database.
3. Result — three diagnostics in the Problems panel:

```
[drift_advisor] FK column "user_public_private_keys.created_at" lacks an index
[drift_advisor] FK column "user_public_private_keys.updated_at" lacks an index
```

And on the `UserEnvOverrides` table:

```
[drift_advisor] FK column "user_env_overrides.updated_at" lacks an index
```

All three report severity `Information` (blue squiggle), but the message text says "FK column" — implying a missing foreign key index when no foreign key exists.

## Expected behavior

1. **Heuristic 3 suggestions should not be labeled as FK issues.** The `created_at`/`updated_at` columns in these tables reference no other table. Calling them "FK columns" is factually wrong.

2. **Single-record tables should be excluded entirely.** `UserPublicPrivateKeys` enforces single-record semantics in the IO layer. Indexing a 1-row table adds write overhead for zero query benefit.

3. **Audit timestamps on small lookup/config tables should be deprioritized.** `UserEnvOverrides` is a key-value settings table queried by `settingKey` (already indexed). Nobody runs `ORDER BY updated_at` or range scans on a configuration table.

## Root cause

Two components contribute to the false positive:

### 1. Server: `IndexAnalyzer` conflates three heuristics into one output format

`index_analyzer.dart` (lines 114-129) applies Heuristic 3 — the date/time regex — to flag columns ending in `created`, `updated`, `deleted`, `date`, `time`, or `_at`:

```dart
// Line 116-128
if (!alreadySuggested &&
    ServerConstants.reDateTimeSuffix.hasMatch(colName)) {
  suggestions.add(<String, dynamic>{
    'table': tableName,
    'column': colName,
    'reason': 'Date/time column — often used in ORDER BY or range queries',
    'sql': 'CREATE INDEX idx_${tableName}_$colName ON "$tableName"("$colName");',
    'priority': 'low',
  });
}
```

The regex in `server_constants.dart` (lines 282-285):

```dart
static final RegExp reDateTimeSuffix = RegExp(
  r'(created|updated|deleted|date|time|_at)$',
  caseSensitive: false,
);
```

This matches every audit timestamp indiscriminately. The suggestion's `reason` field correctly says "Date/time column," but the `priority: 'low'` tag is the only signal distinguishing it from a true FK suggestion (`priority: 'high'`).

### 2. Extension: `fk-checker.ts` applies the `missing-fk-index` code to all suggestions

`fk-checker.ts` (lines 13-49) iterates over every `IndexSuggestion` — regardless of priority or reason — and emits the same diagnostic:

```typescript
issues.push({
  code: 'missing-fk-index',
  message: `FK column "${suggestion.table}.${suggestion.column}" lacks an index`,
  // ...
  severity:
    suggestion.priority === 'high'
      ? vscode.DiagnosticSeverity.Warning
      : vscode.DiagnosticSeverity.Information,
});
```

The severity is downgraded to `Information` for non-high-priority suggestions, but the code (`missing-fk-index`) and message (`FK column ... lacks an index`) remain identical. The developer sees "FK column" and reasonably concludes the column participates in a foreign key — which it does not.

## Suggested fix

### Option A: Separate diagnostic codes per heuristic (recommended)

Add two new codes alongside `missing-fk-index`:

| Heuristic | Priority | New code | New message |
|---|---|---|---|
| 1. True FK from `PRAGMA foreign_key_list` | `high` | `missing-fk-index` (unchanged) | `FK column "{table}.{column}" lacks an index` |
| 2. `_id` suffix | `medium` | `missing-id-index` | `Column "{table}.{column}" ends in _id and may benefit from an index` |
| 3. Date/time suffix | `low` | `missing-datetime-index` | `Date/time column "{table}.{column}" may benefit from an index if used in ORDER BY or WHERE` |

This requires:
- Adding a `heuristic` or `type` field to the `IndexSuggestion` API type (or keying off `priority`)
- Adding two new entries to `schema-codes.ts`
- Splitting `checkMissingFkIndexes()` into three checkers (or one with branching logic)
- Updating existing tests in `index_analyzer_test.dart`

### Option B: Filter Heuristic 3 out of `fk-checker.ts`

Minimal change: skip suggestions where `priority === 'low'` in `checkMissingFkIndexes()`. This silences the false positive but loses the date/time index suggestion entirely.

```typescript
for (const suggestion of suggestions) {
  if (suggestion.priority === 'low') continue; // date/time heuristic — not an FK issue
  // ...existing code...
}
```

### Option C: Exclude common audit column names from Heuristic 3

Add an exclusion list to the server-side regex or post-filter:

```dart
static const Set<String> auditColumnExclusions = {
  'created_at',
  'updated_at',
  'deleted_at',
  'created_by',
  'updated_by',
};
```

This reduces false positives for the most common case but is fragile — any non-standard naming (`modified_at`, `last_changed_at`) still triggers.

### Option D: Per-column inline suppression (general solution)

Support a `// drift_advisor:ignore missing-fk-index` comment on or above the column getter line. This is the most flexible mechanism and would apply to all diagnostic codes, not just this one.

```dart
// drift_advisor:ignore missing-fk-index — audit timestamp, not a foreign key
DateTimeColumn get createdAt => dateTime().nullable()();
```

Option A is the cleanest long-term fix. Option D is the most general and benefits all diagnostics.

## Impact

- **Contacts project**: 35+ Drift tables. Most tables have `created_at` and/or `updated_at` columns. This generates dozens of `missing-fk-index` diagnostics that are factually incorrect — the columns are not FK columns.
- **Developer trust**: When developers see "FK column" on a column they know is not a foreign key, they learn to ignore `missing-fk-index` entirely — including the legitimate high-priority warnings on actual FK columns that genuinely need indexes.
- **Signal-to-noise ratio**: The true FK suggestions (Heuristic 1) are high-value — un-indexed FK columns cause real performance problems in JOINs and cascaded deletes. Burying them under dozens of mislabeled date/time suggestions diminishes their impact.

## Affected code

**Dart side (server):**
- `lib/src/server/index_analyzer.dart` — Heuristic 3 detection (lines 114-129)
- `lib/src/server/server_constants.dart` — `reDateTimeSuffix` regex (lines 282-285)
- `test/index_analyzer_test.dart` — needs tests for heuristic separation

**TypeScript side (extension):**
- `extension/src/diagnostics/checkers/fk-checker.ts` — `checkMissingFkIndexes()` (lines 13-49) applies `missing-fk-index` code to all suggestions
- `extension/src/diagnostics/codes/schema-codes.ts` — `missing-fk-index` entry (lines 16-22); needs new codes for Option A
- `extension/src/api-types.ts` — `IndexSuggestion` type may need a `heuristic` field

## Triggering tables (real-world examples)

### `user_public_private_keys_table.dart`

Single-record table storing the user's encryption key pair. `createdAt` and `updatedAt` are audit metadata. The table is fetched by `id` (the only row). An index on either timestamp column is pure overhead with zero query benefit.

### `user_env_override_table.dart`

Key-value settings table with a unique index on `settingKey`. All queries use `settingKey` for lookup. `createdAt` and `updatedAt` are write-only audit fields never used in WHERE or ORDER BY clauses.

## Resolution

**Option A implemented** — separate diagnostic codes per heuristic tier.

### Changes

1. **`extension/src/diagnostics/codes/schema-codes.ts`** — Added `missing-id-index` (Information) and `missing-datetime-index` (Information) codes alongside the existing `missing-fk-index` (Warning).

2. **`extension/src/diagnostics/checkers/fk-checker.ts` → `index-checker.ts`** — Renamed file and function (`checkMissingFkIndexes` → `checkMissingIndexes`) to reflect the broader scope. `checkMissingIndexes()` now branches on `suggestion.priority` via a `resolveCodeAndMessage()` helper:
   - `high` → `missing-fk-index` with "FK column..." message (Warning)
   - `medium` → `missing-id-index` with "_id column..." message (Information)
   - `low` → `missing-datetime-index` with "Date/time column..." message (Information)

3. **`extension/src/diagnostics/providers/schema-provider.ts`** — Updated import from `fk-checker` to `index-checker`, call site from `checkMissingFkIndexes` to `checkMissingIndexes`. `provideCodeActions()` now offers Copy/Run SQL quick-fix actions for all three index codes.

4. **`extension/src/test/schema-provider.test.ts`** — Added tests verifying:
   - Medium-priority `_id` suggestions produce `missing-id-index` (not `missing-fk-index`)
   - Low-priority datetime suggestions produce `missing-datetime-index` (not `missing-fk-index`)
   - Datetime columns never produce `missing-fk-index`
   - Copy/Run code actions work for both new codes

5. **`extension/src/test/schema-provider-test-helpers.ts`** — Fixed `priority` union type to include `'medium'`.

## Related

- Bug report `no_foreign_keys_false_positive_on_intentionally_isolated_tables.md` — same pattern: a heuristic that lacks schema-context awareness produces false positives that erode trust
- Bug report `null_anomaly_false_positive_on_nullable_columns.md` — same class: rule ignores schema intent
