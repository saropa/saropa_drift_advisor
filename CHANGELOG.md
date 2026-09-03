# Changelog

## Introduction

This changelog is for **Saropa Drift Advisor**: the Dart package that wires up
Drift’s debug server and web viewer, plus the **Drift Viewer** extensions for
[VS Code](https://marketplace.visualstudio.com/items?itemName=Saropa.drift-viewer)
and [Open VSX](https://open-vsx.org/extension/saropa/drift-viewer).

Releases are listed newest first. Each version’s opening paragraph sums up what
changed for users and ends with a **log** link to this file at that release’s
tag on GitHub.

Install the library from
[pub.dev](https://pub.dev/packages/saropa_drift_advisor); report issues and
browse source on
[GitHub](https://github.com/saropa/saropa_drift_advisor).

---

## Links

  **pub.dev** — [pub.dev / packages / saropa_drift_advisor](https://pub.dev/packages/saropa_drift_advisor)

  **VS Code marketplace** - [marketplace.visualstudio.com / items ? itemName=Saropa.drift-viewer](https://marketplace.visualstudio.com/items?itemName=Saropa.drift-viewer)

  **Open VSX Registry** - [open-vsx.org / extension / saropa / drift-viewer](https://open-vsx.org/extension/saropa/drift-viewer)
  
  **Repo** - [github.com / saropa / saropa_drift_advisor](https://github.com/saropa/saropa_drift_advisor)

---

<!-- MAINTENANCE NOTES -- IMPORTANT --

  Format follows Keep a Changelog; versions use SemVer. Omit dates in `## [x.y.z]` headers (pub.dev shows publish dates). Project links and archive location are in the intro below.

  Each release (and [Unreleased]) opens with one plain-language line for humans—user-facing only, casual wording—then end it with:
  `[log](https://github.com/saropa/saropa_drift_advisor/blob/vX.Y.Z/CHANGELOG.md)` substituting X.Y.Z.

  **Audience separation** — User-facing sections (Added, Fixed, Changed, Improved) describe impact, not implementation. Infrastructure, build tooling, code refactoring, publish pipeline, SDK/linter/formatter changes, and internal test additions go inside a collapsed `<details><summary>Maintenance</summary>` block at the bottom of each release. Users skip it; contributors expand it.

  **Banned inside bullets** (move to commit message, PR, or code comment):
  - **PR archaeology** — prior attempts, rename history, "after X didn't hold". Describe the landed state only.
  - **File-by-file inventories** — that is the git diff.
  - **Test counts** — that is CI output.
  - **Code-internal names** — AST classes, regex flags, function signatures, field or type names, private identifiers.
  - **Bug-report, fixture, or test paths** — commit message footer only.
  - **Decision-making narrative** — one clause of reasoning is fine; a paragraph is not.

-->

---

## [4.3.0]

The `ignore` directive for n-plus-one warnings now works even when the diagnostic points at the caller, not the table file. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.3.0/CHANGELOG.md)

### Changed

- **Minimum VS Code version raised to 1.134 (August 2026).** Users on older VS Code versions will need to update.
- **Consolidated docs into a single `doc/` folder.** Moved `DESIGN_LANGUAGE.md`, `IDE_ONLY_CAPABILITIES.md`, and `LAUNCH_TEST.md` from `plans/guides/` into `doc/`. Merged `LOG_CAPTURE_FILE_CONTRACT.md` into `EXTENSION_API.md` as a "File-based access" section.
- **All `doc/*.md` files now listed in the README Documentation table.** Added `EXTENSION_API.md`, `DESIGN_LANGUAGE.md`, `IDE_ONLY_CAPABILITIES.md`, and `LAUNCH_TEST.md`. A parity check script (`scripts/check_doc_readme_parity.py`) catches future drift.

### Fixed

- **Table pagination now actually pages.** The Tables view built its request with malformed page-size and offset parameters, so the server ignored both and returned the same first 200 rows no matter which page you asked for — while the pagination bar still reported "Showing 201–400 of N". Changing the rows-per-page was equally inert. Both the Tables view and Search now build the request through one shared helper, so the two cannot drift apart again.

- **Toolbar icons stay readable when Google Fonts is unreachable.** The viewer inlines its stylesheet and script so it works with no network, but every icon was a ligature drawn from a font that only existed on Google's CDN. Offline — an air-gapped machine, a phone-hosted server over `adb forward`, or a proxy that blocks Google — the font never arrived and the browser painted the raw ligature names, so the toolbar became a row of clipped words like `home` and `table_chart`. The viewer now detects that the icon font failed to load and falls back to the short text label each button already carries, and the font request no longer flashes ligature names while it is still in flight.

- **Tab close buttons and table pin buttons are no longer nested inside another control.** Each tab placed its `×` button inside the tab button itself, and each sidebar row placed its pin button inside the row link. Screen readers responded inconsistently — announcing a tab as "users ×", reading two nested buttons, or dropping the inner one entirely — and Firefox and Chromium disagreed on whether the inner button could be focused at all. Both are now siblings of the control they sit on, so the accessible name and keyboard order are correct and identical across browsers. The layout is unchanged.

- **"Confirm before navigating away" now does something.** The Settings toggle stored and re-displayed its state but nothing ever read it: the prompt appeared whenever a cell edit was unsaved and never otherwise, regardless of the setting. Turning it off now genuinely suppresses the prompt, and the setting is read at the moment you navigate away, so changing it takes effect immediately rather than after a reload.

- **Example chips in the "Ask in English" panel use the correct monospace face.** They asked for a design-system token that does not exist and silently fell back to the browser's generic monospace, so they did not match the SQL preview beside them. Also removed three other references to a font the viewer never loads.

- **Cross-origin web pages could no longer silently trigger writes on the debug server.** Only `POST /api/sql` checked the request's `Content-Type` header; every other mutating endpoint (`/api/import`, `/api/cell/update`, `/api/edits/apply`, `/api/indexes/apply`, `/api/snapshot`, `/api/session/share`, `/api/monitoring`, `/api/change-detection`, `/api/activity/capture`) decoded the body as JSON regardless of its declared type. Because `text/plain` is a CORS-safelisted content type, a cross-origin HTML `<form enctype="text/plain">` could be crafted to submit a body that happened to be valid JSON and reach these endpoints with no browser preflight and no user interaction. Each of these endpoints now rejects a request whose Content-Type is not `application/json` with `415 Unsupported Media Type`, which forces the browser to issue a real CORS preflight for the request — one the server has no route for, so the cross-origin request is blocked outright.

- **SQL-format import no longer executes arbitrary DDL/PRAGMA against the connected database.** `POST /api/import` with `format: "sql"` passed every statement straight to `writeQuery` with no validation — `DROP TABLE`, `ATTACH DATABASE`, `PRAGMA journal_mode`, and cross-table DML all executed silently. Every other write path in the server gates statements through `SqlValidator`; this one was the outlier. Each statement is now validated with `isSingleDataMutationSql` before execution; anything that fails (DDL, multi-statement, non-DML) is collected into the error list and skipped.

- **Web viewer `esc()` now escapes quotes, closing an XSS vector in every attribute-context call site.** The HTML escaper used by ~325 call sites across the web viewer escaped `&`, `<`, `>` but not `"` or `'` — the `textContent` → `innerHTML` DOM round-trip never escapes quotes in text nodes. A database cell value containing `"` broke out of `data-raw="..."` / `title="..."` attributes, and the remainder was parsed as new attributes — including event handlers. The escaper now uses explicit string replacement for all five HTML-significant characters, matching the extension's canonical `escapeHtml` in `shared-utils.ts`.

- **Generated `ADD COLUMN` migrations no longer corrupt existing rows in non-TEXT columns.** The `Generate Migration` quick fix always backfilled a new non-nullable column with `NOT NULL DEFAULT ''`. SQLite's type affinity does not coerce that empty *string* into a number: an INTEGER, REAL, or BLOB column ended up storing TEXT in every pre-existing row, and Drift threw a cast error the first time the table was read — after the migration had already "succeeded." The generator now picks a default matching the column's own type (`0` for INTEGER/BOOLEAN, `0.0` for REAL, `x''` for BLOB, `''` for TEXT), adds a `// TODO` reminder that the value is only a sentinel, and falls back to no default plus a `// TODO` for any unrecognized type rather than guessing.

- **Snapshots and mutation capture no longer OOM-crash the connected app on tables with BLOB columns.** `POST /api/snapshot`, snapshot compare, and the `/api/mutations` before/after row capture all read tables with an unbounded `SELECT *` — every BLOB byte of every row was pulled into memory and JSON-encoded as an integer array. On a table with image/attachment BLOBs this could exhaust the app's native heap and abort the process (`SIGABRT`), the same failure mode the VS Code extension fixed for its own capture sweeps in v4.1.17. The Dart server now projects BLOB columns as their byte length (`length(col)`) instead of their bytes, and caps captured rows at the same limit already used for ad-hoc SQL results.

- **Adding a row to a table with a TEXT, UUID, or composite primary key no longer drops the key.** The "add row" validation assumed every primary key was an auto-generated `INTEGER` id and stripped it from the INSERT unconditionally, so a user-typed TEXT/UUID key (or either half of a composite key) was silently discarded and the row was written with a NULL key that could never be edited or deleted afterward. Only a lone `INTEGER PRIMARY KEY` column (SQLite's rowid alias) is still auto-omitted when left blank; every other primary key column is now included in the INSERT when supplied, or the insert is rejected with a message asking for the missing key.

- **Generation long-poll no longer aborts on an idle database.** The `/api/generation` endpoint blocks server-side for up to 30 s, but the client was using the default 8 s fetch timeout — every idle poll was aborted, triggering exponential backoff and eventually tripping the circuit breaker. Now uses the same 31 s long-poll timeout as `/api/mutations`, extracted into a shared `LONG_POLL_TIMEOUT_MS` constant so the two endpoints cannot drift apart.

- **`drift-advisor:ignore` directives now work when diagnostics are pinned to caller sites.** Previously, `n-plus-one` and `slow-query-pattern` ignore directives in a table definition file were only consulted when the diagnostic was anchored to that same file; when a caller location was available (the common case), the suppression was silently skipped. Both file-level (`ignore-file`) and field-level (`ignore`) directives in the table file are now honoured regardless of where the diagnostic is pinned.

- **Tables declared with a `with <Mixin>` or `implements <Interface>` clause are no longer invisible to every diagnostic.** The Dart source parser's table-class detector required the opening `{` to follow `Table` immediately, so Drift's documented pattern for sharing columns via a mixin (`class Contacts extends Table with TimestampMixin {`) was never recognized. Affected tables produced zero schema/naming/primary-key diagnostics, were skipped by migration generation and schema diff, and were additionally reported as a false-positive `extra-table-in-db` because the parser had no record that the table existed in Dart. The class-header pattern now allows optional `with`/`implements` clauses (including formatter-wrapped line breaks) between `Table` and `{`.

- **Generated `CREATE TABLE` migrations no longer drop a table's primary key when it comes from a `primaryKey` getter override.** `Generate Migration` derived a column's primary-key status solely from `.autoIncrement()`, so a natural or composite key declared via `@override Set<Column> get primaryKey => {...}` (the standard Drift idiom for join tables and UUID-keyed tables) was invisible to it — the generated table had no `PRIMARY KEY` clause at all, so duplicate rows became insertable. The Dart parser now reads this override and the migration generator emits a table-level `PRIMARY KEY (...)` constraint for it, or a `// TODO` review comment (never a silent guess) when one of its columns can't be resolved.

- **"Create all indexes" in the VS Code extension can now actually create indexes.** The command posted `CREATE INDEX` statements to the read-only SQL endpoint, which rejects all non-`SELECT` SQL — every index failed silently, reporting "Created 0 index(es), N failed" with no reason. It now uses the same preview/apply endpoints the browser viewer already relies on, shows accepted vs. rejected statements with the server's reason before anything is written, and reports a before/after `EXPLAIN QUERY PLAN` comparison per created index in a new "Saropa Drift Advisor: Index Apply" output channel.

- **Editing a 64-bit INTEGER cell (a snowflake/Discord ID, an `Int64Column`, or a microsecond timestamp) no longer silently corrupts the stored value.** Inline cell edits and new-row inserts converted INTEGER text through a JavaScript `number`, which only carries 53 bits of exact integer precision; a value above `2^53` (e.g. `9007199254740993`) was rounded to the nearest representable double and written to the database with no warning. Values above `Number.MAX_SAFE_INTEGER` are now kept as an exact digit string and written into the generated SQL unquoted, so the 64-bit value round-trips exactly; a one-time informational message tells you when this path was used.

<details><summary>Maintenance</summary>

- **CSRF gate coverage script now detects regex drift.** The pre-commit check that enforces `_rejectNonJsonBody` on every POST route could silently pass if the router was refactored to check the method differently (variable alias, string literal, route table). A secondary detector now flags any POST-related pattern the primary regex does not recognise, failing the build instead of silently skipping the route.

- **Icon font fallback verdict now persists across page loads.** The inline `<head>` script that was supposed to skip the 3-second blank-glyph period on repeat visits to a known-iconless machine was reading a localStorage key that nothing ever wrote. The probe's `apply()` function now persists each verdict (`'1'` or `'0'`), a matching `ICON_STATE_KEY` constant is the single source of truth for the key name, a parity test asserts the Dart-side inline script reads the same literal, and the pre-commit gate (Gate 7) verifies the key match plus the write-side call in both source and built bundle.

- **SQL import validator now accepts SQLite conflict-clause and UPSERT syntax.** `REPLACE INTO`, `INSERT OR REPLACE INTO`, `INSERT OR IGNORE INTO`, `UPDATE OR {clause}`, `INSERT ... ON CONFLICT DO UPDATE` (native UPSERT), and `INSERT ... ON CONFLICT DO NOTHING` were wrongly rejected as non-DML by the same validator that gates `POST /api/import` and batch edits. Also fixed: `UPDATE` with a quoted table name (e.g. `UPDATE "Users" SET ...`) was rejected because the regex demanded a word-boundary after the verb, which fails when the tokenizer masks quoted identifiers to a non-word placeholder. The `REPLACE()` string function inside INSERT/UPDATE/DELETE values or WHERE clauses no longer triggers a false-positive rejection. Rejection error messages now truncate long SQL to 120 characters to avoid leaking schema in HTTP responses.

- **Cross-language long-poll timeout guard.** Added bidirectional doc comments linking `ServerConstants.longPollTimeout` (Dart) and `LONG_POLL_TIMEOUT_MS` (TypeScript) so a future change to one side surfaces the need to update the other. New `scripts/check_longpoll_timeout_sync.py` parses both constants and asserts the client timeout exceeds the server timeout by at least 1 s — a build-time enforcement of the cross-language contract. Test asserts the TypeScript constant exceeds the server's 30 s window.

- **CSRF gate coverage enforced in pre-commit hook.** New `scripts/check_csrf_gate_coverage.py` scans every POST route in `router.dart` and asserts it calls `_rejectNonJsonBody()` or carries a `// csrf-exempt:` comment. Wired into the Husky pre-commit hook so an ungated endpoint fails the commit. Routes that legitimately skip the gate (bodyless toggles, handlers with internal Content-Type validation) are annotated inline — no line-number bookkeeping.

- **Cross-language pagination parameter sync guard.** New `scripts/check_query_param_sync.py` parses the `limit`/`offset` query parameter names from both `ServerConstants` (Dart) and `buildTableDataUrl` (TypeScript) and asserts they match — preventing a repeat of the bug where the two sides used different parameter names and the server silently ignored pagination.

- **Web build freshness gate.** New `scripts/check_web_build_freshness.py` computes SHA-256 hashes of every `.ts`/`.js`/`.scss` source and both generated artifacts (`bundle.js`, `style.css`), then compares against a committed manifest. Detects uncommitted build drift — a source edit without a corresponding `npm run build` — before the commit lands. Wired into pre-commit as Gate 5.

- **Design-token and l10n placeholder parity gate.** New `scripts/check_reference_parity.py` runs two checks: (1) every `var(--token)` in SCSS resolves to a real `--token:` declaration or an allowlisted gap, and (2) every `{n}` placeholder in English l10n catalogs appears in every locale's translation. Uses a shrink-only baseline (`scripts/l10n_placeholder_baseline.json`) for the 330 known-bad placeholder pairs documented in bug 085, so new damage fails the gate while existing debt is tracked. Wired into pre-commit as Gate 6.

- **Accessibility regression tests for tab close and table pin buttons.** New `assets/web/test/a11y-tab-close-pin.test.mjs` (15 tests) covers tab close button `role`/`aria-label`, tab button `aria-selected`, pin button `role`/`aria-pressed`/accessible name, pin icon `aria-hidden`, sibling structure (pin not nested inside table link), and the accepted `aria-required-children` violation in the tablist (documented as explicit test suppression).

- **Bug 085 repair roadmap.** Full parity analysis revised the damage count from 108 sentinel-grep hits to 330 broken strings across all ten locales (not seven). Categorized into three repair phases: 86 sentinel-residue strings (regex-fixable), 232 placeholder-dropped strings (human review), and 12 hallucinated strings (re-translation). Per-locale breakdown and regex pattern documented in the bug report.

- **L10n parity gate hardened.** The English-catalog parser now accepts both single- and double-quoted TypeScript string literals. MT-residue regex anchored with word boundaries to eliminate false positives on ordinary words. `--strict` flag added to fail the gate on baseline entries too (for CI enforcement of baseline shrinkage). Runtime-set token scan extended to `.js` files.

- **Guarded all remaining unprotected `localStorage` access.** Seven call sites across `theme.ts`, `session.ts`, `persistence.ts`, `settings.ts`, and `toolbar.ts` read or wrote `localStorage` without a try/catch, which throws in private-mode or restricted webview contexts. All sites now catch and degrade silently — the UI still functions, it just loses persistence for that session.

- **`--budget N` flag for the l10n parity gate.** `check_reference_parity.py --budget N` fails the gate only when baseline entries exceed N, enabling "fix N entries per sprint" CI enforcement without the all-or-nothing of `--strict`. Guarded against conflicting flag combos (`--budget` + `--strict`, `--budget` + `--no-baseline`).

- **Annotate endpoint now rejects invalid JSON with 400.** `POST /api/session/{id}/annotate` previously fell back to an empty map when the request body could not be parsed as JSON, silently creating an annotation with no text or author. It now returns 400 with a structured error using `ServerConstants.jsonKeyError`.

- **Issue reporting guide.** Replaced `bugs/BUG_REPORT_GUIDE.md` with a broader `ISSUE_REPORT_GUIDE.md` covering bugs, feature requests, and proposals — aligned with `saropa_lints`' structure. Added file naming conventions, attribution evidence requirements, investigation checklist, common pitfalls, fix requirements, lifecycle diagrams, and severity guide. Updated GitHub issue templates (`bug_report.yml`, `feature_request.yml`) with severity dropdown, emitter attribution field, and detection/behavior section, and added `.github/ISSUE_TEMPLATE/config.yml` to route all new issues through the structured templates (`blank_issues_enabled: false`).

- **Archived 7 fixed bugs.** Moved closed bug files (012, 013, 036, 037, 063, 075, 076) from `bugs/` to `plans/history/2026.09/20260903/` per the project archival convention. Repointed cross-references in bugs 065 and 073.

- **Dangling bug-reference gate.** New `scripts/check_bug_ref_dangling.py` scans staged files for `bugs/<file>.md` paths where the target no longer exists in `bugs/` — catches stale references left behind after archiving. Wired into pre-commit as Gate 8. Files inside `plans/history/` are excluded (historical context, not live references).

- **Publish pipeline: retry/skip/abort on Dart analysis, downgrade, outdated, docs, and dry-run steps.** These five steps previously hard-aborted the entire pipeline on failure. They now offer the same retry/skip/abort prompt the test and lint steps already have, so a transient or externally-caused failure (e.g. upstream plugin emitting unsupported-option warnings) no longer forces a full pipeline restart.

- **Fixed 2 stale server-origin storage tests.** `clearStaleProjectStorage` was refactored to use `safeSetItem`/`safeGetItem` wrappers (from `storage.ts`) instead of raw `localStorage` calls with inline try/catch, but the tests still asserted the old pattern. Updated to verify the safe-wrapper delegation.

</details>

---

## [4.2.5]

Error messages now tell you whether the problem was your SQL or a bug in the server itself. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.2.5/CHANGELOG.md)

### Added

- **Error classification for the `onError` callback.** New `DriftDebugErrorKind` enum (`userQuery`, `server`) and `DriftDebugOnClassifiedError` callback let host apps distinguish expected user-input errors (bad SQL, unknown column) from genuine server bugs (bind failure, snapshot corruption). Pass `onClassifiedError:` to `startDriftViewer` or `DriftDebugServer.start`; when set, it fires instead of `onError` with the error kind attached. `DriftDebugErrorLogger.classifiedErrorCallback()` provides a ready-made implementation that logs user-query errors at info level and server errors at SEVERE. Existing `onError` callers are unchanged.

<details><summary>Maintenance</summary>

- **Localization translate-gaps pass no longer cycles without progress.** Forced-identity keys (brands, acronyms, symbol-only strings) that were missing from locale bundles were never written because the translate action skipped them, so `missing=25` persisted across runs. They are now written with their English value during the translate pass. Added `NULL`, `PNG`, `SVG` to the acronym list; enhanced the no-translatable-content detector to strip known acronyms (word-boundary-aware) before checking for ASCII letters (resolves strings like `✓ FK {0} → {1}`); added per-locale verified cognates (`Schema` in Italian, `Status`/`Total`/`Regex` in Portuguese, `ms` in Korean). The `is_verified_identical` check now strips placeholders before matching, so a single cognate entry (e.g., `Total`) covers all placeholder variants (e.g., `Total: {0}`).
- **Auto-cognate detector.** After a translate pass, any key where MT returned the English text unchanged is written to a `*_cognate_candidates.json` report. Confirmed entries can be added to `VERIFIED_IDENTICAL` in `brands.py` to prevent future cycling.
- **Hardened `doc/API.md` version sync.** `sync_api_md_version` now replaces only the *current* header version (old→new), not any semver-shaped text. The `@vX.Y.Z` pattern is anchored to `cdn.jsdelivr.net` URLs. Dry-run mode added (`dry_run=True` returns a change report without writing). 20-test Python suite (`test_target_config_api_md.py`) covers replacement, preservation of example payloads/IPs/prose semver, round-trip, dry-run, and `ensure_api_md_version_sync` guard rails.

</details>

---

## [4.2.4]

Exported reports no longer count the schema browser's own lookups as app queries, and each export now records which extension and server version produced it. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.2.4/CHANGELOG.md)

### Fixed

- **Performance analytics no longer counts schema-browser introspection as application queries.** Opening the schema browser issues one `PRAGMA table_info` per table; these were filling the "recent queries" list (and could evict real app queries from the timing buffer), so an exported report showed the advisor measuring itself instead of the app. PRAGMA statements are now excluded from query totals, slow queries, patterns, and the recent-queries list. See `plans/history/2026.07/2026.07.24/BUG_EXPORT_PERF_SECTION_FALSE_POSITIVES.md`.

- **Anomaly outlier checks can be silenced on static/seed tables.** `startDriftViewer` (and `DriftDebugServer.start`) accept a new `staticTables:` list; the max-vs-mean outlier scan is skipped for those tables, since an outlier in immutable seed data can never indicate a defect. Other checks (missing values, orphaned references) still run on them. When an outlier is found on a table you have *not* marked static, the finding now carries a one-line hint naming the table and the exact `staticTables:` snippet, so the fix is discoverable from the finding itself. The hint also **auto-suggests which tables are the likely static candidates** — outlier tables with no writes or data changes observed during the session — and flags the ones that did change as probably not static, so you can copy the snippet with more confidence.

### Added

- **App query timings now reach the performance report.** New `DriftDebugServer.reportAppQuery(...)` lets your app forward its own Drift query timings to the advisor, so `performance.totalQueries`, slow queries, and the exported report finally reflect real application traffic instead of only advisor-issued queries (which is why exports previously showed `totalQueries: 0`). Wire it with a Drift `QueryInterceptor` — a complete, tested one ships in the example (`example/lib/database/advisor_timing_interceptor.dart`), installed with `executor.interceptWith(...)`. Full integration guide: [doc/APP_QUERY_TIMING.md](doc/APP_QUERY_TIMING.md). Reported queries are tagged `source: "app"`, and writes feed the static-table candidate ranking so those suggestions become reliable. When no app query has been captured, the performance report carries a one-line `hint` telling you to install the interceptor — so the fix is discoverable right where the empty stats show up.
- **Exported reports are now version-stamped.** The `.drift-advisor.json` sidecar carries a `versions` block with the extension version and the connected server version, so a report can be tied to the release that produced it.
- **`GET /api/docs` serves the full API reference as Markdown.** A non-UI client (AI coding agent, CLI script) can now read the REST contract from the running server without internet access or a GitHub checkout. Served from the package root on disk; available even while the monitoring kill switch is engaged.

<details><summary>Maintenance</summary>

- `HealthResponse` type gains an optional `version` field (already emitted by `/api/health`). `DriftAdvisorSidecar` gains an optional `versions` block. Regression test added in `test/performance_handler_test.dart` for PRAGMA exclusion.
- `staticTables` threaded through `start()`/`_startInternal`/stub/`startDriftViewer` → `ServerContext.staticTables` → `AnomalyDetector.getAnomaliesResult` (auto-derives `potential_outlier` suppressions) and the two `analytics_handler` call sites. New `outlier_check_hint` anomaly type (additive to the issues envelope). Regression tests in `test/anomaly_detector_test.dart`.
- Parallelized independent sequential awaits in `analytics_handler` (PRAGMA queries, per-table stats), `compare_handler` (schema/table queries, column maps), and `report_handler` (table info/rows/count) — uses typed record `.wait` to avoid unsafe `as` casts. Converted manual index loops to `asMap().entries` in `edits_batch_handler`, `index_batch_handler`, and `sql_validator`. Extracted `_dispatchRoutes` helper in `Router` — route dispatch is now a documented single-point closure loop, preventing new routes from being added outside the dispatch chain. Added long-poll delay comment in `generation_handler`. Suppressed false-positive lint warnings with inline rationale where sequential execution is intentional (shutdown ordering, guard-then-query, in-place mutation). Fixed `example/pubspec.yaml` formatting and dependency ordering.
- Feature 61 hardening: the introspection filter now matches `sqlite_master`/`sqlite_schema` only as a `FROM`/`JOIN` target (a literal mention in an app query still counts); the no-app-queries hint leads with `reportAppQuery` so it fits callback-API users, not only interceptor users; `reportAppQuery` documents its same-isolate requirement; the example `AdvisorTimingInterceptor` gained `runCustom`/`runBatched` overrides and is installed only in `kDebugMode` (zero release overhead). `DriftDebugServer.reportAppQuery` gained an end-to-end test; new tests for the literal-`sqlite_master` case and the interceptor's custom/batched paths.
- `doc/API.md` updated to version 4.2.4: added 16 previously undocumented endpoint sections (views, declared schema, relationships, report, snapshots list/delete/rename, cell update, index preview/apply, soft relationships, query history, DVR, mutations, `/api/docs`); added HTTP 403 status code; expanded query parameter reference table. DVR 404 response now documents the extra `error`/`message` sibling keys alongside the envelope.
- `GET /api/docs` endpoint: new route in `_routePreQuery` (pre-gate, no DB dependency) serving `doc/API.md` via the existing `_sendWebAsset` file-serving pipeline. Path constants `pathApiDocs`/`pathApiDocsAlt` added; endpoint listed in `healthEndpoints` and `apiIndexEndpoints`.
- `test/version_sync_test.dart` gains a test that asserts `doc/API.md`'s `**API version:**` header matches `ServerConstants.packageVersion`, preventing the version string from drifting on future releases.
- Publish pipeline now auto-syncs `doc/API.md` version strings from pubspec. `ensure_api_md_version_sync` runs pre- and post-bump (mirroring the server-constants sync) and `write_version(DART, ...)` calls `sync_api_md_version` so `--bump` flows also update the doc. Exit-code mapping added for the new `API doc version` step.

</details>

---

## [4.2.3]

New schema diagnostics warn about missing schema snapshots and catch version mismatches before they cause silent black screens. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.2.3/CHANGELOG.md)

### Added

- **`no-schema-snapshots` diagnostic (Warning).** Warns when a Drift project has no `drift_schemas/` or `test/generated_migrations/` directory — prompts developers to run `dart run drift_dev schema dump` and set up `SchemaVerifier` for migration path testing.
- **`schema-version-mismatch` diagnostic (Error).** Reports when the database's `PRAGMA user_version` differs from the Dart-declared `schemaVersion`, indicating a migration that failed or was skipped — the exact scenario that causes silent black screens on older installs.
- **`declaredSchemaVersion` threading.** The Dart server now derives the host database's declared `schemaVersion` via duck typing and exposes it alongside `dbSchemaVersion` (from `PRAGMA user_version`) in the `/api/schema/metadata` response and VM Service bridge.
- **`AnomalySuppression.copyWith`.** Returns a copy with selectively replaced fields. Nullable fields (`column`, `type`) use a factory-function parameter to distinguish "not specified" from "explicitly set to null".

- **"Validate Migration Paths" command.** Scans `drift_schemas/` for version snapshot files, reports any gaps between the lowest and highest version number (e.g. v1 and v3 present but v2 missing), so developers know which `drift_dev schema dump` runs are needed before SchemaVerifier can cover every upgrade path.

### Fixed

- **`no-schema-snapshots` now uses monorepo-safe glob patterns.** `findFiles` calls use `**/drift_schemas/**` and `**/test/generated_migrations/**` instead of root-anchored globs, so schema snapshot directories inside sub-packages are correctly detected.
- **Lint compliance for `_deriveDeclaredSchemaVersion` ignore directive.** Added rationale comments satisfying both `document_analyzer_ignore_rationale` and `prefer_commenting_analyzer_ignores` rules.
- **SchemaVerifier codegen input hardening.** Import path prompt now rejects a `package:` prefix (the template prepends it automatically), preventing a double-prefix in the generated import. Info message clarifies that the file must be saved under `test/` for the relative `generated_migrations` import to resolve.

<details><summary>Maintenance</summary>

- **Simplified `AnomalySuppression.matches` guard.** Replaced trailing if-return-false / return-true with a single boolean return to satisfy `avoid_unnecessary_if` lint. Added explicit `String?` cast on the `anomaly['type']` lookup for type-safe comparison, matching the existing pattern for `table` and `column`.
- **"Generate SchemaVerifier Test" code action.** The `no-schema-snapshots` diagnostic now offers a quick fix that scaffolds a Drift `SchemaVerifier` test file — prompts for the import path, then opens an editor with the generated test code.
- **Test mock isolation.** `afterEach` in schema-provider and best-practice-provider tests now resets `workspace.workspaceFolders` to prevent state leaking between test files.
- **Dart-side `getDbSchemaVersion` and `declaredSchemaVersion` test coverage.** New `test/schema_version_test.dart` covers PRAGMA user_version parsing (int, non-int, empty, error), `declaredSchemaVersion` threading through `ServerContext`, and `normalizeRows` key-casing behavior.
- **`createTestContext` accepts `queryRecorder`.** Tests that construct a `Router` can now supply a `QueryRecorder` without building a full server.
- **Web stub parity.** Added `declaredSchemaVersion` parameter to `DriftDebugServer.start` stub so web builds compile.
- **Publish pipeline: retry prompts on failures.** Remote sync, dependency, and Dependabot PR steps now ask retry/ignore/cancel instead of aborting immediately.

</details>

---

## [4.2.2]

Servers can now suppress specific anomalies before they hit the response, and outlier detection stops crying wolf on size, duration, and measurement columns. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.2.2/CHANGELOG.md)

### Added

- **Server-side anomaly suppression.** `AnomalyDetector.getAnomaliesResult` accepts a `suppressions` parameter — a list of `AnomalySuppression` rules that filter anomalies by table, column, and/or type before they reach the JSON response or server logs. This is the server-side equivalent of the extension's `// drift-advisor:ignore` inline directives: callers collect suppressions from any source (parsed Dart comments, host configuration, user settings) and pass them to the detector. Wildcard table (`*`) and null column/type (match all) are supported.

### Improved

- **Publish pipeline offers to merge Dependabot PRs inline.** The Dependabot gate now lists open PRs and prompts to squash-merge them via `gh pr merge` without leaving the terminal. On success it pulls the merged commits into the local branch automatically. Declining the merge falls back to the previous continue-anyway prompt.

### Fixed

- **Outlier false positives on dimensional and physical measurement columns.** The anomaly detector now skips columns whose names indicate byte sizes, pixel dimensions, durations, counts, bandwidth, throughput, and latency (`byte_size`, `width`, `height`, `file_size`, `content_length`, `pixel_*`, `num_*`, `*_count`, `duration`, `area`, `volume`, `depth`, `bandwidth`, `throughput`, `latency`), and physical measurements (`weight_*`, `mass`, `distance`, `speed`, `velocity`, `temperature`, `pressure`, `capacity`). Previously these triggered spurious INFO-level `potential_outlier` findings because their naturally wide or bimodal distributions are not Gaussian.
- **Bare `count` column no longer suppressed.** Removed the over-broad `^count$` match from the dimension skip pattern — a column named exactly `count` is ambiguous and could be a meaningful metric. Suffixed forms like `item_count` and prefixed forms like `num_items` remain skipped.

## [4.2.1]

A new Heartbeat screen shows your database's pulse live — tables glow as they are read and written — and other Saropa Suite tools can now pull a small daily digest from Drift Advisor for a consolidated Suite report. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.2.1/CHANGELOG.md)

### Added

- **Heartbeat / Watch screen (Feature 80, phase 1).** A live activity board in the web viewer (and the VS Code webview, which shares the same UI): every table with recorded activity appears as a card whose border glows on access — cool for reads, warm for writes — with per-table read/write counters, and the glow decays in under two seconds so rapid traffic burns brighter. An ECG-style monitor strip across the top aggregates all activity into a scrolling heart-rate trace with a live events-per-minute vital; idle databases show a calm flatline sweep. Untouched tables are never listed. Host-app writes are detected indirectly from row-count changes and labeled "Detected changes" (UPDATE-in-place is invisible in phase 1); the app's own reads are not visible — see `plans/history/2026.07/2026.07.16/80-heartbeat-phase2-host-capture.md` for the phase 2 capture design. Backed by a new in-memory `TableActivityTracker` and `GET /api/activity` endpoint (documented in `doc/API.md`): aggregates plus a bounded 200-event ring, internal/self-issued queries excluded so the board never glows from watching itself, and fully disabled under the monitoring kill switch.
- **Heartbeat screen: per-table sparklines and idle-friendly polling.** Every table card now carries its own miniature 30-second activity trace in the same monitor style as the main ECG strip (warm-tinted when the interval contains writes; static bars under reduced-motion). Polling adapts to traffic: ~750 ms while events arrive, decaying stepwise to a 2.5 s ceiling after eight quiet polls and snapping back instantly on activity — an idle screen no longer issues 80 requests a minute against a battery-powered debug target. Theme switches recolor the monitor and sparklines on the next frame. Table attribution is now CTE-aware: a `WITH` alias is never mistaken for a table, real tables inside CTE bodies still register, and schema-qualified names like `main.items` attribute the table instead of the schema.
- **Heartbeat screen: capture the app's own live traffic (Feature 80, phase 2).** Wire one line in the host app — `DriftDebugServer.reportActivity(sql)` from drift's `logStatements` or a `QueryInterceptor` — and a new "Capture live app traffic" toggle on the Heartbeat screen lights the board with the app's OWN reads and writes, not just advisor traffic and detected row-count changes. Safety is structural: capture always starts off, only the heartbeat screen can arm it, and arming grants a ~5-second lease that the screen's own polling renews — so a closed tab, dropped adb forward, or crashed webview can never leave the per-query hook hot (the screen also disarms on tab switch, hidden visibility, and page unload). While off, the hook costs the host one boolean check per query; a pulsing "Capturing" badge makes the armed state unmissable, and disabling server monitoring force-disarms it. New `POST /api/activity/capture` endpoint and a `captureArmed` field on `GET /api/activity`, both documented in `doc/API.md`.
- **Heartbeat screen: statement tap — a live query inspector on every card.** A new receipt icon on each table card opens a flyout listing the last 10 statements the app ran against that table (newest first, read/write channel dot, relative age), fed by a new `GET /api/activity/statements?table=X` endpoint over bounded per-table rings the server fills while capture is armed. The flyout explains itself when empty: with capture off it says to turn on "Capture live app traffic" rather than showing a bare nothing. Capture hardening in the same change: leading SQL comments (`-- tag`, `/* trace */`) no longer defeat statement classification; a ~200/second cap drops burst overflow before any parsing so an armed capture can never soak the host app's CPU; the screen holds its steady 750 ms poll while capture is armed (an armed capture is active observation, never "idle") instead of decaying toward the lease's edge; and `reportActivity`'s docs now state the raw-SQL and same-isolate requirements explicitly.
- **Saropa Suite daily-summary API.** The extension's exports now implement the cross-tool Suite contract (`apiVersion: 1`, `getDailySummary(date)`) alongside the existing Log Capture snapshot. A sibling extension calls `getExtension('saropa.drift-viewer')?.exports.getDailySummary('YYYY-MM-DD')` and gets a one-sentence headline, named counts (queries, slow queries, anomalies, index suggestions), a failure-only Trouble list with deep-links, and an open-command — or `undefined` when no database is connected. It is a thin read-only projection of already-computed session data, built lazily on call so activation is unaffected; per-day history is not retained, so apiVersion 1 returns the live session view stamped with the requested date. Documented in `doc/EXTENSION_API.md` (`plans/history/2026.07/2026.07.16/PLAN_suite_daily_summary_api.md`).
- **Ignore a Drift Advisor finding from a right-click, not just the lightbulb.** The Problems panel's row context menu is a fixed VS Code menu extensions cannot add to, so double-clicking a finding there only moved the cursor near it without exposing a way to suppress it. Right-clicking anywhere within 3 lines of a finding in the editor now shows "Ignore Finding for This Column" / "Ignore Finding in This File" (also in the Command Palette), which resolve the intended finding from the cursor's line — falling back to the nearest finding within that same window, and prompting to choose when several tie for closest (same line or not) — before inserting the same `// drift-advisor:ignore` directive the lightbulb quick fix writes. A finding with no diagnostic code is refused rather than silently written as a suppress-everything directive.

### Fixed

- **Dashboard and Watch panels no longer lose their first data update after opening.** A race between the extension pushing data and the webview registering its listener silently dropped the first message; panels now queue messages until the webview script signals ready.
- **The extension no longer hammers an unreachable server indefinitely on Windows.** The circuit breaker's dominant failure path on Windows (a safety timeout) was not counted as a transient error, so the breaker never tripped. All non-abort errors now count toward the breaker threshold. A half-open guard also prevents concurrent probes from racing the breaker state.
- **A failing endpoint no longer blocks unrelated features.** A single global circuit breaker meant one bad endpoint (e.g. analytics) could trip the breaker for schema, DVR, and everything else. Each endpoint group now has its own independent breaker; if the server is genuinely down, all groups trip within seconds. User-initiated Retry Discovery resets all groups.
- **Right-click "Ignore Finding" no longer risks inserting a directive for a stale finding.** The QuickPick tie-break (when several findings are equidistant from the cursor) now re-validates the picked finding against fresh diagnostics before inserting, so a directive can no longer land for a finding that changed or vanished while the pick was pending. The `onDidChangeDiagnostics` listener backing the right-click menu now filters events to the active editor's document instead of recomputing on every extension's diagnostics change.

### Improved

- **The extension detects a newly started debug server within seconds instead of up to 60 s.** The Dart server now posts a VM Service Extension event on startup; the extension listens for it and triggers an immediate discovery scan, closing the "server running but extension doesn't know yet" window. Polling remains as the fallback.
- **Port forwarding to a device is automatically re-established when it drops.** During a Dart/Flutter debug session, the extension watches `adb forward --list` every 15 s and re-creates the mapping when it silently dies (device reconnect, adb server restart, editor crash mid-debug). Previously a dead forward was only healed reactively — up to scan-interval + 60 s throttle of unexplained "server lost." Only acts on a confirmed drop (the forward must have been observed alive this session first), honors the 60 s re-forward throttle, and preserves the once-per-session toast latch on recovery.
- **After repeated connection failures, the extension short-circuits requests for 30 s instead of hammering the network.** A circuit breaker gates all outbound HTTP — after 5 consecutive transient failures, requests are rejected immediately instead of every subsystem independently retrying. Discovery health probes bypass the breaker (they are the recovery mechanism). User-initiated retry resets the breaker.

<details><summary>Maintenance</summary>

- **NLLB no longer loads when Qwen is available.** The engine cascade was eagerly constructing `NllbTranslator` (loading the 3.3B model into GPU memory) even when Qwen was the active engine, wasting ~2 GB VRAM and adding startup delay. NLLB now only loads when Qwen is unavailable.
- **Brand-token placeholders survive Qwen translation.** Brand-shield tokens (`<B0>`, `<B1>`, …) were sent raw to the Qwen model, which dropped or mangled them. `validate_brands` then rejected every translation containing a brand name ("wrote 0 translations"). The placeholders are now masked alongside format placeholders (`{count}`, `{name}`) before the model sees the text, then restored after.
- **Translation engine: NLLB → Qwen 2.5 7B (via Ollama).** The primary offline translation engine is now Qwen 2.5 7B running locally through Ollama's OpenAI-compatible API, replacing NLLB-200 3.3B. NLLB remains as a fallback when Ollama is not running; Google Translate is the last resort. Qwen produces materially better translations for UI strings. Existing NLLB-provenance translations are now classified as medium quality and eligible for upgrade via the "Upgrade LOW/NLLB-QUALITY → Qwen" menu action.
- **Qwen prerequisite diagnostics.** The interactive menu now checks Ollama status at startup and shows actionable fix instructions when something is missing — env-disabled, server not running, or model not pulled — instead of silently falling back to a weaker engine.
- **Connection telemetry.** Every real connection phase transition (disconnected/connecting/connected/offline) is now logged to the Output channel with time-since-activation, a running flap count, and the measured reconnect latency when the connection comes back. Log-only — it changes no connection behavior, and it is the measurement instrument any future threshold tuning is gated on.
- **Connection reliability implementation** (`plans/connection-reliability-ongoing.md`): circuit breaker (`CircuitBreaker` → `CircuitBreakerRegistry`), webview ready-handshake (`postMessage` queueing), server push discovery (`ext.saropa.drift.ServerStarted` VM Service event), and adb-forward supervision — see the Fixed and Improved sections above for user-facing descriptions.
- **Publish pipeline: Dependabot PR gate.** The pipeline now checks for open Dependabot PRs after fetching origin — blocks publish (with override prompt) if stale dependency PRs are waiting, so releases never ship on deps that Dependabot already flagged.
- **Audit closure:** C2b phase 2 (nonce CSP for the browser-served SPA + data-grid webview) closed WONTFIX — defense-in-depth only on surfaces already protected by loopback default + fixed XSS sinks. The full codebase audit has no remaining open items. Deferred plan archived to `plans/history/`.
- **96 brand-mangled translations hand-written and patched.** The MT engine (Qwen) dropped keys across 10 locales (de, es, fr, it, ja, ko, pt-br, ru, zh-cn, zh-tw) because it altered brand names (Drift, Saropa, Isar, Flutter, SQLite, WAL, VM Service). All 96 were manually translated with brand terms, HTML tags, and `{0}`/`{1}` placeholders preserved, then inserted into `bundle.l10n.*.json` and `assets/web/l10n/web.*.json`.
- **Full codebase audit archived.** With its last open item closed, the audit document moved from `plans/` to `plans/history/2026.06/2026.06.12/full-codebase-audit-2026.06.12.md`; the ~30 source comments and docs citing the old path were rewritten to the archive path, and a pointer stub remains at `plans/full-codebase-audit-2026.06.12.md` so stale external references still resolve.

</details>

---

## [4.2.0]

One switch now turns ALL monitoring off: a power button in the Database sidebar (plus a card in Drift Tools and two commands) instantly stops query recording, background sweeps, diagnostics, and file badges on both the extension and the in-app debug server — and turns them all back on without any restart. Booleans now render as `true`/`false` instead of `0`/`1`, interactive SQL errors now suggest the right column name, and the web viewer's left icon bar is a touch roomier with softly tinted icons. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.2.0/CHANGELOG.md)

### Added

- **Global monitoring & logging kill switch across the whole toolchain.** For performance-sensitive debugging, privacy compliance, or constrained devices, one control now silences everything at once (`plans/PLAN_BUILD a KILL SWITCH.md`):
  - **VS Code:** a new `driftViewer.enableMonitoringAndLogging` setting (default on), a power toggle in the Database sidebar toolbar, a status card at the top of the Drift Tools Hub ("Monitoring Active" / "Monitoring Suppressed" with a one-click Kill/Resume button), and two Command Palette commands — `Drift Viewer: Kill All Monitoring and Logging` / `Resume All Monitoring and Logging`. Killing clears all Problems-panel diagnostics and row-count file badges immediately, blanks the Database sidebar with a "Monitoring and Logging are disabled via Kill Switch." notice (with a one-tap resume row), and stops the heavy background sweeps. Resuming re-arms everything without a window reload.
  - **Dart server:** `DriftDebugServer.start(monitoringEnabled: false)` boots the server dormant, and `DriftDebugServer.setMonitoringEnabled()` or the new `GET/POST /api/monitoring` endpoint flip it live. While killed, the server records no query timings, no DVR entries, and runs no change-detection sweeps; every data-inspection endpoint answers a structured `403` ("Access Denied: All monitoring and data inspection has been halted by the global kill switch.") while `/api/health` keeps responding with `monitoringEnabled: false` and the discovery manifest advertises `"monitoring": "disabled"` so external tools can tell "deliberately dormant" from "broken".
  - The extension pushes the kill state to any server it connects to (and warns, with a one-tap resume, when a connected server is itself dormant), and API errors caused by the kill switch surface the explanatory message instead of a bare `403`.
  - The switch covers BOTH transports: the Dart VM Service RPCs (`ext.saropa.drift.*`, including SQL and batch edits) refuse with the same message while killed, and new `getMonitoring`/`setMonitoring` RPCs let a VM-only debug session flip the switch when no HTTP port is reachable. `GET /api/mutations` is also gated so row data captured before a kill cannot be read while killed.
- **`/api/sql` errors now carry schema-aware hints instead of a bare `SqliteException`.** A `no such column` failure previously returned only SQLite's terse text, so a client had to already know the exact Drift-generated name — including acronym splitting (`contactSaropaUUID` → `contact_saropa_u_u_i_d`) and reserved-word rules — with zero assistance from a tool whose whole purpose is schema awareness. The Advisor now enriches these errors after SQLite rejects the statement (so there are no false positives): it resolves the referenced table from the query's `FROM`/`JOIN` clauses, appends that table's actual column names, and — when the mistake is a plausible typo — suggests the nearest real column, matching the guidance the source-file column checker already gives for Dart raw SQL. A reserved SQLite keyword used as a bare alias (`... AS primary`) now returns a hint to quote or rename it (`plans/history/2026.07/2026.07.04/BUG_API_SQL_UNVALIDATED_COLUMN_REFS.md`).

### Fixed

- **Boolean columns now display as `true`/`false` instead of `0`/`1` whenever the connected app declares its Drift schema.** SQLite stores Drift booleans as `INTEGER`, and the viewer previously guessed booleans from column names alone (`is_*`, `has_*`, …), so any boolean with a non-matching name rendered as a bare integer. The data grid, the search tab, the inline cell editor, and custom SQL results now read the `driftType` the backend already sends (exact, no guessing); the VS Code sidebar shows a boolean icon and a `bool (INTEGER)` label for these columns. Custom SQL results only format a column when its name is a bool in every table that declares it — an ambiguous name stays raw. Raw SQLite hosts and older servers keep today's name-heuristic behavior (`plans/history/2026.07/2026.07.09/BUG_bools_showing_as_ints.md`).
- **Boolean name detection now matches suffix-named columns (`user_active`, `account_enabled`, …).** The suffix pattern used a Dart-style escaped `\$`, which in a JavaScript regex matches a literal dollar sign rather than end-of-string, so the entire suffix branch never matched any real column name. Date name detection (`expires_at`, `starts_on`) carried the same `\$` artifact and is fixed the same way.
- **The grid and the inline cell editor now agree on which columns are booleans.** They previously used different integer-type lists, so a `user_active INT` column validated its edits as a boolean while still displaying as `0`/`1`; both now share one predicate. Query-builder results from raw SQL or multi-table joins no longer borrow the current table's declared types for same-named result columns — like custom SQL results, they format only names that are bool in every declaring table. A deep-linked `?sql=` run now loads schema metadata before rendering its first result, so booleans format correctly even when the SQL tab is the first surface opened.
- **Multi-line `SELECT`/`WITH` queries are no longer rejected as non-read-only.** The read-only check required a literal space right after the leading verb, so a pretty-printed query with a newline after `SELECT` (the default editor formatting, e.g. `SELECT\n  id, ...`) failed with "Only read-only SQL is allowed (SELECT or WITH ... SELECT)." The check now accepts any whitespace — space, tab, or newline — after the verb (`bugs/BUG_showing_false-read-only-error.md`).

### Improved

- **Web viewer activity bar widened ~20% with lightly tinted icons.** The vertical icon strip (Home, Tables, Search, and the tool launchers) now uses larger 2.4rem buttons and slightly more side padding, giving the 20+ icons more breathing room and bigger tap targets. The resting icons are tinted with a soft, theme-aware blend of the accent and muted colors instead of flat gray, so the strip reads as interactive and scans faster; hover and active states still escalate to the full foreground/accent color. Scoped to the activity bar, so the tab-bar icons are unchanged.

<details><summary>Maintenance</summary>

- **Split five over-cap extension source/test files into focused modules** to satisfy the 300-line (source) and 500-line (test) caps: the Phase-10 event wiring extracted its auto-capture recommender and heavy-sweep scheduler; the discovery core extracted its scan-result/state-machine updater and UI-snapshot builder; the tree provider extracted its refresh orchestrator; the vscode test mock split its clipboard/dialog/message/fs backing stores into separate files; and the snapshot-store test split its `rowsToObjects`/`computeTableDiff` blocks and shared helpers into their own files. Behavior is unchanged. A review pass caught and corrected four behavior-parity breaks introduced by the extraction before they shipped: the discovery change event was firing a one-generation-stale server list (would have blocked first-scan auto-connect), the tree refresh cleared the table list on a safety-timeout abort (should preserve the last-known/offline schema), the coalesced pending refresh bypassed the monitoring kill switch, and the tree refresh captured the pin store at construction (before `setPinStore` runs, so pins never rendered). Added a discovery regression test asserting the change event's payload — not just the `servers` getter — carries the freshly-found server.

</details>

---

## [4.1.17]

The snapshot, branch, and data-breakpoint sweeps no longer pull raw image/attachment BLOB bytes, so they can't crash a connected app that stores them — and timeline auto-capture now ships off by default, with a one-time prompt offering to turn it on. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.17/CHANGELOG.md)

### Fixed

- **Capture sweeps no longer crash a connected app that stores image/attachment BLOBs.** The timeline snapshot, data branch, and data-breakpoint "row changed" sweeps issued `SELECT *` over every table; on a table holding avatar/photo/attachment BLOBs under the row-count cap, that pulled up to a thousand multi-KB–multi-MB blob rows into the connected app's isolate to serialize the response, exhausting native memory and aborting the process (`plans/history/2026.06/2026.06.28/BUG_TIMELINE_CAPTURE_SELECT_STAR_BLOB_OOM.md`). These sweeps now read a `length()` of each BLOB column instead of its bytes — enough to detect a row changed without ever transferring the payload — so the connected app stays alive regardless of how large its blobs are. A blob edited to a different value of the same byte length is the one change this won't flag.

### Changed

- **`driftViewer.timeline.autoCapture` now defaults to off.** Auto-capture re-dumps every physical table on each data change; shipping it off makes that automatic re-dump opt-in rather than a surprise. It is safe on any schema — including BLOB-bearing ones — because the capture reads each blob's length, not its bytes (see the crash fix above). Snapshots are still available any time via the **Capture Snapshot** command. The setting description and README document the behavior.

### Added

- **A one-time prompt offers to enable auto-capture.** On connect, if auto-capture is off and the connected database has a readable schema, a prompt (shown at most once per workspace) offers to turn it on for that workspace. It is not gated on schema shape or size — auto-capture is safe everywhere now that the sweep never transfers blob bytes.

---

## [4.1.16]

Row-count file badges now render on every Drift table file — including large tables — and no longer spam the extension-host log. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.16/CHANGELOG.md)

### Fixed

- **Row-count file badges now show on tables of every size and stop flooding the extension-host log.** The badge label could exceed VS Code's two-character limit for whole row-count bands (100–999 rows, and roughly 9 500 rows and up — e.g. `"100"`, `"10K"`, `"999K"`, `"10M"`). VS Code rejects an over-length badge: it dropped the decoration entirely (so exactly the large tables that most need a count showed none) and logged an `INVALID decoration … 'badge'-property must be undefined or a short character` warning once per offending file on every badge refresh — hundreds of lines per refresh, compounding on a reconnecting link. The badge is now always two characters or fewer: exact counts under 100, then a leading digit plus a magnitude letter (`3H`, `5K`, `2M`, `1B`) or the bare letter when even that won't fit, with the full per-table counts still in the hover tooltip.

<details><summary>Maintenance</summary>

- `formatBadge` rewritten to be total-safe to ≤2 characters (`Math.floor` instead of `Math.round` so values like 9 500 stay `"9K"` rather than overflowing to the 3-char `"10K"`; guards non-finite and non-positive input). Added a defensive guard at the `FileDecoration` call site that omits the badge (keeping the tooltip) if a label ever exceeds two characters, so a future regression cannot reach VS Code. Added a unit test asserting `formatBadge(n).length <= 2` across the full range plus updated the band-specific expectations. Fixes `plans/history/2026.06/2026.06.27/BUG_file_decoration_badge_exceeds_two_chars_floods_exthost_log.md`.

</details>

---

## [4.1.15]

The "Drift debug server detected" toast no longer keeps re-popping on a flaky wireless-debugging connection. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.15/CHANGELOG.md)

### Fixed

- **No more repeated "Drift debug server detected on port 8642" toasts on a flapping wireless link.** When the Drift server runs inside the app on a device reached over Android Wireless Debugging, a dropped-and-recovered link triggered an automatic `adb forward` recovery that restarted discovery and re-armed the once-per-session toast latch — so every reconnect (roughly every 1–few minutes on a flaky link) re-showed the "detected" toast with its action buttons. The automatic recovery path now preserves the latch, so the link flap stays silent after the first detection (and the single "no longer responding" warning). A user-initiated "Retry Discovery" still re-announces as before.

---

## [4.1.14]

The "Code vs database" schema view no longer reports false drift for DateTime columns or autoincrement id columns. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.14/CHANGELOG.md)

### Added

- **Search box in the History sidebar.** A filter field above the history list narrows entries to those whose SQL contains your text (case-insensitive), working alongside the existing All / Browser / App / Internal source filters. Typing filters instantly, and a clear "no queries match" message shows when nothing matches.

### Fixed

- **DateTime columns no longer show a false `code TEXT vs database INTEGER` divergence.** The code-declared schema hard-mapped every Drift `DateTime` column to TEXT, but Drift's default storage is INTEGER (unix-epoch seconds) — TEXT only when the database sets `storeDateTimeAsText`. The declared schema now reads that option and maps DateTime to the affinity the live database actually uses, so default-storage apps (the common case) report no drift.
- **Autoincrement `id` columns no longer show a false `code not null vs database nullable` divergence.** A single-column `INTEGER PRIMARY KEY` is a SQLite rowid alias, and SQLite always reports it as nullable in `PRAGMA table_info` even though it cannot hold NULL. The divergence check now skips the nullability comparison for these rowid-alias primary keys, while still flagging real nullability drift on ordinary columns and on composite or non-integer keys.
- **The theme menu no longer gets cropped by the left activity bar.** The theme flyout is now anchored over the page instead of inside the icon strip (which clips its content), and it stays fully on-screen — so every theme option is visible when you open it.

### Improved

- **Home screen polish.** The feature launcher grid now has breathing room below the last row, and the feature-search box indents its text and placeholder clear of the search icon.
- **Wider left activity bar.** The icon strip on the left is a touch wider so its buttons and labels sit more comfortably.

---

## [4.1.13]

The timeline auto-capture no longer freezes your app's launch when the extension is connected in debug. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.13/CHANGELOG.md)

### Fixed

- **Timeline auto-capture no longer stalls host-app startup.** On connect, the timeline snapshot sweep read every table with a full `SELECT *` in one back-to-back burst over the app's single live database connection. On a host that runs Drift on its main isolate (the standard debug setup), that burst monopolized the connection and froze the app's launch for several seconds. Two fixes: very large tables (over 50,000 rows) are now captured metadata-only — the sweep already truncated them to a misleading partial slice, so it skips the expensive read and still records the row-count change; and a short pause between table reads lets the app's own startup queries run in between, so a capture spreads out instead of blocking the launch.

---

## [4.1.12]

Rewind a table in Time Travel, then save that moment as a branch you can diff or restore later. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.12/CHANGELOG.md)

### Added

- **"Create Branch Here" in Time Travel.** While scrubbing a table's history in the Time-Travel panel, a new button saves the database state at the current snapshot position as a named data branch — which you can then diff, generate merge/rollback SQL from, or restore, exactly like a branch captured from live state. The button appears only when Data Branching is available. Snapshots cap rows per table, so a branch made from a large historical snapshot is flagged as truncated rather than passed off as complete.

<details><summary>Maintenance</summary>

- **Fixed flaky rate-limiting integration test.** `handler_integration_test.dart`'s "returns 429 when rate limit exceeded" test fired three sequential HTTP requests and assumed all three landed in the same one-second window; on a slow CI runner the third request crossed into the next wall-clock window, where the fixed-window counter reset to 1 and returned 200, failing the assertion. The test now fires a burst of concurrent requests so they cluster densely in one window and asserts at least one is throttled (and at least one succeeds), which holds regardless of where second boundaries fall.

</details>

---

## [4.1.11]

Raw SQL strings in your Drift code now get the same column checking as the typed query builder — if a `customSelect`/`customStatement` query names a column that does not exist on the table, you see a warning while editing instead of a crash at runtime. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.11/CHANGELOG.md)

### Added

- **New diagnostic `raw-sql-unknown-column`.** Validates column references inside `customSelect(...)` / `customStatement(...)` raw SQL against the live profiled schema and flags any column absent from the referenced table, suggesting the closest real column name. Catches the case where a hardcoded name does not match Drift's generated column (e.g. an acronym getter `contactSaropaUUID` produces `contact_saropa_u_u_i_d`, not `contact_saropa_uuid`) — a bug invisible to the existing Dart-vs-DB drift checks because it lives in an opaque string. Conservative by design: only single-table queries are checked (JOINs and comma-FROM are skipped), aliases and function names are excluded, and unknown tables are ignored. Default severity Warning; suppress per line/file with `// drift-advisor:ignore raw-sql-unknown-column`.
- **Host-side discovery for device-hosted servers.** When your app runs on a physical device or emulator, the server's own discovery file (`~/.saropa_drift_advisor/server.json`) is written on the *device* and never appears on your computer, so an external agent or `curl` client could not find it without scanning ports or running `adb forward` by hand. The extension now publishes a host-side manifest with the forwarded, host-reachable port and a `transport` field (`adb-forward` or `loopback`) the moment a server becomes reachable, and removes it when the server goes away or the extension shuts down. An agent reads one well-known file and connects. The extension never overwrites a manifest a same-machine (desktop) app wrote for itself.

### Fixed

- **Activity bar icon slightly undersized.** The database glyph in `media/icon-activitybar.svg` spanned 14 of the 24-unit viewBox width (`cx=12, rx=7`), so VS Code drew it a touch narrow next to the codicons around it. Nudged the cylinder width up (`rx=8`) to bring it in line with the neighboring sidebar icons.

<details><summary>Maintenance</summary>

- **Split three over-cap source files to satisfy the 300-line quality gate; no behavior change.**
  - `server-discovery-core.ts` (346 → 290): extracted the once-per-session "server lost" flap debouncer into `server-discovery-lost-debounce.ts` (`ServerLostDebouncer`) and the searching/backoff/connected cadence into a pure, independently testable `server-discovery-state-machine.ts` (`nextDiscoveryState` / `pollIntervalForState`).
  - `diagnostics/rules-config-html.ts` (317 → 164): moved the inline panel CSS into `rules-config-styles.ts` and the client `postMessage` script into `rules-config-client.ts`, matching the pure-builder pattern of the other `*-html.ts` panels.
  - `diagnostics/checkers/raw-sql-parser.ts` (321 → 249): extracted the lexer (literal/comment masking + tokenizer) into `raw-sql-tokenizer.ts`, leaving the parser to do table/column resolution only.
- **Publish line-limit gate now offers retry / continue / ignore instead of a yes/no.** The Step 7 quality check previously asked "Continue anyway? [Y/n]" where No aborted the publish. It now prompts `[R]etry` (default — re-scan after trimming files), `[C]ontinue` (proceed, keep the warning on record), or `[I]gnore` (proceed, drop the warning). A line-limit overrun is advisory, so there is no abort path; a closed stdin (CI) maps to continue so it cannot loop on retry.
- **Host discovery manifest writer (`host-discovery-manifest.ts`).** New extension module: `writeHostManifest` / `removeHostManifest` publish and tear down `~/.saropa_drift_advisor/server.json` on the host. It mirrors the in-app manifest JSON schema (so a reader parses one format) plus two host-only fields — a `source: "vscode-extension"` ownership stamp and `transport`. The writer fetches `/api/health` best-effort to enrich the file but always writes a valid (host, port, transport) manifest even when health is unreachable. The ownership stamp gates both write and remove: the extension never clobbers or deletes a manifest written by an in-app (desktop/emulator-on-host) server. Wired into `bootstrapExtension`'s discovery lifecycle (write on first reachable server, deduped by port; remove when servers go empty and on deactivation). 11 injected-IO unit tests cover the schema, the app-owned guard, the unreachable-health path, and error swallowing. Resolves Finding 1 / Enhancement E1+E3 of `plans/history/2026.06/2026.06.24/BUG_agent_discovery_and_resilience_for_device_hosted_server.md`; Finding 2 (SQL resilience: statement timeout, row cap, error-envelope, never-empty body) was already in place.

</details>

---

## [4.1.10]

Github CI cleanup tasks. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.10/CHANGELOG.md)

<details><summary>Maintenance</summary>

- **Discovery-manifest cleanup no longer swallows its errors.** The best-effort manifest delete in `stop()` caught and discarded any failure (satisfying `avoid_swallowing_exceptions` / `require_catch_logging`). The server now captures the context's `logError` sink on start and routes a cleanup failure through the same channel (dart:developer + the caller's `onError`), so a recurring delete failure is diagnosable instead of silent.
- Tightened `ServerUtils.jsonEncodeFallback` return type from `Object?` to `Object` — it never returns null (a null input encodes to the string `"null"`), so callers no longer carry a redundant null check (`avoid_unnecessary_nullable_return_type`).
- **Publish pre-flight analyze now matches CI exactly, so it can no longer ship one store while the other fails.** The Dart analysis step in `scripts/publish.py` used to strip the `plugins:` block from `analysis_options.yaml` and run `flutter analyze --fatal-infos`, which disabled saropa_lints locally — the exact rules CI enforces with `flutter analyze --fatal-warnings`. The local gate passed on code CI would reject, the script committed/tagged/pushed, the VS Code extension published, and only then did CI catch the warnings and block the pub.dev publish. The step now runs `flutter analyze --fatal-warnings` with the plugins block intact, byte-for-byte the CI command, before any commit/tag/push — a lint failure now stops the publish locally instead of after a tag triggers CI.

</details>

---

## [4.1.9]

The debug server can now tell tools and AI agents what it offers and where to find it, a runaway query can't knock it offline anymore, and the web viewer's sidebar labels and Run SQL screen got a tidy-up. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.9/CHANGELOG.md)

### Added

- **The debug server now advertises its own API so external tools and AI agents can find it.** `GET /api/health` lists the read endpoints, and a new `GET /api/` returns a self-describing index (version, flags, each endpoint with a one-line description, and a link to the full reference) — so a non-UI client learns the API from one request instead of having to read the source. On startup the server also writes a small discovery file at `~/.saropa_drift_advisor/server.json` (host, port, version, flags, workspace) so a tool can find the running server without being told the port; it is removed on shutdown.

### Fixed

- **A single bad or slow query can no longer take the debug server offline.** Each `POST /api/sql` (and `/api/sql/explain`) now has a 30-second statement timeout: a query that hangs returns a clear error and frees the connection instead of wedging the server so that even the health check stops answering. `POST /api/sql` also always returns valid JSON — either `{"rows":[...]}` or `{"error":"..."}` — even when a result holds a value that previously broke encoding and produced an empty response. Very wide results are capped (with a `truncated` flag and the true row count) so one query cannot stream an unbounded body.

### Changed

- Activity-bar label mode (web viewer): when the sidebar strip shows text labels, every button is now the same width with its icon and label left-aligned, and the rows have vertical spacing so the labels read as a clean aligned list.
- Run SQL screen (web viewer): redesigned the controls above the editor. The Template, Table and Fields pickers are now a clean aligned card instead of a cramped wrapping toolbar, and the Fields list is a compact fixed-height scroll box rather than the tall narrow column it used to balloon into. Saved-query actions are grouped together with "Show as" pushed to the right. The query box also opens taller by default (about seven lines instead of three) so a typical formatted query fits without scrolling; it is still drag-resizable.

<details><summary>Maintenance</summary>

- **Publish pipeline: format Dart sources at stage time so the husky pre-commit hook never aborts the release commit.** The hook runs `dart format --set-exit-if-changed .` whenever `.dart` files are staged; the analysis phase formatted early, but `--resume` runs skip analysis and any step (or manual edit) between analysis and commit could re-dirty a file, leaving an unformatted file in the index and failing the commit. `git_commit_and_push` now runs `dart format .` immediately before `git add` (gated by a new `TargetConfig.format_before_stage`, Dart-only), so the staged content always matches what the hook checks.
- **Fixed a flaky discovery-manifest test that passed alone but failed in the full suite.** The discovery manifest is written to a single global path (`$home/.saropa_drift_advisor/server.json`), and dart's `pid` is identical across the in-process suite isolates, so the other server-starting test files running concurrently overwrote or deleted this test's manifest between its write and its assertions. `DriftDebugServer.start` now accepts an optional `discoveryDirectory` override (threaded as instance state and reused on `stop` so write and remove target the same file); the test points each run at its own temp directory, making the manifest lifecycle deterministic and removing the prior "home not resolvable" skip.

</details>

---

## [4.1.8]

Internal tooling only — no user-facing change. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.8/CHANGELOG.md)

<details><summary>Maintenance</summary>

- **Publish pipeline now stops on diverged history instead of blind-merging.** The pre-flight remote-sync check mislabeled a truly diverged branch (origin's history rewritten, local on old SHAs) as "ahead," and the push step then recovered a non-fast-forward by running `git pull --no-edit` (a merge) — tangling two near-duplicate ~240-commit histories into a 25-conflict merge mid-release. The pre-flight now detects divergence explicitly and fails with a rebase hint, and the push recovery uses `git pull --ff-only` (which cannot merge), stopping loudly on divergence so reconciliation stays a deliberate manual rebase.
- **Publish pipeline now catches committed-and-gitignored files before tagging.** A file that is both tracked and matched by `.gitignore` makes `dart pub publish --dry-run` exit 65 — previously only in CI, after the git tag and GitHub release were already created. A new `git ls-files -i -c --exclude-standard` guard runs in the local pre-flight (Dart and extension legs) and as a CI step before the dry-run, naming the offending files and the `git rm --cached` fix instead of failing with a cryptic exit code.
- **Fixed pub.dev "Pass static analysis" deductions for dangling library doc comments.** Three server files (`html_content.dart`, `mutation_handler.dart`, `mutation_tracker.dart`) opened with a top-of-file `///` doc comment but no `library;` directive, so pana flagged them as dangling library doc comments and docked static-analysis points. Each now carries a `library;` directive after its header comment.
- **Enabled `dangling_library_doc_comments` in `analysis_options.yaml`.** This core Dart lint is scored by pana/pub.dev but was not in the package's base lint set, so local `dart analyze` (and the publish pipeline's analyze step) passed while pub.dev still deducted points. Enabling it closes that gap — the lint now fires locally and `dart fix` can auto-insert the `library;` directive.

</details>

The debug server now tells you how to reach it when you debug on a physical device over Wi-Fi, instead of leaving a silent connection-refused when you try the device's network address. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.7/CHANGELOG.md)

### Added

- **Drift Tools Hub.** A new single-page panel that puts the whole toolbox on one screen. Read-only live previews of your Dashboard and Health Score sit side by side at the top — each with an "Open full screen" button to the full interactive panel, and Health-card actions still drill down from inside the hub. Below them, every tool in the sidebar is indexed in a grouped, collapsible launcher: the same six categories (Getting Started, Schema & Migrations, Health & Quality, Data Management, Visualization, Tools), each with an icon, a tool count, and a one-line note on what it does. Tiles carry semantic icons, and destructive actions (Clear All Tables) get a caution accent. A hero bar adds Rescan and a link to the Saropa website. Open it from the top of the Drift Tools sidebar ("Drift Tools Hub") or the command palette. The two preview panes load concurrently behind one cancellable progress notification; if one fails it shows a placeholder without blanking the other, and the launcher is usable immediately while they load.

### Changed

- **The "Drift Tools" sidebar panel is now a slim launcher** and moved to the top of the Saropa activity-bar container (above Database). It shows a prominent "Drift Tools Hub" entry (with the extension version), the "Add Saropa Drift Advisor" setup item when the package is missing, and a connection-status row that opens connection help when no server is connected. The previous category-per-tool list was redundant with the new Hub — open the Hub for the full, grouped tool catalog.
- **Configure Diagnostic Rules screen.** A new full-page panel replaces the old "Drift Advisor Rules" sidebar list. Every rule is grouped by category with its live finding count; each has an enable/disable toggle and a severity dropdown (Default / Error / Warning / Info / Hint). A filter box narrows the list by code or description, and one-click "Enable All" / "Reset Severities" buttons clear your overrides. Open it from the Drift Tools sidebar ("Configure Rules") or the command palette. Changes save to your workspace settings and re-run analysis immediately.
- **Startup banner now explains LAN-IP access.** With the secure default (`loopbackOnly: true`), the banner states that connecting by the device's network IP is off and how to turn it on (`loopbackOnly: false` + an `authToken`). When you do bind a non-loopback interface, the banner prints the reachable `http://<lan-ip>:<port>` URL(s) beside the existing `adb forward` hint, so a Wi-Fi-by-IP user gets a copy-paste address instead of guessing the device IP.
- **`GET /api/health` advertises the bind mode** via a new `loopbackOnly` field. A remote client (e.g. Saropa Lints) can now tell "server up but loopback-only" from "no server" — previously both looked like a bare connection-refused.
- **Clicking "Offline" in the Database sidebar now opens a live connection panel.** The "Offline — cached schema" (and "Disconnected") row used to do nothing when clicked. It now opens the Troubleshooting panel showing your actual state: a status banner with the precise next step (start a debug session, or — if one is already running — check that the app calls `DriftDebugServer.start()` and is a debug build), plus a configuration grid (target host/port, discovery range, debug-session status, offline-cache setting) above the existing setup guidance.
- **"Good to know" explainers in the connection panel.** A new collapsible section answers the questions that previously lived only in code comments and the changelog: why the server is private to your machine, what "Offline — cached schema" means, why the app must be a debug build, why your Wi-Fi debug port keeps changing, and whether it reconnects after a hot restart.

### Fixed

- **Wi-Fi-by-IP debugging looked like a dead server.** Reaching the debug server by a physical device's LAN IP failed silently under the loopback-only default, with nothing in-product explaining that the IP route is closed by design. The banner and health endpoint now make the bind mode and the two supported access paths explicit. Documentation-only on the security side — the loopback-only default is unchanged.
- **Toggling a rule in the Drift Advisor Rules sidebar errored out.** Clicking a rule (e.g. "no-primary-key") to mute it failed with "…is not a registered configuration" because the settings the extension reads and writes — `driftViewer.diagnostics.disabledRules`, `driftViewer.diagnostics.severityOverrides`, and `driftViewer.logVerbosity` — were never declared in the manifest, so VS Code refused to save them. All three are now registered, so muting/unmuting rules, severity overrides, and the Set Log Verbosity command write successfully.
- **Repeated "no longer responding" popups while Wi-Fi debugging.** On a flaky link the debug server drops and reconnects over and over, and each cycle used to fire a "Drift debug server on port … is no longer responding" warning plus a "detected" toast on recovery — a steady stream of popups to dismiss. Now you get **at most one** "lost" warning per debug session: a brief blip that recovers within a short grace window produces no popup at all, the first sustained drop warns once, and after that the session stays silent no matter how many times the connection flaps. Starting a new debug session or running **Retry Discovery** re-arms the single warning. Disconnect detection is unchanged, so the sidebar/status still reflect the connection state in real time.

<details><summary>Maintenance</summary>

- **Publish pipeline runs only the affected tests, selected by import graph.** `scripts/modules/dart_build.py` `run_tests` diffs the working tree against the last release tag, builds the package's transitive import graph, and runs every `*_test.dart` whose dependency closure includes a changed file (resolving relative and `package:` imports, including multi-line conditional exports). This is the "outdated tests" set the editor's Test Explorer shows, computed without the editor — so a change to a core file with no same-named test still runs every test that imports it through any chain. A changed library file that no test reaches is logged as a genuine coverage gap. The only full-suite paths are unreadable git history and an explicit `PUBLISH_FULL_TESTS=1`; `PUBLISH_TEST_BASELINE=<rev>` overrides the diff baseline.

</details>

---

For older versions see [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md).
