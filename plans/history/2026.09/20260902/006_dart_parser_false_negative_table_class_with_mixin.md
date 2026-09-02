# BUG: Tables declared with a mixin or `implements` clause are invisible to every diagnostic

**Status: Fixed**

Created: 2026-09-02
Component: Extension
File: `extension/src/schema-diff/dart-parser.ts` (line 35)
Severity: False negative

---

## Summary

`TABLE_CLASS_PATTERN` is `/class\s+(\w+)\s+extends\s+Table\s*\{/g` - it requires the opening brace to follow `Table` immediately. Drift supports (and its docs recommend) sharing columns via a mixin, `class Contacts extends Table with TimestampMixin {`. That form does not match, so the table is not parsed at all. Every schema, naming, primary-key, raw-SQL and performance diagnostic silently skips it, as do migration generation and the schema diff.

---

## Attribution Evidence

```bash
# Positive - the parser IS here, and it is the sole source of table info
grep -rn "TABLE_CLASS_PATTERN" extension/src/
# extension/src/schema-diff/dart-parser.ts:35:const TABLE_CLASS_PATTERN = /class\s+(\w+)\s+extends\s+Table\s*\{/g;

grep -rn "parseDartTables" extension/src/ | grep -v /test/
# extension/src/diagnostics/dart-file-parser.ts:10  (import)
# extension/src/diagnostics/dart-file-parser.ts:66  (all diagnostics)
# extension/src/migration-gen/migration-gen-commands.ts:8,42  (migration generation)
# extension/src/schema-diff/dart-parser.ts:162  (definition)
# extension/src/schema-diff/schema-diff-commands.ts:3,35  (schema diff)

grep -rn "extends\\\\s+Table" lib/src/
# Expected: 0 matches (the Dart-source parser is TypeScript-only; the Dart package
#           reads the live database, never the user's Dart source)

# Negative - not a sibling-repo rule
grep -rn "TABLE_CLASS_PATTERN\|parseDartTables" ../saropa_lints/lib/src/rules/
# Expected: 0 matches   (actual: 0 matches; ../saropa_lints/lib/src/rules/ exists, 21 entries)
```

**Emit site(s) - list ALL:** not an emit site but a *suppression* site - `extension/src/schema-diff/dart-parser.ts:162` (`parseDartTables`) returns an empty list, and `extension/src/diagnostics/dart-file-parser.ts:68` then drops the file from `ctx.dartFiles` entirely (`if (tables.length > 0)`).

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- VS Code version: any
- Extension version: 4.2.5
- Dart SDK version: any
- Database type and version: SQLite (Drift 2.x)
- Connection method: local debug server
- Relevant non-default settings: none

---

## Steps to Reproduce

1. Share audit columns across tables with a mixin - the documented Drift way to avoid repeating them:

   ```dart
   mixin TimestampMixin on Table {
     DateTimeColumn get createdAt => dateTime()();
     DateTimeColumn get updatedAt => dateTime()();
   }

   class Contacts extends Table with TimestampMixin {
     IntColumn get id => integer().autoIncrement()();
     TextColumn get displayName => text()();
   }
   ```

2. Delete the `display_name` column from the live database (or simply never create the table) so `missing-column-in-db` / `missing-table-in-db` should fire.
3. Connect the extension and refresh diagnostics.

---

## Expected Behavior

`Contacts` is parsed, and the drift between the Dart definition and the database is reported, exactly as it would be without the `with` clause.

---

## Actual Behavior

No diagnostics at all for `Contacts`. Removing ` with TimestampMixin ` from the class header makes every expected diagnostic appear immediately - which is the proof that the class header, not the schema state, decides the outcome.

Because `dart-file-parser.ts:68` drops files with zero parsed tables, a file containing only mixin-using tables is removed from `ctx.dartFiles` altogether. That file then also loses:

- `raw-sql-unknown-column` validation of its `customSelect` strings;
- inline `// drift-advisor:ignore` suppression parsing;
- its ability to be the N+1 / slow-query table-definition fallback target (`findDartFileForTable` cannot find the table);
- `checkExtraTablesInDb`'s knowledge that the table exists in Dart - so the table is *additionally* reported as `extra-table-in-db` ("exists in database but not in Dart"), an outright false positive caused by the same miss.

---

## Minimal Reproducible Example

The regex is pure; running it over four class headers:

```
MATCH   "class Contacts extends Table {"
MISS    "class Contacts extends Table with TimestampMixin {"
MISS    "class Contacts extends Table implements Foo {"
MATCH   "@DataClassName(\"C\")\nclass Contacts extends Table {"
```

`extension/src/test/dart-parser.test.ts` and `extension/src/test/dart-parser-tables.test.ts` contain no `with`-clause or `implements`-clause fixture, so nothing catches this.

Note the compounding effect: the false negative on the Dart side produces a false *positive* on the DB side. A project that uses a timestamp mixin on all of its tables sees zero drift diagnostics and one `extra-table-in-db` Information per table.

---

## Root Cause

`TABLE_CLASS_PATTERN` anchors on `Table\s*\{`, treating the superclass name as immediately adjacent to the class body. Dart's class header grammar allows `with <mixins>` and `implements <interfaces>` between them, in that order, both optional. The pattern encodes only the simplest header form.

The same anchoring means a header wrapped across lines by the formatter also misses:

```dart
class ContactPointsWithAVeryLongName extends Table
    with TimestampMixin {
```

**Fix sketch**

1. Allow the optional clauses between the superclass and the brace:

   ```ts
   // Dart allows `with <mixins>` and `implements <interfaces>` between the
   // superclass and the class body. Drift's docs recommend a mixin for shared
   // columns, so the bare `extends Table {` form is not the common case.
   const TABLE_CLASS_PATTERN =
     /class\s+(\w+)\s+extends\s+Table\b(?:\s+(?:with|implements)\s+[\w\s,<>]+?)?\s*\{/g;
   ```

   Keep `\b` after `Table` so `extends TableCompanion` cannot match.
2. Columns declared *in the mixin* still will not be found, because `extractClassBody` only reads the table class body. Either (a) parse `mixin X on Table { ... }` bodies as column sources and merge them into any class whose header names them, or (b) leave them out but do not let their absence hide the class - option (b) alone already removes the `extra-table-in-db` false positive and restores every table-scoped check for the columns that *are* in the class body. Option (a) is the complete fix; do not ship (a) without also handling a mixin defined in a different file, or the merged column list will be silently partial.
3. Tests: add fixtures to `extension/src/test/dart-parser-tables.test.ts` for `with M`, `with M1, M2`, `implements I`, `with M implements I`, and a header wrapped across two lines.

---

## Changes Made

Implemented fix-sketch option (b): the regex no longer hides the class, but
columns declared inside a mixin's own body are still not merged (documented
limitation below, tracked separately if it becomes necessary).

- `extension/src/schema-diff/dart-parser.ts:35` — `TABLE_CLASS_PATTERN` changed from
  `/class\s+(\w+)\s+extends\s+Table\s*\{/g` to
  `/class\s+(\w+)\s+extends\s+Table\b(?:\s+(?:with|implements)\s+[\s\S]+?)?\s*\{/g`.
  The `\b` after `Table` preserves the existing guard against matching
  `extends TableCompanion`. The optional non-greedy `[\s\S]+?` (not `.+?`)
  absorbs a `with`/`implements` clause of any length, including one wrapped
  across a formatter-inserted line break, and stops at the first `{`.
- `extension/src/test/dart-parser-mixin.test.ts` (new) — 9 regression cases:
  bare `extends Table {`, single mixin, multiple comma-separated mixins,
  `with` + `implements` together, bare `implements` with a generic type
  argument, a line-wrapped header, and three negative cases (`*Table`-named
  non-Table class, class with no `extends Table` at all, and
  `extends TableCompanion` to confirm the word-boundary guard still holds).
  Kept in its own file rather than added to `dart-parser-tables.test.ts` to
  respect the repo's ~300-line-per-test-file convention.

**Known remaining limitation (not fixed here):** columns declared inside the
mixin body itself (`mixin TimestampMixin on Table { ... }`) are still not
parsed — `extractClassBody` only ever reads the table class's own body. A
table using a mixin is now visible with its own columns, and the
`extra-table-in-db` false positive is gone, but `createdAt`/`updatedAt`-style
columns defined only in the mixin will not appear in that table's
`IDartTable.columns`. Fully resolving that (fix-sketch option (a): parsing
`mixin X on Table { ... }` bodies and merging them into every class that
names them, including across files) is a separate, larger change and was
intentionally left out of this fix per the bug's own guidance not to ship
(a) without handling cross-file mixins.

## Impact

- Who is affected: every project that shares columns through a `Table` mixin - a pattern Drift documents and that is standard for `createdAt`/`updatedAt`/soft-delete columns, so typically *all* of a project's tables at once.
- What is blocked: the entire diagnostic surface for those tables. The extension reports "no problems" on a schema it never read, which is worse than reporting nothing at all - and simultaneously emits an `extra-table-in-db` false positive for each affected table.
- Data risk: indirect - `Generate Migration` and `Schema Diff` use the same parser, so a migration generated for such a project omits the tables entirely.
- Frequency: always, for any affected class.
