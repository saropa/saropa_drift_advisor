# Bug Report

**Status:** Fixed

## Title

Interactive `/api/sql` executes queries with no schema pre-validation, so column-name / reserved-word mistakes return bare `SqliteException` with no nearest-match hint — three distinct schema-mismatch failures in one debug session against Saropa Contacts.

---

## Type

Feature request against an existing capability gap. The Advisor already profiles the live schema **and** already ships a fuzzy column checker (`raw-sql-column-checker.ts`, added 2026-06-24) — but that checker only runs against raw SQL found in Dart *source files* (`customSelect` / `customStatement`). The interactive `/api/sql` execution path does **not** apply it, so client-composed queries hit raw SQLite errors with no suggestion of the correct column.

Not a bug in the target app (Saropa Contacts). See "Emitter Attribution" — the app issues none of these queries.

---

## Environment

| Field | Value |
|---|---|
| OS | Windows 11 Pro 10.0.22631 (host); target app runs on Android device, flutter pid 23923 |
| VS Code version | Not captured — fill from Help > About |
| Extension version | `saropa_drift_advisor` ext-v4.1.18 (`extension/package.json`) |
| Dart / Flutter SDK | Not captured on host — target is the Saropa Contacts debug build |
| Database | SQLite (Drift-managed `saropa` app DB) via the loopback SQL server |
| Connection method | Advisor loopback HTTP server, `POST /api/sql`, executed on the app's Drift isolate |
| Target project | Saropa Contacts (`d:\src\contacts`) |

---

## Steps to Reproduce

1. Launch the Saropa Contacts debug build with the Advisor loopback server active.
2. From an `/api/sql` client (viewer query console, or an agent using `POST /api/sql {"sql": ...}`), run a query that references a column by a name that does **not** match Drift's snake_case acronym splitting — e.g. `contact_saropa_uuid` (real column is `contact_saropa_u_u_i_d`).
3. Observe the response / app log.

Reproduced three times in one session (`d:\src\contacts\reports\20260704\20260704_144738_contacts.log`), each triggered while browsing a contact:

- 15:07:34 — avatar-coverage probe (`Kirsten, Agnes, Elizabeth, James, Declan`)
- 15:17:42 — email-dedup probe (`Claire Mount`)
- 15:22:15 — contact-detail probe (`Claire Mount`)

---

## Expected Behavior

Because the Advisor already knows every table's real columns (it profiles the schema) and already has `findClosestMatches`, an `/api/sql` query referencing a non-existent column should return a structured error that names the unknown column, its table, and the nearest real column — e.g.:

> `no such column: contact_saropa_uuid` on `contacts` — did you mean `contact_saropa_u_u_i_d`?

The same suggestion the `raw-sql-unknown-column` diagnostic already produces for Dart source.

---

## Actual Behavior

The SQL is forwarded straight to SQLite and the bare driver error is returned / logged, with no column suggestion:

- `no such column: c.saropa_uuid`
- `no such column: e.email_normalized`
- `near "primary": syntax error`

The client has to know the exact Drift-generated name (and SQLite reserved-word rules) with zero assistance from a tool whose entire purpose is schema awareness.

---

## Error Output (full statements + stack, not truncated)

### Failure 1 — 15:07:34 — unknown column `saropa_uuid`

```
SqliteException(1): while preparing statement, no such column: c.saropa_uuid, SQL logic error (code 1)
Causing statement (at position 7):
SELECT c.saropa_uuid AS uuid, c.given_name AS gn, c.family_name AS fn,
       CASE WHEN a.image IS NOT NULL THEN 1 ELSE 0 END AS has_img,
       CASE WHEN a.color_hash IS NOT NULL AND a.color_hash<>'' THEN 1 ELSE 0 END AS has_hash
FROM contacts c
LEFT JOIN contact_avatars a ON a.contact_saropa_uuid=c.saropa_uuid
WHERE c.given_name IN ('Kirsten','Agnes','Elizabeth','James','Declan') LIMIT 20
```

Real schema: both `contacts` and `contact_avatars` name the UUID column
`contact_saropa_u_u_i_d` (the Dart getter `contactSaropaUUID` with an all-caps
acronym expands to one underscore per letter; both tables also declare
`.named('contact_saropa_u_u_i_d')`). Corrected join:
`ON a.contact_saropa_u_u_i_d = c.contact_saropa_u_u_i_d`, and
`SELECT c.contact_saropa_u_u_i_d AS uuid`. All other columns
(`given_name`, `family_name`, `image`, `color_hash`) are correct.

### Failure 2 — 15:17:42 — unknown column `email_normalized`

```
SqliteException(1): while preparing statement, no such column: e.email_normalized, SQL logic error (code 1)
Causing statement (at position 7):
SELECT e.email_normalized AS email, count(*) AS n
FROM contact_email_lookups e
WHERE e.contact_saropa_u_u_i_d IN (
  SELECT contact_saropa_u_u_i_d FROM contacts WHERE given_name='Claire' AND family_name='Mount'
) GROUP BY e.email_normalized
```

Real schema: `contact_email_lookups` has no `email_normalized`; the normalized
column is `email_lower` (Dart getter `emailLower`). Corrected:
`SELECT e.email_lower AS email ... GROUP BY e.email_lower`. Note this query got
`contact_saropa_u_u_i_d` right — only the email column name is wrong. Nearest
match `email_lower` is exactly what `findClosestMatches` would surface.

### Failure 3 — 15:22:15 — reserved word `primary` used as alias

```
SqliteException(1): while preparing statement, near "primary": syntax error, SQL logic error (code 1)
Causing statement (at position 124):
SELECT contact_saropa_u_u_i_d AS uuid, emails_json, phones_json,
       native_phone_contact_id AS nid, primary_contact_u_u_i_d AS primary,
       data_source_name AS src
FROM contacts WHERE given_name='Claire' AND family_name='Mount' LIMIT 3
```

All column names here are correct. The failure is `AS primary` — `primary` is a
SQLite reserved keyword and must be quoted (`AS "primary"`) or renamed
(`AS primary_uuid`). This is a **different failure class** (syntax, not unknown
column) — the column checker will not catch it; see "Proposed Fix" secondary note.

---

## Shared origin (all three)

Identical call chain — every failure enters through the Advisor's loopback SQL API:

```
#17  _runDriftQuery            package:saropa_drift_advisor/src/start_drift_viewer_extension.dart:21:26
#18  ServerContext.timedQuery  package:saropa_drift_advisor/src/server/server_context.dart:457:22
#20  SqlHandler.runSqlResult   package:saropa_drift_advisor/src/server/sql_handler.dart:63:13
#21  SqlHandler.handleRunSql   package:saropa_drift_advisor/src/server/sql_handler.dart:131:20
#22  Router._routeSqlApi       package:saropa_drift_advisor/src/server/router.dart:430:7
#23  Router._dispatch          package:saropa_drift_advisor/src/server/router.dart:220:11
#24  Router.onRequest          package:saropa_drift_advisor/src/server/router.dart:124:7
```

`SqlHandler` validates the request *body* shape (`sql` + `isInternal`) around
`sql_handler.dart:298-299` but performs **no column/schema validation** before
handing the string to the Drift executor — grep for `raw-sql | columnCheck |
findClosest | closestMatch` in `sql_handler.dart` returns nothing.

---

## Emitter Attribution

This is a **runtime SQL execution error surfaced by the SQL API**, not a VS Code
diagnostic — there is no `(owner, code)` pair. The relevant attribution is (a)
where the failing query TEXT comes from, and (b) where the reusable validator
already lives.

**(a) Query text is NOT authored in this repo — it is client-composed and POSTed to `/api/sql`.**

Greps run in `d:\src\saropa_drift_advisor` (both language trees + the webview bundle):

- `grep -rnE "email_normalized|has_img|saropa_uuid AS|contact_email_lookups" lib/` → 0 matches
- `grep -rnE "email_normalized|has_img|saropa_uuid AS|contact_email_lookups" extension/src/ --include=*.ts` (excluding `/test/`) → 0 matches
- `grep -oF` for `given_name`, `has_img`, `has_hash`, `contact_avatars`, `saropa_uuid` in `assets/web/bundle.js` → 0 matches (only `CASE WHEN` ×2, unrelated)
- Sole matches for the query shape are TEST FIXTURES + the plan for the 2026-06-24 checker feature: `extension/src/test/raw-sql-column-checker.test.ts`, `extension/src/test/raw-sql-parser.test.ts`, `plans/history/2026.06/2026.06.24/feature_raw_sql_column_reference_validation.md`

Negative grep in the target app (`d:\src\contacts`): the query text (`has_img`,
`has_hash`, `FROM contacts c`, `given_name AS`, `email_normalized`) exists in **no**
`lib/` source. The Saropa Contacts app never issues these queries; its own avatar
and email code uses the typed Drift API / derives names from
`db.<table>.<col>.name`. **Not a contacts-app defect.**

Conclusion: the queries are composed by an `/api/sql` client (viewer query
console, or a research agent using the loopback endpoint per the documented
`POST /api/sql` workflow). The Advisor is the correct place to *catch* the
mistake, not the origin of the mistake.

**(b) The reusable validator already exists but is not wired to `/api/sql`:**

- `extension/src/diagnostics/checkers/raw-sql-column-checker.ts` — emits
  `raw-sql-unknown-column` for Dart-source raw SQL, using `extractRawSqlColumnRefs`
  (`raw-sql-parser.ts`) + `findClosestMatches` (`terminal/fuzzy-match.ts`) against
  the profiled `TableMetadata`. This is exactly the check missing on the runtime
  SQL path.

---

## Proposed Fix

**Primary (catches Failures 1 & 2):** before executing an `/api/sql` query,
run the referenced column identifiers through the same schema-existence + fuzzy
logic the `raw-sql-unknown-column` checker already uses (`extractRawSqlColumnRefs`
+ `findClosestMatches`). On a miss, return a structured error naming the unknown
column, its table, and the nearest real column — instead of, or alongside, the
bare `SqliteException`. Both the Dart server side (`sql_handler.dart`) and the TS
client that renders errors can consume this; decide which layer owns it (server
returning a richer error object is preferable so every client benefits).

**Secondary (Failure 3):** reserved-word-as-alias is a syntax error the column
checker cannot see. Lower value; options: detect SQLite reserved words used as
bare aliases and suggest quoting, or leave as-is. Note it so a fix agent does not
assume the primary fix covers all three.

---

## Impact

- **Who:** anyone (agent or human) running interactive queries via `/api/sql`
  against a Drift/SQLite app whose columns use acronym-heavy names.
- **What is blocked:** nothing hard-blocks — queries can be hand-corrected — but
  the tool provides zero schema assistance on the one path (interactive SQL)
  where it would be most useful, and identical mistakes recur (3× in one session).
- **Data risk:** none. All three failed at prepare; no rows read or written.
- **Frequency:** every time a client references a mis-cased/typo'd column or a
  reserved-word alias on `/api/sql`.

---

## What Was Already Tried / Established

- Confirmed the three queries originate at `/api/sql` (shared stack above), not
  the target app (negative greps in `d:\src\contacts\lib`).
- Confirmed the real column names against the Contacts Drift schema:
  `contacts.contact_saropa_u_u_i_d`, `contact_avatars.contact_saropa_u_u_i_d`,
  `contact_email_lookups.email_lower`, `contacts.primary_contact_u_u_i_d`.
- Confirmed `sql_handler.dart` validates only the request body, not columns.
- Confirmed the fuzzy column checker exists but runs only on Dart-source raw SQL.

## Regression Info

Not a regression — the interactive-path gap has existed since the `/api/sql`
feature; the source-file checker (2026-06-24) never covered this path.

---

## Resolution (fixed)

Fixed on the **Dart server side** as post-hoc error enrichment — the layer the
report recommended so every `/api/sql` client benefits, and post-hoc so there
are zero false positives (SQLite has already rejected the statement before any
hint is composed).

**New file:** `lib/src/server/sql_error_enricher.dart` — `SqlErrorEnricher.enrich`:
- Parses the unknown column out of `no such column: <alias>.<col>`.
- Resolves the referenced table(s) from the query's `FROM`/`JOIN` clauses
  (alias → table map; clause keywords like `LEFT`/`ON`/`WHERE` are not mistaken
  for aliases).
- Runs `PRAGMA table_info` (via `internalQuery`, so the probes stay out of
  slow-query diagnostics) for the resolved table(s), appends their real column
  names, and — when within a Levenshtein threshold matching the source-file
  checker (`max(3, ceil(len/2))`) — suggests the nearest real column.
- Includes a Dart Levenshtein mirroring the extension's `fuzzy-match.ts` so
  suggestions agree across the source-file and runtime paths.
- Best-effort: any lookup failure is logged via `onError` and the original
  message is returned untouched.

**Wired at:** `lib/src/server/sql_handler.dart` `_handleQueryError` (now async) —
enrichment runs only for `no such column` / `syntax error` messages; the
`no such table/view` quiet-log path is unchanged.

**Covers:**
- Failure 1 (`saropa_uuid` → `contact_saropa_u_u_i_d`): fuzzy distance is too
  large to suggest, but the appended `Columns in "contacts": ...` list shows the
  real acronym-split name, solving the query.
- Failure 2 (`email_normalized` → `email_lower`): within threshold, so it emits
  `did you mean "email_lower"?`.
- Failure 3 (`AS primary`): reserved-word-alias hint tells the client to quote
  or rename it.

**Tests:** `test/sql_error_enricher_test.dart` — 8 cases (all three failures plus
no-resolvable-table, enrichment-failure, non-keyword syntax error, and unrelated
error pass-through). Passing. `test/sql_handler_test.dart` still passes after the
`_handleQueryError` signature change.

**Changelog:** `[Unreleased]` → Added.

---

## Finish Report (2026-07-04)

**Defect.** The interactive SQL endpoint (`POST /api/sql`) forwarded a
client-composed query directly to the Drift executor and returned SQLite's bare
`SqliteException` on failure. A `no such column` reply carried no indication of
the table's real column names or the nearest match, and a reserved word used as
a bare alias (`... AS primary`) surfaced only as `near "primary": syntax error`.
Clients therefore had to already know the exact Drift-generated identifier —
including acronym splitting (`contactSaropaUUID` → `contact_saropa_u_u_i_d`) and
SQLite reserved-word quoting — from a tool whose purpose is schema awareness. The
source-file checker (`raw-sql-column-checker.ts`, 2026-06-24) produced this
guidance for Dart raw SQL but never covered the runtime path.

**Change.** A new server-side module, `lib/src/server/sql_error_enricher.dart`,
enriches the error *after* SQLite rejects the statement, so there are no false
positives. `SqlErrorEnricher.enrich`:

1. Extracts the unknown column from `no such column: <alias>.<col>` (quote- and
   alias-prefix aware).
2. Resolves the referenced table(s) from the query's `FROM`/`JOIN` clauses into
   an alias→table map, rejecting clause keywords (`LEFT`, `ON`, `WHERE`, …) that
   sit where an alias would.
3. Reads each resolved table's real columns via `PRAGMA table_info` through
   `ServerContext.internalQuery` (excluded from slow-query diagnostics), appends
   them to the message, and — within a Levenshtein threshold identical to the
   source-file checker, `max(3, ceil(len/2))` — suggests the nearest column.
4. Detects a SQLite reserved keyword misused as a bare alias and appends a
   quote-or-rename hint.

A Dart Levenshtein (single rolling-row buffer) mirrors the extension's
`fuzzy-match.ts` numerically, so suggestions agree across the source-file and
runtime paths. Enrichment is best-effort: any lookup failure is reported through
the injected `onError` callback and the original message is returned unchanged —
an enrichment fault can never replace a real query error.

The enricher is wired into `SqlHandler._handleQueryError`
(`lib/src/server/sql_handler.dart`), which became `async` and now returns
`Future<Map<String, String>>`; both call sites (`runSqlResult`,
`explainSqlResult`) `await` it. Enrichment runs only for `no such column` /
`syntax error` messages; the pre-existing quiet-log path for
`no such table`/`no such view` is unchanged.

**Verification.** `test/sql_error_enricher_test.dart` covers all three reported
failures plus the safety paths (no resolvable table, enrichment-time throw
routed to `onError`, non-keyword syntax error, unrelated error pass-through) —
8 cases, passing. `test/sql_handler_test.dart` passes unchanged after the
signature change. The fix is server-side only; it enriches the JSON `error`
field every client already renders, and does not add client-side pre-validation
before the POST (the report preferred the server layer).
