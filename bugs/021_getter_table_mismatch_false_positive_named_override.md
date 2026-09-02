# BUG: `getter-table-mismatch` fires on every deliberate `.named()` override — including the one `column-name-acronym-mismatch` tells you to add

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/diagnostics/providers/naming-provider.ts` (line ~276)
Severity: False positive

---

## Summary

`_checkColumnNaming` compares the column's SQL name against `_toSnakeCase(dartName)` and reports a mismatch. `.named('...')` exists precisely to produce a SQL name that is *not* the derived one, so using it always trips the rule. Worse, `column-name-acronym-mismatch` (from `column-checker.ts`) explicitly instructs the user to add `.named(...)` as the fix — following that advice trades one Error for a permanent Information diagnostic.

---

## Attribution Evidence

```bash
# Positive — diagnostic IS defined here
grep -rn "'getter-table-mismatch'" extension/src/
# extension/src/diagnostics/codes/naming-codes.ts:31:  'getter-table-mismatch': {
# extension/src/diagnostics/codes/naming-codes.ts:32:    code: 'getter-table-mismatch',
# extension/src/diagnostics/providers/naming-provider.ts:157:        code: 'getter-table-mismatch',

grep -rn "'getter-table-mismatch'" lib/src/
# Expected: 0 matches (TypeScript-only diagnostic)

# Negative — not a sibling-repo rule
grep -rn "'getter-table-mismatch'" ../saropa_lints/lib/src/rules/
# Expected: 0 matches   (actual: 0 matches; ../saropa_lints/lib/src/rules/ exists, 21 entries)
```

**Emit site(s) — list ALL:** `extension/src/diagnostics/providers/naming-provider.ts:156` (file-local line 278 of the concatenated providers listing)
**Diagnostic `source` / `owner` as seen in Problems panel:** `drift-advisor`

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- Extension version: 4.2.5
- Database type and version: SQLite (Drift)
- Connection method: local debug server
- Relevant non-default settings: none (naming category enabled by default)

---

## Steps to Reproduce

1. Start with a legacy, manually-created table whose column is `contact_saropa_uuid`, and a Drift getter:
   ```dart
   class Contacts extends Table {
     IntColumn get id => integer().autoIncrement()();
     TextColumn get contactSaropaUUID => text()();
   }
   ```
2. Connect. `column-name-acronym-mismatch` fires (Error):

   > Column "contacts.contact_saropa_u_u_i_d" name mismatch: Drift generates "contact_saropa_u_u_i_d" but database has "contact_saropa_uuid". Rename the Dart getter so Drift produces "contact_saropa_uuid", **or add .named('contact_saropa_uuid') to override**

3. Take the suggested fix:
   ```dart
   TextColumn get contactSaropaUUID => text().named('contact_saropa_uuid')();
   ```
4. Refresh diagnostics.

---

## Expected Behavior

Step 3 resolves the finding. A `.named()` override is the sanctioned mechanism for an intentional Dart↔SQL name divergence; there is nothing left to report.

---

## Actual Behavior

The Error is replaced by a permanent Information diagnostic on the same line:

> drift-advisor Dart getter "contactSaropaUUID" maps to unexpected SQL name "contact_saropa_uuid"

There is no way to satisfy both rules simultaneously.

---

## Minimal Reproducible Example

```dart
class Contacts extends Table {
  IntColumn get id => integer().autoIncrement()();
  // Deliberate override — SQL name is fixed by a legacy schema.
  TextColumn get contactSaropaUUID => text().named('contact_saropa_uuid')();
}
```

Checker arithmetic (`naming-provider.ts:276-285`):

```ts
dartCol.dartName = 'contactSaropaUUID'
dartCol.sqlName  = 'contact_saropa_uuid'          // from .named()
expectedSqlName  = _toSnakeCase('contactSaropaUUID')
                 = 'contact_saropa_u_u_i_d'       // each capital -> _<lower>
colName !== expectedSqlName                        // true
colName !== dartCol.dartName                       // true
=> emit 'getter-table-mismatch'
```

A simpler case with no acronym involved fails identically:

```dart
TextColumn get userName => text().named('user_name_v2')();
// expected 'user_name', actual 'user_name_v2' -> flagged
```

---

## Root Cause

The rule's intent (per `naming-codes.ts`, message `'Dart getter "{getter}" maps to unexpected SQL name "{sqlName}"'`) is to catch an *accidental* divergence — a getter whose derived name is not what the developer thinks it is. But an accidental divergence is impossible: Drift derives the SQL name from the getter mechanically. The **only** way `sqlName !== _toSnakeCase(dartName)` can hold is a `.named()` call, i.e. an explicit, deliberate declaration. The rule therefore fires exclusively on intentional code.

`IDartColumn` (`extension/src/schema-diff/dart-schema.ts:12-36`) records `sqlName` but not whether it came from `.named()`, so the checker has no way to distinguish the two cases today.

**Fix sketch**

1. Add `hasNamedOverride: boolean` to `IDartColumn`, set by `dart-parser.ts` when `.named(` appears in the builder chain (the parser already regex-tests the chain for `.autoIncrement()` and `.nullable()`, so this is the same shape as `AUTO_INCREMENT_RE`).
2. Skip `getter-table-mismatch` when `hasNamedOverride` is true:
   ```ts
   // A .named() override IS the declaration of an intentional divergence, and
   // is what column-name-acronym-mismatch recommends as its fix. Reporting it
   // makes the two rules mutually unsatisfiable.
   if (dartCol.hasNamedOverride) return;
   ```
3. Consider retiring the rule entirely — with `.named()` excluded, the remaining condition is unreachable for Drift-generated names, which would make this dead code. If it is kept, it should be re-scoped to something reachable, e.g. "`.named()` value does not match the live DB column" (which is already `missing-column-in-db`).
4. Test: extend `extension/src/test/naming-provider.test.ts` with the two fixtures above asserting zero `getter-table-mismatch` issues.

---

## Impact

- Who is affected: every project with a legacy or externally-owned schema, and every user who follows the `column-name-acronym-mismatch` quick-fix advice.
- What is blocked: the two rules give contradictory instructions, so neither can be driven to zero. Users disable one of them.
- Data risk: none.
- Frequency: every refresh, once per `.named()` column.
