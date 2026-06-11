# NL→SQL Unit Test Suite + Converter Fixes

**Trigger (user request, verbatim):** "create extensive and substantial unit tests for the natural language processing sub system. scan my local project for project table ideas: D:\src\contacts\lib\database\drift\drift_database.dart"

Built a permanent, executable test suite for the web viewer's heuristic NL→SQL converter ([assets/web/nl-to-sql.ts](../../../../assets/web/nl-to-sql.ts)), grounded in two fixtures derived from real Saropa data models. Writing the suite surfaced three real converter bugs, all fixed in the same change.

## Finish Report (2026-06-11)

### 1. Critical note
This work will be reviewed by another AI.

### 2. Scope
**(A)** project code — but specifically the **web-viewer TypeScript/JS** subsystem (`assets/web/`), not Flutter UI and not the VS Code extension. New tests run under Node (`node:test`). No Dart `lib/` logic changed.

### 3. Deep review
- **Logic & safety:** the three fixes are localized and defensive. The duplicate-column picker now reads the noun after "duplicate" via the existing `matchColumn` (handles plural via substring containment); the bool-flag guard compares against already-emitted quoted literals (case-folded) so it can't double-filter; the group-column extractor adds `per` to the existing `by` alternation. No new recursion, async, or shared-state.
- **Architecture:** reuses existing helpers (`matchColumn`, `singularize`); no new parallel utilities. Fixes sit inside the existing branch dispatch.
- **Performance:** negligible — one extra regex match per query in two branches.
- **Docs:** every fix carries a WHY comment naming the failure mode. New test files have module doc headers explaining the esbuild+node:sqlite harness and the two fixtures' provenance.
- **Refactoring:** none beyond scope.

### 4. Testing validation
- **4A audit:** grepped `test/` and `assets/web/test/` for `nlToSql`, `duplicate emails`, `per company`, `relationshipWhere`, `valueWhere`. Only the new `assets/web/test/*` files reference converter symbols; the Dart contract test pins bundle.js *text* (function names/ids), not converter output, so the 3 fixes don't touch its assertions. Ran it anyway: `dart test test/web_viewer_nl_modal_contract_test.dart` → **9/9 pass**.
- **4B new tests:** `npm run test:web` (`node --test`) → **114/114 pass**. Categories: table resolution, aggregates, temporal windows, value predicates, ordering/limit, grouping, FK relationship engine, injection/wildcard safety, real-schema (contactsApp) behavior, and a 43-query execute-in-SQLite sweep. Every generated query is executed against in-memory `node:sqlite`, so "the SQL runs" is asserted, not just "the string looks right." Before/after of the 3 fixes is explicit (the tests fail on the pre-fix converter).
- `tsc -p tsconfig.web.json --noEmit` → clean.

### 5. Localization
SKIPPED [A-NOT-IN-SCOPE for Flutter l10n] — no Flutter UI, no ARB. The converter emits SQL (not user copy); the only strings added are dev-only test fixtures and a `test:web` script.

### 6. Project maintenance
- CHANGELOG: not updated — this is a test-infrastructure + internal-correctness change with no user-visible behavior delta (the 3 fixes change generated SQL for niche phrasings, but the NL feature itself shipped earlier; no changelog-worthy user surface changed). README verified — no updates needed. guides reviewed.
- `package.json`: added `test:web` script (no dependency change; esbuild + node:sqlite already available).
- No bug archive — task did not close a `bugs/*.md` file.

### 7. Persist finish report
Finish report saved: `plans/history/2026.06/2026.06.11/nl-sql-unit-test-suite.md` (this file).

### 8. Files changed (commit c20de19)
- `assets/web/test/helpers.mjs` (new) — esbuild bundle loader + `node:sqlite` exec harness.
- `assets/web/test/fixtures.mjs` (new) — `relational` (declared INTEGER FKs) + `contactsApp` (real Saropa shape: UUID links, camelCase) fixtures.
- `assets/web/test/nl-to-sql.test.mjs` (new) — 114 cases.
- `assets/web/nl-to-sql.ts` — 3 fixes (duplicate column, bool-flag value collision, `per X` grouping).
- `assets/web/bundle.js` — rebuilt.
- `package.json` — `test:web` script.

### Core logic diff summary (for reviewer)
1. **Duplicate column:** `const dupWord = q.match(/(?:duplicate|repeated|dupe)d?\s+([a-z0-9_]+)/i); col = (dupWord && matchColumn(dupWord[1], target)) || …` — "duplicate emails" now groups by `email`, not the first name-ish column.
2. **Bool-flag value collision:** before emitting `flag = 0/1`, skip when `conds` already contains `'<flagword>'` as a quoted literal (case-folded) — "status is not active" no longer also emits `active = 0`.
3. **Group column:** `q.match(/\b(?:by|per)\s+([a-z0-9_]+)/i)` — "contacts per company" now groups by `company_id`.

### Outstanding / documented limitations (NOT fixed — captured as explicit tests)
- **No-FK hub fallback:** without declared SQLite foreign keys, the best-guess table heuristic falls back to the largest table by row count. For the real (UUID-linked) Saropa Contacts schema that picks `contact_points`, not `contacts`. The clarifier dropdown lets the user override. (Test: "KNOWN LIMITATION: no-FK hub falls back to row count".)
- **camelCase date columns:** `*At` camelCase columns (favoriteAt, emergencyAt, eventStart) aren't auto-detected as date columns; only names containing created/updated/modified/time/date/`_at` (snake) are. (Test: "KNOWN LIMITATION: camelCase favoriteAt is not auto-detected".)

Both are real weaknesses against the user's actual schema; a follow-up could (a) infer soft relationships from shared `*UUID`/`*_id` column names when no declared FK exists, and (b) treat camelCase `*At`/`*Date`/`*Timestamp` as date columns.
