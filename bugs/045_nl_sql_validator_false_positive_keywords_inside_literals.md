# BUG: NL-to-SQL safety gate rejects valid read-only SELECTs whose string literals contain a keyword or a semicolon

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/nl-sql/sql-validator.ts` (lines 15, 25)
Severity: False positive

---

## Summary

`validateGeneratedSql` scans the raw SQL text for `;` and for mutation keywords without first masking string literals or quoted identifiers. A perfectly read-only query whose *data* mentions `DELETE`, or whose search pattern contains a semicolon, is rejected as a mutation or as stacked statements. These are exactly the queries a user asks for when the database has an audit or event table.

---

## Attribution Evidence

```bash
# Positive - the gate IS here
grep -rn "validateGeneratedSql" extension/src/ | grep -v /test/
# extension/src/nl-sql/sql-validator.ts:7:export function validateGeneratedSql(sql: string): void {
# (called from the nl-sql generation path before insertion into SQL Notebook)

grep -rn "validateGeneratedSql" lib/src/
# Expected: 0 matches (the NL-to-SQL gate is TypeScript-only; the Dart server has
#           its own independent SQL validation, which is not what this report covers)

# Negative - not a sibling-repo rule
grep -rn "validateGeneratedSql" ../saropa_lints/lib/src/rules/
# Expected: 0 matches   (actual: 0 matches; ../saropa_lints/lib/src/rules/ exists, 21 entries)
```

**Emit site(s) - list ALL:** `extension/src/nl-sql/sql-validator.ts:16` (stacked-statement throw), `extension/src/nl-sql/sql-validator.ts:26` (banned-token throw)
**Surface:** error thrown before the generated SQL reaches SQL Notebook; surfaced to the user as a failure of the NL-to-SQL request.

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- VS Code version: any
- Extension version: 4.2.5
- Database type and version: SQLite (Drift)
- Connection method: local debug server
- Relevant non-default settings: NL-to-SQL configured with an LLM provider

---

## Steps to Reproduce

1. Have an audit table:

   ```sql
   CREATE TABLE audit_log (id INTEGER PRIMARY KEY, action TEXT NOT NULL, at TEXT);
   INSERT INTO audit_log (action, at) VALUES ('DELETE','2026-01-01'),('INSERT','2026-01-02');
   ```

2. Run NL-to-SQL with the prompt: *"show me the delete entries in the audit log"*.
3. The model returns the obvious, correct, read-only query:

   ```sql
   SELECT * FROM audit_log WHERE action = 'DELETE'
   ```

---

## Expected Behavior

The query is accepted and inserted into SQL Notebook. It reads one table and mutates nothing.

---

## Actual Behavior

```
Error: Only read-only SELECT queries are allowed.
```

The user has no recourse: the query is correct, the rejection message describes a property the query already has, and re-prompting produces the same SQL.

---

## Minimal Reproducible Example

`validateGeneratedSql` is pure. Running it verbatim over five inputs:

```
REJECT: Only read-only SELECT queries are allowed. | SELECT * FROM audit_log WHERE action = 'DELETE'
REJECT: Only a single SQL statement is allowed.    | SELECT id, note FROM notes WHERE note LIKE '%a;b%'
REJECT: Only read-only SELECT queries are allowed. | SELECT "update" FROM counters
REJECT: Only read-only SELECT queries are allowed. | SELECT COUNT(*) FROM events WHERE kind IN ('insert','update')
PASS                                               | SELECT * FROM migrations WHERE name = 'create_users_table'
```

The first four are valid read-only SELECTs. Note the last line: `'create_users_table'` passes only because `create_` has no word boundary after `CREATE` - the pass/fail outcome is decided by incidental adjacency in the literal, not by anything about the statement.

---

## Root Cause

Both checks run against `trimmed`, the unmodified statement text:

```ts
// sql-validator.ts:15
if (trimmed.includes(';')) { throw new Error('Only a single SQL statement is allowed.'); }
// sql-validator.ts:23-27
const bannedTokens = /\b(INSERT|UPDATE|DELETE|...)\b/i;
if (bannedTokens.test(trimmed)) { throw new Error('Only read-only SELECT queries are allowed.'); }
```

A lexical safety gate cannot use a raw substring/regex scan: the semantics it is enforcing are about *statement structure*, and string literals and quoted identifiers are not structure. The repo already owns a correct, tested implementation of the masking step - `blankLiteralsAndComments` in `extension/src/diagnostics/checkers/raw-sql-tokenizer.ts:24`, which replaces literals, quoted identifiers and comments with equal-length spaces.

The existing test file `extension/src/test/sql-validator.test.ts` has four cases (`accepts single SELECT statements`, `accepts CTE statements`, `rejects stacked statements`, `rejects mutation statements`) - none exercises a keyword or semicolon inside a literal, so the gap is untested.

**Fix sketch**

1. Mask literals and comments before both checks, reusing the existing tokenizer helper rather than writing a second masker:

   ```ts
   import { blankLiteralsAndComments } from '../diagnostics/checkers/raw-sql-tokenizer';
   ...
   // Structure checks must run over masked text: a semicolon or the word DELETE
   // inside a string literal is data, not a statement boundary or a mutation.
   const masked = blankLiteralsAndComments(trimmed);
   if (masked.includes(';')) { ... }
   if (bannedTokens.test(masked)) { ... }
   ```

   The masker preserves offsets and length, so `trimmed.length > 20_000` and the `^(SELECT|WITH)` anchor are unaffected. Keep the anchor test on `trimmed` (a leading literal is impossible in a valid statement).
2. `blankLiteralsAndComments` also blanks double-quoted identifiers, which fixes the `SELECT "update" FROM counters` case for free.
3. Keep the gate conservative where it is genuinely ambiguous: after masking, a remaining `;` is a real statement separator and must still be rejected.
4. Tests: add the four rejected cases above to `extension/src/test/sql-validator.test.ts` as *accept* cases, plus a genuine `SELECT 1; DROP TABLE t` and a `SELECT * FROM t WHERE x = 'a' ; DROP TABLE t` as *reject* cases, so the masking cannot be over-applied.

---

## Impact

- Who is affected: any user whose data contains SQL-keyword-shaped values - audit logs, event tables, permission tables, migration-name tables, feature-flag tables. Also any free-text search whose pattern contains a semicolon.
- What is blocked: the NL-to-SQL feature for those queries entirely. The failure looks like a security refusal, so users reasonably conclude the feature is broken or that their query is dangerous.
- Data risk: none - the failure is in the safe direction, but it is the direction that makes the feature unusable for a common table shape.
- Frequency: every generated query whose literals mention a mutation keyword or contain `;`.
