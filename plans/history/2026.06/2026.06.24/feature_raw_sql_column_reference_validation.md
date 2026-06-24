## Title

Validate column references inside `customSelect` / `customStatement` raw SQL strings against the profiled schema — flag references to columns that do not exist before they crash at runtime.

---

## Status

Fixed — diagnostic `raw-sql-unknown-column` implemented. See Finish Report at end.

---

## Type

Feature request (new diagnostic check). Not a bug against an existing diagnostic.

---

## Summary

Drift's typed query builder is schema-checked, but **raw SQL** passed to
`customSelect(...)` / `customStatement(...)` is an opaque string the compiler
never validates. A column name typo — or a name that does not match Drift's
snake_case generation — only surfaces as a runtime `SqliteException(1): no such
column` when the query executes.

Drift Advisor already profiles the live schema (it knows every table's real
columns) **and** already extracts raw SQL from these calls
(`extension/src/explain/sql-extractor.ts` has `CUSTOM_CALL_RE` matching
`customSelect` / `customStatement`). The missing piece is a checker that joins
the two: parse the column identifiers out of each extracted raw SQL string and
flag any that are absent from the referenced table's profiled column set.

---

## Motivating Incident

**Project:** Saropa Contacts (`d:\src\contacts`). **Date:** 2026-06-24.

Opening any contact threw, every time:

```
Drift ERROR SELECT: SELECT contact_saropa_uuid AS uuid, LENGTH(image) AS sz
FROM contact_avatars — SqliteException(1): while preparing statement,
no such column: contact_saropa_uuid, SQL logic error (code 1)
```

The avatar byte-size audit ran:

```dart
await db.customSelect(
  'SELECT contact_saropa_uuid AS uuid, LENGTH(image) AS sz FROM contact_avatars',
).get();
```

The `ContactAvatars` table getter is `contactSaropaUUID` (all-caps `UUID`), so
Drift generated the column `contact_saropa_u_u_i_d` — the raw SQL referenced
`contact_saropa_uuid`, which exists in *neither* the Dart model *nor* the DB.
The fix was to derive the name from `db.contactAvatars.contactSaropaUUID.name`.

---

## Why the existing `column-name-acronym-mismatch` check does NOT catch this

Drift Advisor already has a related schema-diff check:

- **Code:** `column-name-acronym-mismatch`
- **Registered at:** `extension/src/diagnostics/codes/schema-codes.ts:69`
- **Emitted at:** `extension/src/diagnostics/checkers/column-checker.ts:59`
- **What it does:** compares a Drift Dart getter's *generated* column name
  against the *actual DB* column and flags when they differ (Dart vs DB drift).

That check would NOT have caught this incident. The avatar table's generated
name (`contact_saropa_u_u_i_d`) **matches** the DB column exactly — there is no
Dart-vs-DB drift. The bug lived in a **raw SQL string literal** that matched
neither side. `column-name-acronym-mismatch` never inspects raw SQL, so the
crash was invisible to it. The proposed check operates on a different surface
(the contents of `customSelect` / `customStatement` strings) and is genuinely
new — it complements, not duplicates, the acronym check.

---

## Emitter Attribution

This is a **new check** — the proposed diagnostic code does not exist yet.

- Proposed `owner`: `drift-advisor`
- Proposed `code`: `raw-sql-unknown-column` (new)
- Proposed `source`: `Drift Advisor`
- Registered at (file:line): N/A — to be added, suggest
  `extension/src/diagnostics/codes/schema-codes.ts` alongside the other schema codes
- Emit site(s): N/A — to be added, suggest new
  `extension/src/diagnostics/checkers/raw-sql-column-checker.ts`
- Grep proof the code does not exist yet:
  `grep -rn "raw-sql-unknown-column" extension/src/ lib/src/` → 0 matches
- Existing related code confirmed distinct (see section above):
  `column-name-acronym-mismatch` at `schema-codes.ts:69`, emitted at
  `column-checker.ts:59`. The new check is a separate surface.

Mixed-language note: the schema diagnostics live in the TypeScript extension
tree (`extension/src/diagnostics/`). Raw SQL extraction also lives there
(`extension/src/explain/sql-extractor.ts`). No Dart (`lib/src/`) emit path is
involved for this feature; `grep -rn "customSelect" lib/src/` → 0 matches.

---

## Proposed Behavior

For each `customSelect(...)` / `customStatement(...)` call in the user's Dart
source:

1. Extract the SQL string (reuse `sql-extractor.ts` `CUSTOM_CALL_RE`; extend to
   capture the call even when not at the cursor — the existing extractor is
   cursor-driven for EXPLAIN, this checker needs to scan the whole file).
2. Parse the referenced table name(s) from `FROM` / `JOIN`.
3. Parse column identifiers from the `SELECT` list / `WHERE` / `ON` / `ORDER BY`
   (a lightweight tokenizer is enough; full SQL parsing is not required — skip
   `*`, SQL functions like `LENGTH`, `COUNT`, aliases after `AS`, and literals).
4. For each column identifier, check it against the profiled schema's column set
   for that table.
5. If absent, emit `raw-sql-unknown-column` on the string-literal range with a
   message naming the table, the bad column, and the closest actual column name
   (Levenshtein nearest) as the suggested fix — e.g. for the incident:
   `Column "contact_saropa_uuid" not found in "contact_avatars"; did you mean
   "contact_saropa_u_u_i_d"? Reference it via the Drift getter
   (db.contactAvatars.contactSaropaUUID.name) instead of hardcoding.`

### Scope / safety

- **Only validate when the FROM table resolves to a known profiled table.**
  Unknown tables (CTEs, temp tables, `PRAGMA`, `sqlite_*`) → skip silently.
- **Skip computed/aliased identifiers** — `LENGTH(image) AS sz` must not flag
  `sz`. Only validate bare column tokens that resolve to a real table.
- **Default severity Warning, not Error** at first — a conservative tokenizer
  may miss exotic SQL; a false Error would block. Promote to Error once the
  parser is proven on the codebase corpus.
- Honor an inline suppression comment for intentional dynamic SQL.

---

## Minimal Reproducible Example

```dart
// contact_avatar_drift_io.dart — the real incident, minimized.
await db.customSelect(
  // raw-sql-unknown-column (proposed): `contact_saropa_uuid` is not a column
  // of `contact_avatars`; the real column is `contact_saropa_u_u_i_d`.
  'SELECT contact_saropa_uuid AS uuid, LENGTH(image) AS sz FROM contact_avatars',
).get();
```

Profiled schema for `contact_avatars` (from any sample DB): columns are
`id`, `version`, `image`, `image_thumbnail`, `dominant_color`,
`contact_saropa_u_u_i_d`. `contact_saropa_uuid` is absent → the check fires.

---

## Expected vs Actual

| | Behavior |
|---|---|
| **Expected** | A diagnostic on the raw SQL string at author time, naming `contact_saropa_uuid` as unknown for `contact_avatars` and suggesting `contact_saropa_u_u_i_d` |
| **Actual** | No author-time signal; the query compiles and ships, then throws `no such column` on every contact open at runtime |

---

## Impact

- **Who is affected:** any project authoring raw SQL via `customSelect` /
  `customStatement` — common in Drift apps for aggregates, `LENGTH()` scans,
  JOINs the typed API does not express cleanly.
- **What is blocked:** nothing at author time today; failures are runtime-only
  and can ship to production (this incident crashed every contact-open).
- **Data risk:** none directly, but a raw `customStatement` UPDATE/DELETE with a
  bad column silently no-ops or throws mid-transaction.
- **Frequency:** every execution of the offending query.

---

## What Already Exists To Build On

- `extension/src/explain/sql-extractor.ts` — `CUSTOM_CALL_RE` already matches
  `customSelect` / `customStatement` and pulls the SQL string out. Extend from
  cursor-scoped to whole-file scan.
- The profiled schema model (column sets per table) the schema checkers already
  consume — `column-checker.ts` / `schema-provider.ts` read it for the acronym
  and type-drift checks; the new checker reads the same source.

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- Extension version: (current)
- Database type and version: SQLite (Drift / sqlite3)
- Triggering project/file: Saropa Contacts —
  `lib/database/drift_middleware/user_data/contact_avatar_drift_io.dart`
  (`dbContactAvatarByteSizes`), table
  `lib/database/drift/tables/user_data/contact_avatar_table.dart`.

---

## Related

- Companion preventive lint filed in `saropa_lints`:
  `bugs/feature_lint_rule_require_named_for_acronym_drift_columns.md` — forces
  `.named()` on acronym Drift getters so the *generated* name is never
  surprising. That removes the surprise at the table-definition source; this
  drift-advisor check validates *any* raw-SQL column reference against the real
  schema (catches typos and stale names the lint cannot see). The two are
  complementary layers.
- Prior acronym-mismatch work: `plans/history/2026.04/2026.04.06/uuid_column_name_mismatch.md`.

---

## Finish Report (2026-06-24)

### Defect

Raw SQL passed to Drift's `customSelect(...)` / `customStatement(...)` is an
opaque string the compiler never validates. A column name that does not exist —
a typo, a stale name, or a name that does not match Drift's snake_case acronym
splitting (`contactSaropaUUID` getter generates `contact_saropa_u_u_i_d`, not
`contact_saropa_uuid`) — only surfaces at runtime as
`SqliteException(1): no such column`. The existing `column-name-acronym-mismatch`
check operates on Dart-vs-DB getter drift and never inspects raw SQL, so it
could not catch a literal that matches neither side.

### Change

Added a new schema diagnostic `raw-sql-unknown-column` that joins the raw-SQL
extraction surface to the profiled schema the other column checks already
consume.

- `extension/src/diagnostics/codes/schema-codes.ts` — registers the code
  (category `schema`, default severity Warning). Auto-composed into
  `DIAGNOSTIC_CODES`, so suppression / per-table-and-column exclusion / severity
  override all work without extra wiring.
- `extension/src/diagnostics/checkers/raw-sql-parser.ts` (new, pure) —
  `extractRawSqlColumnRefs(text)` scans a whole file for
  `customSelect`/`customStatement` string bodies (single/double/triple quote,
  optional Dart `r` prefix), blanks SQL string literals and comments, tokenizes,
  resolves the single source table, and returns each validatable column
  reference with its absolute source span. Conservative: any query that is not
  single-table (JOIN, comma-FROM, second FROM) is skipped entirely; function
  names, `AS` aliases, `*`, bind params, literals, and identifiers in
  non-column positions are excluded; a qualified `x.col` is validated only when
  `x` is the table name or its declared alias.
- `extension/src/diagnostics/checkers/raw-sql-column-checker.ts` (new) —
  `checkRawSqlColumns(...)` resolves the table against the schema-provider's
  exact and normalized table maps, then flags any column whose EXACT
  (case-insensitive, underscores preserved) name is absent. Exactness is the
  key distinction from the acronym check: `contact_saropa_uuid` and the real
  `contact_saropa_u_u_i_d` normalize identically but are different columns to
  SQLite — that difference is the bug being caught. The nearest real column is
  suggested via the existing `findClosestMatches` when within an edit-distance
  threshold. Each issue carries `data.tableName` / `data.column` so the existing
  exclusion machinery applies.
- `extension/src/diagnostics/providers/schema-provider.ts` — invokes the checker
  once per Dart file (skipped on an empty DB, where no table resolves).

### Tests

- `extension/src/test/raw-sql-parser.test.ts` (16 cases) — the motivating
  incident, precise spans, alias/function/`*` exclusion, WHERE/ORDER BY columns,
  JOIN and comma-FROM skip, qualified-by-table and qualified-by-alias
  resolution, unknown-qualifier skip, string-literal blanking, bind params,
  `customStatement`, no-FROM skip, triple-quoted multi-line.
- `extension/src/test/raw-sql-column-checker.test.ts` (5 cases) — flags the
  incident with the suggested real column, passes valid columns, skips
  unprofiled tables, pins the range to the offending token, case-insensitive
  match.
- All 21 pass; full extension suite 2964 passing, 0 failing. `tsc -p ./` clean.

### Scope notes

The bug's suggested message named the exact Dart getter path
(`db.contactAvatars.contactSaropaUUID.name`). That getter cannot be reliably
derived from a raw SQL string alone, so the emitted message gives the generic
"reference the Drift getter's .name" guidance plus the nearest column name.
Diagnostic messages in this extension are hardcoded English (matching every
existing checker / code template); no i18n catalog exists for diagnostic copy.
