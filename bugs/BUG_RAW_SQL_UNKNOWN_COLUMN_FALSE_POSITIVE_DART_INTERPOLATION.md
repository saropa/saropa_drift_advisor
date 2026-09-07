# BUG: Dart string interpolation and named bind parameters in raw SQL are flagged as unknown columns

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/diagnostics/checkers/raw-sql-parser.ts` (line ~186), `extension/src/diagnostics/checkers/raw-sql-tokenizer.ts` (line ~72)
Severity: False positive

---

## Summary

The raw-SQL tokenizer does not recognise `$` (Dart string interpolation) or `:` / `@` (SQLite named bind parameters) as sigils. `$contactId` tokenizes as the bare word `contactId`, sits in a column position after `=`, and is emitted as `raw-sql-unknown-column`. Every `customSelect` that interpolates a Dart variable produces a spurious Warning.

---

## Attribution Evidence

```bash
# Positive — diagnostic IS defined here
grep -rn "'raw-sql-unknown-column'" extension/src/
# extension/src/diagnostics/checkers/raw-sql-column-checker.ts:106:      code: 'raw-sql-unknown-column',
# extension/src/diagnostics/codes/schema-codes.ts:78:  'raw-sql-unknown-column': {
# extension/src/diagnostics/codes/schema-codes.ts:79:    code: 'raw-sql-unknown-column',

grep -rn "'raw-sql-unknown-column'" lib/src/
# Expected: 0 matches (TypeScript-only diagnostic — no Dart emit path to fix)

# Negative — not a sibling-repo rule
grep -rn "'raw-sql-unknown-column'" ../saropa_lints/lib/src/rules/
# Expected: 0 matches   (actual: 0 matches; ../saropa_lints/lib/src/rules/ exists, 21 entries)
```

**Emit site(s) — list ALL:** `extension/src/diagnostics/checkers/raw-sql-column-checker.ts:105`
**Diagnostic `source` / `owner` as seen in Problems panel:** `drift-advisor`

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- Extension version: 4.2.5
- Database type and version: SQLite (Drift)
- Connection method: local debug server
- Relevant non-default settings: none (schema category enabled by default)

---

## Steps to Reproduce

1. In a file that also defines at least one Drift table class (see `023_raw_sql_unknown_column_false_negative_files_without_tables.md` for why that matters), write:
   ```dart
   Future<List<QueryRow>> contactName(int contactId) =>
       customSelect('SELECT name FROM contacts WHERE id = $contactId').get();
   ```
2. Connect to a running debug server so `contacts` resolves in `dbTableMap`.
3. Save the file and wait for the diagnostic refresh.

---

## Expected Behavior

Two column references validated — `name` and `id`. Both exist. No diagnostic.

---

## Actual Behavior

A Warning on `contactId`:

> drift-advisor Column "contactId" not found in table "contacts". Raw SQL column names must match the database exactly — reference the Drift getter's .name instead of hardcoding

---

## Minimal Reproducible Example

The parser is pure, so this is reproducible without VS Code. Transcribing `raw-sql-tokenizer.ts` + `raw-sql-parser.ts` verbatim into a Node script and calling `extractRawSqlColumnRefs` on each input gives:

```
input : customSelect('SELECT name FROM contacts WHERE id = $contactId')
output: [{"table":"contacts","column":"name"},
         {"table":"contacts","column":"id"},
         {"table":"contacts","column":"contactId"}]   <-- FALSE POSITIVE

input : customSelect('SELECT name FROM contacts WHERE id = :contactId')
output: [{"table":"contacts","column":"name"},
         {"table":"contacts","column":"id"},
         {"table":"contacts","column":"contactId"}]   <-- FALSE POSITIVE

input : customSelect('SELECT name FROM contacts WHERE id = ${filter.id}')
output: [{"table":"contacts","column":"name"},
         {"table":"contacts","column":"id"}]           <-- correct (dotted qualifier rejected)
```

Note the third case only passes by accident: `filter.id` is a dotted identifier whose qualifier is neither the table nor its alias, so `columnAt` rejects it at `raw-sql-parser.ts:208`. A single-segment `${limit}` would also be flagged if it sat in a column position.

---

## Root Cause

`TOKEN_RE` in `raw-sql-tokenizer.ts:72`:

```
/([A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)*)|(\()|(\))|(,)|(\*)|(::|\|\||<=|>=|!=|<>|[=<>+\-/%])/g
```

`$` and `:` are not in any alternative, so the regex engine simply skips them and resumes matching at the following letter. The parser then sees a normal word token whose `prev` is the `=` operator — a legal column position per `columnAt` (`raw-sql-parser.ts:188-193`) — and validates it against the schema.

`?` positional parameters are safe only because they are also unmatched *and* not followed by an identifier; the existing test `ignores bind parameters and numeric literals` (`extension/src/test/raw-sql-parser.test.ts:114`) covers `?` and `5` only and therefore does not catch this.

**Fix sketch**

1. Add a `param` token kind to `TOKEN_RE` that consumes the sigil together with its identifier, so the parser sees one non-column token instead of a bare word:
   ```
   ([$:@][A-Za-z_][A-Za-z0-9_$]*)   // named param / interpolation -> kind 'param'
   ```
   and emit it with `kind: 'param'`, which `columnAt` returns `null` for (it already returns `null` for `tok.kind !== 'word'`).
2. Blank `${...}` interpolation blocks in `blankLiteralsAndComments` the same way string literals are blanked, so a braced interpolation containing arbitrary Dart cannot be tokenized as SQL at all. Preserve offsets by replacing with spaces.
3. Regression tests in `extension/src/test/raw-sql-parser.test.ts` for `$var`, `${expr}`, `:named`, `@named`, and a `$var` in a `SELECT` list position.

---

## Impact

- Who is affected: any project using `customSelect` / `customStatement` with interpolated Dart values or named bind parameters — the normal way dynamic raw SQL is written.
- What is blocked: nothing hard-blocked, but the Problems panel fills with unfixable Warnings; the suggested remedy in the message ("reference the Drift getter's .name") is meaningless for a bind parameter, so users cannot act on it.
- Data risk: none.
- Frequency: once per interpolated identifier in a column position, on every refresh.
