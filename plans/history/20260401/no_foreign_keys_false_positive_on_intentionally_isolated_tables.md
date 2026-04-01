# Bug: `no-foreign-keys` fires on tables that intentionally have no FK relationships

**Created:** 2026-04-01
**Severity:** Low — informational diagnostic, but high noise in real projects
**Component:** `extension/src/diagnostics/providers/best-practice-provider.ts` — `_checkNoForeignKeys()`

---

## Summary

The `no-foreign-keys` diagnostic flags every table that has an `id` column, at least one other column, and zero `FOREIGN KEY` constraints. It does not distinguish between tables that *should* have FKs but are missing them versus tables that are *intentionally isolated* by design. In a real project with 35+ tables, this produces dozens of false positives that bury legitimate warnings in the Problems panel.

## Reproduction

1. Define a Drift table that stores external API data with a soft UUID reference:

```dart
@DataClassName('FacebookFriendDriftModel')
class FacebookFriends extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get facebookId => text()();
  TextColumn get contactSaropaUUID => text().nullable()(); // soft link, not FK
  TextColumn get givenName => text().nullable()();
  TextColumn get familyName => text().nullable()();
  DateTimeColumn get importedAt => dateTime().nullable()();
}
```

2. Open the file in VS Code with Drift Advisor enabled.
3. Result:

```
[drift_advisor] Table "facebook_friends" has no foreign key relationships
```

Severity: `Information` (rendered as a blue squiggle on the class declaration line).

## Expected behavior

No diagnostic should fire for tables where the absence of FKs is an intentional design choice. Common legitimate patterns include:

| Pattern | Why no FK | Example tables |
|---|---|---|
| **External import cache** | Records exist before any local entity to reference; FK would block import | `facebook_friends`, `contact_import_cache` |
| **Static/bundled data** | Read-only data loaded from JSON assets; FK adds write-path overhead for zero benefit | `curious_facts`, `inspirational_quotes`, `country_states` |
| **UUID soft references** | Cross-table links use UUID strings instead of integer FKs (common during Isar-to-Drift migration) | Any table with a `*SaropaUUID` column |
| **Configuration/settings** | Key-value stores with no relational dependencies | `user_preferences`, `user_env_overrides` |
| **Audit/log tables** | Append-only records that must survive parent deletion | `activity_log`, `error_log`, `performance_log` |

The current rule treats "has columns but no FKs" as sufficient evidence of a problem. It is not.

## Root cause

`_checkNoForeignKeys()` (lines 149–173 of `best-practice-provider.ts`) applies a single, unconditional heuristic:

```typescript
if (fks.length === 0 && dartTable.columns.length > 1) {
  const hasIdColumn = dartTable.columns.some(
    (c) => c.sqlName === 'id' || c.autoIncrement,
  );
  const hasOtherColumns = dartTable.columns.some(
    (c) => c.sqlName !== 'id' && !c.autoIncrement,
  );

  if (hasIdColumn && hasOtherColumns) {
    issues.push({ code: 'no-foreign-keys', ... });
  }
}
```

The only filter is "has an id + at least one non-id column." This matches virtually every table in every project. There is no column-name heuristic, no schema-context awareness, and no per-table suppression mechanism.

## Suggested fix

### Option A: Suppress when soft-reference columns are present (heuristic)

If the table contains columns whose names match common soft-reference patterns (`*_uuid`, `*_saropaUUID`, `*_id` where the referenced table also has no FK back), treat the table as intentionally using soft references and skip the diagnostic.

```typescript
const softRefPattern = /(_uuid|_saropa_uuid|_external_id)$/i;
const hasSoftRefs = dartTable.columns.some(
  (c) => softRefPattern.test(c.sqlName),
);
if (hasSoftRefs) return; // intentional soft references
```

This is project-specific and fragile, but would eliminate the most common false positives.

### Option B: Per-table inline suppression (recommended)

Support a `// drift_advisor:ignore no-foreign-keys` comment on or above the class declaration line. The provider already parses Dart files — extending the parser to detect ignore comments would provide a universal suppression mechanism that works for all diagnostic codes, not just this one.

```dart
// drift_advisor:ignore no-foreign-keys — import cache, no relational dependencies
class FacebookFriends extends Table { ... }
```

This is the most robust and general solution. It keeps the rule active by default but lets developers document and suppress known false positives at the source.

### Option C: Table-role heuristic (smart default)

Infer table "roles" from naming patterns and column signatures, then skip the diagnostic for roles where FKs are not expected:

| Signal | Inferred role | Skip `no-foreign-keys`? |
|---|---|---|
| Table name contains `cache`, `import`, `log`, `audit` | Cache / log | Yes |
| All non-id columns are nullable | Optional/sparse data store | Yes |
| Table has a `*_json` column | Denormalized blob store | Yes |
| Table name matches a static data directory pattern | Static/bundled data | Yes |

This reduces false positives without requiring any user configuration, but risks misclassifying tables.

### Option D: Require inbound OR outbound FK (refine the check)

Currently the check only looks at outbound FKs (constraints declared on this table). It should also check whether any *other* table has an FK pointing *to* this table. A table that is referenced by others is part of the relational graph even if it declares no outbound FKs itself.

```typescript
const isReferencedByOthers = [...fkMap.values()].some(
  (fks) => fks.some((fk) => fk.toTable === dartTable.sqlTableName),
);
if (isReferencedByOthers) return; // table participates in FK graph
```

This is a quick win that eliminates false positives on parent/lookup tables, but does not help with genuinely isolated tables like import caches.

## Impact

- **Contacts project**: 35+ Drift tables, of which ~25 intentionally have no FK constraints. The Problems panel shows ~25 `no-foreign-keys` informational diagnostics, drowning out the ~3 genuine warnings (`circular-fk`, `autoincrement-not-pk`) that actually need attention.
- **Developer trust**: A wall of blue squiggles on every table file teaches developers to ignore the entire `bestPractices` category, defeating the purpose of the more valuable checks in the same category.
- **Workaround tax**: The current workaround (global disable via `driftViewer.diagnostics.disabledRules`) is all-or-nothing — it silences the rule on tables where it *would* be useful (e.g., a new table that genuinely forgot to declare an FK).

## Affected code

- `extension/src/diagnostics/providers/best-practice-provider.ts` — `_checkNoForeignKeys()` (lines 149–173)
- `extension/src/diagnostics/codes/best-practice-codes.ts` — `no-foreign-keys` entry (lines 40–46)
- `extension/src/test/best-practice-provider.test.ts` — existing tests (lines 76–119) only cover the binary has-FK / no-FK case; need tests for soft-reference columns, inline suppression, and inbound-FK scenarios

## Triggering table (real-world example)

`facebook_friend_table.dart` — an import cache for Facebook Graph API friend data. The `contactSaropaUUID` column is a nullable soft link to the contacts table, intentionally *not* a foreign key because:

1. Records are created during import before any contact match exists
2. The Facebook friend may never be matched to a local contact
3. A hard FK would require insert ordering and would block bulk imports
4. Deleting a contact should not cascade-delete the Facebook import record

## Related

- Plan `044_drift-advisor-false-positives.md` — Bug 1 documents this as an enhancement request for per-table suppression
- Bug report `null_anomaly_false_positive_on_nullable_columns.md` — same class of problem (rule ignores schema intent)
