# Import parsing fidelity: CSV quoting + SQL statement splitting (audit M10/M11)

Two data-import parsers corrupted or shattered legitimate input. The CSV parser split the text on `\n` before interpreting quotes, so a newline inside a quoted field broke the record into two; it also trimmed every field, destroying whitespace that quoting was meant to preserve. The SQL-format importer split statements with `data.split(';')`, which shatters any statement containing a semicolon inside a string literal (e.g. `INSERT INTO t VALUES ('a;b')`).

## Finish Report (2026-06-13)

This work will be reviewed by another AI. — (chat-time note; not part of the durable record.)

### Scope

(A) Dart package code (`lib/`) + Dart test. No extension/Flutter/docs beyond the changelog.

### What changed

- **`lib/src/drift_debug_import.dart`** —
  - `parseCsvLines` rewritten as a single-pass RFC-4180 state machine over the whole (BOM-stripped, CRLF-normalized) text. Quotes are tracked across newlines, so a newline inside `"…"` stays part of the field. Quoted field content is preserved exactly; only unquoted fields are trimmed (preserving the lenient `a, b` convention). Blank lines (no fields, only unquoted whitespace) are skipped; a quoted empty field `""` is kept as real data.
  - `_importSql` now uses a new `_splitSqlStatements` helper that splits on top-level `;` only, skipping semicolons inside single/double-quoted literals (with `''`/`""` escapes) and inside line/block comments (comments are dropped from the executed statement, which the DB would ignore anyway).

### Design notes

- The CSV blank-line skip is computed before the field is committed, so it never reads `row.first` (the zero-dependency package can't use `package:collection`'s `firstOrNull`).
- Comments are stripped rather than echoed into the statement, which both matches DB behavior and keeps the splitter free of the recompute the analyzer flagged.

### Verification

- `dart analyze` of the file and test — no issues.
- Existing import suite (simple CSV, embedded commas, escaped quotes, BOM, CRLF/CR, empty-line skip, unquoted-field trim, semicolon-separated SQL, error collection) passes unchanged, confirming behavior is preserved.
- Added: CSV with a newline inside a quoted field stays one record; quoted whitespace preserved while unquoted is trimmed; SQL with `;` inside a string literal yields two statements (not three fragments). All pass (32).

### Outstanding

None. The shared/weaker duplicate `parseCsvLines` in `ServerUtils` is a separate dedup item (audit L5/L7), addressed in the cleanup phase.
