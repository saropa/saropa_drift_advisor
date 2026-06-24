# Changelog Archive

Versions 3.7.3 and prior. For current changes see [CHANGELOG.md](./CHANGELOG.md).

---

## [3.7.3]

Publish tooling now runs the runtime translation audit and points you at the command to open the translation util — no user-facing change. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.7.3/CHANGELOG.md)

<details>
<summary>Maintenance</summary>

- **Translate util: live progress bar, WPM/ETA, and run logs** — the operator-gated translate pass now renders a per-locale progress bar with a words-per-minute rate and an ETA (computed from words processed, not key count, so the estimate stays steady across short and long strings). On a non-TTY it degrades to one milestone line per ~10% instead of carriage-return spam. Every key is journaled: shipped values to `reports/<YYYYMMDD>/<ts>_translate.log` and dropped/failed keys (brand-mangled drops, engine aborts) to the sibling `..._translate_errors.log`; both paths are printed at the end, even on an early CTRL-C abort. The interactive menu summary, the audit summary, and the translate output now color coverage by severity (red/yellow/green) and highlight the engine name. New `ProgressMeter` / `coverage_color` / `_fmt_duration` helpers in `scripts/modules/display.py`; wiring in `scripts/modules/l10n/actions.py` and `scripts/modules/l10n/cli.py`. No machine translation is run by these changes.
- **Publish runs the runtime translation audit (plan 75 §5.5)** — the extension publish leg's runtime l10n step (Step 11b) now runs the full runtime (System B) translation audit (`scripts/modules/l10n/audit.py`) over the ten target locales and writes a timestamped report to `reports/<YYYYMMDD>/<ts>_l10n_runtime_audit.json`, alongside the existing dry-run baseline/sync check. It prints the per-locale coverage summary, the **audit report path** (a full filesystem path), and the **full absolute-path command** (running interpreter + `scripts/translate_l10n.py`) to open the translation util's interactive menu — so the maintainer can jump straight to the operator-gated translate pass. The baseline-stale hint now uses that same absolute-path command instead of a bare `python scripts/...`. Read-only and non-fatal: it never translates and never dirties the tree; gaps stay a warning (English-first). `scripts/modules/pipeline.py`.
- **Fixed: publish Step 11b silently crashed every run** — the runtime l10n step always failed with `cannot access local variable 'ok'`. Root cause: `_run_ext_build_and_validate` later did `version, ok = …`, which made `ok` a function-local for the WHOLE function, shadowing the imported `ok()` display helper, so the baseline line above it raised `UnboundLocalError` and the step fell into its non-fatal except. Renamed the local to `version_ok`; the step (now the translation audit) runs cleanly. `scripts/modules/pipeline.py`.
- **Fixed: Dart pre-publish dry-run was always skipped on Windows** — `pre_publish_validation` short-circuited on `win32` citing an old Dart SDK `nul`-path crash, so Windows publishes shipped to pub.dev with NO local `dart pub publish --dry-run` validation. That SDK bug is gone (verified clean on Dart 3.12.1), so the unconditional skip was removed — the dry-run now runs on every platform (exit 65 still treated as a pass for advisory warnings). `scripts/modules/dart_build.py`.
- **Fixed: 4 stale extension toolbar tests** — `hamburger-menu.test.ts` and `tab-icons-accent.test.ts` still asserted the Tables and Search toolbar buttons as `data-tool="…"` launchers, but those became permanent `data-panel-btn="…"` panel buttons; the assertions now match (and `tables`/`search` moved out of the `data-tool` launcher list into a dedicated `data-panel-btn` check). Buttons and glyphs were unchanged — this was a test/markup drift, not a regression.
- **Split `constraint-wizard-html.ts` under the line limit** — extracted the static document shell (the `<style>` block and client `<script>`, ~140 lines) into a new `constraint-wizard-shell.ts` exporting `wrapConstraintWizardHtml(body)`, dropping the main file from 305 to 166 lines (under the 300 limit) so publish no longer prompts "Continue anyway?". Pure move; no behavior change.
- **Clearer local-install label in publish** — the publish "Local Install" step's `Installed locally: code vX` line read as if it had just installed the new build, when it actually reports the EXTENSION version ALREADY installed in the editor (install happens at the later prompt). It also read as the editor's own version. Relabeled to `Currently installed drift-viewer: code vX` (and `drift-viewer not currently installed in VS Code or Cursor.`), naming the extension so the version can't be mistaken for VS Code's. `scripts/modules/pipeline.py`.
- **Publish "Proceed?" prompts default to yes** — both the Dart-only and full (`all`) publish confirmation prompts now default to yes, so pressing Enter at `Proceed with publish?` proceeds instead of aborting. `scripts/publish.py`.

</details>

The web viewer's toolbar can now show labels: click any empty space in the toolbar row to switch between icon-only buttons and icons with a short word in a dim box. Your choice is remembered.

### Added

- **Snapshots can survive a server restart** — pass a `snapshotStorePath` to `DriftDebugServer.start` and the website's captured snapshots are saved to that file and reloaded next time the server starts, so they outlive a full restart of your app's debug session (not just a browser reload). Each capture, delete, and rename rewrites the file atomically; a missing or corrupt file simply starts empty. Without the option, snapshots stay in memory exactly as before — nothing is written to disk unless you opt in.
- **Website: code-vs-database schema divergence** — the web viewer's **Code schema** tool now diffs your app's declared Drift schema against the live database and shows where they drift, right above the declared-table list. It flags tables declared in code but missing from the database (and vice versa), columns present on only one side, and per-column type, nullability, and primary-key mismatches — grouped by table. Type comparison uses SQLite storage affinity, so `INT`/`INTEGER` and `VARCHAR`/`TEXT` aren't reported as differences, and `sqlite_*` internal tables are never flagged as "extra". When code and database agree it says so; when the live schema can't be read (for example change detection is off) it says divergence wasn't computed rather than guessing. Needs the app to supply its declared schema (automatic with `startDriftViewer`, or via the `declaredSchema` callback).
- **Website: download a portable report** — the debug web viewer's Export panel has a new **Report** download. One click saves a single self-contained HTML file with your data, schema, and anomaly findings all baked in — open it in any browser with no server, attach it to a bug report, or archive it. The report has a table list with row counts, click-to-view paged tables (50 rows/page) with a per-table filter, the schema DDL, a severity-coded anomaly list, and a light/dark theme toggle. By default it includes every table (up to 1000 rows each); the endpoint accepts `?tables=a,b`, `?maxRows=N`, `?schema=false`, and `?anomalies=false` to tailor it. This brings the website to parity with the VS Code extension's "Export Portable Report".
- **Website: drag to resize the sidebar** — the debug web viewer's single left sidebar now has a drag bar on its right edge. Drag it to make the sidebar wider or narrower; your width is remembered across reloads. Drag it all the way in to hide the sidebar — the bar stays put and gets wider so it's easy to grab and pull the sidebar back open. You can also focus the bar and use the left/right arrow keys (Enter to hide/show). The separate collapse icon in the activity bar has been removed, since the drag bar now handles hide and show.
- **Website: history groups repeated queries** — in the debug web viewer's History sidebar, identical SQL is now collapsed into a single row instead of repeating once per run. When a query ran more than once, a clickable **(n)** count appears next to it; clicking it opens a dialog listing every run with its source, time, and duration, plus a **Copy** button that copies the query and all its run times/durations as tab-separated text (ready to paste into a spreadsheet). When the same SQL ran from more than one source (browser / app / internal), the collapsed row shows a pill for each source; otherwise it shows the most recent run's duration and timestamp. Clicking the row (outside the count) loads its SQL into Run SQL as before.
- **Website: toolbar label toggle** — click the blank whitespace between the debug web viewer's toolbar icons (not an icon) to flip the whole toolbar between two looks: compact icon-only, or each icon paired with a short word inside a dim bounding box. The mode is saved, so it stays the way you left it across reloads.
- **Website: dictate your question by voice** — the "Ask in English…" dialog now has a microphone button next to the question box. Click it and speak; your words are transcribed into the box and the SQL preview updates as usual. The button only appears in browsers that support voice input (Chrome, Edge, Safari) and stays hidden elsewhere. Recognition uses your browser's built-in speech service, so audio is handled by your browser, not the viewer.
- **Website: copy the generated SQL** — the "Ask in English…" dialog now has a copy button next to the "Generated SQL (preview)" label that puts the generated query straight on your clipboard, without touching the main editor. The icon briefly turns into a checkmark to confirm.
- **Website: preview results in the dialog** — a new **Preview results** button in the "Ask in English…" dialog runs the generated query and shows the first 10 rows in a compact table right inside the dialog, so you can sanity-check the SQL before clicking Use. The sample clears automatically when you change the question.
- **Website: show or hide result columns from the table definition** — the "Table definition" panel now has a **Show** checkbox on each column row. Uncheck a column to drop it from the results grid; check it to bring it back. It stays in sync with the right-click "Hide" menu and the column chooser, and your choices are remembered per table.
- **Website: column profiling stats in the table definition** — the "Table definition" panel header now has a stats button (📊 insights icon). Click it to add a set of profiling columns for every field, computed across the whole table: a **Fill** completeness bar with percent, **Nulls** count, **Distinct** value count, a **Unique** column that flags candidate keys with a 🔑 (or shows the distinct-to-rows ratio for low-cardinality fields), **Min** and **Max** values, and total stored **Size** in bytes. Stats are fetched once per table and cached, so toggling them off and back on is instant. Click the button again to hide them.
- **Website: copy a table definition as JSON** — a new JSON button in the "Table definition" header copies the whole definition to your clipboard as structured JSON: each column's name, type, primary-key and not-null flags, and any foreign-key target. If you've turned on the profiling stats, those numbers are included per column too.
- **Website: copy a table definition as Flutter (Drift) code** — a new Flutter button in the "Table definition" header copies a ready-to-paste Drift `Table` class for the table, mapping SQLite types to the right Drift columns (`IntColumn`, `TextColumn`, `RealColumn`, `BlobColumn`, `BoolColumn`, `DateTimeColumn`), marking nullable columns, using `autoIncrement()` for a single integer primary key, and emitting an explicit `primaryKey` override for composite keys.
- **Website: "Ask in English" understands value filters, sorting and limits** — beyond dates, the natural-language box now turns column conditions into `WHERE` clauses: comparisons (`age > 30`, `age between 18 and 65`, `at least`, `under`), equality and negation (`status = active`, `status is not closed` — matched case-insensitively), text search (`email contains gmail`, `name starts with a`, `ends with .com`, `named john`, `search for alice`), boolean flags (`active`, `inactive`, `not archived`, `verified`, `subscribed` / `unsubscribed`), presence checks (`has email`, `no phone`, `balance is null`), and sign checks (`negative balance`, `zero stock`). It also reads **sorting** (`sort by name desc`, `alphabetical`, `newest first`, `top 10 by balance`, `longest name`), **row caps** (`show 20`, `first 5`, `a dozen`), **grouping & segments** (`count by country`, `per status`, `breakdown by source`), **duplicate finding** (`duplicate emails`), and **staleness** for re-engagement and data-quality work (`not updated in 30 days`, `older than 6 months`, `stale`, `dormant`, `not logged in for 60 days`, `test accounts`). It rounds out the aggregate words too (`typical`, `combined`, `grand total`, `peak`). Conditions combine freely with each other and with date filters — e.g. `active contacts created this week sorted by name`. Typed values are quote-escaped and `LIKE` wildcards are escaped, so your text can't break the query.
- **Website: searchable "What can I ask?" help in the dialog** — the "Ask in English…" dialog has a new **ⓘ** button in its top-right corner that opens a cheat-sheet of supported phrasings. It has a **filter box** at the top (type "this week" or "top" to narrow it) and **collapsible sections** — Counting &amp; math, Filter by value, Dates &amp; time windows, Stale data &amp; quality checks, Sort &amp; limit, and Group &amp; segment — each with example phrases. Searching auto-expands the sections that still match; the panel collapses again on the next click or when you close the dialog.
- **Relationships your app knows, handed to the viewer as fact** — apps can now declare their parent→child links directly (a new `declaredRelationships` option on `DriftDebugServer.start`), for schemas that connect tables by a shared id/UUID column instead of a SQLite foreign key. When supplied, the "Ask in English" wizard treats those links as the exact truth instead of guessing them from column names, and falls back to its naming heuristic when an app declares nothing. It's read-only metadata: nothing touches your database file, connection settings, or migrations.
- **Orphan-row checks now follow your declared relationships** — the anomaly scan used to find orphaned rows only across SQLite foreign keys, so an app that links tables by a shared id/UUID column (and declares no foreign keys) got no orphan findings at all. The scan now also checks the relationships your app declares: for each declared link it looks for child rows whose parent id is missing. Because these links aren't database-enforced, an orphan there is flagged as a **warning** (it's normal in an offline-first app where a parent may not have synced yet), while an orphan across a real, enforced foreign key stays an **error**. Links your app marks as not checkable (a list of ids packed into one text cell, or seed-only ids) are skipped, and a link that's both declared and a real foreign key is reported once.
- **Hidden table relationships are now surfaced as advice** — when two tables clearly link by column naming (a shared `*UUID` identity column, or a `<noun>_id` reference) but the schema declares no SQLite foreign key, the viewer now points it out as an **info** issue: "these columns look like a link, but nothing declares it, so the ER diagram, joins, NL queries and orphan checks can't see it." It reads the live columns only — it never scans or flags rows, so an offline-first app's not-yet-synced children don't generate noise. Each finding names which convention it spotted (the `<noun>_id` reference is the stronger signal) and recommends declaring the link via `declaredRelationships` — no schema change, no `PRAGMA`, no migration. Once you declare the link (or it's a real foreign key), the advice disappears. Available on its own at `GET /api/issues/soft-relationships` and merged into `GET /api/issues` (and the Health tab) like the other checks.
- **Website: ER diagram now shows inferred relationships as dashed lines** — the schema diagram used to draw only declared SQLite foreign keys, so a database that links its tables by a shared id/UUID column (or a `<noun>_id` column) looked like a set of unconnected boxes. Those inferred-but-undeclared links now appear as **dashed** connectors, distinct from the solid lines of real foreign keys. Hovering a dashed line (or reading the diagram with a screen reader) explains it: e.g. "contact_points.contactSaropaUUID → contacts.contactSaropaUUID (inferred from shared UUID column, not declared)." The screen-reader text alternative lists them under their own "Inferred (undeclared) relationships" heading. Declaring a link (via `declaredRelationships`) or adding a real foreign key removes its dashed line.
- **Website: ask "Hey Saropa" for a spoken-style answer** — start an "Ask in English" question with "Hey Saropa" (lots of spellings and voice-typed mishearings are recognized) and the dialog answers back in a sentence, like a chat reply: ask "hey saropa, how many contacts were added last week?" and it runs the query and replies "Your database added 45 contacts last week," with the full SQL it used shown right underneath. The wake words are ignored when building the query, so they never change the result — they only switch on the narrated answer. Counts, totals, averages, highest/lowest, and "how many groups" all get their own phrasing; for a list of rows it tells you the exact total (not just the previewed first ten). Saying only "Hey Saropa" with no question gives a friendly nudge to ask something.

### Fixed

- **Extension: performance regression warnings no longer fire on table growth** — the end-of-session "query regression(s) detected" warning used to compare a query's raw average time against its saved baseline, so a query that got slower only because its table grew between debug sessions (more rows take proportionally more time) — or because its result set was cold in the cache — was flagged as a regression you couldn't act on. The check now compares **per-row** cost whenever it has a row count for both runs, so pure table growth no longer trips it; a genuine per-row slowdown still does, including one that returns fewer rows than before (which raw timing would have hidden). Normalized warnings read "Nx slower per row" and show the row counts so the comparison is clear. Baselines saved before this release keep the old raw comparison until they refresh, so nothing changes abruptly.

<!-- cspell:ignore chnaged -->
- **Website: "Ask in English" now keeps date filters like "today"** — a question such as "how many contacts changed today?" previously dropped the "changed today" part and counted the whole table (`SELECT COUNT(*) FROM "contacts"`). The dialog now understands a large vocabulary of time phrases and adds the matching date filter to the generated SQL:
  - **Days:** today, yesterday, the day before yesterday, "N days ago", and time-of-day windows — this morning / afternoon / evening, tonight, last night, earlier today.
  - **Named weekdays:** "last Monday", "on Friday", etc. (full names and abbreviations) resolve to the most recent occurrence.
  - **Calendar periods:** this & last week / month / quarter / year, the past week / month / year, the weekend, this decade, a fortnight.
  - **Named months & years:** "in June", "last December", "in 2024", "since 2020", "before 2022", "after 2023", and **Q1–Q4**.
  - **Rolling windows** down to the last N hours / minutes, plus compact dashboard tokens like **24h, 7d, 2w, 3mo, 1y, 15min, T-30**.
  - **Shorthands:** ytd / mtd / qtd / wtd, "the other day", "recently / lately".
  - It also reads vague counts ("a couple of days", "the last few weeks"), tolerates common misspellings ("chnaged tody"), and picks the right column from the verb — **changed / updated / modified / edited / synced / migrated** target the last-modified date, while **created / added / new / joined / seeded / imported** target the creation date. A side effect of supporting minute windows: a question mentioning "minutes" no longer mis-fires the `MIN()` aggregate.

### Changed

- **Website: clearer results header** — the results section header now reads, for example, **"Results — 126 rows / 5 columns"**, and only shows the larger totals when they differ (**"126 of 1,126 rows / 5 of 19 columns"**) instead of repeating an identical count like "126 of 126 rows".
- **Website: expand/collapse chevrons moved to the right** — the ▲/▼ arrows on collapsible section headers (Results, Table definition, Query builder) now sit at the right edge, dimmed, so they no longer crowd the heading text on the left.

### Improved

- **Website: refine your question in plain English** — after the "Ask in English" panel runs a query, you can narrow it with a follow-up that starts with a connective instead of retyping the whole thing: ask "active contacts", then "and sorted by name", then "now only from last week" — each one is appended to the previous query and the SQL preview updates to the combined result. A small hint shows the full combined question so you can see exactly what will run. Connectives recognized are additive ones (now, and, also, plus, then, just, only, filter to, narrow to, restrict to); clearing the question box starts a fresh query. Phrasings that imply replacing a prior condition (like "instead") are treated as fresh questions, since the refinements stack rather than overwrite.
- **Website: "Ask in English" understands relationships even without declared foreign keys** — many schemas link tables by a shared id/UUID column instead of a declared SQLite foreign key (Saropa Contacts links every table by `contactSaropaUUID`). The wizard now infers those relationships from column naming (`<noun>_id` → that table, and a shared `*UUID` column → its owner table). So it best-guesses the right main table (e.g. a name search lands on **contacts**, not the largest detail table), and relationship phrases like **"contacts with more than one connection"** generate correct queries even when the database declares no foreign keys.
- **Website: "Ask in English" recognizes more date columns** — date/time columns are now detected from the column's declared type (`DATE` / `DATETIME` / `TIMESTAMP`) as well as its name, and the name match understands camelCase (`favoriteAt`, `eventDate`, `lastSeenTime`), not just snake_case (`created_at`). So time phrases ("this week", "newest first", "changed today") bind to the right column on more schemas — while bool/status/count columns are deliberately not mistaken for dates, and "newest first" still prefers a created/updated column.
- **Website: exact date/boolean detection for Drift apps** — when the app provides its declared Drift schema, the metadata now carries each column's Drift *semantic* type (`DateTimeColumn`, `BoolColumn`, …), not just the SQLite storage type. Because Drift stores both `DateTime` and `bool` as `INTEGER`, the storage type alone can't tell them apart; with the semantic type, "Ask in English" identifies date and boolean columns **exactly** instead of guessing from the name — and falls back to the name/type heuristics for raw SQLite files with no declared schema.
- **Website: large binary (BLOB) cells no longer slow the grid** — BLOB values are now shown as a short preview instead of dumping the whole value into the cell, which previously made tables with big binary columns sluggish. Hover a truncated BLOB cell and click the new expand button (next to copy) to read the full value in a popup.

<details>
<summary>Maintenance</summary>

- **Localization framework (plan 75, scaffolding only)** — stood up the runtime l10n plumbing that future string migration hooks into; no user-facing string is localized yet, so the UI is unchanged. Added the browser-side lookup runtime `assets/web/l10n.ts` (`vt()`/`t()` over a bundled English registry plus an optional per-locale overlay, `navigator.language` detection with a host override, fail-soft to English then to the raw key) and its source registry `assets/web/l10n/strings-web.ts`; the matching host-side `extension/src/l10n.ts` (`t()` → `vscode.l10n.t()`, `getWebviewL10nMap()` for panel injection) and `extension/src/l10n/strings-host.ts`. Wired `initWebL10n()` as the first step in the web entry point `assets/web/index.js`. Standalone-browser viewer cannot use `vscode.l10n`, so it has its own catalog lookup — see [plans/75-localization.md](plans/75-localization.md). No translation pipeline is run.
- **Manifest localization (plan 75 System A)** — externalized 231 user-facing manifest strings (command titles, view names, settings descriptions, `viewsWelcome` blocks, walkthrough, task descriptions, extension description) from `extension/package.json` into a new `extension/package.nls.json` English source, referenced as `%key%`. Brand strings (`displayName`, the activity-bar title, each command's `category`, the configuration `title` — all "Saropa Drift Advisor") are deliberately left literal so they stay identical in every locale. Added a `verify-nls` parity guard (`extension/scripts/verify-nls.mjs`) — fails the build if a `%key%` lacks an nls entry or an nls key is orphaned — wired into the extension `compile` script. Updated the manifest-validation test to resolve `%key%` placeholders from `package.nls.json` before scanning `viewsWelcome` for command links. Locale files (`package.nls.<locale>.json`) are not added yet; that is a later, deliberate step.
- **Manifest l10n coverage measure + publish audit (plan 75 §2/§5.5)** — added `verify:nls-coverage` (`extension/scripts/nls-coverage.mjs`): measures, per locale, how many manifest values differ from English, regenerates the committed snapshot `extension/src/l10n/nls-coverage-data.ts`, and (with `--check`) fails the build only when that snapshot is stale — it reports coverage, never gates on it. Wired `generate:nls-coverage` / `verify:nls-coverage` scripts and chained the check into `compile`. Added a publish-time manifest l10n audit (`scripts/modules/l10n_audit.py`, wired as Step 11 of the extension publish leg in `scripts/modules/pipeline.py`): it writes a report to `reports/<YYYYMMDD>/<ts>_l10n_manifest_audit.json` and, when a shipped locale has missing/untranslated keys, prompts the maintainer **[I]ignore / [R]retry / [A]abort** (default ignore). It never translates. With no locale bundles today there are no gaps, so it runs silently.
- **Runtime string sweep (plan 75 Phase 3, System B)** — extracted the user-facing English strings rendered at runtime out of the source and into symbolic-key registries, then rewired the call sites to resolve through `t()` (host) / `vt()` (browser). Covered all 46 host-built panel HTML builders (`extension/src/**/*-html.ts`) into ten `strings-panel-*.ts` family slices (787 host keys total, from a 17-key seed) and ~45 standalone web-viewer modules (`assets/web/*.ts`) into nine `strings-web-*.ts` slices (652 web keys total, from an 11-key seed), all registered in `extension/src/l10n.ts` / `assets/web/l10n.ts`. Every string ships **in English in every locale** — this is source-key setup only; no translation pipeline was run. Brand/acronym tokens, machine values (`data-*`, command IDs), CSS, and dev/`console` logs were deliberately left literal; counts and other runtime values are `{0}`/`{1}` tokens (never English concatenation) so a translator can reorder. Updated the source-grep contract tests (`web-inline-edit-contract`, `web-table-def-icons`, `web-table-view-blob-colvis`, host `l10n` map test) to follow the registry indirection rather than pinning literals to the modules they moved out of.
- **Client-script l10n bridge (plan 75 §3.3, closes the Phase 3 tail)** — the strings generated INSIDE embedded panel `<script>` blocks (which have no host `t()`) now localize through the `__VT` bridge. Each of the 9 affected panels (`watch`, `time-travel`, `analysis-compare`, `bulk-edit`, `lineage`, `narrator`, `impact`, `refactoring`, `snippet-library`) injects `const __VT = ${getWebviewL10nMap(['panel.<area>.'])}` plus a tiny `vt()` helper (same `{0}`/`{1}` substitution, fail-soft to key) at the top of its client script, prefix-filtered so only that panel's keys ship. Their ~54 client strings are now keys in the owning `strings-panel-*.ts` slices (counts/times/names as `{0}` tokens, not concatenation; if/ternary + singular/plural variants each keyed). No `// TODO(l10n): client-script string` markers remain at any call site. With this, **every host-panel + web-viewer user-facing string flows through l10n** (English source today; translation is the separate gated step).
- **Browser overlay path wired end-to-end (plan 75 §3.3 / Phase 2)** — the debug server now produces the `window.__SDA_L10N` global the viewer's `initWebL10n()` consumes, closing the gap where the browser translation overlay had no source. On the index request the server resolves a locale (an explicit `?locale=` override — which the VS Code extension now appends from `vscode.env.language` in both Open-in-Browser and the hosted panel's fetch — else the browser's `Accept-Language`, but only when a catalog actually ships for it) and inlines `window.__SDA_L10N={locale,catalog}` BEFORE the bundle, reading the verbatim `assets/web/l10n/web.<locale>.json` (cached per locale; `</script>` escaped). A locale tag is normalized with the same rules as the client (`de-AT`→`de`, `pt-BR`→`pt-br`, `zh-Hant`→`zh-tw`) and hard-allowlisted before any file read. **Inert today** — no translated catalogs ship yet, so every lookup yields English and nothing changes on screen; the moment a `web.<locale>.json` exists it renders with no further code change. Dart: `html_content.dart` (injection), `generation_handler.dart` (locale + catalog resolution); extension: `nav-commands-core.ts`, `panel.ts`.
- **Activation coverage notice (plan 75 §2 / Phase 1 tail)** — because VS Code auto-selects the menu language from the editor display language (the user never picks one), a one-time, per-display-language notice now fires on activation when the editor's menu chrome is mostly untranslated (below 90%), naming the language + percent and reassuring that the data viewer itself is localized. Policy is **notify, not gate** — every locale keeps shipping; the notice is the whole mechanism. Silent for English, for languages outside the translated set, for already-complete locales, and after it has shown once (gated in `globalState`). New `extension/src/l10n/coverage-notice.ts` (pure `evaluateCoverageNotice` decision + `normalizeLocale`, both unit-tested; thin `maybeShowCoverageNotice` vscode shell), wired as the final activation phase; the notice text is a runtime `t()` string so it localizes itself once translations exist. Reads the generated `nls-coverage-data.ts` snapshot — today English-only, so a non-English editor reports 0%.
- **Runtime l10n toolchain + English baseline (plan 75 §4 / Phase 4)** — added `scripts/translate_l10n.py` and the `scripts/modules/l10n/` package that audits, syncs, and (operator-gated) translates the runtime System-B strings, distinct from the manifest audit (`scripts/l10n.py`). `--run-mode audit` classifies every locale bundle (missing / untranslated / identity / brand-mangled / translated-by-engine) and writes a report; `--run-mode sync` builds the host English baseline `l10n/bundle.l10n.json` (721 value-keyed identity entries) and prunes orphan keys from locale bundles; both never translate. Brand shielding (forces `Saropa`/`Drift`/`SQLite`/… verbatim, `<B0>` placeholder swap + validation), per-key provenance with a high/low quality model (untracked = low, so an upgrade pass can find old output), and the `missing`/`gaps`/`low_quality` scopes are ported from the proven Saropa family design. The deliberate `translate` pass is **hard-gated** — it refuses without `--confirm-translate` + a named `--locales` list and performs no machine translation from the repo (plan 75 §7). A publish-time runtime baseline check (Step 11b) reports staleness/orphans without rewriting or translating. Run with no arguments in a terminal for an **interactive menu** — it shows the audit then a numbered action list (audit / sync / translate-gaps / upgrade-low-quality, each with an "all 10 locales" preset and a context-aware default) so no long flag string is needed; the translate options prompt a y/N confirmation. The translate engine is **offline NLLB-200-3.3B** (Meta, via CTranslate2 — the model probed from the shared `\tools\meta_nllb` cache, CUDA when available else CPU, per-string deadline + format-placeholder masking + brand shielding), with **Google Translate as the fallback** when the model is not cached or `SAROPA_SKIP_NLLB=1`; the engine that produced each string is recorded in provenance. Machine translation stays operator-gated and never runs unattended (plan 75 §7). 75 unit tests cover extraction, brands, provenance, scopes, audit classification, sync currency, the circuit breaker, the translate gate, engine selection, CLI dispatch, and the menu.
- **Standalone localization entry point (plan 75 §5.3)** — added `scripts/l10n.py` so the manifest l10n audit can be run on its own, separately from publish: `python scripts/l10n.py` writes a report and prints the per-locale coverage table (exit 0); `python scripts/l10n.py check` exits non-zero when any locale has gaps (pre-publish / CI gate). It reuses the same audit module as the publish step and **never translates** — a machine-translation run stays a separate, gated, operator-run step.
- **Per-row normalization in perf regression detection (A3)** — closes Suggestion #2 from `BUG_perf_regression_false_positives_from_data_quality_probes.md`, deferred from the 2026-04-21 `isInternal` fix. `IPerfBaseline` gained an optional `avgRowCount` (rolling EMA, same 20-sample cap as duration); `PerfBaselineStore.record()` takes an optional third `rowCount` arg so all existing two-arg callers and tests are unchanged. `aggregateQueries` sums result rows per normalized key; `detectRegressions` divides by row count on both sides when both are positive and the baseline has a tracked count, else falls back to the raw ratio; `IRegressionResult` exposes `currentRowCount`/`baselineRowCount`/`rowCountNormalized`; `recordSessionBaselines` and `recordDvrQueriesIntoPerfBaselines` thread the count through. Six new cases in `perf-baseline-store.test.ts`. Finish report appended to the archived bug under `plans/history/2026.04/2026.04.21/`.
- **Reclassify the IDE-only capabilities note as a guide** — the former `plans/74-ide-only-capabilities.md` carried no build work; it only records that go-to-definition, code actions, and data breakpoints are intentionally IDE-only (not website parity gaps). Moved it to `plans/guides/IDE_ONLY_CAPABILITIES.md`, dropped the feature-number/plan framing, and rewrote it as a reference doc: an editor-surface-vs-website table explaining why each is out of reach for the read-only viewer, plus per-capability reopening criteria. Historical references (the archived `GAP_FIT_PLAN.md`, prior changelog entry) keep the old path.

</details>

Paste a query and see it as a diagram: the web viewer's query builder can now turn a `SELECT` you've typed (or pasted) into the multi-table visual graph.

### Added

- **Website: import SQL into the visual builder** — in the debug web viewer's query builder, switch to **Raw SQL**, paste or write a flat `SELECT`, and click **Import to visual builder** to reconstruct it as a multi-table graph (tables, JOINs, selected columns and aggregates, WHERE filters, GROUP BY, ORDER BY, and LIMIT). The builder then re-renders the exact same SQL, so you can keep editing visually and run it against your data. Supports the same query shape the VS Code Visual Query Builder produces (quoted identifiers, `AS` aliases, INNER/LEFT/RIGHT joins on column equality, self-joins, `=`/`!=`/`<`/`>`/`<=`/`>=`/`LIKE`/`IN`/`IS [NOT] NULL`); unsupported constructs (CTEs, `UNION`, subqueries) are reported instead of producing a wrong graph, and a failed parse leaves your current builder untouched. This closes the last gap between the website query builder and the extension's.

<details>
<summary>Maintenance</summary>

- **Single source of truth for query-builder SQL (Feature 21, Phase 1)** — the visual query builder's SQL rendering, validation, literal escaping, WHERE-operator lists, and flat-`SELECT` importer were previously hand-synced between the extension (`sql-renderer.ts`, `sql-import*.ts`) and the web bundle (`query-builder-sql.ts`, `query-builder-import.ts`), so the two could silently diverge and emit different SQL for the same model. Extracted them into self-contained, dependency-free `query-builder-core*.ts` modules (`-core` render/validate/literal, `-core-ops` operator lists, `-core-parse` string primitives, `-core-import` + `-core-import-clauses` parser) that compile into both the extension (tsc) and the web bundle (esbuild). The extension's `sql-renderer.ts`/`sql-import.ts` and the web's `query-builder-sql.ts`/`query-builder-import.ts` are now thin adapters re-exporting or delegating to the shared core; the importer injects a per-surface table factory so the extension keeps its initials aliases + canvas `position` and the web keeps `tN` aliases. Deleted the five now-redundant `sql-import-{utils,from-joins,select-list,where,group-order}.ts` helpers. The shared validator also adds the JOIN-reachability check the web had but the extension lacked (a disconnected table now reports an error instead of producing an un-runnable cross-join SELECT). All 2677 extension tests pass; web typecheck/build clean; an import→render→import→render stability check confirms identical re-rendered SQL.

</details>

---

## [3.7.0]

Two new ways to work with your data over time: a **Time Travel** slider to scrub a table's snapshot history, and **Data Branches** to capture, diff, and restore named snapshots of the whole database like `git stash` for your data. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.7.0/CHANGELOG.md)

### Added

- **Time Travel data slider** — right-click any table in the Database Explorer → **Time Travel** (or run it from the command palette) to open a slider across all captured snapshots of that table. Drag the slider, step with the ◀ ▶ buttons, or press play to animate; each frame highlights rows added (green), removed (red, struck through), and changed (amber, with the exact changed cells marked) versus the previous snapshot. A table picker and 0.5×–4× speed control sit above the grid, and the panel updates live as new snapshots are captured. Built on the existing snapshot history, using each table's real primary key to match rows.
- **Data Branches (git-style)** — capture the whole database as a named branch, then experiment freely and compare. Open **Data Branches** from the Database Explorer toolbar (or "Create Data Branch" from the palette) to capture the current state. Each branch offers **Diff vs Now** (a row-level insert/update/delete view against the live database), **Generate Merge SQL** (differential SQL — forward or the reverse rollback — opened in an editor tab, with deletes ordered children-first so foreign keys are never violated), **Restore** (overwrite the live database with the branch's rows, with an offer to back up the current state first), and **Delete**. Branches persist in the workspace and honor configurable caps (`branching.maxBranches`, `branching.maxRowsPerTable`); a branch that hits the row cap is flagged as truncated so a partial capture is never mistaken for a complete one.
- **Refactoring: extract common column groups** — the schema refactoring advisor now detects column bundles that repeat across two or more tables and suggests defining them once. It recognizes known families — audit/timestamp columns (`created_at`, `updated_at`, …), soft-delete flags, and address blocks (including `addr_*` prefixes) — and tolerates ragged sets where the same bundle appears in slightly different tables, plus any generic group of columns that always appears together. Columns whose type is inconsistent across tables are excluded so an extraction never forces a lossy type decision. Each suggestion opens a migration plan with a shared-table + foreign-key template and a ready-to-use Drift mixin (so per-row metadata like timestamps can reuse definitions instead of being normalized), with the backfill and column drops left as flagged advisory steps. Detection is schema-only and runs no queries against your data.

- **Website: code-declared schema tab** — a new **Code schema** tool in the debug web viewer shows the schema as declared in your Drift code (tables, columns, types, primary keys, nullability), separate from the live SQLite file — useful for spotting drift between code and the running database. It reads a new `GET /api/schema/declared` endpoint, which is served from an optional host callback: apps started with the `startDriftViewer` extension get it automatically (derived from the Drift database), or you can pass a `declaredSchema` callback to `DriftDebugServer.start`. When no schema is supplied the tab shows a short explanation and the endpoint reports `available: false` — never an error. New public types `DeclaredColumn`, `DeclaredTable`, `DeclaredSchema`, and `DeclaredSchemaCallback` support the callback.
- **Website: multiple snapshots** — the debug web viewer's **Snapshot** tool now keeps several snapshots instead of a single slot. Each capture is appended (with an optional label you're prompted for) and listed with its timestamp and table count; rename or delete any one, or clear them all. Two selectors let you diff **any pair** — pick a *From* snapshot and a *To* snapshot, or leave *To* on "now (live DB)" for the classic snapshot-vs-current comparison. Up to 20 snapshots are retained, oldest evicted first. New endpoints back it: `GET /api/snapshots` (list), `GET /api/snapshot/compare?from=&to=` (pairwise; `to` omitted means live), `DELETE /api/snapshot/{id}` (one) alongside the existing clear-all, and `PUT /api/snapshot/{id}` (rename). Older single-snapshot clients keep working — `POST`/`GET /api/snapshot` and the no-argument compare behave as before, now operating on the most recent snapshot.
- **Website: bulk index creation** — the debug web viewer's **Index suggestions** tool now lets you act on suggestions, not just copy them. Each suggestion gets a checkbox (plus a select-all); pick two or more, click **Preview SQL** to see the exact `CREATE INDEX` statements validated server-side (with any rejected ones called out), then **Apply selected** to create them all in one click. Applying is best-effort and reports per-index success or failure, so one bad statement never silently drops the others, and a toast prompts you to re-run Analyze to refresh the list. Apply is shown only when the server was started with writes enabled; otherwise the bar explains it is read-only. Backed by two new endpoints — `POST /api/indexes/preview` (validate only, safe on read-only servers) and `POST /api/indexes/apply` — gated by a dedicated single-`CREATE INDEX` validator so no other SQL can ride along.

### Changed

- **Health Score reacts to the refactoring advisor** — the **Schema Quality** metric now applies a small, bounded penalty (up to 15 points) for high-severity refactoring suggestions you have run but not yet acted on or dismissed in the advisor panel. Each deduction is explained in a detail line on the Schema Quality card, and dismissing a suggestion restores the points on the next score. The penalty is separate from the existing missing-primary-key check, so no issue is counted twice, and databases with no advisor session keep their previous grade unchanged.

<details>
<summary>Maintenance</summary>

- **Modularize files over the 300-line limit** — split the 19 extension source files that exceeded the Step 7 quality-check line cap into cohesive sibling modules along their natural seams, with no behavior change (all 2677 tests pass). Each original file keeps its public exports (moved symbols are re-exported where callers depend on them) so no call sites changed. Highlights: `sql-import.ts` (688) split into per-clause parsers (`sql-import-{utils,from-joins,select-list,where,group-order}.ts`); the refactoring analyzer and plan-builder split into helpers + per-detector / per-plan-type modules; `api-client.ts` split into a `DriftApiClientBase` (HTTP-only/session/DVR) the `DriftApiClient` subclass extends, and `api-client-http-impl.ts` into per-domain endpoint files re-exported from a barrel; the query-builder, DVR, and refactoring panels split their message routing / model-ops / integration handlers into separate files; webview HTML files (`query-builder-html`, `health-html`, `sql-notebook-html`, plus the convention-violating inline `bulkEditHtml`) split their CSS / client JS into dedicated modules; and the activation/command files split out event-wiring and the feature-command registry. Test files are exempted instead of split — the line check now applies a higher cap (`MAX_TEST_FILE_LINES = 500`) to `*.test.ts` while production source stays at 300 (`scripts/modules/constants.py`, `ext_build.py`).
- **Fix missing Code schema tab icon** — the new `declared` ("Code schema") tool added a `TOOL_LABELS` entry but no matching `TOOL_ICONS` entry, so the tab rendered without an icon and the `tab-icons-accent` test failed (every `TOOL_LABELS` key must have an icon). Added `declared: 'code'`.
- **Plan housekeeping** — archived the shipped Mutation Stream plan (`22-realtime-mutation-stream.md` → `plans/history/2026.06/2026.06.10/`), removed the now-redundant `GAP_FIT_PLAN.md` redirect stub from the active tree (its full analysis was already archived and the per-feature plans 71–74 point straight at the archive), and added explicit `## Implementation Plan` headings to `esbuild-ts-migration.md` and `fix-pub-dev-publisher.md` so every active plan presents its plan under one heading.
- **Connection reliability Phase 2 — end-to-end lifecycle test** — added `connection-lifecycle.test.ts`, the full-chain regression net the project never had: wiring → discovery scans → server found → tree loads → command invoked → data appears. It wires the real `DriftApiClient` + `ServerDiscovery` + `ServerManager` + `DriftTreeProvider` + `ConnectionStateMachine` against a stubbed HTTP server, asserts table rows appear at the end, then deliberately breaks each link once (no discovery, failed schema load, unregistered command) and asserts the end state is not reached — so a silent break in any single link fails a test instead of shipping. (Phase 2 of `plans/connection-reliability-ongoing.md`.)
- **Connection reliability Phase 1 — single connection-state authority** — introduced `connection-state.ts` (`ConnectionStateMachine` plus a pure `computeConnectionPhase` / `deriveConnectionContexts` model) as the one place that owns the connection truth and the sole writer of the `driftViewer.serverConnected` and `driftViewer.databaseTreeEmpty` context keys. `isDriftUiConnected`, `buildConnectionPresentation`, and the connection-UI refresh funnel now derive "transport up" from that single model instead of each recomputing their own boolean, so the two long-standing contradictions — "connected but no data" and "disconnected but server running" — are no longer representable. The Database tree exposes a `hasLiveSchema` signal feeding the machine. New `connection-state.test.ts` enumerates all 16 signal combinations and drives the machine through the full disconnected → connecting → connected → offline lifecycle, asserting the flags can never disagree. No behavior change to the tree's always-return-rows workaround. (First structural phase of `plans/connection-reliability-ongoing.md`.)
- **Archive the website-vs-extension gap analysis; split remaining work into per-feature plans** — the parity sweep is complete (all high-impact and quick-win gaps closed on both surfaces), so `plans/GAP_FIT_PLAN.md` moved to `plans/history/2026.06/2026.06.10/` with a short stub left in place. The handful of still-open rows were lifted into standalone, individually trackable plans rather than buried in the archived tables: `71-website-dart-schema-scanning.md` (§5), `72-website-multiple-snapshots.md` (§8), `73-website-bulk-index-creation.md` (§11), and `74-ide-only-capabilities.md` — which reclassifies go-to-definition, code actions, and data breakpoints as intentionally IDE-only rather than unresolved parity gaps. The doc-maintenance backlog (evidence coverage, classification cleanup, parity release gate) retires with the archive.

</details>

---

## [3.6.1]

Spots leftover tables that physically sit in your SQLite file but your Drift schema no longer declares, so you can clean up after old migrations. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.6.1/CHANGELOG.md)

### Added

- **Orphan physical-table check** — flags tables that physically exist in the SQLite file but are not declared anywhere in your Drift schema (typically left behind by a migration whose Drift definition was later removed or renamed). These are invisible to a schema-first audit and silently bloat the database, so the check starts from the physical side: it enumerates the real tables and subtracts the ones your schema declares. Findings appear in `GET /api/issues` (alongside index suggestions and anomalies) and at the new `GET /api/analytics/orphan-tables` endpoint, each naming the exact table and suggesting a `DROP TABLE` you can run by hand. It is report-only and never drops anything. When you start the viewer with `startDriftViewer`, the declared table set is derived automatically from your Drift database; with the callback API, pass the new `declaredTableNames` parameter to enable it. Without a declared set the check stays silent, so it never produces false positives. Android's `android_metadata` bookkeeping table is excluded by default (`lib/src/server/orphan_table_detector.dart`, `lib/src/server/analytics_handler.dart`, `lib/src/server/router.dart`, `lib/src/server/server_context.dart`, `lib/src/start_drift_viewer_extension.dart`, `lib/src/drift_debug_server_io.dart`)

<details>
<summary>Maintenance</summary>

- **Timeline auto-capture: coalesce write bursts into one re-dump** — an open timeline previously re-scanned every physical table (schema metadata + a per-table `SELECT`, a thousand-plus queries) on every detected DB write, and the old leading-edge guard fired that scan on the *first* write of a burst — the worst moment, mid write-storm — while silently dropping the rest, which could leave the panel stale on the final committed write. `SnapshotStore.requestCapture` now applies a trailing-edge debounce: writes within a quiet window (new `driftViewer.timeline.captureDebounceMs`, default 200 ms) reset the timer, so one re-dump runs after the burst settles, reflecting the coalesced final state, and the coalesced count is logged as `timeline: re-dump (coalesced K writes)` (`extension/src/timeline/snapshot-store.ts`, `extension/src/extension-providers.ts`, `extension/src/extension-activation-final.ts`, `extension/package.json`)

</details>

---

## [3.6.0]

The startup banner now shows the exact `adb forward` command and the real bound port for emulator and device debugging, NULL cells in data tables render dimmed (with a display option), and tables-sidebar row counts read as quieter secondary text. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.6.0/CHANGELOG.md)

### Improved

- **Startup banner: emulator/device port-forward hint** — the server startup banner now shows the exact `adb forward tcp:<port> tcp:<port>` command alongside the `http://127.0.0.1:<port>` URL. When the host app runs on an Android emulator or a physical device, the bound port lives in that device's network namespace, so a host browser/viewer cannot reach the printed URL until the port is forwarded — previously "server started" and "viewer offline" looked contradictory with no on-screen guidance (`lib/src/drift_debug_server_io.dart`, `lib/src/server/server_constants.dart`)

### Fixed

- **Startup banner showed the requested port, not the bound port** — when the server was started with `port: 0` (let the OS pick an ephemeral port), the banner printed `http://127.0.0.1:0`; it now prints the actual OS-assigned port so the URL and the new `adb forward` command are copy-pasteable. The default fixed port (8642) was unaffected (`lib/src/drift_debug_server_io.dart`)

### Added

- **Web viewer: dimmed NULL cells with display option** — SQL `NULL` values in data tables now render dimmed (muted + italic) so empty cells are visually distinct from real text; new **Settings → Table Defaults → "NULL display"** lets you switch the label between `NULL` (default) and `-` (`assets/web/_data-display.scss`, `state.ts`, `settings.ts`, `table-view.ts`)

### Changed

- **Web viewer: tables sidebar row counts** — the row count next to each table name is now rendered one step smaller (`--text-xs`) so it reads as secondary metadata, and empty-table counts (`(0)`) are dimmed at 50% opacity so non-zero rows win the eye when scanning the list (`assets/web/table-list.ts`, `assets/web/_sidebar.scss`)

<details>
<summary>Maintenance</summary>

- **Lint hygiene** — appended `--` rationales to `// ignore_for_file` and `// ignore` directives in `lib/src/drift_debug_server_io.dart` to satisfy `document_analyzer_ignore_rationale`
- **Doc headers on flagged-complexity methods** — added concise `///` headers on `_isTextAffinity` (`lib/src/server/cell_update_handler.dart`), `_classifySql` / `_parseTableName` / `_record` (`lib/src/query_recorder.dart`), `_recordEvent` / `_extractWhereClause` (`lib/src/server/mutation_tracker.dart`), and `_migrationColumnMap` (`lib/src/server/compare_handler.dart`) so static-analysis complexity reports surface intent alongside the metric

</details>

---

## [3.5.0]

Query Replay DVR is now available in the extension and server API, so you can record SQL activity during debug sessions and inspect recent queries in a timeline panel. Bulk editing also got a dedicated pending-changes grid in the extension, clearer batch-commit failures, and safer inline edits in the browser viewer when writes are enabled. The extension also adds a Visual Query Builder with optional SQL import and a full **natural-language-to-SQL** flow: after the model answers, you can land the SQL in the notebook, the query builder, a **saved snippet**, a **dashboard SQL widget**, or **query cost**, with an optional starter picker and safer prompts on huge schemas. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.5.0/CHANGELOG.md)

### Added

- **Web debug viewer: multi-table query builder** — on a table tab, choose **Multi-table** next to **Single table** to compose JOINs (FK hints from existing metadata), multi-column `SELECT` with optional aggregates when `GROUP BY` is set, stacked `ORDER BY` clauses, type-aware `WHERE` (including `IN`), and `LIMIT`, with live preview and the same `POST /api/sql` run path as the classic builder (`assets/web/query-builder-sql.ts`, `query-builder-multi.ts`)
- **Visual Query Builder** — compose flat `SELECT` queries against the connected schema (tables, joins, filters, aggregates, `GROUP BY` / `ORDER BY` / `LIMIT`) in a webview with live SQL preview and run; command **Visual Query Builder** (`driftViewer.openQueryBuilder`)
- **Import SQL into Visual Query Builder** — paste or pick generated `SELECT` text and map it back into the visual model where the dialect matches the builder output (best-effort; `WITH` / `UNION` not supported yet); command **Import SQL into Visual Query Builder** (`driftViewer.openQueryBuilderFromSql`)
- **Natural language to SQL (NL-SQL)** — **Ask Natural Language** (`driftViewer.askNaturalLanguage`) and **NL Query History** (`driftViewer.nlSqlHistory`) use OpenAI-compatible chat settings with the API key in **secret storage**. Before calling the LLM you can optionally pick a **starter prompt** from past NL questions, **saved table filters**, and **SQL Notebook run history** (`driftViewer.nlSql.seedSuggestions`); turn that off for a simple single-line prompt instead
- **NL-SQL: where the SQL goes** — after validation, a **QuickPick** sends the generated `SELECT`/`WITH` to **SQL Notebook** (new query tab), **Visual Query Builder**, **Save as Snippet** (with a suggested name), **Add SQL query widget to the dashboard** (`driftViewer.addQueryWidgetToDashboard`), or **Analyze query cost**; the same picker is used when reopening from **NL Query History**
- **NL-SQL: big schemas & follow-on tooling** — schema text for the LLM can follow **Schema Intelligence** when that subsystem started successfully, otherwise live metadata from the server; **table and character caps** (`driftViewer.nlSql.maxSchemaTables`, `maxSchemaContextChars`) keep token-heavy databases from overfilling the prompt. When **Query Intelligence** is active, a successful generation is also **recorded for pattern hints**. If **Saropa Log Capture** is enabled and `performance.logToCapture` is not `off`, each successful NL generation can emit a compact **`nl-query`** JSON line for session logs
- **Query Replay DVR endpoints on the debug server** — added `GET /api/dvr/status`, `POST /api/dvr/start`, `POST /api/dvr/stop`, `POST /api/dvr/pause`, `POST /api/dvr/config`, `GET /api/dvr/queries`, and `GET /api/dvr/query/:sessionId/:id` with versioned envelopes and ring-buffer window metadata for robust client pagination/error handling; status now reports buffer size and before/after capture flags when supported; `POST /api/sql` accepts optional `args` / `namedArgs` for DVR-declared bindings (JSON-safe normalization); write `affectedRowCount` uses SQLite `changes()` when `writeQuery` is configured; optional `queryWithBindings` / **`writeQueryWithBindings`** on `DriftDebugServer.start` for read/write host callbacks that accept declared bindings (HTTP write paths still pass SQL strings until extended); VM Service `ext.saropa.drift.runSql` accepts the same read bindings as flat JSON strings (`args`, `namedArgs`)
- **Query Replay DVR panel + commands in the extension** — added `driftViewer.openDvr`, `driftViewer.dvrStartRecording`, and `driftViewer.dvrStopRecording`, plus a DVR webview with filters, semantic search over row snapshots, timeline stepping (buttons + Home/End/arrows), selection detail (`/api/dvr/query`), JSON export, SQL editor / **SQL Notebook** / **Query Cost** actions, a **status bar** DVR indicator, auto-refresh when schema generation changes, and start/pause/stop/refresh controls; DVR refresh feeds **Query Intelligence** when active and optionally merges DVR timings into **perf baselines** (`driftViewer.perfRegression.recordBaselinesFromDvr`, optional `warnOnDvrPanelRefresh`); toolbar **Snapshot diff** runs `driftViewer.showSnapshotDiff`; **Schema rollback…** runs `driftViewer.generateRollback`
- **Debug lifecycle auto-record wiring** — extension now auto-starts DVR recording on Dart/Flutter debug session start (configurable) and attempts to stop recording on debug-session termination
- **Bulk Edit panel grid** — `driftViewer.editTableData` opens a dashboard-style webview with a paged grid of pending cell changes, redo support, the same preview/apply/discard flows as before, **keyboard navigation** on the pending-changes grid (focus the grid with Tab, move selection with arrows, Enter opens the table viewer, Escape clears selection), and toolbar links to **Data invariants**, **Paste from clipboard**, **Query DVR**, and **Capture DB snapshot** (runs `driftViewer.captureSnapshot` as a safety net before destructive work until full plan-37 data branching exists)
- **Anomaly Detection → bulk edit** — the anomalies webview adds **Bulk edit table…** to pick a single-PK table and jump straight into the bulk edit dashboard
- **Batch apply failure detail** — when `POST /api/edits/apply` fails on one statement in a transaction, the error JSON can include `failedIndex` and `failedStatement`; the extension surfaces formatted messages plus **Preview SQL** and **Copy Failed SQL** actions on commit errors
- **Web viewer inline editing (v1)** — when `/api/health` reports writes enabled and the table has a single-column primary key, you can double-click a cell for explicit Save/Cancel (no blur commit), delete a row with confirmation, and get a leave-page prompt if a cell edit is still open; the row highlights when your draft differs from the loaded value, failed saves offer **Retry save** and **Reload table**, and failed deletes can reload the grid from a confirm dialog
- **Schema refactoring suggestions (Feature 66)** — **Suggest Schema Refactorings** (`driftViewer.suggestSchemaRefactorings`) opens a panel that analyzes the connected schema (normalization, wide-table split hints, overlap-based merge hints), shows advisory migration steps, and can copy SQL or Dart snippets; **Open Refactoring Advisor (External Hint)** (`driftViewer.refactoringOpenWithHint`) opens the same panel with a hint banner for table/column context; toolbar links for **Generate migration**, **Schema diff**, migration preview, and ER diagram; also available from the Database view toolbar when a server is connected
- **Refactoring Phase 3 integrations** — migration preview accepts an optional appended advisory SQL block; ER diagram command accepts optional table focus; NL-to-SQL accepts a pre-filled question; health score webview shows the last refactoring session summary (including dismiss count) and **Schema Quality** metric text can include advisor session lines when you refresh the health panel after analyzing refactorings

<details>
<summary>Maintenance</summary>

- **Cross-stack API typing for DVR** — added DVR envelope/status/query/page types in `extension/src/api-types.ts` and HTTP/client transport methods in `extension/src/api-client-http-impl.ts` and `extension/src/api-client.ts` to keep server/extension contracts aligned
- **DVR integration tests** — extended `test/handler_integration_test.dart` to validate DVR route availability, basic recording flow, `POST /api/dvr/config`, wrong-session lookups, `POST /api/sql` declared `args`/`namedArgs` on DVR entries, and structured `QUERY_NOT_AVAILABLE` behavior; added `test/query_recorder_test.dart`, `test/dvr_bindings_test.dart`, and extension contract/search tests for DVR JSON parsing and semantic search; golden JSON fixtures under `extension/src/test/fixtures/dvr/` (envelope, status, recorded row, `QUERY_NOT_AVAILABLE`, legacy `rowCount`, missing `params`); `extension/src/test/dvr-perf-baseline.test.ts` for DVR → baseline helpers
- **DVR write snapshots** — when `writeQuery` uses the mutation tracker, DVR write entries can include the same best-effort before/after row snapshots as `/api/mutations` (still subject to `captureBeforeAfter` and ring-buffer limits)
- **Bulk edit / edits-apply hardening** — `EditsBatchHandler` wraps per-statement failures in `BatchApplyStatementError`; `test/handler_integration_test.dart` covers semicolon-chained statement rejection and failure payload keys; extension tests cover PK gates, HTTP client error parsing, bulk panel HTML, and web inline-edit contract strings
- **Bulk apply session log + timeline** — after a successful pending-edit batch apply, the extension appends one timestamped line to the Drift Advisor output channel and triggers an immediate **snapshot capture** (debounce bypass) so the **Drift Database** VS Code timeline row-count history updates right away; DVR write capture for each statement remains unchanged
- **Refactoring engine extension tests** — added `extension/src/test/refactoring-analyzer.test.ts` and `refactoring-plan-builder.test.ts` for analyzer heuristics and plan templates
- **Refactoring Phase 3 modules** — `refactoring-advisor-state.ts` and `refactoring-nl-bridge.ts` for workspace session persistence and NL-SQL seed prompts
- **Query builder import** — `extension/src/query-builder/sql-import.ts` parses `FROM`/`JOIN`/`WHERE`/`GROUP BY`/`ORDER BY`/`LIMIT` segments using successive clause boundaries so `LIMIT` is not swallowed into `WHERE` or the `FROM` clause; covered by `extension/src/test/sql-import.test.ts` with renderer round-trips
- **Web query builder SQL layer** — `assets/web/query-builder-sql.ts` mirrors extension `sql-renderer` validation/rendering (join connectivity, `GROUP BY` / aggregate rules) so the browser preview matches execution; `npm run typecheck:web` covers the new modules

</details>

---

## [3.4.1]

Publish-pipeline bug report refreshed (no change to the shipped Dart package or extension behavior in this tag). [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.4.1/CHANGELOG.md)

<details>
<summary>Maintenance</summary>

- **`bugs/PROBABLE_marketplace_failure_blocks_open_vsx_publish.md`** — verified against `scripts/modules/ext_publish.py` (`_run_publish_steps`): added line-level citations for the Marketplace failure path that returns before Step 14 (Open VSX), tightened repro steps, and replaced a Windows-only `rg` example with repo-root commands

</details>

---

## [3.4.0]

No more bogus "potential outlier" warnings on `lastModified` / `last_seen` style timestamp columns, and every anomaly and missing-index suggestion now appears exactly once in the Problems panel instead of twice. Outlier messages also now tell you how many rows were sampled. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.4.0/CHANGELOG.md)

### Fixed

- **Anomaly false positive on `lastModified` / `last_seen` / `last_accessed` style timestamp columns** — the data-quality scanner was firing a *"Potential outlier in \<table\>.last_modified: max value … is 4.1σ from mean …"* on any Drift table whose `DateTimeColumn get lastModified` had been written to a few times within the same day. The prior skip pattern covered `^created` / `^updated` / `^deleted` / `^modified` prefixes but nothing starting with `last_`, so Drift's canonical `lastModified` (serialized as `last_modified` in SQLite) fell straight through to the 3σ check. On a ~17-hour window σ is tiny by construction and the newest write always sits many σ above the mean — the "outlier" is just "the row we just wrote." The timestamp-skip pattern in `AnomalyDetector._detectNumericOutliers` now matches `last_modified`, `last_seen`, `last_accessed`, `last_used`, `last_sync`/`last_synced`, `last_refresh`/`last_refreshed`, `last_login`/`last_logout`, `last_activity`/`last_active`, `last_read`/`last_written`, `last_opened`/`last_viewed`/`last_played`, `last_fetch`/`last_fetched`, `last_heartbeat`/`last_ping`, `last_visit`/`last_visited`, `last_check`/`last_checked`, `last_poll`/`last_polled`, `last_scan`/`last_scanned` — in both snake_case and camelCase, without widening to generic `^last_.*` (which would have swallowed `last_name` / `last_ip`). Reported in [plans/history/2026.04/2026.04.22/BUG_anomaly_false_positive_tight_timestamp_range.md](plans/history/2026.04/2026.04.22/BUG_anomaly_false_positive_tight_timestamp_range.md)
- **Potential outlier diagnostic now reports sample size** — the message now ends with `n=<sampleCount>` (e.g. *"… (range [1.0, 999.0], n=37)"*) alongside the existing min/mean/max/σ numbers. The minimum sample-size guard (`n ≥ 30`) filters the worst low-`n` false positives, but sigma estimates are still wide between ~30 and ~100 samples and the reader has no way to tell how big the n actually is from the old message. Surfacing it lets "4.1σ at n=35" be treated as weaker evidence than the same value at n=5000 without having to go query the table. Covers suggested fix #5 in the same bug report
- **Duplicate diagnostics — same anomaly and same index suggestion shown twice per file** — every anomaly (null counts, empty strings, potential outliers, orphaned FKs) AND every missing-index suggestion was being published through two separate VS Code `DiagnosticCollection`s inside the extension: the legacy `drift-linter` collection (via `src/linter/schema-diagnostics.ts` → `mergeServerIssues`) and the newer `drift-advisor` collection (via `src/diagnostics/providers/schema-provider.ts` calling `checkAnomalies` + `checkMissingIndexes`). Users saw two Problems-panel entries per issue with different owners, different line numbers for anomalies (class header vs column getter), and — for index suggestions — different codes (`index-suggestion` vs `missing-fk-index` / `missing-id-index`). The entire legacy pipeline has been retired: `src/linter/schema-diagnostics.ts`, `src/linter/issue-mapper.ts`, the `drift-linter` diagnostic collection, the `SchemaDiagnostics` class, and the `DriftCodeActionProvider` are all deleted. The new `DiagnosticManager` pipeline is now the single source of these diagnostics: anomaly warnings land on the column-getter line (with a class-header fallback when the column can't be resolved), index suggestions land on the column line, and the `Copy CREATE INDEX SQL` quick-fix that previously lived on the legacy provider is already wired on `SchemaProvider.provideCodeActions` keyed on the new codes. The `driftViewer.runLinter` command, the VM-disconnect diagnostic clear, and all activation-time refreshes now dispatch to `DiagnosticManager` directly. Reported in [plans/history/2026.04/2026.04.22/BUG_anomaly_false_positive_tight_timestamp_range.md](plans/history/2026.04/2026.04.22/BUG_anomaly_false_positive_tight_timestamp_range.md) (Bug 2 — duplicate emission)

<details>
<summary>Maintenance</summary>

- **`error_logger.dart`: `// ignore: avoid_print` directives now carry rationales** — the analyzer's `document_ignores` rule was flagging three bare `// ignore: avoid_print` lines in `lib/src/error_logger.dart` (lines 68, 116, 119) as info-level diagnostics. Each directive now appends ` -- intentional console output so logs/errors/stack traces are visible without DevTools`, so future readers see why `print` is deliberate here (structured `developer.log` alone is invisible in the standard Flutter console)
- **Legacy `linter/` module deleted** — `extension/src/linter/schema-diagnostics.ts`, `extension/src/linter/issue-mapper.ts`, and their test files have been removed. `SchemaDiagnostics` and `DriftCodeActionProvider` are gone; `ProviderSetupResult.linter` is gone; `IDebugCommandDeps.linter` is now `diagnosticManager: DiagnosticManager`; `registerNavCommands` takes `DiagnosticManager` instead. Callers that previously invoked `linter.refresh()` / `linter.clear()` now dispatch to `DiagnosticManager`, which was already being called next to every legacy-linter call site. Disposable count in `extension.test.ts` updated from 199 → 197 (the `drift-linter` DiagnosticCollection and its `DriftCodeActionProvider` registration are the two that went away; the unified `drift-advisor` collection still lives and is owned by `DiagnosticManager`). `CommandRegistrationDeps.diagnosticManager` is a `Partial<DiagnosticSetupResult>` so the `setupDiagnostics`-throws resilience test still passes: when diagnostics failed, command handlers see a no-op fallback (`refresh → resolved promise`, `clear → noop`) rather than crashing

</details>

---

## [3.3.5]

Sidebar tables list is easier to read at a glance, clicking a history entry actually takes you to the Run SQL tab, the theme picker is no longer see-through, and the three always-on tools now live as toolbar icons above the tab bar instead of fighting for space with your open tabs. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.3.5/CHANGELOG.md)

### Fixed

- **Sidebar tables: name vs count readability** — in the sidebar's Tables list, the grey row count had been rendering with more visual weight than the table name itself, making the name hard to pick out at a glance. The two colors are now swapped so the table name wins the eye and the count recedes
- **Sidebar tables: unpin icon hidden until hover** — the faint pin/unpin button sat visible on every unpinned row at rest, adding a column of low-level noise down the sidebar. It is now hidden on unpinned rows and only appears when you hover the row (or focus it via keyboard). Pinned rows keep the icon visible so the pinned state is still obvious, and touch devices still see it since hover isn't available there
- **History sidebar: clicking an entry now opens the Run SQL tab** — previously, clicking a query in the History sidebar populated the hidden `#sql-input` editor but left you on whatever tab you were on (Tables, Schema, etc.), so the click looked like it did nothing. The handler now switches to the Run SQL tab first, then drops focus into the editor, so the loaded query is visible immediately and ready to edit / re-run
- **History sidebar: second collapse control removed** — the history heading had a down-chevron that toggled the inner list independently of the sidebar itself, creating two ways to “collapse history” that didn’t agree with each other. The chevron is gone; the right-hand toolbar icon (`⇥`) is now the only collapse affordance, mirroring how the tables sidebar already works
- **Theme menu: flyout no longer reads as “a menu under another menu”** — on Showcase and Midnight the theme dropdown was at 15% opacity, so the toolbar icons behind it bled right through and the whole thing looked like two stacked menus. The flyout is now opaque (92% alpha on the tinted themes) and its `z-index` has been raised above the tab-panel chrome so it can’t be clipped by panels that establish their own stacking context
- **Theme menu: double-fire on selection removed** — `.tb-theme-option` clicks had two listeners attached (one from `initThemeListeners`, one from `initToolbar`). Both applied the theme, but only the toolbar one closed the flyout, so the submenu looked “locked” after the first click. Theme-option wiring now lives only in `initToolbar`; `initThemeListeners` only watches the OS `prefers-color-scheme` change
- **Toolbar icons: middle-aligned in the toolbar row** — 2 rem icon buttons were top-aligned against the 2.75 rem tab row because the flex container used `align-items: stretch` and mixed-height children default to flex-start when stretch can’t apply. The new `#toolbar-bar` sets `align-items: center` and `.tb-icon-btn` pins `align-self: center` as a belt-and-braces guard

### Changed

- **Toolbar split: Tables / Search / Run SQL are now toolbar icons, not fixed tabs** — the three “always-present” tabs used to share the tab row with the rest of the toolbar icons, which meant that opening several table tabs pushed the tools around and the permanent tabs took a lot of horizontal space for labels. Those three are now icon-only launchers in a dedicated top row (`#toolbar-bar`), alongside every other tool. The tab row (`#tab-bar`) below it holds only the tabs you have actually opened. On first load the Tables tab is auto-opened so you still land on the familiar browse view; closing it leaves the Tables panel visible but with no pinned tab, and clicking the Tables icon again re-creates a closeable tab
- **Run SQL: Run button moved beneath the editor** — the primary Run button used to live in the template toolbar above the textarea, visually detached from the query body it executes. It now sits on its own row directly below the editor so it's the natural next action after typing
- **Run SQL: icons added to every toolbar button** — Apply template, Save, Del, Export, Import, Ask in English…, and Run now carry Material Symbols icons (post_add, bookmark_add, delete, download, upload, smart_toy, play_arrow) matching the conventions used elsewhere in the viewer's toolbars
- **Run SQL: empty dropdowns are dimmed** — when a dropdown is still on its placeholder entry (“— Saved queries —”, “— Recent —”, “—” for Table / Fields), it now renders at 55% opacity so the eye skips over unused controls and lands on filled ones. The dim lifts automatically the moment you pick a real value
- **Run SQL: inline “Recent” dropdown replaced with a history icon button** — the old `History:` / `Recent:` label + `<select>` looked like a form input waiting for a value, and the em-dash placeholder read as empty. It also duplicated what the right-hand History sidebar already shows (with more detail: full SQL, duration, rows, timestamp, source badge), which after the previous fix even opens the Run SQL tab on click. The inline dropdown is gone; in its place is a single icon button (Material `history` glyph) that toggles the History sidebar open/closed — same behavior as the toolbar-level history toggle, so both controls stay in sync

---

## [3.3.4]

No more spurious "14 query regression(s) detected" warnings at the end of every debug session — the extension's own diagnostic probes are no longer mistaken for your app's slow queries. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.3.4/CHANGELOG.md)

### Fixed

- **Perf-regression false positives from the extension's own diagnostic probes** — every debug session ended with a warning of the shape *"Drift: 14 query regression(s) detected: SELECT SUM(CASE WHEN "id" IS NULL THEN …): 55ms vs baseline 6ms (9.17x)"* even when the app's own queries were unchanged. The SQL was not written by the user at all — it was the extension's own null-count scan from `DataQualityProvider`, `scoreNullDensity` in health metrics, and the column profiler, running over tables whose row counts differed from the prior session. The regression detector was comparing these probes against baselines it had captured from itself on a prior run, producing one false warning per probed table per session. The `sql()` client now accepts `{ internal: true }` and plumbs it through POST `/api/sql` (and the VM-service `runSql` RPC) so the server tags those timings as `isInternal: true`; `detectRegressions` skips internal entries in both the compare pass and the baseline-recording pass so internal probes neither fire false warnings nor poison future baselines. Raising `driftViewer.perfRegression.threshold` no longer required as a workaround

<details>
<summary>Maintenance</summary>

- **Publish script: Marketplace propagation failure now points to the publisher page** — when the final Step 16 store-propagation check times out for the VS Code Marketplace, the warning now includes the publisher management URL (`marketplace.visualstudio.com/manage/publishers/Saropa`), the public listing URL, and the absolute path to the packaged `.vsix` so the user can upload it manually in one click instead of hunting for the file. Open VSX and pub.dev timeouts also emit store-specific guidance. Implemented in `scripts/modules/store_propagation.py` (per-store `pending` set) and `scripts/modules/ext_publish.py` (passes `vsix_path` through); new `MARKETPLACE_PUBLISHER_URL` constant added in `scripts/modules/constants.py`
- **Lint cleanup: `prefer_return_await` + `depend_on_referenced_packages`** — removed redundant `Future<T>.value(...)` wrappers in two `async` branches of `vm_service_bridge.dart` (the async function already wraps the return value, so the explicit wrapper both added noise and tripped the lint); converted four self-referential `package:saropa_drift_advisor/...` imports inside `lib/` to relative paths in `drift_debug_server_io.dart`, `server/import_handler.dart`, `server/router.dart`, and `server/session_handler.dart` (a package cannot list itself in its own pubspec dependencies, so the self-import tripped `depend_on_referenced_packages`)
- **Lint cleanup: `avoid_null_assertion` on regex group access in `server_context.dart`** — replaced `match.group(1)!` / `match.group(2)!` in `_parseCallerFrame` with `?? ''` fallbacks, and gated the file check on `file.isEmpty`. The regex literal guarantees both groups are non-null on a successful match today, so behavior is unchanged; the fallback removes a silent crash site if the pattern is ever edited. Related upstream bug filed against `saropa_lints` (`avoid_null_assertion_false_positive_regex_match_group.md`) — the rule should recognize `RegExpMatch.group(N)!` as a safe pattern.

</details>

---

## [3.3.3]

Removed the noisy "Drift server not reachable" diagnostic that stuck around whenever your Flutter app wasn't actively running in debug mode — connection state lives in the tree view and panel now, not in your Problems list. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.3.3/CHANGELOG.md)

### Removed
- **"Drift server not reachable" diagnostic** — the proactive connection-health check fired whenever your Flutter app wasn't running in debug mode (i.e. most of the time), producing a permanent, low-value Information diagnostic that couldn't be distinguished from real issues. The tree view and panel already reflect live connection state, so the editor diagnostic was noise. Connection state is now surfaced only through the tree view / panel.

<details>
<summary>Maintenance</summary>

- **Publish script: vsce login limited to 3 attempts** — when the Marketplace credential store is unavailable, the script now prompts for the PAT up to 3 times and passes it non-interactively, instead of letting `vsce login` re-prompt indefinitely
- **Removed connection-error diagnostic path** — deleted `connection-checker.ts`, the `connection-error` code, the `'connection-error'` event type, `RuntimeEventStore.hasRecentConnectionError`, `RuntimeProvider.recordConnectionError`, and the connection-error Quick Fix actions (Retry Connection / Don't Show / Open Settings). Tests updated.

</details>

---

## [3.3.2]

The extension sidebar and "Get Started" welcome screen no longer show up in Flutter/Dart projects that don't actually use Drift. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.3.2/CHANGELOG.md)

### Changed
- **VS Code minimum version bumped to 1.115.0** — aligns `engines.vscode` with the `@types/vscode` typings to fix `.vsix` packaging errors

### Fixed
- **Extension sidebar no longer appears in non-Drift projects** — the Database Explorer, Drift Tools, and activity bar icon are now hidden in workspaces that don't declare `drift` or `saropa_drift_advisor` in pubspec.yaml. Previously, the "Get Started" welcome screen appeared in every Flutter/Dart project regardless of whether it used Drift.

---

## [3.3.1]

Added a real security policy so vulnerabilities can be reported privately through GitHub Security Advisories. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.3.1/CHANGELOG.md)

<details>
<summary>Maintenance</summary>
- **SECURITY.md** — replaced GitHub default template with a real security policy: private reporting via GitHub Security Advisories, response timeline commitments, scope definition, and coordinated disclosure terms

</details>

---

## [3.3.0]

Brand-new Settings panel for persistent preferences, a right-side History sidebar showing every query the server has run, and every tool launcher is now a visible icon in the tab bar instead of buried in a hamburger menu — plus Showcase and Midnight finally got the glassmorphism overhaul they were always supposed to have. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.3.0/CHANGELOG.md)

### Added

- **Settings panel** — new Settings tool tab (accessible from the hamburger menu gear icon) lets users configure persistent preferences: SQL history max entries, max saved analyses, default page size, default display format, show-only-matching-rows toggle, slow query threshold, auto-refresh polling, epoch timestamp auto-detection, and navigate-away confirmation; all preferences persist to localStorage and take effect immediately without a page reload; includes "Clear all stored data" (removes project-specific data while keeping theme/sidebar preferences) and "Reset all to defaults" actions
- **Binary size disclosure in README** — added a paragraph in "How it works" clarifying that this package adds zero bytes to release builds when gated on `kDebugMode`, has zero runtime dependencies, and never compiles web UI assets into the binary
- **History sidebar** — new collapsible right-side sidebar shows all SQL query execution history from the server's ring buffer; each entry displays a source badge (Browser / App / Internal), truncated SQL preview, duration, row count, and relative timestamp; filter buttons let you toggle between All, Browser, App, and Internal queries; clicking an entry loads its SQL into the SQL runner input; dedicated `GET /api/history` and `DELETE /api/history` endpoints power the sidebar with the full timing buffer (up to 500 entries) and a computed `source` field derived from caller stack-frame analysis
- **Inline toolbar replaces hamburger menu** — all tool launchers (Snapshot, DB diff, Index, Schema, Diagram, Size, Perf, Health, Import, Export, Settings) are now visible as icon buttons in the tab bar row instead of hidden behind a dropdown; sidebar toggles sit at the edges (left for Tables, right for History); Mask, Theme (flyout picker), and Share are right-aligned; active tool tabs are highlighted on their toolbar icon
- **Collapsible results table** — the data table and status bar are now wrapped in a `▲ Results` expander (matching the existing Table definition and Query builder toggles) so users can collapse the grid and focus on the query builder or definition; heading shows the current row count for context when collapsed
- **Visual / Raw SQL toggle in query builder** — a pill-style toggle above the query builder switches between the existing form controls (Visual) and a free-text SQL textarea (Raw SQL); switching to Raw pre-fills the textarea with the current visual builder query so the user can refine it; both modes share the same Run / Reset buttons and inline results
- **Inline cell edit context and validation** — double-click cell editing now shows a context bar (PK identity, column name, type, nullable) and the original value above the input; client-side format validation checks number, integer, and boolean formats on each keystroke with a red-border + inline error message instead of `alert()` dialogs; validation errors keep the editor open so the user can fix and retry
- **Double-click tab to close others** — double-clicking any tab in the tab bar prompts to close all other closeable tabs, making it quick to declutter when many tables or tools are open
- **Tab icons and per-type accent colors** — every tab type now shows a unique Material Symbols icon (e.g. table_chart for Tables, search for Search, terminal for Run SQL, etc.); on the Midnight and Showcase themes, each tab type also gets a unique accent color for the top border and text when active, replacing the single link color so tabs are visually distinct at a glance

### Improved

- **Showcase and Midnight glassmorphism overhaul** — the tab bar, data table, SQL editor, and sticky table headers now use translucent frosted-glass surfaces with `backdrop-filter`, so the animated body gradient (pastel aurora for Showcase, deep aurora for Midnight) is visible through every major UI surface instead of being hidden behind opaque backgrounds; Midnight's CSS variables (`--surface`, `--header-bg`, `--sidebar-bg`, `--bg-pre`) changed from opaque hex to translucent rgba so all elements automatically participate in the aurora bleed-through; tab bar gets a slide-in entrance animation matching the header; pinned columns and sticky headers use heavier frost for readability; scattered data-table glassmorphism overrides consolidated into the per-theme SCSS partials

### Changed

- **Hamburger menu — Themes submenu** — replaced the single-click theme cycle button with a full submenu listing all four themes (Light, Showcase, Dark, Midnight) with a checkmark on the active selection
- **Hamburger menu — sliding toggle switches** — Sidebar visibility and PII Mask now use sliding boolean switches instead of text-swapping buttons and checkboxes
- **Hamburger menu — layout polish** — section headings use a smaller font with tighter bottom padding; a divider separates Mask from Share for clearer visual grouping

<details><summary>Maintenance</summary>

- **Upgraded `saropa_lints`** from `^11.1.0` to `^12.0.1`; `dart_style`, `analyzer`, and related packages remain pinned below their latest versions because `analyzer ^12.0.0` conflicts with the Flutter SDK's `meta` constraint
- **Pre-commit Dart format gate** — added `dart format --set-exit-if-changed .` to the Husky pre-commit hook so formatting issues are caught locally before they reach CI; mirrors the GitHub Actions format check step

</details>

---

## [3.2.2]

New setting lets you suppress specific diagnostic rules on specific tables, and several false-positive anomaly / slow-query warnings on bounded rating columns and internal probes are gone. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.2.2/CHANGELOG.md)

### Added

- **Per-table diagnostic suppression** — new `driftViewer.diagnostics.tableExclusions` setting lets users suppress specific diagnostic rules on specific tables while keeping those rules active elsewhere; for example, suppress `no-foreign-keys` on tables that deliberately use UUID soft references without disabling the rule project-wide

### Fixed

- **Slow-query false positives from extension-internal probes** — the extension's own change-detection `COUNT(*)` queries (used to fingerprint table row counts) were recorded in the performance timeline and reported as user-application slow-query warnings; these internal probes are now tagged with `isInternal` and excluded from slow-query diagnostics, aggregate stats, and query patterns so only genuine application queries trigger warnings
- **False-positive anomaly on bounded ratings** — outlier detection no longer flags values at the boundary of known bounded scales (0–5, 0–10, 1–10, 0–100). A TV rating of 1.0 on a 1–10 scale is rare but valid, not a data anomaly
- **Rating/score/percent column skip** — columns matching `rating`, `score`, `percent`, or `pct` are now excluded from sigma-based outlier detection, since bounded-scale data is inherently non-Gaussian

---

## [3.2.0]

All ten toolbar buttons and the floating action button are now a single hamburger menu, the SQL editor auto-runs EXPLAIN as you type and shows an index report, and every theme got a beautification pass with consistent tokens, frosted tables, and fewer invisible borders. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.2.0/CHANGELOG.md)

### Added

- **Bug report guide** — added `bugs/BUG_REPORT_GUIDE.md` with a comprehensive template and checklist for filing useful bug reports
- **Project name in masthead pill** — "Saropa Drift Advisor" now appears between the logo and version badge, making the product identifiable at a glance
- **Template lock toggle** — lock icon in the Run SQL toolbar; when locked (default), changing table or field selections auto-applies the current template
- **Auto-explain with index report** — the SQL editor now automatically analyzes query plans as you type (1.2 s debounce), showing estimated cost, which indexes are used vs available, and flagging full-scan tables with no indexes

### Changed

- **Hamburger menu replaces toolbar and FAB** — the 10-button toolbar row and the floating action button are consolidated into a single hamburger menu (☰) at the left edge of the tab bar; tools are grouped by purpose (Snapshots & Comparison, Performance Analysis, Schema Tools, Import/Export) with labeled sections; app-wide settings (sidebar toggle, theme cycle, PII mask, share) sit below a heavy divider; reclaims an entire row of vertical space and eliminates the FAB overlay

### Fixed

- **Theme contract tests fail in CLI but pass in IDE** — `extractBlock` test helper matched compound selectors like `body.theme-dark ::-webkit-scrollbar-thumb` before the real variable-defining block; now skips blocks that don't contain CSS custom properties
- **Publish pipeline aborts on test failure with no recovery** — extension and Dart test steps now prompt skip/abort on failure (matching the existing lint step pattern) so a known failure doesn't force a full pipeline restart
- **Publish pipeline prompt defaults** — target selection defaults to option 1 on Enter; "Continue with uncommitted changes?" defaults to Y
- **Publish pipeline git operations hard-abort without asking** — every git failure (add, commit, push, tag) now prompts skip/abort instead of silently ending the script; "nothing to commit" is auto-recovered as success
- **Outlier false positive on external ID columns** — numeric outlier detection now skips identifier columns (`*_id`, `*Id`, `*_key`, `*Key`, `*_code`, `*Code`) and primary key columns, since external IDs are opaque identifiers not drawn from a normal distribution; also adds a minimum sample size guard (n < 30) to prevent unreliable sigma estimates from flagging small datasets
- **Empty-string false positive on columns with empty-string default** — the anomaly detector no longer flags empty strings when the column's schema declares `withDefault(const Constant(''))`, since those values are the designed "no value" sentinel, not data quality problems
- **PII mask toggle now works and gives visible feedback** — toggling the MASK checkbox immediately re-renders tables and search results without a page refresh; a bright "MASKED" badge appears in the masthead pill so the user always knows when masking is active
- **Expanded PII column detection** — the mask heuristic now recognizes many more column names as sensitive: `name`, `first_name`, `last_name`, `username`, `salary`, `credit_card`, `ip`, `dob`, `passport`, `license`, `city`, `zip`, `latitude`/`longitude`, and dozens more; previously only 9 patterns were checked; short words like `tel` and `name` use word-boundary matching to avoid false positives on `hotel` or `filename`

### Improved

- **Unified table grid styling across all panels** — Search, Run SQL, and Query Builder now share the same table formatting as the Tables panel (borders, alternating rows, hover highlight, copy-on-hover, column context menu, drag-to-reorder, double-click cell popup)
- **Theme beautification pass** — all four themes overhauled for contrast, visibility, and visual identity:
  - **Light**: opaque borders (`#c2cde0`) replace invisible rgba hairlines; `--muted` darkened to `#556685` for WCAG AA; card shadows strengthened for visible depth
  - **Dark**: borders lightened to `#4a4d52` for visibility against dark backgrounds
  - **Showcase**: gradient stops changed from near-white to saturated pastels (lavender, pink, peach, sky) so frosted-glass surfaces actually show the moving gradient behind them; surface opacity lowered and blur strengthened; white frost-edge borders; frosted tab panels and data tables
  - **Midnight**: aurora gradient widened from monochrome navy to indigo/teal/purple shifts; primary orb raised from 8% to 18% opacity; second warm-purple orb added; surface opacity lowered so aurora bleeds through; expanded card periwinkle glow halo now visible; input focus glow ring added; frosted tab panels and data tables
  - **All themes**: entrance animations strengthened (12px translate); per-file hardcoded rgba border overrides replaced with `var(--border)` tokens
- **Global UI polish** — systematic beautification across all partials:
  - **Spacing tokens** (`--space-1` through `--space-12`): 4px geometric scale added to `:root`; migrated into tab panels, query builder, and pagination
  - **Global form controls**: centralized input/select/textarea styling in `_base.scss` with consistent border-radius, padding, and theme-aware focus rings (`--focus-ring-color` per theme); removed duplicated focus ring rules from `_search.scss` and `_sql-editor.scss`
  - **Custom scrollbars**: thin, theme-tinted scrollbars for Firefox (scrollbar-width/color) and Chromium (::-webkit-scrollbar) across all themes
  - **Text selection**: theme-aware `::selection` color matching each theme's accent
  - **Tab bar**: active tab gets 2px colored top accent bar and bold weight; close button visible at rest (opacity 0.4) instead of hidden
  - **Buttons**: secondary buttons get subtle shadow for depth; `.btn-danger` uses `--radius-md` token (was hardcoded 4px) with hover glow; toolbar buttons lift on hover (`translateY(-1px)`)
  - **Sidebar**: pin button visible at rest (opacity 0.3) instead of invisible
  - **Masthead**: status button gets subtle pill background so it reads as interactive
  - **Data table**: header row gets 2px bottom border for clear separation; scroll container gets stronger shadow and per-theme frosted glass treatment
  - **Pagination**: "Advanced" toggle gets visible border/background (was invisible text)
  - **Query builder**: hardcoded `border-radius: 3px/4px` replaced with `--radius-sm` token; spacing uses `--space-*` tokens

### Changed

- **Removed project logo from tab bar** — the small icon next to the Tables tab has been removed; the logo remains in the masthead pill
- **Dimmed version number in masthead** — the version badge is now muted grey, keeping it readable but visually secondary to the project name
- **Run SQL panel always visible** — the collapsible header has been removed; the SQL runner is now always expanded inside its tab
- **Smart field substitution in templates** — all templates (except COUNT) now substitute selected fields for `*`, not just the "SELECT columns" template
- **Explain button removed** — replaced by automatic query plan analysis; the separate Explain button is no longer needed

<details><summary>Maintenance</summary>

- **Modularized `tools.ts` (850 lines) into 3 files** — `tools-compare.ts` (snapshot, compare, migration preview), `tools-analytics.ts` (index suggestions, size analytics, anomaly detection), and `tools-import.ts` (CSV/JSON/TSV import); each file has its own imports and no shared private state
- **Modularized `_theme-effects.scss` (482 lines) into 3 files** — `_theme-showcase.scss` (showcase glassmorphism effects), `_theme-midnight.scss` (midnight aurora/glow effects), and a slim `_theme-effects.scss` (shared entrance animations + reduced-motion override)

</details>

---

## [3.1.1]

Killed 40+ false-positive "add a datetime index" suggestions that fired on every `created_at` and `updated_at` column regardless of whether it was actually being queried. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.1.1/CHANGELOG.md)

### Fixed

- **Eliminated 40+ false-positive datetime index suggestions** — the blanket heuristic that flagged every `created_at`, `updated_at`, and `_at` column as needing an index has been removed (96% false-positive rate in real projects); legitimate datetime index suggestions are still caught by the evidence-based `unindexed-where-clause` diagnostic

---

## [3.1.0]

Save and compare snapshots for Index Suggestions, Size Analytics, Anomaly Detection, and Health Score — plus fewer noisy diagnostics in multi-root and non-Drift workspaces. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.1.0/CHANGELOG.md)

### Fixed

- **Connection warning no longer targets wrong folder in multi-root workspaces** — in workspaces with several root folders, the "Drift server not reachable" diagnostic attached to whichever folder happened to be first, even non-Drift projects; now scans folders and only targets one that actually uses Drift
- **Consistent `[drift_advisor]` prefix on all diagnostics** — index-suggestion and invariant-violation diagnostics from the legacy linter paths were missing the `[drift_advisor]` message prefix; all diagnostic messages now include it for consistent filtering in the Problems panel
- **Boolean columns no longer flagged as datetime index candidates** — the index-suggestion heuristic matched any column name ending in `time`, causing `BoolColumn` fields like `is_free_time` to produce a spurious "Date/time column" diagnostic; the pattern now requires `timestamp` instead of bare `time`
- **No more "no longer responding" toasts in non-Drift projects** — server discovery port scanning now only starts when the workspace pubspec.yaml declares a Drift dependency; previously every VS Code workspace triggered scanning and stale server-lost notifications

### Added

- **Save & compare analysis history** — Index Suggestions, Size Analytics, Anomaly Detection, and Health Score panels now have Save Snapshot and Compare buttons; snapshots are persisted in workspace state (up to 50 per type) and can be compared side-by-side with a diff summary showing what changed between runs

### Changed

- **Connection diagnostic downgraded from Warning to Information** — "server not reachable" is the normal state when the debug server isn't running; the diagnostic now shows as an info icon instead of a yellow triangle, reducing noise in the Problems panel

---

## [3.0.3]

Schema tab no longer gets stuck on "Loading…", "Ask in English" stops crashing on open, and the DB Diff tab shows a proper setup guide instead of raw developer-facing errors. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.0.3/CHANGELOG.md)

### Fixed

- **Schema tab stuck on "Loading…"** — when schema DDL was already cached from another view (table data in "both" scope, search tab), the Schema tab never rendered the cached content; now uses cache-first rendering so the tab displays immediately
- **"Ask in English" crashes with `loadSchemaMeta is not defined`** — the NL modal, table-view column-type loader, and cell-edit module all called `loadSchemaMeta` at runtime but the function was scoped inside `app.js` and never reachable from the bundled TS modules; extracted into a shared `schema-meta.ts` module with proper imports

### Improved

- **DB Diff tab shows setup guide instead of error jargon** — when the comparison database is not configured, the panel now explains what the feature does and shows a collapsible "How to enable" section with a code example; buttons are hidden until the feature is active, instead of showing developer-facing error messages after clicking
- **Quieter debug console for stale tables** — when a table is listed in `sqlite_master` but has been dropped since the last metadata fetch, the server now logs a one-line warning instead of a full stack trace; snapshot capture skips failed tables instead of aborting

<details>
<summary>Maintenance</summary>

- **README screenshots** — added 10 feature screenshots (Tables, Table Data, Schema, Index, Size, Perf, Health, Import, Ask in English, Light Mode) in an HTML grid with captions; renamed files from random hashes to descriptive names; added Screenshots link to TOC

</details>

---

## [3.0.2]

Stale tables no longer carry over when you switch Flutter projects, and empty databases stop flagging every Dart table class as a "missing table" error. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.0.2/CHANGELOG.md)

### Fixed

- **Stale tables persist after project switch** — switching Flutter projects reloaded the webview HTML but localStorage kept pinned tables, nav history, table state, SQL history, bookmarks, and analysis results from the previous project; now detects when the server origin changes and purges all project-specific storage while preserving user preferences (theme, sidebar state)
- **False-positive "missing table" errors on empty database** — when the database had no tables (app never run, or server connected to an empty DB), every Dart table class was flagged with an Error-level `missing-table-in-db` diagnostic; now detects the empty-DB condition and suppresses individual missing-table errors while still flagging genuinely missing tables in partially populated databases

<details>
<summary>Maintenance</summary>

- **File modularization** — split 3 files exceeding 300-line limit: dashboard chart-clipboard logic, ER diagram SVG helpers, and panel test fixtures each extracted into dedicated modules
- **Final IIFE extraction** — moved last 4 inline init blocks (`initPiiMaskToggle`, `initSearchToggle`, `setupCellValuePopupButtons`, `setupChartResize`) into their feature modules; removed 70 unused imports; `app.js` reduced to 926-line init-only glue
- **Test coverage** — added tests verifying extracted helpers compose correctly into webview script output
- **Test coverage** — 22 contract tests for server-origin storage clearing: state constant, persistence function wiring, key targeting, UI-preference preservation, call ordering in app.js, and bundle integration

</details>

---

## [3.0.1]

Version bump for publication. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.0.1/CHANGELOG.md)

---

## [3.0.0]

Fixed stale data after switching servers, restored broken heartbeat and polling controls, and added Log Capture session export so Drift Advisor diagnostics flow into your capture sessions automatically. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.0.0/CHANGELOG.md)

### Fixed

- **Wrong project tables after server switch** — webview panel showed stale tables from the previous project when the debug server changed; now detects host/port changes and fully reloads content from the new server
- **Retry targeted wrong server** — the Retry button in the webview used the original server endpoint instead of the current one after a server switch; now always uses the panel's current host/port
- **Heartbeat reconnection stopped working** — heartbeat reconnection silently dropped back to no-op stubs instead of resuming polling; now wired correctly at startup
- **Polling toggle missing** — the masthead pill click handler and keep-alive toggle stopped responding; restored

### Added

- **Log Capture session export** — when both extensions are installed and `driftViewer.integrations.includeInLogCaptureSession` is `full` (the default), session end now writes structured metadata (query stats, anomalies, schema summary, health, diagnostic issues) into the Log Capture session and a `{session}.drift-advisor.json` sidecar file; set to `header` for lightweight headers only, or `none` to opt out entirely
- **Log Capture extension API** — `getSessionSnapshot()` is now available on `context.exports` so Log Capture's built-in provider can request a snapshot directly without the file fallback
- **Session file fallback** — `.saropa/drift-advisor-session.json` is written at session end for tools and scenarios where the extension API is unavailable

<details>
<summary>Maintenance</summary>

- **esbuild bundling** — all web JS/TS assets bundled into a single `bundle.js` via esbuild; Dart server plumbing collapsed from 4 cached fields / 4 script tags to 1
- **Full JS modularization** — `app.js` decomposed from 6882-line monolith to 915-line init glue; 23 TypeScript modules extracted; shared state centralized in `state.ts` with typed exports
- **SCSS modularization** — `style.scss` decomposed from 2184 lines to 28-line import hub with 17 feature partials; migrated from deprecated `@import` to `@use`
- **Connection diagnostic logging** — all connection state transitions, poll cycles, heartbeat, and keep-alive events now emit `[SDA]` prefixed console.log entries for browser dev tools tracing

</details>

---

## [2.19.0]

Type badges on columns, random data sampling, health scores, query cost analysis, and a pile of UI polish. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.19.0/CHANGELOG.md)

### Added

- **Column type icons** (Website) — data table column headers now show a compact type badge (e.g. TEXT, INT, REAL, BLOB) sourced from schema metadata; full type in tooltip
- **Table definition type icons** (Website) — table definition panel now shows a fixed-width icon column with type glyphs (`#` integer, `T` text, `.#` real, etc.) plus 🔑 PK and 🔗 FK badges for quick visual scanning
- **Data sampling** (Website) — Sample button in the pagination bar loads a random sample of rows via `ORDER BY RANDOM() LIMIT N`
- **Health score** (Website) — anomaly scan results now show a 0–100 health score with letter grade (A–F) and a severity breakdown summary
- **Query cost analysis** (Website) — EXPLAIN output now shows an estimated cost rating (Low/Medium/High) with operation counts (full scans, index lookups, subqueries, sorts, temp storage) and a collapsible raw plan detail view

### Fixed

- **App logo not appearing** (Website) — replaced corrupted inlined base64 PNG (~185 lines) with a CDN-hosted URL using the same jsDelivr + `@main` fallback pattern as CSS/JS assets

### Changed

- **Query history expanded** (Website) — SQL history limit increased from 20 to 200 entries, matching the VS Code extension

- **Collapsible table definition** (Website) — table definition panel above the data grid is now collapsible (collapsed by default), matching the query builder pattern; self-contained in `table-def-toggle.js`
- **Masthead pill** (Website) — combined the version badge and connection status into a single header pill showing logo · version · Online/Offline; styles extracted to `_masthead.scss` partial, HTML extracted to `_buildMastheadPill()` method
- **Connection status terminology** (Website) — renamed "Live" to "Online" throughout the web viewer for clarity
- **Sidebar toggle arrow** (Website) — arrow is now larger, right-aligned, and points left instead of down for clearer collapse affordance
- **FAB opens upward** (Website) — floating action button menu now fans upward from the trigger, with items right-aligned against the trigger edge
- **Share moved to FAB** (Website) — Share button relocated from the header bar into the FAB menu as the first action item
- **FAB modularized** (Website) — FAB styles extracted to `_fab.scss` partial, FAB UI logic extracted to self-contained `fab.js` module
- **Premium theme effects** (Website) — Showcase and Midnight themes now have real glassmorphism (backdrop-filter blur on header, sidebar, cards), animated gradient backgrounds, rainbow shimmer borders on expanded cards, floating glow orb (Midnight), entrance animations, and gradient buttons; removed broken CDN dependency on nonexistent drift-enhanced.css; all four themes are always available without external network requests
- **Monospace font upgrade** (Website) — switched to JetBrains Mono via Google Fonts CDN; centralized font stack into a single `--font-mono` CSS custom property for easy future changes
- **Responsive toolbar** (Website) — tools toolbar no longer wraps to a second row; text labels progressively hide at three breakpoints (1100px, 900px, 700px) leaving icon-only buttons with tooltips at narrow widths

### Added

- **Column visibility toggle** (Extension) — SQL Notebook results now have a "Columns" button to show/hide individual columns, with a dropdown chooser and "Show All" reset
- **Row filter toggle** (Extension) — SQL Notebook filter bar now has a "Matching/All" toggle to switch between showing only matching rows and showing all rows
- **Responsive ER diagram** (Extension) — ER diagram automatically re-fits to the panel when the window is resized, debounced to avoid flicker
- **Export index analysis** (Extension) — Index Suggestions panel has a new "Export Analysis" button that exports as JSON, CSV, or Markdown to clipboard or file
- **Copy chart to clipboard** (Extension) — Dashboard chart widgets now have a clipboard button in the header that copies the chart as a PNG image
- **JSON export** (Website) — Export panel now offers "Table JSON" alongside the existing CSV download
- **Import history log** (Website) — Import panel tracks all import operations during the session in a collapsible history list showing time, table, format, row count, and errors

### Fixed

- **Acronym column name mismatch detection** — When Drift's camelCase-to-snake_case splits acronyms like `UUID` into `u_u_i_d`, but the database uses `uuid`, the advisor now reports a single `column-name-acronym-mismatch` diagnostic instead of a confusing `missing-column-in-db` / `extra-column-in-db` pair. The message explains the root cause and suggests both fix options (rename getter or `.named()` override)
- **Anomaly detector: reduced false positives** — Numeric outlier detection now skips timestamp columns (`created_at`, `*_date`, etc.), sort/ordering columns (`sort_order`, `position`, `rank`, etc.), and year/founded columns. Added a log-scale fallback so distributions spanning orders of magnitude (e.g., currency exchange rates, engagement scores) are no longer flagged. Outlier messages now identify which end (min/max) is the problem and by how many σ
- **Slow-query and N+1 false positives on table definitions** — Runtime performance diagnostics (`slow-query-pattern`, `n-plus-one`) moved from the `performance` category to `runtime` so users can disable them independently of schema checks. Server-internal queries (no caller location) are now downgraded from Warning to Information severity. When caller location is available, diagnostics pin to the call site at full Warning severity. Slow-query messages include row count; N+1 messages hint at batching via JOIN/IN for high repeat counts

---

## [2.17.5]

Super FAB menu, app logo in the tab bar, and premium theme effects that actually look dramatic now. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.17.5/CHANGELOG.md)

### Added

- **Super FAB menu** — Sidebar toggle, theme cycle, and PII mask moved from the header into a floating action button in the bottom-right corner. Click the gear icon to expand; click outside or press Escape to dismiss
- **App logo in tab bar** — Replaced the "Saropa Drift Adviser" text header with the app logo, positioned inline with the tab buttons

### Fixed

- **Showcase/Midnight themes now show dramatic visual effects** — The premium themes had nearly-opaque backgrounds (75-85% alpha) that made glassmorphism invisible. Completely rewritten with floating ambient orbs, glass shimmer sweeps, card entrance animations with blur-to-clear, rainbow borders visible at rest, dramatic hover lifts, animated gradient buttons, and backgrounds at 25-35% alpha so the frosted glass effect is unmistakable
- **Sticky header preserved in premium themes** — The enhanced CSS was overriding `position: sticky` with `position: relative` on the header, causing it to scroll away instead of staying fixed

---

## [2.17.4]

Fixed the changelog — 2.17.2 had accidentally overwritten the 2.17.1 entry. Both versions are now listed correctly below. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.17.4/CHANGELOG.md)

<details>
<summary>Maintenance</summary>

- **Publish pipeline: store propagation polling** — After publishing, the pipeline now polls pub.dev, VS Code Marketplace, and/or Open VSX APIs until the new version is visible (30 s interval, 10 min max). Timeout is non-fatal

</details>

---

## [2.17.3]

Midnight theme, draft conflict detection, masked CSV export, clipboard paste import, and a wave of false-positive fixes across diagnostics. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.17.3/CHANGELOG.md)

### Added

- **Midnight theme (CDN-only)** — A fourth theme option: deep navy dark mode with periwinkle accents, glassmorphic panels, animated gradient background, and rainbow side borders. Uses the saropa.com dark palette (#1a1d2b / #2c3350 / #8fa8ff). Degrades gracefully to the base dark theme when the CDN is unavailable
- **Draft conflict detection** — When restoring saved pending edits from a previous session, the extension now checks each edit's original value against the live database. Warns if rows were changed or deleted since the draft was saved, with the option to restore anyway or discard
- **BLOB columns blocked at the DOM level** — BLOB columns are now visually non-editable (double-click is silently ignored) rather than requiring a server round-trip rejection. Table headers carry `data-col-type` attributes for client-side detection
- **Copy migration SQL** — Database comparison panel now has a "Copy Migration SQL" button that fetches the DDL migration preview and copies it to the clipboard
- **Clickable ER diagram tables** — Double-click a table node in the ER diagram to open its data view. Drag detection prevents accidental navigation while repositioning
- **Masked CSV export** — New "CSV (PII masked)" option in the extension export picker. Heuristic column-name detection masks emails, phones, SSNs, passwords, tokens, secrets, API keys, and addresses
- **Clear table / clear all** — Web viewer now shows "Clear rows" and "Clear all tables" buttons when write access is enabled. Executes via the batch edits endpoint in a single transaction with double-confirmation
- **Clipboard paste import** — Web viewer import panel has a "Paste" button that reads from the clipboard and auto-detects CSV, TSV, or JSON format
- **Configurable slow-query threshold** — Performance panel now has a threshold input (default 100 ms) that is passed as a query parameter to the server. Recent queries color-coding adapts dynamically

### Changed

- **Light theme is now the default** — The web viewer defaults to light mode when no saved preference or OS/VS Code hint is detected. Previously defaulted to dark
- **Light and showcase palettes overhauled** — Both light themes now use the saropa.com design system: slate-blue text (#242b4a), blue-tinted borders (rgba(143, 168, 255, ...)), multi-layer composited shadows, larger border radii (8/12/16px), and hover lift effects
- **Theme cycle expanded to four** — With enhanced CSS loaded, the toggle cycles Light → Showcase → Dark → Midnight. Without CDN, it toggles Light ↔ Dark
- **Smart premium upgrade** — When enhanced CSS loads with no saved preference, OS dark-mode users get Midnight automatically; light-mode users get Showcase

### Fixed

- **Removed `blob-column-large` diagnostic** — The unconditional "may cause memory issues" warning on every BLOB column has been removed. Developers choose BLOB storage deliberately; the type-only check was unactionable noise. The "Profile Column" command remains available from other diagnostic providers for on-demand column analysis
- **Anomaly false positives on valid wide-range columns** — The numeric outlier detector no longer flags coordinate columns (lat/lng/lon/latitude/longitude), version/revision columns, or any column whose data naturally spans a wide range. Replaced the naive 10× average heuristic with 3-sigma (standard deviation) statistical analysis, plus name-based skips for known domain patterns
- **False positive diagnostics in non-Drift projects** — The extension no longer fires `missing-table-in-db` and `extra-table-in-db` diagnostics in workspaces that don't use Drift. Three fixes: (1) diagnostics now skip scanning when pubspec.yaml lacks `drift` or `saropa_drift_advisor`; (2) the Dart parser ignores `class … extends Table` patterns inside `///` doc comments, `//` line comments, and `/* */` block comments; (3) `extra-table-in-db` reports against the primary schema file instead of an arbitrary first match
- **Saved premium theme restored after CDN loads** — If a user saved Showcase or Midnight but the CDN hadn't loaded yet, initTheme degraded them (Showcase→Light, Midnight→Dark). When the enhanced CSS finally loaded, markEnhancedReady did not restore the saved premium theme. Now it does
- **No-PK table gate uses error, not warning** — Opening the bulk edit panel on a table without a primary key now shows `showErrorMessage` (blocking, unmissable) instead of `showWarningMessage` (dismissible)
- **Commit failure message includes rollback context** — Error now states the statement count and confirms the transaction was rolled back, making it clear pending edits are preserved for retry
- **Table cells carry raw values for editing** — Report table `<td>` elements now include `data-raw-value` attributes so the inline editing script correctly distinguishes `NULL` from the text "NULL"
- **N+1 false positive on activity/log tables** — The N+1 query detector now only counts SELECT operations. Write operations (INSERT, UPDATE, DELETE) are inherently per-record and were incorrectly inflating the hit count, causing false warnings on tables like `activities` that receive frequent independent writes from user actions
- **Index suggestion false positives (`missing-id-index`, `missing-datetime-index`)** — Three fixes: (1) the `_id` heuristic now only fires when a matching table exists in the database (e.g. `user_id` fires if `users` table exists, but `api_id`, `swapi_id`, `wikidata_id` are suppressed); (2) the datetime heuristic now checks the Dart column type and skips non-datetime types like `BoolColumn` (fixes `is_free_time` being flagged as a datetime column); (3) both heuristic codes downgraded from Information to Hint severity so they appear as faded text rather than cluttering the Problems panel

---

## [2.17.1]

Showcase theme, webview panels for all command output, sidebar column counts, and reliable theme activation. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.17.1/CHANGELOG.md)

### Added

- **Showcase theme (CDN-only)** — A third theme option for the web viewer with glassmorphism frosted-glass panels, animated pastel gradient backgrounds, rainbow side border accents, drop shadows, staggered entrance animations, and purple accent colors. The theme is the default when the enhanced CDN stylesheet loads and cycles between Showcase → Dark → Light via the header toggle. When the CDN is unavailable, the viewer falls back to the existing dark/light two-way toggle with no visual regression

### Removed

- **Schema Search sidebar panel removed** — The dedicated Schema Search webview panel has been removed. Use VS Code's built-in tree filter (funnel icon or type-to-filter) in the Database panel instead. The Global Search command in Drift Tools remains available for cross-table search

### Changed

- **Database tree shows column count** — Table items now display `"3 cols, 42 rows"` instead of just `"42 rows"`, making table shape visible at a glance
- **Command Palette titles cleaned up** — All 106 commands now use VS Code's `category` field (`"Saropa Drift Advisor"`) instead of embedding the prefix in each title, following VS Code extension conventions
- **All command output now uses webview panels** — Ten commands that previously used the VS Code top bar (quick picks, input boxes, info messages) for displaying results or collecting multi-step input now open dedicated webview panels instead. Index suggestions, anomaly detection, and performance baselines render in rich sortable/filterable tables. Annotation, compare rows, data breakpoint, snapshot changelog, import dataset, and export dataset commands now collect all inputs in a single form view with Ctrl+Enter support, replacing sequential top-bar prompts
- **Tables heading now collapses sidebar horizontally** — Clicking the "Tables" heading in the sidebar collapses the entire sidebar panel to the left (same as the header chevron button) instead of vertically collapsing the table list upward

### Fixed

- **Showcase theme now activates reliably** — The enhanced CSS load detection used a 3-second timeout that nulled the `onload` callback, permanently locking out the showcase theme if the CDN was slightly slow or the browser never fired `onload` for `<link>` elements (VS Code webview, some WebKit builds). Replaced with an idempotent `markEnhancedReady()` function called by both `onload` and a polling fallback that checks `link.sheet` every 250ms for up to 10 seconds
- Debug server now survives Flutter hot restart without a `SocketException` — previously required a full cold restart to reconnect the VS Code extension
- Anomaly scanner no longer flags empty strings in nullable text columns — if the schema says the field is optional, empty strings are a valid design choice, not a data quality warning
- **"Run CREATE INDEX Now" quick fix removed** — the action always failed because the debug server only allows read-only SQL; the "Copy CREATE INDEX SQL" action remains and is now the preferred quick fix for all index suggestions

---

## [2.16.0]

Dashboard tab renamed for clarity, and web UI assets now load reliably on Flutter Windows desktop. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.16.0/CHANGELOG.md)

### Changed

• **Dashboard tab renamed to "Saropa Drift Dashboard"** — The VS Code webview tab previously showed the generic title "Dashboard"; it now displays "Saropa Drift Dashboard" for clarity when multiple editor tabs are open.

### Fixed

• **Web UI blank on Flutter Windows desktop** — The web viewer's CSS and JS failed to load on Flutter desktop apps because the asset resolver couldn't locate the package directory. Now uses multiple resolution strategies with in-memory caching, so the web UI loads reliably on all Flutter platforms.

• **Server diagnostic messages invisible in Flutter console** — `[SDA]` diagnostic messages now appear in the standard Flutter run console and IDE debug terminal, not just Dart DevTools.

<details>
<summary>Maintenance</summary>

• **Asset resolution internals** — Four resolution strategies now run in sequence: (1) `Isolate.resolvePackageUri` with an asset-existence probe to reject pub-cache paths, (2) `.dart_tool/package_config.json` ancestor walk to locate the declared `rootUri`, (3) ancestor walk from `Directory.current`, and (4) ancestor walk from `Platform.resolvedExecutable`. Assets are cached in memory on first resolution so subsequent requests skip disk I/O.

• **Error logger dual output** — `DriftDebugErrorLogger` log and error callbacks now call both `developer.log()` and `print()`, and log exact file paths probed with existence and byte counts.

</details>

---

## [2.14.4]

Eliminates false-positive diagnostics across index, FK, empty-table, and anomaly checks, and fixes blank Web UI caused by MIME-blocked CDN fallback. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.14.4/CHANGELOG.md)

### Fixed

• **`missing-fk-index` false positive on audit timestamp and `_id` columns** — The `missing-fk-index` diagnostic fired on `created_at`, `updated_at`, and `_id`-suffixed columns that have no foreign key relationship, labeling them "FK column" in the Problems panel. Index suggestions from the server's three heuristics (true FK, `_id` suffix, date/time suffix) now produce distinct diagnostic codes: `missing-fk-index` (Warning) for actual FK columns, `missing-id-index` (Information) for `_id` columns, and `missing-datetime-index` (Information) for date/time columns. Each code has an accurate message and all three retain Copy/Run SQL quick-fix actions.

• **`empty-table` false positive on legitimately empty tables** — The `empty-table` data-quality diagnostic fired on every table with 0 rows, flooding the Problems panel with false positives in fresh or development databases. Empty tables are a valid state (user-data, cache, static-data tables all start empty), so the diagnostic has been removed entirely. The `empty-table` code, its code-action quick fixes (Generate Seed Data / Import Data), and its entry in the diagnostic code registry have all been deleted.

• **Anomaly scanner false positive on boolean columns with skewed distributions** — The `potential_outlier` numeric heuristic fired on boolean columns stored as `INTEGER 0/1` when the true-percentage was low (e.g., 9% → `max(1) > avg(0.09) × 10`). Boolean-typed columns (`BOOLEAN`, `BOOL`, `BIT`) are now excluded from numeric outlier detection, and a binary-domain guard (`min == 0 && max == 1`) catches Drift `BoolColumn` values stored as `INTEGER`.

• **`no-foreign-keys` false positive on intentionally isolated tables** — The `no-foreign-keys` best-practice diagnostic fired on every table that had an `id` column and at least one other column but no `FOREIGN KEY` constraints, producing dozens of false positives on tables intentionally designed without FKs (import caches, config stores, static data, audit logs). The check now only flags tables that have `_id` columns matching a known table name (e.g. `user_id` when a `users` table exists) but lack FK constraints — catching genuine "forgot `references()`" mistakes. Tables referenced by other tables via inbound FKs are also skipped, since they already participate in the relational graph.

• **`missing-table-in-db` false positive on tables with consecutive uppercase letters** — `dartClassToSnakeCase()` grouped acronyms as single tokens (e.g. `DC` → `dc`), but Drift splits every uppercase letter individually (`DC` → `d_c`). Tables like `SuperheroDCCharacters` were flagged as missing even though they existed under the Drift-generated name `superhero_d_c_characters`. The converter now matches Drift's per-letter splitting.

• **Anomaly scanner false positives on nullable columns** — `_detectNullValues()` flagged NULLs in columns declared `.nullable()`, producing up to 13 spurious warnings per table. NULL detection now only scans NOT NULL columns, where NULLs indicate genuine constraint violations (data corruption, direct SQL inserts, failed migrations). Severity changed from threshold-based warning/info to always `error`.

• **Web UI blank for pub.dev consumers — CDN fallback silently killed by MIME mismatch** — When the debug server could not find web assets on disk (typical for separate projects using the package from pub.dev), it returned 404 with `Content-Type: text/plain`. Combined with Dart's default `X-Content-Type-Options: nosniff` header, both Firefox and Chrome MIME-blocked the response, which suppressed the `<link>`/`<script>` `onerror` callback. The multi-CDN fallback chain never fired — the page loaded blank with no CSS or JS. The 404 path now uses the expected content type (`text/css` or `application/javascript`) so browsers do not MIME-block it; the 404 status alone triggers `onerror` reliably.

---

## [2.14.2]

Web UI no longer loads blank in Firefox — CSS and JS are inlined directly into the HTML when available, with a fetch-based CDN loader as the fallback instead of the broken `onerror` chain. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.14.2/CHANGELOG.md)

**NOTE:** This changelog version was corrupted - it may not have been deployed

### Fixed

• **Web UI blank in Firefox — CDN fallback never fired after local 404** — The `onerror` attribute on `<link>` and `<script>` elements does not reliably fire in Firefox when the server returns HTTP 404 with the correct MIME type (`text/css`, `application/javascript`). The multi-CDN fallback chain (`_sda_fb`) was dead code in practice. CSS and JS are now inlined directly into the HTML response when the package root is resolved on disk (zero extra requests, works offline). When local files are unavailable, the HTML references jsDelivr CDN URLs directly via a fetch-based JS loader instead of the broken `onerror` mechanism.

### Changed

• **Loading overlay shows startup diagnostics** — The loading screen now displays the package version, asset source (local/CDN), and per-asset load status instead of an uninformative "Loading…" message. Errors use distinct red styling.

---

## [2.14.1]

Fixes silent command failures and missing user feedback, adds annotation previews and removal commands, and moves bookmarks to the tree toolbar. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.14.1/CHANGELOG.md)

### Fixed

• **Go to Column/Table Definition did nothing with no feedback** — tree-view context-menu commands silently swallowed errors and gave no progress indication. Now shows a progress notification during search, surfaces errors via toast, and falls back to opening the table class when the specific column getter pattern isn't matched. Also excludes `.g.dart` / `.freezed.dart` from the search for faster results.

• **pub.dev publish failed for v2.14.0** — The pubspec `screenshots` path was changed from `assets/banner_v2.png` to `extension/icon_1024.png`, but `.pubignore` excludes the entire `extension/` directory. pub.dev rejected the upload with "Screenshot `extension/icon_1024.png` is missing from archive." Restored the screenshot path to `assets/banner_v3.png`, which lives in the non-excluded `assets/` directory.

• **Query Cost command failed to register** — `driftViewer.analyzeQueryCost` was registered in both `health-commands` and `query-cost-commands`, causing a "command already exists" error on every activation. Removed the duplicate proxy registration.

• **Warning toasts had no actionable buttons** — 11 `showWarningMessage` calls told users to check settings, docs, or output channels but gave no way to get there. Every warning that references a destination now includes a one-click button (Retry, Open Settings, View Docs, Open Output, etc.).

• **Annotation creation gave no user feedback** — After completing the annotation quick-pick and text input, the command silently returned with no toast, no tree change visible if disconnected, and no indication the annotation was saved. All annotation commands now show a confirmation info message (e.g. "Annotation added to column 'users.email'.").

### Changed

• **Annotation preview in Database Explorer tree** — Tree items now show the actual annotation emoji and note text (truncated at 40 chars) instead of the old generic "· 1 note" / "· 📌" placeholders. Multiple annotations show "+N more" suffix.

• **Bookmarks button moved to tree toolbar** — The "Open Bookmarks" command is now a visible `$(bookmark)` icon in the Database Explorer title bar instead of buried in the `...` overflow menu.

### Added

• **Remove annotations from tree context menu** — Right-click a table or column → "Remove Annotations" with a modal confirmation. Table removal clears all annotation kinds (table, column, row) in a single pass.

• **Clear All Annotations command** — Available in the Database Explorer `...` menu. Confirms before wiping all annotations.

---

## [2.14.0]

Stops false-positive slow-query warnings from internal analytics, fixes connection errors in non-Drift projects, and makes the web UI much more reliable when assets can't be found locally. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.14.0/CHANGELOG.md)

### Fixed

• **False-positive slow-query diagnostics** — Internal analytics queries (anomaly detection, index suggestions, size analytics) were being reported as slow user queries in the Performance panel. These internal queries are now excluded from performance data.

• **Connection-error diagnostic firing on non-Drift workspaces** — The extension no longer tries to connect to a debug server in projects that don't use Drift.

• **Notification messages drop redundant "Saropa Drift Advisor:" prefix** — Warning and error toasts no longer start with the extension name; VS Code already shows the source.

• **Web UI blank when local assets unavailable** — When the server couldn't find CSS/JS on disk (common for pub.dev consumers), the web viewer loaded blank with no error. Now falls back to CDN automatically, and shows a clear error message if all sources fail.

### Changed

• **Connection-error diagnostic downgraded to Warning** — Connection errors are now Warning severity (was Error), reflecting that a missing server is an operational state, not a code defect. Quick fix actions: "Retry Connection", "Don't Show Connection Warnings", and "Open Connection Settings."

### Added

• **Loading overlay with error state** — A loading screen shows "Loading Drift Advisor..." until assets load. If loading fails, it updates to a clear error message with instructions.

<details>
<summary>Maintenance</summary>

• **In-memory asset cache** — `style.css` and `app.js` are read once and served from memory, eliminating per-request disk I/O.

• **Multi-CDN fallback chain** — CSS and JS `onerror` handlers try version-pinned jsDelivr (`@v{version}`), then `@main`. All sources exhausted dispatches a `sda-asset-failed` custom event.

• **Asset MIME mismatch fix** — `_sendWebAsset` no longer sends HTTP 200 with `text/plain` when file-read fails; failures fall through to a clean 404 so `onerror` CDN fallback fires. `_resolvePackageRootPath` validates that the resolved root contains web assets before accepting it.

</details>

---

## [2.13.0]

Fixes several broken commands and stuck webviews, and removes duplicate Quick Actions from the Database tree. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.13.0/CHANGELOG.md)

### Changed

• **Removed duplicate Quick Actions from Database tree** — The "Quick Actions" collapsible group in the Database Explorer duplicated every command already in the "Drift Tools" panel. Removed the redundant group so tool commands appear only in Drift Tools.

### Fixed

• **"Browse all tables" link in Schema Search did nothing** — Browse results were being overwritten by server-discovery updates. Now browse-all results persist until the user types, changes filters, disconnects, or encounters an error.

• **11 commands missing from Command Palette** — `disableDiagnosticRule`, `clearRuntimeAlerts`, `copySuggestedName`, and 8 other commands now appear in the Command Palette as expected.

• **Schema Search stuck on "Waiting for the extension" forever** — The Schema Search panel now initializes reliably instead of silently dropping the first connection message.

• **Query Cost Analysis command failed to register** — The command silently failed with only a warning toast; now registers correctly.

• **Web UI blank when running from the example app** — Asset resolution failed in the example app context, serving 404s that browsers blocked silently. Now resolves assets correctly.

<details>
<summary>Maintenance</summary>

• **Exhaustive command-wiring tests** — Two new tests verify that every command declared in `package.json` is registered at activation (forward check) and that every registered command is declared (reverse check). Any future wiring breakage now fails the test suite before publication.

• **Example app upgraded** — The example's landing screen now displays a compact status header with server state and URL, a table overview with row counts, and a recent-posts list.

</details>

---

## [2.11.1]

Fixes the invisible server-startup banner on Android (third regression) and makes disconnected sidebar buttons actually clickable. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.11.1/CHANGELOG.md)

### Fixed

• **Server startup banner invisible on Android (third regression)** — Commit `086152f` replaced `print()` with `ctx.log()` to satisfy `avoid_print`, routing the banner through `developer.log()` which does not produce `I/flutter` lines on Android. The server was starting but the user saw no output. Restored `print()` with lint ignores and an anchored comment explaining why `print()` is the only correct choice. Server startup errors (e.g. port in use) are now also printed visibly instead of only going through `developer.log()`.

• **VS Code: buttons do nothing when disconnected** — The Database tree returned an empty array when no server was connected, forcing VS Code to show a `viewsWelcome` overlay with markdown `command:` links. These links silently fail in some VS Code forks/versions — no output, no toast, no error. The tree now always returns real `TreeItem` rows with `.command` properties (Retry Discovery, Diagnose, Troubleshooting, Connection log, Select Server, etc.) so every action is a clickable tree item that works reliably in all hosts.

### Changed

• **Discovery output log is much more verbose** — Every scan cycle now logs its start, result (ports found or empty scan count), and when the next scan is scheduled. Previously only state transitions were logged, leaving long silent gaps during the 3s→30s search/backoff cycle.

---

## [2.11.0]

Fixes a Windows-only hang where fetch never completes, permanently locking the Database tree. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.11.0/CHANGELOG.md)

### Fixed

• **Database tree permanently stuck on Windows** — On some Windows builds, a network request could hang forever due to a Node.js bug, locking the Database tree on "Could not load schema" with no recovery. Added multiple safety timeouts so the tree always recovers, even if the underlying bug is triggered.

---

## [2.10.2]

Fixes a batch of reliability issues — stuck Database tree, broken mutation tracking — and polishes sidebar loading states. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.10.2/CHANGELOG.md)

### Fixed

• **Database tree stuck on “Could not load schema” after discovery** — The tree could silently drop concurrent refresh calls during server discovery, leaving it permanently stale. Refresh calls are now queued so the tree always loads when a server is found.

• **Web UI failed on Flutter iOS/Android** — Asset requests crashed on mobile embedders. The server now handles this gracefully and falls back to CDN as expected.

• **”Open URL” on server-detected toast didn't select the server** — Choosing **Open URL** when discovery finds a Drift debug server now also selects that host:port as the active server. Previously the sidebar could stay on the wrong port or none.

• **Mutation tracking not detecting changes** — INSERT/UPDATE/DELETE statements were not being classified correctly, so mutation tracking and live updates were silently broken. Now works reliably.

• **App stalling with multiple connected clients** — Idle mutation long-poll timeouts were flooding the VM service log, which could stall the app. Idle timeouts are now silent.

### Improved

• **Tables sidebar loading** — While the table list loads, shimmer skeleton rows appear under the **Tables** heading. Failed loads show an error message in the same block.

• **Database sidebar when schema fails to load** — The explorer now lists a warning row and troubleshooting commands as **clickable tree items** (Refresh, Diagnose, Troubleshooting, Select Server, etc.) instead of relying on markdown links that some editors ignore.

<details>
<summary>Maintenance</summary>

• **Missing command declarations** — `commitPendingEdits` and `editTableData` were registered in source but not declared in `contributes.commands`.

• **Mutation SQL regex fix** — INSERT/UPDATE/DELETE patterns used literal `\\s` / `\\b` in raw Dart strings instead of regex character classes.

• **`doc/API.md` — Run SQL from links** — Documents the web viewer `GET /?sql=` deep link alongside `POST /api/sql`, with query-parameter reference and stable anchor IDs.

</details>

---

## [2.10.0]

Clearer table row counts, inline table column definitions, a more polished Size analytics panel, and a lighter Dart package. The VS Code extension adds offline Database tree from persisted schema, sidebar-to-Dart navigation, and a command to scan Drift table definitions without a connected server. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.10.0/CHANGELOG.md)

### Changed

• **Smaller Dart package footprint** — The package no longer bundles duplicate web UI assets as Dart string constants. When local assets are unavailable, the web viewer loads from CDN automatically — no change to your workflow, just a smaller dependency.

### Improved

• **Table definition on table tabs (debug web UI)** — Opening a table shows a **Table definition** block above the query builder and grid: each column’s SQLite type plus PK / NOT NULL flags (from schema metadata). The same block appears when Search uses schema **and** table data (“both”) and a table is loaded.

• **Web UI table row counts** — In the sidebar, Tables browse grid, Search table picker, and Import dropdown, counts appear as comma-separated numbers in parentheses (e.g. `(1,643)`), without the word “rows”; numbers use muted color and align to the right beside the table name.

• **Size tab (debug web UI)** — Summary cards use comma-grouped numbers where appropriate; the Pages card shows total bytes with a dimmed `page_count × page_size` line; index names use smaller type; the Columns column is right-aligned. Table names in the breakdown link to open that table in a tab. Revisiting the Size tab in the same session reuses the last successful analyze (no automatic re-fetch); **Analyze** still refreshes on demand. Read-only metrics have hover tooltips (including journal mode / **wal** and PRAGMA-backed fields).

• **Busy spinners on slow actions (debug web UI)** — Primary and toolbar buttons that wait on the server (e.g. Size/Index/Health analyze, Perf update, Run SQL / Explain, migration preview, share, import, query builder run) show an inline spinner beside the progress label; existing error handling and disabled-state behavior are unchanged.

• **Ask in English (debug web UI)** — Replaces the full-width bright text row with an **Ask in English…** control that opens a modal: multiline question, dark-themed **Generated SQL (preview)** that updates as you type (debounced), and **Use** to copy into the main SQL editor. Cancel, Escape, or the backdrop close without changing the main editor. NL conversion errors stay in the modal so they do not replace SQL run errors below the editor.

• **Sidebar panel toggle (debug web UI)** — Header **Sidebar** control collapses the full left column (search + table list) so the main panel can use the full width; collapsed state is stored in `localStorage`. Removed the redundant sidebar line that only pointed users to the **Export** tab (export downloads are unchanged on that tab).

• **Header chrome (debug web UI)** — Shorter mask and live-status labeling where it reduces clutter; theme button tooltip names the mode you switch to on click.

### VS Code extension

• **Schema Search panel (disconnected)** — Now shows troubleshooting actions (Open in Browser, Retry, Refresh sidebar UI, Forward Port, Select Server, etc.) instead of a blank welcome overlay. Distinguishes “no saved schema in this workspace” vs “saved schema available.”

• **Offline Database tree** — New setting `driftViewer.database.allowOfflineSchema` (default on): when the server is unreachable, the tree repopulates from last-known persisted schema; status shows “Offline — cached schema.”

• **Go to Dart definitions from sidebar** — Context menu and Schema Search result clicks open the Drift table/column definition in the workspace; falls back to revealing the table in the Database tree.

• **Scan Dart schema definitions (offline)** — New command **Saropa Drift Advisor: Scan Dart Schema Definitions** lists Drift `Table` classes, columns, keys, and indexes from workspace `.dart` files. No debug server required. Setting `driftViewer.dartSchemaScan.openOutput` controls auto-opening the output channel.

• **Schema Search when “connected” but schema missing** — Schema Search keeps the help banner visible (Retry, Diagnose, **Scan Dart sources**, etc.) until the Database tree has actually loaded table data.

• **Schema Search webview readability** — Always-visible header, fallback colors when theme variables are missing, visible search field borders, and smoother startup transitions.

---

## [2.9.2]

Sidebar stays actionable when HTTP/VM says “connected” but the schema tree cannot load, and Schema Search recovers if the webview script never reaches the ready handshake. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.9.2/CHANGELOG.md)

### Fixed

• **Blank Database section with a false “connected” state** — `driftViewer.serverConnected` could be true (discovery or VM) while `health` / `schemaMetadata` failed, so the tree had no roots and the disconnected welcome stayed hidden. The extension now sets `driftViewer.databaseTreeEmpty` from the tree provider and shows a dedicated **viewsWelcome** with refresh, diagnose, and help links until the tree loads.

• **Schema Search panel stuck empty** — The host now forces delivery of connection state after a short timeout when the embedded script never posts `ready`, the script wraps init in try/finally so `ready` always fires, and the webview registers a dispose handler for the timer. The wildcard `*` activation event was removed (use `onStartupFinished` and explicit hooks) to avoid invalid-manifest behavior in some hosts.

• **Refresh / About toolbar commands during activation** — `driftViewer.aboutSaropa` and `driftViewer.refreshTree` register immediately after bootstrap and tree creation so title-bar actions work even if a later activation step fails before the bulk command registration pass.

• **Schema Search view visibility** — The Schema Search sidebar entry is no longer hidden when `driftViewer.enabled` flips late; it stays declared like the Database view so the webview can render during startup.

---

## [2.9.1]

No-blank sidebar startup fallback and safer command availability during activation. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.9.1/CHANGELOG.md)

### Fixed

• **No-blank sidebar startup fallback** — Activation now includes startup/view/workspace hooks so connection commands register before users click them, and disconnected welcome text no longer depends on pre-set context keys. Schema Search also has a fallback welcome block with direct actions (Refresh UI, Retry, Diagnose, Troubleshooting, web help), preventing empty panes during activation races.

• **Database header icons no longer fail in partial activation contexts** — `About` / `About Saropa` now resolve extension file paths via `extensionUri` with a safe fallback to the hosted docs URL, so the icon commands do not throw when path metadata is unavailable.

---

## [2.9.0]

Faster disconnect detection, batch apply for pending cell edits with foreign-key–aware ordering, bulk-edit panel, and authenticated server discovery. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.9.0/CHANGELOG.md)

### Fixed

• **Schema Search disconnected banner never appeared** — The banner now shows reliably when the server is not connected, with controls disabled until connection is confirmed.

• **Cell update numeric parsing now fails safely** — Invalid numeric values now return clear validation errors instead of risking parse exceptions.

### Added

• **Batch apply pending data edits** — New command **Apply Pending Edits to Database** sends all pending edits in a single transaction. Requires `writeQuery` to be configured.

• **Bulk edit panel** — **Edit Table Data** opens a dashboard to preview SQL, apply, undo, or discard pending edits. Available from the Database table context menu.

• **FK-aware apply order** — Pending edits are automatically ordered: deletes (child tables first), then updates, then inserts (parents first), respecting foreign key relationships.

### Improved

• **Less SQLite contention** — Server discovery and schema fetching are much lighter on your database — fewer queries, sequential prefetch, and a 90s schema cache TTL.

• **Authenticated discovery** — Port scans now pass the Bearer auth token, so discovery works when the debug server requires authentication.

### Changed

• **Faster disconnect detection** — Lost server is detected in ~20s (was ~45s).

• **Quieter discovery log** — Suppressed noisy per-cycle port scan messages.

<details>
<summary>Maintenance</summary>

• **Batch transaction failure logging** — Rollback and transaction exceptions are both logged for `/api/edits/apply` diagnostics.

• **VM Service batch apply + health** — `ext.saropa.drift.applyEditsBatch` and `getHealth` now mirror HTTP endpoint capabilities.

</details>

---

## [2.8.2]

Fixes web UI failing on Flutter emulators and Schema Search getting stuck on load. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.8.2/CHANGELOG.md)

### Fixed

• **Web UI blank on Flutter emulators** — On Android/iOS emulators the web viewer's CSS and JS failed to load. The server now serves assets from memory when the filesystem is unreachable.

• **Schema Search panel stuck on loading indicator** — The panel could silently drop its first connection message and never leave the loading state. Now uses a ready-handshake so state is always delivered.

• **Drift Tools "no data provider" on activation** — The Drift Tools sidebar section could fail to appear if another registration step threw first. Now always registers reliably.

### Improved

• **Troubleshooting: Schema Search diagnostics** — "Diagnose Connection" output now includes Schema Search state with actionable warnings. The Troubleshooting panel has a new section for "Schema Search panel stuck on loading indicator."

<details>
<summary>Maintenance</summary>

• **Published package missing web UI assets** — `.pubignore` contained an unanchored `web/` pattern that excluded `assets/web/` from the published package. Fixed by anchoring to `/web/` (root only).

• **Schema Search registered before command wiring** — `WebviewViewProvider` is now created in `setupProviders` instead of inside `registerAllCommands`, preventing permanent loading indicators if command registration fails.

</details>

---

## [2.8.1]

More reliable connection UI and Schema Search, plus web UI no longer errors during `flutter test`. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.8.1/CHANGELOG.md)

### Fixed

• **Web UI assets error during `flutter test`** — The debug server no longer returns HTTP 500 when running under the test VM; falls back to discovering the package root from the working directory.

### Improved

• **Connection UI and Schema Search resilience** — Sidebar connection state is now more accurate, combining HTTP discovery and VM Service signals. Schema Search gains connection labels, action links (Output log, Retry, Diagnose, Refresh UI), and auto-retry on transient failures. New commands: **Show Connection Log**, **Refresh Connection UI**, **Diagnose Connection**. Discovery is less likely to drop a server during brief interruptions.

<details>
<summary>Maintenance</summary>

• **Publish script: working-tree prompt** — Clearer messaging about uncommitted changes, per-target `git add` scope, and analysis-only mode.

• **Publish script: version sync** — Dart analysis now auto-syncs `server_constants.dart` with `pubspec.yaml` version before format/tests.

</details>

---

## [2.7.1]

Mutation Stream with column-value filtering, merged issues API for Saropa Lints integration, and web UI assets now load locally with CDN fallback. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.7.1/CHANGELOG.md)

### Added

• **Mutation Stream (VS Code)** — Added a semantic event feed openable from the **Drift Tools** status menu / **Database → Quick Actions**, with **column-value filtering** (schema column dropdown + match value).

• **Merged issues endpoint** — Index suggestions and data-quality anomalies are now available in a single request via `GET /api/issues`. Enables Saropa Lints and other integrations to fetch all issues at once.

• **Health capabilities** — Health endpoint now includes a `capabilities` array so clients can detect feature support and fall back gracefully on older servers.

### Improved

• **Mutation Stream UX** — Debounced filter inputs, added a schema-loading placeholder, and made pause/resume feel immediate.

### Fixed

• **Web UI loaded from CDN even when local assets were available** — The viewer now loads CSS/JS from the debug server first (works offline), falling back to CDN only on failure.

• **About / About Saropa / Save Filter "command not found"** — These commands now work even before a Dart file has been opened.

<details>
<summary>Maintenance</summary>

• **Pipeline: saropa_lints report colocation** — Lint scan report is now copied into the same `reports/YYYYMMDD/` folder as the run's summary report.

• **VM Service getIssues RPC** — `ext.saropa.drift.getIssues` returns the same merged issues list as the HTTP endpoint.

• **doc/API.md** — Documented Issues endpoint, issue object fields, and health `capabilities`.

• **Log Capture integration internals** — Session-end flow deduplicated; shared helpers exported from bridge module.

</details>

---

## [2.7.0]

Table tabs, self-contained Search tab, collapsible sidebar, ~97% query spam reduction, shared schema cache, and zero runtime dependencies. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.7.0/CHANGELOG.md)

### Fixed

• **Commands silently failed with no feedback** — Every sidebar and welcome-view button now shows a user-facing error or warning toast instead of swallowing failures silently.

• **Search tab performance issues** — Fixed a recursive fetch loop (4 duplicate requests per count update), filter re-fetching on every keystroke (now uses cached data), and shared pagination state bleeding between Search and Tables tabs.

• **Search toolbar button didn't open the Search tab** — The toolbar Search button now correctly opens the Search tab before focusing its input.

• **ER diagram columns only visible in first table** — Column text in the diagram was pushed off-screen for every table except the first. Now renders correctly.

• **Schema Search hung on "Searching…" forever** — Browse and search operations now have bounded timeouts. A "Server not connected" banner and **Retry** button appear on failure.

• **Table names with special characters crashed** — Table names containing quotes, brackets, or backslashes no longer cause `DOMException` errors.

• **Stale tabs after database changes** — When a table is dropped or renamed, its tab is automatically closed instead of becoming an orphaned error state.

### Changed

• **NULL cell indicator** — Table cells with `NULL` database values now display a dimmed, italic "NULL" label instead of blank space, matching DBeaver/DataGrip/pgAdmin convention.

• **Zero runtime dependencies** — Removed the `crypto` dependency. Apps no longer pull in any third-party packages, reducing install size and attack surface.

### Added

• **Web UI: pin tables to top of sidebar** — Hovering a table in the sidebar reveals a push-pin icon. Clicking it pins the table to the top of the list; clicking again unpins it. Pinned state persists via localStorage and auto-prunes stale entries when tables are dropped. Accessible: keyboard focus ring, `aria-pressed` toggle, visible on touch devices.

• **Web UI: table tabs** — Clicking a table name (sidebar or browse panel) opens it in its own closeable tab. Multiple table tabs can be open simultaneously; clicking an already-open table switches to its tab. The Tables tab now shows a browse-all grid of clickable table cards with row counts.

• **Web UI: collapsible sidebar table list** — The "Tables" heading in the sidebar is now a toggle that collapses/expands the table list. State persists across page reloads via localStorage. Supports keyboard activation (Enter/Space) and ARIA attributes.

• **Web UI: self-contained Search tab** — The Search tab now has its own inline controls (table picker, search input, scope selector, row filter) and loads data independently from the Tables tab. Includes debounced input handling and match navigation.

• **Web UI: Size tab Rows column** — The Rows column in the Size analytics table now has a minimum width and `nowrap` to prevent the bar chart from squeezing the row count number.

• **Extension: schema cache and performance options** — Shared in-memory schema cache so tree, Schema Search, ER diagram, and other features reuse one fetch. New settings: `driftViewer.schemaCache.ttlMs` (cache TTL), `driftViewer.schemaCache.persistKey` (stale-while-revalidate on startup), `driftViewer.database.loadOnConnect` (lazy tree loading), `driftViewer.lightweight` (skip badges and auto-capture for low-powered machines), `driftViewer.schemaSearch.timeoutMs` and `driftViewer.schemaSearch.crossRefMatchCap`.

• **Web UI: connection banner improvements** — When the server is unreachable, the banner now shows a live countdown ("Next retry in Xs"), the current retry interval (e.g. "Retrying every 5s"), attempt count, and "(max interval)" at 30s. A **Retry now** button triggers an immediate health check and resets backoff; a 1s ticker keeps the countdown accurate. Duplicate in-flight health checks are avoided so Retry does not race with the automatic heartbeat.

### Improved

• **Web UI: accessibility** — Proper heading landmarks, semantic buttons, and `:focus-visible` styles on sidebar toggle and search toolbar buttons (WCAG 2.4.7).

• **~97% query spam reduction** — For a 40-table database, a refresh cycle drops from ~160 queries to ~2. Eliminates massive "Drift: Sent" console spam when `logStatements` is enabled.

• **Search input debounce** — Search and filter inputs are now debounced to prevent floods of network requests on large tables.

<details>
<summary>Maintenance</summary>

• **SDK constraint raised to `>=3.9.0 <4.0.0`** — Enables Dart 3.6 digit separators, Dart 3.7 wildcard variables and tall formatter, and Dart 3.8 null-aware collection elements.

• **Dart 3.8 null-aware map elements** — `QueryTiming.toJson()` uses `'error': ?error` syntax.

• **`.firstOrNull` simplifications** — Replaced manual empty-check patterns across multiple files.

• **Digit separators** — Applied to numeric literals for readability.

• **Dart 3.7 tall formatter** — All 47 Dart files reformatted.

• **New lints enabled** — `unnecessary_underscores`, `prefer_digit_separators`.

• **Dev dependencies** — `saropa_lints` ^9.5.2 → ^9.8.1, `test` ^1.25.0 → ^1.30.0.

• **Extracted shared `createClosableTab()` helper** — Eliminates ~35 lines of duplicated DOM construction.

• **Server discovery error logging** — Port scan failures now logged to the Output channel.

• **Troubleshooting panel message routing** — Webview button actions now surface rejected command promises.

</details>

---

## [2.5.0]

Web UI: leave confirmation, auto-analyze on Index/Size/Health tabs, refreshed toolbar and Export tab, SQL syntax highlighting, and version→changelog link. Extension: Refresh and Dashboard commands fixed, Search/Tables toolbar, quieter polling, and Schema Search timeout plus portable report fixes. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.5.0/CHANGELOG.md)

### Added

• **Web UI: navigate-away confirmation** — Closing the tab, refreshing the page, or navigating away (e.g. back button) now triggers the browser's native "Leave site?" confirmation dialog so users can avoid losing context by accident.

• **Web UI: Index tab auto-analyze** — Opening the Index tab runs index suggestion analysis automatically (no manual Analyze click). Uses the shared `triggerToolButtonIfReady` helper; does not re-trigger if analysis is in progress or server is offline.

• **Web UI: Size tab auto-analyze** — Opening the Size tab runs database size analysis immediately (no manual Analyze click). The existing "Analyzing…" state and results UI apply; does not re-trigger if a run is already in progress or if the server is offline. Implemented via the same shared `triggerToolButtonIfReady` helper used for Index, Size, Perf, and Health tabs.

• **Web UI: Health tab auto-scan** — Opening the Health tab (toolbar or tab) automatically starts the data quality scan ("Scan for anomalies"). No need to click the button; the existing "Scanning…" state and results UI apply. Does not re-trigger if a scan is already in progress or if the server is offline. Matches the pattern used for Index, Size, and Perf tabs.

• **Web UI: toolbar and tab styling** — Tools toolbar buttons (Search, Snapshot, DB diff, Index, Size, Perf, Health, Import, Schema, Diagram, Export) use distinct styling: surface background, subtle shadow, clear hover and focus states. Tab bar is styled as real tabs: wider header area, rounded top corners, active tab visually connected to content via shared border; tab panels have a full border (except top) so content clearly belongs to the selected tab.

• **Web UI: Export as tab** — Export is now a toolbar button that opens a dedicated **Export** tab. The tab contains a short narrative explaining each option (Schema, Full dump, Database, Table CSV) and the same download links; sidebar shows a single line directing users to the Export tab. Export link IDs unchanged so existing JS (dump, database, CSV handlers) continues to work.

• **SQL syntax highlighting** — Schema tab, Run SQL results, migration preview, Schema Diff panel, Compare report, and portable Report schema section now show SQL with basic syntax highlighting (keywords, strings, numbers, comments, identifiers). Implemented via a shared highlighter module (`extension/src/sql-highlight.ts` and `assets/web/sql-highlight.js`) used everywhere SQL is displayed.

• **Web UI: version badge links to changelog** — The version number in the header (e.g. v2.2.0) is now a link that opens the extension's changelog on the VS Code Marketplace in a new tab. Tooltip and aria-label indicate version and "View changelog"; hover uses a short opacity transition.

### Changed

• **Web UI: colorful favicon** — Browser tab favicon now uses the same purple-to-cyan gradient database cylinder as the extension store icon (replacing the previous single-tone gray-blue favicon).

• **Web UI: Snapshot compare results in a table** — Compare-to-now results are shown in a summary table (columns: Table | Then | Now | Status) for easier scanning; per-table detail for added/removed/changed rows appears below when present. Result container is a scrollable div with opacity transition; loading state shows "Comparing…" and `aria-busy` for accessibility. Clearing a snapshot or starting a new compare clears the previous result.

• **Web UI: Export diff report in new tab** — The DB diff panel "Export diff report" link now opens in a new browser tab (`target="_blank"` with `rel="noopener noreferrer"`) so the current view stays open.

• **Web UI: sidebar Export section** — Replaced the inline export toolbar in the sidebar with a brief note: "Export schema, dumps, and table data from the **Export** tab (toolbar button above)."

### Fixed

• **Extension: Refresh command not found after second launch (issue #7)** — Added `onCommand:driftViewer.refreshTree` to activation events so the extension activates when the user invokes Refresh (e.g. from the Database view toolbar), fixing the case where the command was not yet registered on later app launches or when the view was restored before activation completed.

• **Extension: Database toolbar and Dashboard command** — The Database view toolbar showed many icons in one row and was hard to scan. Primary actions (About, Open in Browser, Refresh, Health, Dashboard, Drift Tools menu) now stay in the main bar; Schema Docs, Import, Search, Bookmarks, Snippet Library, ER Diagram, Export, and Add Package move to the overflow (…) menu for discoverability. An activation event for `driftViewer.openDashboard` was added so the Dashboard toolbar button works when the extension activates on first use of that command (fixes "command 'driftViewer.openDashboard' not found").

• **Web UI: toolbar Search and Tables buttons** — The toolbar **Search** button now opens the Search tab and expands the sidebar search options (it had no `data-tool`, so it only toggled the sidebar). A **Tables** toolbar button was added so the Tables view can be opened from the toolbar like other tools; both use `data-tool` and the shared `openTool` flow.

• **Debug console log spam at rest** — Change detection now throttles the row-count (UNION ALL) query to at most once every 2 seconds when the extension or web UI long-polls. The long-poll loop still runs every 300ms for responsive UI, but the app's Drift "Sent SELECT" logs drop from many per second to about one per 2 seconds when the Advisor is open. Turn polling off (web UI or extension) for zero queries when idle.

• **Extension: Schema Search never resolves** — The Schema Search sidebar could hang on "Searching…" when the initial empty query matched many tables/columns (hundreds of sequential FK API calls) or when the server was slow/unreachable. Search now has a 15s timeout and shows a clear error message on timeout or failure; cross-reference building is skipped when there are more than 80 matches so the panel resolves quickly. Loading state uses a pulse animation; errors are shown in the panel so the view always reaches a resolved state.

• **Portable report: schema section test and defensive handling** — The "include schema section when schema is provided" test failed because the SQL highlighter wraps keywords in `<span>`s, so the literal substring "CREATE TABLE" never appears. Test now asserts on content within the schema section slice and on CREATE/TABLE separately. Report HTML builder now guards against null/empty schema array, missing or empty table name (shows "(unnamed)"), non-string or empty sql, and falls back to escaped plain SQL when the highlighter returns empty so schema content is never dropped. Anomaly section uses the same null/empty guard for consistency.

---

## [2.3.0]

PII masking, richer charts/exports, query-builder AND/OR, and page-based pagination; plus improved Search tab, tabbed tools UI, cell popups/status/tooltips, and better About/Save Filter/share feedback. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.3.0/CHANGELOG.md)

### Added

• **Web UI: PII masking toggle (BUG-015)** — Header toggle "Mask data" lets you mask sensitive columns (email, phone, password, token, SSN, address, etc.) in the table view and in Table CSV exports. Column detection is name-based (e.g. columns containing "email", "phone", "password"); when masking is on, values are partially redacted (e.g. `j***@example.com`, `***-***-1234`). Copy and export respect the toggle. Server-side config and `.drift-mask.json` are not yet implemented.

• **Web UI: chart improvements (BUG-008)** — New chart types: Scatter, Area, and Stacked bar. Optional chart title. Export toolbar: PNG download, SVG download, and Copy image to clipboard. Charts use responsive sizing (viewBox + container width), X/Y axis labels (default to column names), and readable font size (--text-min-readable). ResizeObserver re-renders chart on container resize (throttled 150ms). Export buttons disable during async export; Copy shows brief "Copied!" feedback.

• **Web UI: query builder AND/OR connectors (BUG-006)** — The visual query builder only supported multiple WHERE conditions combined with AND. It now shows an AND/OR connector dropdown on the second and subsequent conditions so users can build expressions like `status = 'active' AND created_at > '2024-01-01'` or `role = 'admin' OR role = 'moderator'`. The live SQL preview and saved query-builder state include the chosen connectors.

### Changed

• **Web UI: Perf tab auto-update and button label** — Opening the Perf tab now triggers an automatic update of performance data (same pattern as Size and Health). The action button label is renamed from "Refresh" to "Update" with tooltip "Update performance data"; loading state still shows "Loading…".

• **Web UI: full page-based pagination (BUG-005)** — Table pagination is now page-based: First | Prev | Page [dropdown] of N | Next | Last, with a "Showing X–Y of Z rows" status. Rows per page is a clear selector; raw offset and Apply are under an "Advanced" toggle. First/Last and the page dropdown are disabled when not applicable; "(past end of results)" still appears when offset is beyond total.

• **Web UI: small interactive targets (BUG-010)** — Cell copy buttons, chart labels, and other small controls used 10px font and sub-24px tap targets, hurting usability on high-DPI and touch devices. All readable text now uses design token `--text-min-readable` (12px); interactive targets are at least 24×24px (pointer) and 44×44px on touch (WCAG 2.5.8). Copy button has a hover scale effect; breadcrumb and FK label use CSS classes instead of inline font-size.

### Fixed

• **Web UI: Diagram tab table cards empty** — Schema diagram now normalizes PRAGMA table_info results and supports both lowercase and uppercase column keys (name/type/pk and NAME/TYPE/PK), so all table cards show column names and types instead of appearing empty on some drivers.

• **Extension: (i) icon and About/Save Filter commands** — Clicking the info icon on the Database section header could show "command driftViewer.aboutSaropa not found" if the extension had not yet finished activating. About and Save Current Filter are now wired so they always work: activation events for both about commands ensure the extension activates when the command is invoked; about commands are registered first (before other feature modules) so the (i) icon works even if a later module fails; and the previously contributed-but-unregistered `driftViewer.saveFilter` command now has a handler that opens the Data Viewer and directs users to the in-panel Save Filter control.

• **Share modal and dialogs: newlines and ellipsis now render correctly** — The share prompt, "Copy to clipboard" alert, and "Sharing…" / "Extending…" button labels used double-escaped sequences (`\\n`, `\\u2026`) and showed literal `\n` or `\u2026` in the UI. All now use literal newlines and the Unicode ellipsis character so messages and loading states display as intended. CSV export and import were also corrected (row separators and newline-in-cell quoting use real newlines; CSV header split uses `\r?\n`).

• **Sidebar stayed "No Drift debug server connected" despite discovery finding a server** — Discovery reported "Found servers on ports: 8642" and ServerManager auto-selected the server, but the `driftViewer.serverConnected` context could fail to reach the welcome view (e.g. view evaluated before context was set), so the Database sidebar kept showing the disconnected message. Now we sync the context when discovery fires with servers (backup sync after ServerManager's listener), run a one-time 1.5 s delayed sync after activation so the view catches up if the first poll already found a server, and log "Selected server :port" to the Saropa Drift Advisor output channel when a server is auto-selected for diagnostics.

• **Welcome-view buttons gave no user feedback** — The Database sidebar welcome content (Add Saropa Drift Advisor, Troubleshooting, Retry Connection, Forward Port, Select Server) ran commands with no visible response. Each button now shows an immediate information or error toast, appends a timestamped line to **Output → Saropa Drift Advisor**, and (for Retry, Forward Port, Add Package) reveals the output channel so users see that the action ran and can inspect discovery or adb output. Select Server reports success when connected or when the picker was dismissed.

### Added

• **Web UI: search behind toolbar icon; Search tab; row toggle; collapsible sections** — Search options (search input, scope, filter rows, Prev/Next) are hidden by default and shown via the toolbar **Search** (magnifying glass) button. A dedicated **Search** tab displays search results in a readable panel; when you switch to it, the current Tables content is copied and highlighted so match navigation (Prev/Next, "X of Y") applies there. When viewing a table, **Show: All rows | Matching** lets you toggle between displaying every row or only rows matching the row filter. In the "Both" (schema + table data) view, **Schema** and **Table data** sections are collapsible (click header to expand/collapse).

• **Web UI: tools toolbar and tabbed tools** — Tools (Snapshot, DB diff, Index, Size, Perf, Health, Import, Schema, Diagram) moved from the sidebar into a horizontal toolbar above the main content. Clicking a tool opens it in a dedicated tab, giving full width to each tool. Tables and Run SQL remain fixed tabs; tool tabs can be closed (×). Tab switch uses a short opacity transition; Schema and Diagram load on first open.

• **Web UI: table cell truncation and full-value popup** — Long cell text in the data table is truncated with an ellipsis (max width 18rem). Double-click any cell to open a popup showing the full value, with a Copy button and Close/backdrop/Escape to dismiss. Popup uses a short fade transition; column name appears in the popup title.

• **Web UI: table status bar, scrollbars always on, SQL result pagination** — Data tables show a status bar below the grid: "Showing X–Y of Z rows • N columns" (and "(past end of results)" when offset is beyond total). Table and SQL result scroll containers use `overflow: scroll` so scrollbars are always visible. SQL runner table results are paginated client-side (100 rows per page) with Prev/Next and the same status bar. Column widths use natural content width with horizontal scroll instead of wrapping (e.g. episodes, URLs stay on one line).

• **Web UI: tooltips on all buttons and expanders** — Every button and collapsible header in the web view has a [title] attribute for native hover tooltips. Covers sidebar tools (snapshot, compare, index, size, perf, anomaly, import, schema, diagram), SQL runner and saved queries, pagination, column chooser and context menu, query builder, migration copy, compare panel close, breadcrumb Back/Clear path, and export links.

### Changed

• **Extension: Explain Query Plan context menu only when SQL at cursor** — The right-click "Explain Query Plan" entry now appears only in Dart files when the cursor or selection contains extractable SQL (e.g. SELECT/WITH string, triple-quoted SQL, or customSelect/customStatement). Reduces noise in files without SQL; command remains available from the Command Palette. Context updates are debounced on selection changes (50 ms) to avoid unnecessary work.

• **Web UI: Run SQL Explain and Saved queries** — Explain shows a single plain-English message (e.g. full table scan on table name, or index lookup) instead of raw EXPLAIN output. "Bookmarks" renamed to "Saved queries" throughout the Run SQL section (label, dropdown, prompts, alerts, export filename).

• **Web UI: sidebar collapsible polish** — Removed the blue vertical accent line to the left of collapsible section headers (drift-enhanced.css). Expand/collapse arrow is now right-aligned and dimmed (opacity 0.4) until the header is hovered (0.9), with a 0.15s opacity transition (style.scss / style.css).

• **Web UI: panel padding** — All main panels (sidebar, main content, feature cards, table list links) now use a shared design token `--panel-padding-x: 1.5rem` so content is no longer squashed against the left and right edges. Sidebar and main content use the token for horizontal padding; feature cards and table list links have slightly increased internal padding for consistency.

• **Extension: 300-line limit compliance** — Ten TypeScript source files that exceeded the 300-line limit were modularized so all extension source files are now within the limit. New modules: `api-client-http.ts` (HTTP endpoint helpers), `server-discovery-constants.ts` / `server-discovery-scan.ts` / `server-discovery-notify.ts`, `debug-vm-connect.ts` (VM connect + health retry), `rollback-order.ts` / `rollback-dart.ts` / `rollback-helpers.ts` / `rollback-utils.ts`, `vm-service-api.ts` (VM extension method wrappers), `troubleshooting-styles.ts`. Test files split with shared helpers (`api-contract-helpers`, `compliance-checker-test-helpers`, `rollback-generator-test-helpers`, `schema-provider-test-helpers`) and additional test modules for API contract sessions, compliance rules/general, rollback ordering/Dart. No behavior changes; all 1810 tests pass.

• **Extension: entry point under 300 lines** — `extension.ts` exceeded the limit; connection bootstrap (client, discovery, watcher, server manager, auth token listener, adb-forward on debug start) moved to `extension-bootstrap.ts`. Entry point now delegates to bootstrap then sets up providers, diagnostics, editing, and commands. Behavior unchanged; all tests pass.

• **Web UI: merged connection status** — Header previously showed separate "Polling: ON/OFF" and "● Live" pills. A single connection-status control now shows **Live** | **Paused** | **Offline**. Tap toggles Live ↔ Paused when connected; when disconnected the control shows Offline and is disabled (Reconnecting… during retry). Tooltips and `aria-live="polite"` clarify state; opacity transition (0.2s) on state change.

---

## [2.1.1]

Web UI gets a clearer layout and sidebar; the extension activates when you open the Drift views; drift_sqlite_async users get clearer guidance; and turning polling off no longer spams the console. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.1.1/CHANGELOG.md)

### Added

• **Web UI redesign** — Two-column layout (sticky sidebar + main content), semantic header with branding and actions, export toolbar as buttons, feature sections as cards with expand/collapse state. Sidebar sections: Search, Export, Tools, Tables. Design tokens (type scale, radius, tap targets), refreshed light/dark palette, loading spinner for "Loading tables…", copy-toast animation. Table list shows active table; feature cards show expanded state. **Phase 4.1:** Icons via Google Material Symbols Outlined (CDN) on feature headers, Theme/Share, and export links; expand/collapse arrow is CSS-only so icons are preserved. Styling and script loaded from CDN (not embedded in APK). See `docs/UI_REDESIGN_PLAN.md`.

### Changed

• **Web viewer performance** — Table list no longer re-renders on every table count fetch; only the updated table's link text is changed, reducing DOM updates and preserving active state.

### Fixed

• **VS Code: "command driftViewer.refreshTree not found" [GitHub issue #7](https://github.com/saropa/saropa_drift_advisor/issues/7)** — Extension now activates when the Drift Advisor sidebar views are opened (`onView:driftViewer.databaseExplorer`, `onView:driftViewer.toolbox`), so the Refresh command is registered even if no Dart file was opened first.

• **drift_sqlite_async compatibility (issue #7)** — README and error messages now document using `DriftDebugServer.start(query: ...)` with an explicit query callback when the web UI stays on "Loading tables…" or when using drift_sqlite_async; ensure the database is open before starting the server. Error hint extracted to a single constant; unit tests assert error response contains the callback-API guidance.

• **HTTP schema metadata and diagram when polling off** — `GET /api/schema/metadata` and `GET /api/schema/diagram` now return empty `tables` (and empty `foreignKeys` for diagram) with `changeDetection: false` when change detection is disabled, so no `PRAGMA table_info` or `SELECT COUNT(*)` queries run and the app's Drift log is no longer spammed. Matches the existing VM service behavior (extension already received empty schema when polling was off).

---

## [2.1.0]

Connection health, session expiry countdown, clickable FK breadcrumbs, and OS dark-mode sync make the debug experience more resilient and navigable. Search now scrolls to matches and lets you step through them with Next/Previous. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.1.0/CHANGELOG.md)

### Added

• **Web UI assets on CDN (BUG-001)** — CSS and JavaScript extracted from inline Dart string into `assets/web/style.css` and `assets/web/app.js`; served via jsDelivr CDN with version pinning. `html_content.dart` reduced from ~4,200 lines to a ~227-line HTML shell. Consuming app binaries no longer embed ~143KB of static UI; CDN URLs use `ServerConstants.packageVersion` (requires matching git tag for CDN to serve).

• **Extension test coverage (BUG-019)** — New unit tests for command handlers (dashboard open/save/load/delete, polling toggle), webview HTML (dashboard, health: structure, XSS escaping, empty state), API client (getChangeDetection/setChangeDetection and error paths), and Tools tree provider (categories, connection state, Add Package visibility). Extension disposable count assertion updated to 173.

• **Example app: multi-table schema and full feature demo (BUG-021)** — example uses 5 tables (users, posts, comments, tags, post_tags) with foreign keys for ER diagram and FK navigation demos; `writeQuery` configured for Import; opt-in auth token (`_kExampleAuthToken`); startup via `startDriftViewer()` with callback-style alternative in comments; seed data with dates, nulls (draft posts), and varied types

• **CSV column mapping in Import (Web UI)** — when importing CSV, the UI shows a mapping step: each CSV header can be mapped to a table column or skipped. Headers no longer need to match table column names exactly. Optional `columnMapping` in POST /api/import (object: CSV header → table column); duplicate table columns resolve with last mapping wins (BUG-007 item 1)

• **Server-detection notification actions** — when a Drift debug server is detected, the notification now offers **Open URL** (opens the server in the default browser), **Copy URL** (copies the URL to the clipboard), and **Dismiss**

• **REST API reference** (`doc/API.md`) — formal specification for all ~30 endpoints with request/response JSON schemas, HTTP status codes, query parameter documentation, authentication details, and error format reference; contract test assertions in Dart integration tests and TypeScript type tests catch API drift between server and extension

• **Connection health banner** — fixed-position "Connection lost — reconnecting..." banner with dismiss button when the server becomes unreachable; slides down with a smooth CSS transition; auto-recovers via `/api/health` heartbeat with exponential backoff (1 s → 30 s max)

• **Offline control disabling** — 17 server-dependent buttons are visually dimmed (`opacity: 0.4`, `pointer-events: none`) while disconnected; re-enabled automatically on reconnection

• **Reconnecting pulse animation** — live indicator pulses during reconnection to convey ongoing retry activity

• **Keep-alive health check** — periodic lightweight `/api/health` ping (every 15 s) when polling is toggled OFF, so disconnection is still detected

• **Server restart detection** — generation going backwards triggers a console log and full data refresh

• **Session expiry countdown** — info bar displays remaining time, switching to yellow under 10 minutes

• **Extend session** button in the info bar resets the timer by another hour (POST `/api/session/{id}/extend`)

• **Expiry warning banner** — yellow banner appears below the info bar when under 10 minutes remain

• **Expired session banner** — red banner with clear message when accessing an expired or unknown session URL (replaces silent failure)

• **Share dialog expiry notice** — prompt now mentions "Session will expire in 1 hour"

• **Configurable session duration** — new optional `sessionDuration` parameter on `DriftDebugServer.start()` (defaults to 1 hour)

• **Clickable FK breadcrumb steps** — each table in the navigation trail is now a link; clicking jumps directly to that table instead of one-step-back only

• **FK breadcrumb persistence** — navigation history saved to localStorage and restored on page refresh, with validation against the current table list

• **"Clear path" breadcrumb button** — discards the entire FK navigation trail

• **OS dark-mode sync** — first visit respects `prefers-color-scheme`; VS Code webview theme auto-detected via body classes and `data-vscode-theme-kind`; real-time updates when OS or VS Code theme changes (MutationObserver for webview, matchMedia listener for OS)

• **Per-IP rate limiting** — optional `maxRequestsPerSecond` parameter on `DriftDebugServer.start()` enables fixed-window counter rate limiting; returns HTTP 429 with `Retry-After` header when exceeded; `/api/generation` (long-poll) and `/api/health` endpoints are exempt (BUG-023)

• **Search result navigation** — auto-scrolls to the first match when typing, shows "X of Y" match counter, and provides Prev/Next buttons to step through results

• **Keyboard shortcuts** — Enter/Shift+Enter for next/prev match in search input, Ctrl+G/Shift+Ctrl+G globally, Ctrl+F to focus search, Escape to clear

• **Active match highlight** — distinct orange highlight with outline distinguishes the current match from passive highlights (supports both light and dark themes)

• **Collapsed section expansion** — navigating to a match inside a collapsed section automatically expands it

• **Saved and shareable analysis results (BUG-014)** — Index suggestions, database size analytics, query performance, and data health (anomaly) sections now offer **Save result** (stores in localStorage with timestamp), **Export as JSON** (download for sharing), **History** dropdown (past runs), and **Compare** (before/after modal with two runs side-by-side). Results persist across refresh and can be compared over time.

### Tests

• **Handler unit tests** — dedicated test files for `IndexAnalyzer`, `AnomalyDetector`, `PerformanceHandler`, `SchemaHandler`, `CompareHandler`, `SnapshotHandler`, `TableHandler`, and `GenerationHandler`; covers edge cases, error paths, boundary conditions, and business logic not exercised by the existing integration tests (BUG-017)

• **Stress and performance tests (BUG-018)** — `test/stress_performance_test.dart`: change detection with 100+ tables (single UNION ALL query), query timing ring buffer under concurrent insertions and eviction, snapshot capture with many tables/rows (30×200 and 50×100), anomaly detection completion within timeout on wide tables (25 tables × 20 columns)

### Fixed

• **Accessibility: color-only severity indicators** — index suggestion priorities (`HIGH`/`MEDIUM`/`LOW`) and performance query durations now show `[!!]`/`[!]`/`[✓]` icon prefixes alongside color, matching the anomaly detection pattern (WCAG 2.1 1.4.1)

• **Stale search match guard** — navigating to a match inside a collapsed section now rebuilds the match list if the expand causes a re-render, preventing scroll-to-nothing

• **Version constant CI guard** — added `version_sync_test.dart` that verifies `ServerConstants.packageVersion` matches `pubspec.yaml`; prevents stale version reporting in health endpoint and web UI (BUG-022)

• **Accessibility: schema diagram** — SVG diagram now has `role="group"` with `aria-label` summary, ARIA-labelled keyboard-focusable table boxes (`tabindex`, `role="button"`, arrow-key grid navigation, Enter/Space activation), `<title>` tooltips on FK relationship paths, and a screen-reader-only text alternative listing all tables and foreign keys (WCAG 2.1 1.1.1, 2.1.1, 4.1.2) (BUG-012)

• **Stale data table highlights** — clearing the search term now properly removes highlight markup from data table cells (previously they persisted until re-render)

---

## [2.0.0]

Internal modularization: split the 793-line server_context.dart god object into three focused modules for maintainability. [log](https://github.com/saropa/saropa_drift_advisor/blob/v2.0.0/CHANGELOG.md)

### Changed

• **Extracted `ServerUtils`** — 16 static utility methods (normalizeRows, getTableNames, sqlLiteral, etc.) moved from `ServerContext` to a dedicated `abstract final class ServerUtils` in `server_utils.dart`.

• **Extracted `server_typedefs.dart`** — 5 callback typedefs (`DriftDebugQuery`, `DriftDebugOnLog`, etc.) consolidated into a single source of truth, eliminating duplication between `server_context.dart` and the web stub.

• **Slimmed `ServerContext`** — reduced from 793 to 423 lines; now contains only instance state and instance methods (auth, CORS, logging, timing, change detection).

---

## [1.8.0]

Silence the log spam: batched change detection, runtime polling toggle, and UI buttons in both the web viewer and VSCode extension. [log](https://github.com/saropa/saropa_drift_advisor/blob/v1.8.0/CHANGELOG.md)

### Added

• **Polling toggle button (web UI)** — "Polling: ON/OFF" button in the browser header toggles change detection on/off via `POST /api/change-detection`. The live indicator updates to show "Paused" when polling is disabled.

• **Polling toggle button (VSCode)** — "Toggle Polling" item in the Drift Tools sidebar tree (`driftViewer.togglePolling` command) toggles change detection via VM service or HTTP fallback. Shows an info message confirming the new state.

• **Change detection HTTP endpoint** — `GET/POST /api/change-detection` reads and sets the polling toggle state at runtime.

• **Change detection VM service extensions** — `ext.saropa.drift.getChangeDetection` and `ext.saropa.drift.setChangeDetection` allow the VSCode extension to toggle polling without HTTP.

• **Static Dart API** — `DriftDebugServer.changeDetectionEnabled` getter and `DriftDebugServer.setChangeDetection(bool)` for programmatic control from app code.

### Changed

• **Web UI branding** — Browser tab and page heading now show "Saropa Drift Adviser" instead of "Drift tables" / "Drift DB".

• **Batched row-count queries** — `checkDataChange()` now uses a single `UNION ALL` query instead of N individual `SELECT COUNT(*)` queries, reducing per-check queries from N+1 to 2 (first call) or 1 (cached table names).

• **Table name caching** — sqlite_master table names are cached across change detection cycles and invalidated only on schema-altering operations (e.g., import).

• **VM service handler gating** — `getSchemaMetadata` and `getGeneration` VM service handlers return lightweight cached/empty responses when change detection is disabled, eliminating `PRAGMA table_info` and `SELECT COUNT(*)` spam from the debug console.

### Fixed

• **Web UI version drift** — `packageVersion` in `server_constants.dart` was hardcoded at `1.5.0` while pubspec was at `1.6.1`, causing the health endpoint to report the wrong version and the CDN enhanced CSS URL to 404. The publish scripts now auto-sync `server_constants.dart` alongside `add-package.ts` whenever the Dart version changes.

• **SQL identifier escaping** — `_buildDataSignature()` now escapes double-quote characters in table names for the SQL identifier context, preventing malformed SQL if a table name contains a literal `"`.

• **Polling toggle button UX** — The web UI polling toggle now disables itself and shows "Polling..." during the request, preventing double-clicks and providing clear visual feedback.

## [1.7.0]

Smart package lifecycle management: the extension now detects whether the Dart package is already in your project and hides redundant setup prompts. [log](https://github.com/saropa/saropa_drift_advisor/blob/v1.7.0/CHANGELOG.md)

### Added

• **Open in Browser button** — quickly open the Drift debug server UI from the Database sidebar:

- Globe icon in the header toolbar (visible when connected)
- Clickable "Connected" status item opens the server URL
- "Open in Browser" button in the welcome view (visible when not connected)

• **Build safeguards (defense-in-depth)** — Seven independent layers now prevent shipping an extension that silently fails to activate:

- `npm install` auto-compiles TypeScript via `postprepare` hook — fresh clones and `git clean` are self-healing
- Pre-commit hook verifies `out/extension.js` exists alongside the existing type check
- F5 launch config (`launch.json`) with `preLaunchTask` ensures compilation before every debug run
- Background `watch` task available for continuous recompilation during development
- Publish pipeline verifies `out/extension.js` on disk after `tsc` exits
- Publish pipeline inspects VSIX archive contents before allowing publish
- Post-install verification confirms the extension directory exists on disk after `code --install-extension`

• **Package upgrade detection** — On activation the extension checks pub.dev for newer versions of `saropa_drift_advisor`. If the workspace pubspec.yaml has an older constraint, an upgrade notification offers a one-click update (rewrites the constraint and runs `pub get`). Checks are throttled to once per hour; network errors are silently ignored.

• **Conditional "Add Package" button** — The "Add Saropa Drift Advisor" button, welcome view link, and tools tree item are now hidden when the package is already present in pubspec.yaml. A new context key `driftViewer.packageInstalled` drives all three locations.

• **Pubspec file watcher** — A `PackageStatusMonitor` watches `pubspec.yaml` for changes and keeps the installed-state UI in sync automatically.

• **Version display in Database header** — The Database section header shows the extension version (e.g. "v1.6.1") at all times, whether connected or disconnected.

• **About Saropa icon** — An `$(info)` icon in the Database section title bar opens `ABOUT_SAROPA.md` in VS Code's markdown preview, giving users quick access to the Saropa product overview. Also available via Command Palette.

### Fixed

• **Server banner invisible on Android emulator** — The startup banner used `stdout.writeln()`, which writes to the native process stdout — invisible on Android because Flutter only intercepts `print()`/Zone output. Switched to `print()` (with `// ignore: avoid_print`) so the banner appears as clean `I/flutter` lines, matching Isar Inspector's banner style.

---

## [1.6.1]

The extension couldn't connect to running servers and now has an About button for easy access to release notes. [log](https://github.com/saropa/saropa_drift_advisor/blob/v1.6.1/CHANGELOG.md)

### Added

• **About Saropa Drift Advisor** — "About Saropa Drift Advisor vX.Y.Z" item at the top of the Drift Tools sidebar. Opens the bundled CHANGELOG.md in VS Code's markdown preview; falls back to the GitHub changelog if the local file is missing. Also available via Command Palette (`Saropa Drift Advisor: About`).
• **Existing debug session detection** — When the extension activates after a debug session is already running (late activation), it now detects the active Dart/Flutter session and immediately attempts VM Service connection. Previously only `onDidStartDebugSession` was used, which never fires for sessions that started before the extension loaded.

### Fixed

• **Server discovery rejected valid servers** — The secondary validation in `ServerDiscovery._validateServer` checked `Array.isArray(data)` on the `/api/schema/metadata` response, but the server returns `{ tables: [...] }` (an object wrapping the array). Health checks passed but every server was then silently rejected, preventing the extension from ever connecting. Now accepts both raw array and wrapped `{ tables: [...] }` formats.
• **VM Service connection too impatient for emulator debugging** — The original `tryConnectVm` made only 2 quick attempts with 500ms delay, but on Android emulators the Drift debug server typically needs 5–15 seconds after VM Service is available before its extension methods are registered. Rewrote as a two-phase approach: Phase 1 connects the WebSocket (2 quick attempts — the VM port is auto-forwarded by Flutter); Phase 2 patiently polls health with increasing delays (500ms → 1s → 2s → 3s → 5s, ~30s total) while the app initializes. Includes a concurrency guard to prevent concurrent connection attempts.
• **Core debug commands silently failed to register** — `registerDebugCommands` (which wires VM Service lifecycle, debug session listeners, and server connectivity) was the last call in `registerAllCommands`. If any preceding feature module threw during registration, the entire function aborted and the core connection logic never ran — silently. Discovery kept scanning ports, but no VM Service handlers were registered, producing the symptom of 17+ minutes of only port-scan output with zero VM connection attempts. Fixed by calling `registerDebugCommands` first and wrapping each of the 27 feature modules in individual try/catch blocks so one failing module cannot take down the rest.

---

## [1.6.0]

VM Service connection now works — Android emulator connects without port forwarding. Web UI gets a visual polish layer loaded from CDN, and the published package is leaner. [log](https://github.com/saropa/saropa_drift_advisor/blob/v1.6.0/CHANGELOG.md)

### Added

• **Enhanced CSS loaded from jsDelivr CDN** — The web UI dynamically loads a `drift-enhanced.css` stylesheet from jsDelivr, version-pinned to the exact release tag. Adds polished button hover/active states, focus rings for accessibility, zebra-striped tables with hover highlighting, sticky table headers, a pulsing live indicator, accented collapsible section headers, card-style expanded sections, smooth theme transitions, custom scrollbars, and chart/toast polish. Falls back gracefully to inline styles when offline or CDN-blocked (3-second timeout).

• **`.pubignore`** — Excludes `web/`, `extension/`, `.github/`, and Node tooling from the pub.dev package, reducing download size for consumers.

### Fixed

• **VM Service connection never worked** — The extension called `getIsolates` (not a valid Dart VM Service method) instead of `getVM` when resolving isolates, causing every VM Service connection to silently fail and fall back to HTTP. This made Android emulator connections fragile since HTTP requires `adb forward`. With the fix, the extension connects via VM Service (like Isar Inspector), which Flutter auto-forwards — no manual port forwarding needed.

• **Isolate selection** — When multiple isolates exist (e.g. main + vm-service), the extension now prefers non-system isolates to reliably find the one where `DriftDebugServer` registers its extensions.

## [1.5.1]

Web UI now shows the server version and has a proper favicon. [log](https://github.com/saropa/saropa_drift_advisor/blob/v1.5.1/CHANGELOG.md)

### Added

• **Version badge in web UI header** — The page header now displays the Drift Advisor version (e.g. "v1.5.0") fetched from the `/api/health` endpoint, so users can verify which server version is running. The health endpoint now includes a `version` field.

• **Favicon** — Added an inline SVG database-cylinder favicon via `<link rel="icon">` data URI in the HTML head, and a lightweight 204 No Content route for `/favicon.ico` requests to silence browser console 404s.

• **Troubleshooting webview panel** — The sidebar "Troubleshooting" button now opens a rich webview with a quick checklist, connection architecture diagram, collapsible FAQ sections for common issues, and action buttons (Retry Connection, Forward Port, Select Server, Open Output Log, Open Settings).

### Changed

• **Renamed "Add package to project" to "Add Saropa Drift Advisor"** — The sidebar button, command palette entry, and walkthrough step now use the clearer name.

• **Sidebar welcome panel formatting** — Replaced `**` markdown bold (which rendered as literal asterisks in VS Code panels) with CAPS headers (GET STARTED, RESOURCES). Moved troubleshooting tips out of inline text into the new webview panel.

• **Walkthrough dependency type corrected** — Changed "dev dependencies" to "dependencies" since the package must be a regular dependency (users import it in `lib/` code).

• **Package version constraint** — Updated the "Add Saropa Drift Advisor" button to install `^0.3.0`.

### Fixed

• **"Add Saropa Drift Advisor" silent failure on missing dependencies section** — When a pubspec.yaml had no `dependencies:` section, the error was thrown but not caught, causing the command to fail silently with no user notification. Now properly caught and shown as an error message.

• **"Already present" feedback** — When the package was already in pubspec.yaml, the success message now explicitly says so instead of only showing "Run your app with the Drift debug server to connect."

• **Query builder LIKE operators caused JS syntax error** — The Dart `'''` string escape `"\"` was consumed by Dart as an escaped double-quote, producing `""` in the served JavaScript. This broke `LIKE`, `NOT LIKE`, and `LIKE_START` operator conditions in the query builder with `Uncaught SyntaxError: missing ) after argument list`. Fixed by using `"\\"` so Dart emits `\"` (a valid JS string escape).

### Internal

• **Publish script syncs PACKAGE_VERSION** — `write_version(DART, ...)` now automatically updates the `PACKAGE_VERSION` constant in `add-package.ts` so the "Add Saropa Drift Advisor" button always installs the correct version after a release.


---

## [1.4.3]

Most of the extension's ~105 commands were only accessible via the Command Palette. Five new discovery surfaces ensure every major feature has a visible entry point. [log](https://github.com/saropa/saropa_drift_advisor/blob/v1.4.3/CHANGELOG.md)

### Added

• **Getting Started Walkthrough** — VS Code's built-in walkthrough system (Help → Get Started). Five illustrated steps guide new users from package installation through health checks and migration generation. Each step has a completion event so progress persists.

• **Quick Actions in Database Explorer** — Collapsible "Quick Actions" node at the top of the tree when connected. Five categorized groups (Schema, Health, Data, Visualization, Tools) with clickable items that execute commands directly.

• **Drift Tools sidebar view** — Always-visible "Drift Tools" tree view in the sidebar listing all major commands grouped by category. Server-dependent items show a disabled state with "(not connected)" when offline, teaching users what the extension can do before they connect.

• **Health Score status bar** — Displays the last computed health grade (e.g. `Health: A (92)`) color-coded by grade. Hidden until the first health check; click re-runs the check. Priority 80, between the connection indicator and invariants.

• **Drift Tools QuickPick status bar** — Shows a `$(tools) Drift Tools` button when connected. Click opens a QuickPick with the 15 most-used commands, searchable by description. Priority 60.

• **Dashboard on-connect notification** — On first server connection each session, an information message offers to open the Dashboard. "Don't Show Again" persists per workspace. Controlled by `driftViewer.dashboard.showOnConnect` setting.

• **Feature Discovery dashboard widget** — New `featureDiscovery` widget type in the default dashboard layout. Renders five category cards with command buttons, letting users explore all features from a single panel.

---

## [1.4.1]

Select any schema change from the timeline and instantly generate the reverse migration — both the rollback SQL and the Dart code. [log](https://github.com/saropa/saropa_drift_advisor/blob/v1.4.1/CHANGELOG.md)

### Added

• **Migration Rollback Generator** — Command palette → _Generate Migration Rollback_: pick a schema change from the timeline QuickPick, then the extension generates the reverse SQL (`DROP TABLE`, `ALTER TABLE DROP COLUMN`, etc.) and wraps it in Dart `customStatement()` calls. Opens in a new editor tab for review. Handles all change types: table add/drop, column add/remove, type changes, and FK changes. Warns about SQLite limitations (DROP COLUMN requires 3.35.0+, type/FK changes need manual table recreation). Multi-line CREATE TABLE uses triple-quote Dart strings for readability. Rollback statements are ordered correctly (drops before recreates). Warnings are deduplicated.

• **ADB auto-forward on debug start** — When a Flutter/Dart debug session starts, the extension now waits 5 seconds then automatically attempts ADB port-forwarding if no server is found. Complements the existing discovery-based forwarding for emulator debugging. Timer is properly cleaned up on deactivation.

### Fixed

• **Welcome-view buttons gave no user feedback** — "Retry Connection" now shows an info notification on click. "Select Server" and "Forward Port" errors are now caught and displayed. Previously all three buttons appeared to do nothing when clicked.

• **Discovery event not fired on state transitions** — `onDidChangeServers` now also fires when the discovery state machine transitions (e.g. searching → backoff), allowing listeners like the auto-adb-forward trigger to fire even when the server list stays permanently empty.

### Changed

• **Dart server banner uses print()** — The startup banner now uses `print()` instead of `ctx.log()` → `dart:developer.log()`, which attached expandable stack traces to every line in the debug console. Displays as clean `I/flutter` lines matching Isar Inspector's banner style. (`stdout.writeln()` was tried first but is invisible on Android because Flutter only intercepts `print()`/Zone output.)

---

## [1.4.2]

Fixes a critical bug that prevented VM Service auto-detection during Flutter/Dart debugging, hardens the entire connection/discovery subsystem with timeouts, retries, and exponential backoff, and adds comprehensive connection diagnostics. [log](https://github.com/saropa/saropa_drift_advisor/blob/v1.4.2/CHANGELOG.md)

### Fixed

• **VM Service output listener was non-functional** — The debug adapter tracker used `onOutput()` which does not exist on the VS Code `DebugAdapterTracker` interface. Replaced with `onDidSendMessage()` to correctly intercept DAP output events containing the VM Service URI. This was the primary cause of "drift is never detected" when debugging.

• **"Select Server" button appeared to do nothing** — When no servers were found, a bare toast notification was easy to miss. Now shows an actionable warning with **Retry** and **View Log** buttons plus guidance about `DriftDebugServer.start()`.

• **VM Service URI regex only matched IPv4 addresses** — Hostnames (`localhost`, `my-dev.local`) and IPv6 addresses (`[::1]`) were silently rejected. Broadened the regex to match all valid host formats.

### Added

• **Request timeouts and retry** — All HTTP API calls now use `fetchWithTimeout` (8s default) and `fetchWithRetry` (single retry on transient errors with 200ms delay). Prevents fetch calls from hanging indefinitely on Windows and other platforms.

• **Discovery backoff auto-recovery** — After 3 polls in backoff state (~90s), discovery automatically resets to searching. Users no longer wait indefinitely for the extension to try again.

• **Generation watcher exponential backoff** — Poll errors now use exponential backoff (1s → 2s → 4s → … → 30s cap) instead of fixed 1s retries. First and every 10th error is logged. Resets to 1s on success.

• **VM Service connect retry** — VM connection attempts now retry once (500ms delay) before failing. Isolate resolution also retries once (300ms delay) to handle VM startup timing.

• **Connection diagnostics in Output channel** — Server discovery and generation watcher write timestamped diagnostic logs to the _Saropa Drift Advisor_ Output channel: port scan activity, health check failures, schema validation, state transitions, and backoff behavior.

---

## [1.4.0]

Export your database as a shareable, self-contained HTML report — open it in any browser with zero dependencies. Detects when queries slow down across debug sessions and alerts you before regressions become production issues. [log](https://github.com/saropa/saropa_drift_advisor/blob/v1.4.0/CHANGELOG.md)

### Added

• **Query Performance Regression Detector** — Tracks per-query performance baselines across debug sessions using exponential moving average. When a debug session ends, compares current query durations against historical baselines and shows a VS Code warning if any query exceeds the configurable threshold (default 2x slower). Baselines adapt over time (capped at 20 samples) and persist in workspace state. Configurable via `driftViewer.perfRegression.enabled` and `driftViewer.perfRegression.threshold`. Reset baselines via Command Palette: _Reset Query Performance Baseline_ (individual) or _Reset All Performance Baselines_.

• **Portable Snapshot Report** — Command palette → _Export Portable Report_: select tables, collect data with progress, save as a single HTML file. The report includes a table sidebar with row counts, paginated data view (50 rows/page), client-side search/filter, light/dark theme toggle, optional schema SQL and anomaly summary, and a generation timestamp footer. Configurable via `driftViewer.report.defaultMaxRows`, `.includeSchema`, `.includeAnomalies`. Tables with 10,000+ rows are auto-deselected. XSS-safe HTML escaping throughout. Also available as a toolbar icon in the Database Explorer view.

• **Schema Compliance Rules** — Define team-wide schema conventions in a `.drift-rules.json` config file. The extension validates the live database against naming conventions (snake_case, camelCase, PascalCase, UPPER_SNAKE for tables and columns), FK column naming patterns (`{table}_id`), required columns (with optional type enforcement and per-table exclusions), and four built-in structural rules: `no-text-primary-key`, `require-pk`, `max-columns`, `no-nullable-fk`. Violations appear as VS Code diagnostics on Dart table class files with severity overrides. Quick-fix actions to disable individual rules or open the config file. JSON Schema provides autocomplete and validation for `.drift-rules.json`. File watcher auto-refreshes diagnostics on config changes. Toggle via `driftViewer.diagnostics.categories.compliance`.

### Maintenance

• **Modularization (final 18 files)** — All 18 TypeScript source files that exceeded the 300-line quality gate are now within limits. Source splits: `api-client-sessions.ts` (session/import HTTP methods), `health-metrics-secondary.ts` (table-balance, schema-quality, recommendations), `data-narrator-describe.ts` (narrative description helpers), `import-history-format.ts` (entry formatting). Mock splits: `vscode-mock-diagnostics.ts`, `vscode-mock-extras.ts` (debug/extensions/tasks). Test helpers consolidated: `diagnostic-test-helpers.ts` shared across 3 provider tests; 5 test files split to extract utility/batch tests. Zero violations; all 1570 tests pass.

---

## [1.3.4]

Implemented a master switch to turn the extension off, and an “Add package to project” flow. [log](https://github.com/saropa/saropa_drift_advisor/blob/v1.3.4/CHANGELOG.md)

### Added

• **Master switch (driftViewer.enabled)** — Extension can be turned off entirely via Settings → Saropa Drift Advisor → **Enable** (`driftViewer.enabled`, default true). When false: no server discovery or connection, watcher stopped, status bar shows "Drift: Disabled", Database view shows a welcome with [Open Settings]. Toggling back on starts discovery (if enabled), watcher, and refreshes tree/codelens/diagnostics.

• **Add package to project** — Installing the extension should install the package, and vice versa. Command **Saropa Drift Advisor: Add package to project** adds `saropa_drift_advisor` to the project’s `pubspec.yaml` (dependencies) and runs `dart pub get` / `flutter pub get`. Welcome view (when no server connected) includes [Add package to project]; command also in Command Palette and Database Explorer view.

### Maintenance

• **Modularization (Phases 6–7 and remaining files)** — Health scorer split into `health-metrics.ts` (all 6 metric scorers) and slim `health-scorer.ts`; test fixtures under `test/fixtures/health-test-fixtures.ts` and health tests split into `health-scorer-grade.test.ts`, `health-panel.test.ts`, `health-scorer.test.ts`. Clipboard import: `clipboard-import-actions.ts` (validation/import flow, `executeImportFlow`), `checkSchemaFreshnessForImport` in schema-freshness; panel under 300 lines. Debug commands split into `debug-commands-types.ts`, `debug-commands-perf.ts`, `debug-commands-panels.ts`, `debug-commands-vm.ts` with slim orchestrator. Import: `import-sql-helpers.ts` (`escapeSqlValue`, `findExistingRow`, `insertRow`, `updateRow`); `import-executor.ts` under 300 lines. Engines: `relationship-engine-cache.ts` (TTL-cached FK/schema fetchers); `relationship-engine.ts` under 300 lines. `api-client.ts` trimmed. Aligns with `plans/modularization-plan.md`; no source file exceeds 300 lines except api-client (301).

• **Pub.dev score checks in publish script** — The Dart publish pipeline (`python scripts/publish.py dart`) now runs pub.dev score verification: downgrade check (`flutter pub downgrade` then `flutter analyze lib/`), restore with `flutter pub upgrade`, then outdated check (`dart pub outdated --no-dev-dependencies --no-dependency-overrides`). Ensures lower-bound compatibility and up-to-date constraints before publish. Plan 68 (fix pub score) archived to `plans/history/20250314/fix-pub-score.md`.

---

## [1.3.2]

Health Score, schema linter, and timeline now work over the VM Service—so you can use them on an emulator without HTTP. [log](https://github.com/saropa/saropa_drift_advisor/blob/v1.3.2/CHANGELOG.md)

### Added

• **Extension entry point modularization (Batch 5)** — `extension.ts` split into focused setup modules: `extension-providers.ts` (tree, language, file decoration providers), `extension-diagnostics.ts` (diagnostic manager and disable/clear/copy commands), `extension-editing.ts` (change tracker, editing bridge, pending changes), `extension-commands.ts` (all command registration). Main `extension.ts` stays ~125 lines; activate/deactivate orchestrate setup in sequence. Aligns with modularization plan Phase 5.

• **Index suggestions over VM Service (Plan 68)** — When connected via VM only (e.g. emulator debug), Health Score, health commands, schema linter, and timeline no longer fail: `indexSuggestions()` now uses VM RPC `getIndexSuggestions`. Dart: `AnalyticsHandler.getIndexSuggestionsList()` + `Router.getIndexSuggestionsList()` + `VmServiceBridge` handler; extension: `VmServiceClient.getIndexSuggestions()`, `DriftApiClient` VM branch; HTTP response parsing fixed for `{ suggestions, tablesAnalyzed }` shape.

• **Stale override checker script** — `scripts/check_stale_overrides.py` classifies `dependency_overrides` as required vs stale by running a version solve with each override removed. Addresses false positives from tools that report overrides as "safe to remove" without re-solving (see `bugs/history/20260313/stale_override_false_positive.md`). Unit tests in `scripts/tests/test_check_stale_overrides.py`.

### Changed

• **Connection log disposal** — Output channel "Saropa Drift Advisor" is now registered in `context.subscriptions` so it is disposed on deactivate.

---

## [1.2.0]

Debug sessions can connect over the Dart VM Service instead of HTTP—no port forwarding or discovery needed when you’re already debugging. [log](https://github.com/saropa/saropa_drift_advisor/blob/v1.2.0/CHANGELOG.md)

### Added

• **VM Service as debug channel (Plan 68)** — When a Dart or Flutter debug session is active, the extension tries to connect via the Dart VM Service WebSocket (same channel as the debugger) instead of HTTP port discovery. No adb forward or port scan needed on emulators: connection “just works” when debugging. The app registers `ext.saropa.drift.*` RPCs (getHealth, getSchemaMetadata, getTableFkMeta, runSql) that mirror the HTTP API; the extension uses them when the VM Service URI is available from the debug session. HTTP and discovery remain for “Open in browser” and when not debugging.

• **VM Service nice-to-haves** — Status bar shows "VM Service" when connected via VM; hot restart clears VM state and refreshes UI (no stuck state); panel and "Open in browser" show a clear fallback/info message when only VM is reachable (no HTTP); performance, anomalies, and explain SQL work over VM; unit tests for `parseVmServiceUriFromOutput`; Plan 68 doc updated with manual test steps.

• **Connection robustness (Plan 68)** — VM Service URI validated before connect; **Output > Saropa Drift Advisor** logs connection attempts, success, and failure reasons; after hot restart, next VM URI from debug output auto-retriggers connect; welcome view points to Output for troubleshooting when debugging Flutter/Dart.

### Fixed

• **Anomaly scan (HTTP)** — Extension now calls `/api/analytics/anomalies` (matches server) and accepts both `{ anomalies: [...] }` and array responses.

---

## [1.3.0]

Android emulator users get automatic port forwarding when debugging, so the extension can reach the Drift server inside the emulator. [log](https://github.com/saropa/saropa_drift_advisor/blob/v1.3.0/CHANGELOG.md)

### Added

• **Android emulator connection** — When no Drift server is found and a Flutter/Dart debug session is active, the extension automatically runs `adb forward tcp:8642 tcp:8642` (or the configured port) and retries discovery so the host can reach the server running inside the emulator. Throttled to one attempt per 60 seconds per workspace.

• **Forward Port (Android Emulator) command** — Manual command and welcome-view link to run `adb forward` and retry discovery. Shows a progress notification while forwarding. Useful when auto-forward did not run or failed (e.g. adb not on PATH).

### Changed

• **Disconnected welcome view** — Troubleshooting now includes Android emulator: explains that the extension will try to forward the port automatically when debugging, and offers the Forward Port (Android Emulator) action and the manual `adb forward` command. Corrected server setup wording to `startDriftViewer()` / `DriftDebugServer.start()`.

### Fixed

• The changelog now has the correct version sequence

---

## [1.1.0]

A welcome screen when disconnected and richer VS Code Marketplace metadata—smoother first run and easier to find the extension. [log](https://github.com/saropa/saropa_drift_advisor/blob/v1.1.0/CHANGELOG.md)

### Added

• **Disconnected Welcome View** — When no Drift debug server is connected, the Database panel now shows a helpful welcome screen instead of a bare "Disconnected" message. Includes troubleshooting checklist (app running, DriftDbViewer initialized, port config, firewall), action buttons (Retry Connection, Select Server), and resource links (Getting Started guide, Report Issue). Uses VS Code's native viewsWelcome API for consistent styling.

### Changed

• **VS Code Marketplace metadata** — Added rich marketplace metadata: categories (Debuggers, Visualization), 15 searchable keywords (dart, drift, flutter, sqlite, database, orm, schema, debug, visualization, data viewer, moor, query, sql, table viewer, database explorer), homepage link, issues link, and gallery banner. The extension listing now shows Project Details with GitHub activity, and Resources links to Issues, Repository, Homepage, License, and Changelog.

• **Dependabot Configuration** — `.github/dependabot.yaml` extended to keep npm dependencies up to date; weekly schedule with grouped minor/patch updates for both root and extension directories.

---

## [1.0.1]

Clipboard import, interactive ER diagrams, data stories, custom dashboards, and invariant checking—a big feature drop. [log](https://github.com/saropa/saropa_drift_advisor/blob/v1.0.1/CHANGELOG.md)

### Fixed

• **VS Code extension test isolation** — Fixed missing mock methods in `vscode-mock.ts` (`workspace.onDidSaveTextDocument`, `workspace.onDidChangeTextDocument`, `statusBarItem.hide()`) that caused test cascade failures when running the full test suite via CLI. Tests passed individually in Test Explorer but failed in batch due to incomplete stub cleanup when `beforeEach` threw.

### Added

• **Clipboard Import** — Paste tabular data from Excel, Google Sheets, or CSV directly into any database table. Right-click a table and select "Paste from Clipboard". Auto-detects format (TSV, CSV, HTML tables), auto-maps columns by name, and shows a preview before import. Four import strategies: Insert only, Skip conflicts, Upsert (insert or update), and Dry run (preview without changes). Pre-import validation checks types, NOT NULL constraints, and foreign key references. All imports run in transactions with automatic rollback on failure. Full undo support—revert any import from history. Schema freshness checking warns if table structure changed since you copied data.

• **ER Diagram** — Auto-generate an interactive entity-relationship diagram from the live schema. Tables render as boxes with column lists (PK with 🔑, FK with 🔗), relationships as connecting arrows. Three layout modes: Auto (force-directed), Hierarchical (parent tables on top), and Clustered (grouped by FK relationships). Drag tables to rearrange, zoom with scroll wheel, pan by dragging canvas. Right-click a table for quick actions (View Data, Seed, Profile). Export to SVG or Mermaid markdown. Auto-refreshes when schema changes. Access via Command Palette or the tree view title bar icon.

• **Data Story Narrator** — Right-click any table and select "Tell This Row's Story" to generate a human-readable narrative that follows FK relationships. Enter a primary key value and see a paragraph-style description: the root entity with notable columns, parent relationships ("Belongs to User Alice via user_id"), and child relationships ("Has 3 orders: ..."). Supports truncated results for large datasets, detects name columns automatically (name, title, email, etc.), and outputs both plain text and Markdown. Copy narrative to clipboard or regenerate. Loading spinner and error states included.

• **Custom Dashboard Builder** — Drag-and-drop dashboard with resizable widget tiles. Choose from 10+ widget types (row counts, health score, query stats, anomaly list, etc.). Save/load named layouts per workspace. Real-time data via the shared API client.

• **Data Invariant Checker** — Define SQL-based invariants (e.g. "user.email must be unique", "order.total > 0") and run them on demand or continuously. Violations surface as VS Code diagnostics with severity levels. Invariant templates for common patterns (uniqueness, referential integrity, range checks).

• **Centralized Diagnostic Manager** — Unified diagnostic pipeline that merges schema linter, anomaly detection, and invariant violations into a single Problems panel view with consistent severity mapping and quick-fix actions.

• **Health Score + Pre-Launch Integration** — The pre-launch health check task now computes and displays the overall health grade (A+–F) with per-metric breakdown. Terminal output includes clickable "View Health Score Dashboard" link.

• **Quick Actions for Health Metrics** — Health Score dashboard cards are now clickable. Index coverage opens the Query Cost Analyzer with suggestions; anomaly count opens the anomaly scan panel.

• **Profile-Informed Seeding** — Test data seeder uses column profiling stats (min/max, patterns, distributions) to generate more realistic fake data that matches your actual data characteristics.

## [0.4.1]

Database health score, query cost analysis with index suggestions, saved filters, and row impact analysis—analytics and insights land here. [log](https://github.com/saropa/saropa_drift_advisor/blob/v0.4.1/CHANGELOG.md)

### Added

• **Database Health Score** — Overall database health grade (A+–F) computed from six weighted metrics: index coverage, FK integrity, null density, query performance, table balance, and schema quality. Webview dashboard with color-coded cards, per-metric scores, and actionable recommendations.

• **Query Cost Analyzer** — Run any SQL query and see its execution plan visualized as a color-coded tree. Highlights full table scans, missing indexes, and temporary sorts. Suggests CREATE INDEX statements based on WHERE, JOIN, and ORDER BY analysis. Click "Run" to create an index and re-analyze to see the improvement. Access via Command Palette: "Saropa Drift Advisor: Analyze Query Cost".

• **Saved Filters** — Save named filter/sort/column-visibility configurations per table and switch between them instantly. A sticky toolbar in the data panel provides a dropdown of saved filters with Apply, Save As, Clear, and Delete controls. Filters persist in workspace state and execute via the existing SQL endpoint.

• **Row Impact Analysis** — Right-click any table and select "Analyze Row Impact" to see what breaks if you delete a row. Shows outbound dependencies (parents), inbound dependents grouped by table with counts, cascade delete summary, and generates safe DELETE SQL in correct FK order.

## [0.4.0]

Smaller bundle for apps that ship the package: in-app Flutter overlay removed; use the VS Code extension or browser instead. [log](https://github.com/saropa/saropa_drift_advisor/blob/v0.4.0/CHANGELOG.md)

### Removed

• **In-app Flutter overlay** — Removed `DriftViewerOverlay`, `DriftViewerFloatingButton`, and `lib/flutter.dart`. The VS Code extension and browser already provide the same functionality without shipping native code in consumer APKs.

• **6 dependencies** — Removed `webview_flutter`, `webview_flutter_android`, `url_launcher`, `intl`, `meta`, `collection`, and the `flutter` SDK dependency. The package is now pure Dart with a single dependency (`crypto`).

### Added

• Marketplace icon for the VS Code extension (128×128 database + delta symbol with pink-to-cyan gradient).

• View-level icons for Schema Search, Database, Pending Changes, and Drift Queries sidebar entries.

### Changed

• Added MIT license for Open VSX release.

• Refactored extension source to enforce 300-line file limit: split `extension.ts` (1359→300 lines) into 9 command modules plus a status-bar utility, split `vscode-mock.ts` (719→299 lines) into 3 files, extracted `seeder-html-shell.ts` from `seeder-html.ts`, and extracted shared test fixtures from 7 test files.

• Renamed all user-facing display text from "Drift Viewer" to "Saropa Drift Advisor" across extension commands, activity bar, status bar, generated code comments, documentation, and example app.

## [0.3.0]

Package renamed to `saropa_drift_advisor`—update `pubspec.yaml` and imports; APIs are unchanged. Also: visual query builder, smarter data formatting, per-table state, and one-click cell copy. [log](https://github.com/saropa/saropa_drift_advisor/blob/v0.3.0/CHANGELOG.md)

### Added

• **VS Code extension: Isar-to-Drift schema generator** — Convert Isar `@collection` classes to Drift table definitions. Scan the workspace to auto-discover all `@collection` / `@embedded` files, or manually pick Dart source files or Isar JSON schema exports. The parser extracts collections, embedded objects, links, indexes, and enum fields. Type mapper converts Isar types to Drift column types, generates foreign key columns for `IsarLink`, junction tables for `IsarLinks`, and supports configurable strategies for embedded objects (JSON serialization or column flattening) and enums (ordinal int or name text). Interactive webview panel shows a live preview of the generated Drift code with options to copy, open as editor tab, or save to file. New files: `isar-gen/isar-gen-types.ts`, `isar-gen/isar-parser.ts`, `isar-gen/isar-json-parser.ts`, `isar-gen/isar-type-mapper.ts`, `isar-gen/isar-drift-codegen.ts`, `isar-gen/isar-gen-panel.ts`, `isar-gen/isar-gen-html.ts`, `isar-gen/isar-gen-commands.ts`, `isar-gen/isar-workspace-scanner.ts`.

• **VS Code extension: Pre-launch health check tasks** — Register VS Code tasks ("Drift: Health Check", "Drift: Anomaly Scan", "Drift: Index Coverage") that can be wired into `launch.json` as `preLaunchTask` to automatically scan for database issues every time you press F5. Tasks use `CustomExecution` with a `Pseudoterminal` for formatted terminal output showing connection status, index coverage gaps, and data anomalies with severity icons. Exit code 1 blocks launch when errors are found; warnings pass by default (configurable via `driftViewer.tasks.blockOnWarnings`). A `drift-health` problem matcher routes task output to the Problems panel. New API client methods: `indexSuggestions()`, `anomalies()`. New files: `tasks/drift-task-provider.ts`, `tasks/health-check-runner.ts`.

• **VS Code extension: Peek / Go to Definition for SQL names** — Place the cursor on a table or column name inside a raw SQL string in Dart code, then press Alt+F12 (Peek Definition) or F12 (Go to Definition) to jump to the corresponding Drift table class or column getter. Table names are resolved via snake_case-to-PascalCase conversion (e.g. `users` → `class Users extends Table`), and column names match both snake_case and camelCase getters (e.g. `created_at` → `get createdAt`). Schema metadata is cached from the API with 30-second TTL and auto-cleared on generation changes. New files: `definition/drift-definition-provider.ts`, `definition/sql-string-detector.ts`.

• **VS Code extension: CodeLens on Drift table classes** — Inline annotations appear above `class ... extends Table` definitions in Dart files. Each table class shows a live row count from the running server (e.g. "42 rows"), a "View in Saropa Drift Advisor" action that opens the webview panel, and a "Run Query" action that executes `SELECT *` and opens the results as JSON in a side editor. Row counts update automatically via the generation watcher. When the server is offline, lenses show "not connected". Dart PascalCase class names are mapped to SQL snake_case table names with case-insensitive fallback. New files: `codelens/drift-codelens-provider.ts`, `codelens/table-name-mapper.ts`. New commands: `driftViewer.viewTableInPanel`, `driftViewer.runTableQuery`.

• **VS Code extension: Query Performance Panel in Debug sidebar** — Live-updating tree panel appears in the Run & Debug sidebar during active Dart debug sessions when the Drift server is connected. Shows aggregate stats (query count, total/avg duration), slow queries (>500ms with flame icon, >100ms with watch icon), and recent queries in collapsible categories. Click any query to view full SQL with duration, row count, and timestamp in a readonly editor. Auto-refreshes every 3 seconds (configurable via `driftViewer.performance.refreshIntervalMs`). Panel visibility controlled by compound `when` clause (`inDebugMode && driftViewer.serverConnected`) with server health check on debug session start. Toolbar buttons for manual refresh and clearing stats. Concurrency guard prevents overlapping refresh calls. New files: `debug/performance-items.ts`, `debug/performance-tree-provider.ts`. New commands: `driftViewer.refreshPerformance`, `driftViewer.clearPerformance`, `driftViewer.showQueryDetail`. New settings: `driftViewer.performance.slowThresholdMs`, `driftViewer.performance.refreshIntervalMs`.

• **VS Code extension: Saropa Log Capture integration** — Optional bridge to the Saropa Log Capture extension for unified log timeline visibility. When `saropa.saropa-log-capture` is installed, registers as an integration provider contributing session-start headers (server URL, slow threshold) and session-end summaries (query stats, top slow queries). Connection lifecycle events are written via `writeLine()`. Supports three verbosity modes via `driftViewer.performance.logToCapture` setting: `off`, `slow-only` (default), and `all`. No hard dependency — all methods are no-ops when the extension is absent. New file: `debug/log-capture-bridge.ts`.

• **Web UI: visual query builder** — Collapsible "Query builder" section appears below table metadata when viewing any table. Build SQL queries visually with SELECT column checkboxes, type-aware WHERE clause builder (text: contains/equals/starts-with; numeric: comparison operators; blob: null checks only), ORDER BY column/direction picker, and LIMIT control. Live SQL preview updates as selections change. "Run query" executes via `POST /api/sql` with loading state feedback; "Reset to table view" returns to raw data. Query builder state is persisted per table via localStorage. Column types sourced from existing `/api/schema/metadata` endpoint — no new server endpoints.

• **Web UI: copy cell to clipboard** — Hover over any data table cell to reveal a copy button. Click copies the raw cell value via `navigator.clipboard.writeText()` with a brief "Copied!" toast notification (auto-dismisses after 1.2s). Works alongside FK navigation links without interference (copy button uses `stopPropagation`). Copy buttons are preserved during search highlighting.

• **Web UI: filter state caching per table** — Table view state (row filter text, pagination limit/offset, display format preference, query builder configuration) is automatically saved to localStorage when switching tables and restored when returning. "Clear state" button in the pagination bar resets all cached state for the current table. localStorage key pattern: `drift-viewer-table-state-{tableName}`.

• **Web UI: data type display toggle** — "Display: Raw / Formatted" dropdown in the table toolbar toggles between raw SQLite values and human-readable formatting. Epoch timestamps (seconds or milliseconds after year 2000) in date-named columns display as ISO 8601 strings. Integer 0/1 in boolean-named columns (`is_*`, `has_*`, `*_enabled`, etc.) display as `true`/`false`. Formatted cells show the raw value below in muted text and in the tooltip, both individually copyable. Preference is saved per table as part of filter state caching.

---

## [0.2.4]

Charts, natural-language queries, anomaly detection, session sharing, and a query performance monitor—the web UI gets a serious upgrade. [log](https://github.com/saropa/saropa_drift_advisor/blob/v0.2.4/CHANGELOG.md)

### Added

• **Collaborative debug sessions** — Share the current viewer state (selected table, SQL query, filters, pagination) as a URL. Click the "Share" button in the header, optionally add a note, and the URL is copied to the clipboard. Teammates open the URL to see the exact same view with an info bar and any text annotations. Server stores sessions in memory with 1-hour auto-expiry and a 50-session cap. Three new endpoints: `POST /api/session/share`, `GET /api/session/{id}`, `POST /api/session/{id}/annotate`. Session business logic is extracted into a dedicated `DriftDebugSessionStore` class (`lib/src/drift_debug_session.dart`) for clean separation from HTTP handling. Client-side JS is modularized into seven named functions for state capture, clipboard handling, UI restoration, and annotation rendering.

• **Web UI: SQL bookmarks** — Save, name, and organize frequently used SQL queries. Bookmarks persist in `localStorage` and appear in a dropdown below the history selector. Save current query with a custom name, delete selected bookmarks, export all as JSON for version control, and import from JSON with automatic deduplication. Purely client-side — no server changes.

• **Web UI: EXPLAIN QUERY PLAN viewer** — "Explain" button next to Run in the SQL runner. Sends `POST /api/sql/explain` to visualize SQLite's query execution plan as an indented tree. Full table scans are highlighted red with a warning; index lookups are highlighted green. Read-only SQL validation is enforced before explaining. Server handler reuses shared body-reading/validation helper (`_readAndValidateSqlBody`) to avoid duplication with the Run SQL handler. Run and Explain buttons disable each other during requests to prevent race conditions.

• **Web UI: data charts** — Bar, pie, line/time-series, and histogram charts rendered as inline SVG from SQL query results. Chart type selector, X/Y axis pickers, and Render button appear after SQL results. Large datasets (>500 rows) are automatically sampled for SVG performance. Pie chart groups slices below 2% into "Other" and handles single-slice (100%) rendering. All chart colors use CSS variables for theme support. Zero new dependencies (pure inline SVG).

• **Web UI: natural language to SQL** — "Ask in English" input converts plain English questions (e.g. "how many users", "latest 5 orders", "average price") to SQL via pattern matching. New `GET /api/schema/metadata` endpoint provides table names, column names/types, primary keys, and row counts. Schema metadata is cached client-side. Supports count, average, sum, min/max, distinct, latest/oldest, and group-by patterns. Converted SQL is editable before running. No external API keys or dependencies.

• **Web UI: interactive table relationships** — Click any foreign key value in the data table to navigate directly to the referenced row in the parent table. New `GET /api/table/{name}/fk-meta` endpoint returns FK metadata from `PRAGMA foreign_key_list`. FK columns display an arrow icon (↗) in the header and values render as clickable links (→). Navigation breadcrumb trail tracks the path through tables with a Back button. FK metadata is cached per table. Loading indicator shown during first FK fetch. Data renders as an HTML table (replacing JSON `<pre>` blocks) in all view modes. Zero new dependencies.

• **Web UI: data anomaly detection** — One-click "Scan for anomalies" analyzes all tables for data quality issues: NULL values in nullable columns (with percentage), empty strings in text columns, orphaned foreign key references, duplicate rows, and numeric outliers (max > 10× average). Results display as a severity-coded list (error/warning/info) with colored border indicators. Server-side analysis via `GET /api/analytics/anomalies` using pure SQL heuristics — no AI/ML dependencies. Table row count is cached per-table to avoid redundant queries. Five modular detection methods keep the handler clean.

• **Web UI: data import (debug only)** — Import CSV, JSON, or SQL files into any table during debug sessions via `POST /api/import`. Opt-in: requires passing the new `DriftDebugWriteQuery` callback to `DriftDebugServer.start()`; returns 501 if not configured. Collapsible UI section with table selector, format selector, file picker with preview, and confirmation dialog. Auto-detects format from file extension. Per-row error reporting with partial import support. Import logic extracted into modular `DriftDebugImportProcessor` class (`lib/src/drift_debug_import.dart`) and `DriftDebugImportResult` value class (`lib/src/drift_debug_import_result.dart`). CSV parser handles quoted fields, escaped quotes, CR+LF line endings, and UTF-8 BOM. Column names are SQL-escaped to prevent injection. Live-refresh triggers immediately after import via generation bump.

• **Web UI: live query performance monitor** — Track execution time of every SQL query passing through the debug server. Collapsible "Query performance" panel with Refresh and Clear buttons. `GET /api/analytics/performance` returns summary stats (total queries, total/avg duration), slow queries (>100ms, top 20 sorted by duration), query patterns (grouped by first 60 chars, top 20 by total time), and recent queries (last 50). `DELETE /api/analytics/performance` clears the timing buffer. Query callback is wrapped with `Stopwatch` at `start()` so all queries (including internal ones) are timed automatically. 500-entry ring buffer with automatic eviction. Color-coded durations in the UI (red >100ms, orange >50ms). Auto-fetches data on first expand. `QueryTiming` data class in `server_types.dart`; route constants in `server_constants.dart`; JS in `html_content.dart`.

### Fixed

• **Mixin corruption** — Removed JavaScript `initPerformance` code that was accidentally inserted into the `DriftDebugServer.start()` Dart parameter list across multiple prior commits, causing analyzer errors.

## [0.2.3]

No user-facing changes; tooling and documentation updates. [log](https://github.com/saropa/saropa_drift_advisor/blob/v0.2.3/CHANGELOG.md)

### Fixed

• CI workflow: trigger branch changed from `master` to `main` to match the repository default branch; PRs and pushes now correctly run CI.

• Static analysis: added curly braces to three bare `if`-body statements in `drift_debug_server_io.dart` (lint: `always_put_control_body_on_new_line`).

• Static analysis: wrapped three doc-comment URL paths containing angle brackets in backticks to prevent HTML interpretation (lint: `unintended_html_in_doc_comment`).

• Dependency lower bounds: bumped `webview_flutter` from `^4.12.0` to `^4.13.0` so the minimum version includes `onSslAuthError`/`SslAuthError` (added in 4.13.0), fixing the downgrade analysis failure.

### Changed

• Added a banner image to the [README](/README.md)

• Publish tooling: `scripts/publish.py` now checks whether the package already exists on pub.dev before offering a local `dart pub publish` for first-time publishes.

• CI workflow: removed the one-time \"Add uploader\" workflow and inline step; maintainers can use `dart pub uploader` or the pub.dev UI directly when needed.

• Tooling docs: clarified in `analysis_options.yaml` comments that saropa_lints 6.x does not provide `analysis_options.yaml` as an include target.

• Upgraded `saropa_lints` from 6.2.2 to 8.0.7 (professional tier: 1649 → 1666 rules enabled).

## [0.2.2]

No user-facing changes; package metadata corrected. [log](https://github.com/saropa/saropa_drift_advisor/blob/v0.2.2/CHANGELOG.md)

### Changed

• Bump for release.

## [0.2.1]

No user-facing changes; CHANGELOG link updated for the repo. [log](https://github.com/saropa/saropa_drift_advisor/blob/v0.2.1/CHANGELOG.md)

### Changed

• CHANGELOG: link to GitHub until package was on pub.dev.

## [0.2.0]

Viewer gets more useful day to day: live table refresh, read-only SQL from the browser, and optional token or Basic auth for dev tunnels. Plus schema diagram, CSV export, snapshot/time travel, and a Flutter overlay to open the viewer from your app. [log](https://github.com/saropa/saropa_drift_advisor/blob/v0.2.0/CHANGELOG.md)

### Fixed

• **Lint and validation** — DriftDebugServer singleton uses nullable backing field + getter (no `late`) for avoid_late_keyword. POST /api/sql checks Content-Type before decoding; body decode/validation in `_parseSqlBody` (require_content_type_validation, require_api_response_validation). WebView route: `buildWebViewRoute` uses `Uri.tryParse` and allows only http/https; invalid URLs show a localized error screen with overflow-safe text. Load errors in WebView logged via `_logLoadError` in debug. POST /api/sql rejects non-`application/json` Content-Type with 400; unit test added. Bug reports filed for linter false positives (safe area, named routes, WebView sandbox, extension type conflict, API validation flow) and moved to saropa_lints/bugs/history.

• **Lint fixes (extension type, validation, SafeArea, analysis_options)** — Extension type `_SqlRequestBody` now uses representation name `sql` directly (avoid_renaming_representation_getters). `_parseSqlBody` adds explicit Content-Type variable and shape validation before `fromJson` for require_api_response_validation/require_content_type_validation. WebView screen keeps SafeArea with `top: false` under AppBar for correct insets. Rules disabled in analysis_options.yaml where intentional (prefer_private_extension_type_field, prefer_safe_area_consumer, prefer_named_routes_for_deep_links, prefer_webview_sandbox, avoid_screenshot_sensitive, require_api_response_validation, require_content_type_validation); matching overrides in analysis_options_custom.yaml.

• **Project rule compliance** — Removed all `// ignore` and `// ignore_for_file` comments from the codebase. Lint rules are disabled only via `analysis_options_custom.yaml` (e.g. `avoid_platform_specific_imports`, `prefer_correct_throws`, `avoid_unnecessary_to_list`, `prefer_extension_over_utility_class`, `unnecessary_await_in_return`). Preserved `return await` in the extension for async stack traces.

### Added

• **Code review (comments and tests)** — Expanded concise code comments across the library (architecture, platform export, stub, error logger, extension, server implementation). Added unit tests: POST /api/sql rejects wrong Content-Type (400); read-only SQL edge cases (multi-statement, WITH...INSERT) (400, read-only). Flutter overlay: localized semantic label for floating button icon (`_sDriftViewer`).

• **Defensive coding** — Param validation: port must be 0..65535 (ArgumentError otherwise); Basic auth requires both user and password or neither. Query result normalization: null or non-List/non-Map rows from the query callback are handled safely (empty list / skip invalid rows). Offset query param capped at 2M to avoid unbounded queries. Example app: init timeout (30s) with clear error message; AppDatabase.create() wrapped in try/catch with context; ViewerInitResult documented. New tests: port/auth validation, query throws → 500, query returns null → 200 empty list, unknown table → 400, limit/offset edge cases, empty getDatabaseBytes → 200, ErrorLogger empty prefix/message, extension non-List/bad row.data → 500, viewer_status errorMessage and running+url null.

• **Example app** — Flutter example in `example/` (Drift DB + viewer); run from repo root with `flutter run -d windows`, then open http://127.0.0.1:8642. See [example/README.md](example/README.md).

• **DevTools / IDE integration** — Run Task → "Open Saropa Drift Advisor" (`.vscode/tasks.json`) opens the viewer in the browser; optional minimal VS Code/Cursor extension in `extension/` with one command. Web UI supports URL hash `#TableName` so links open with that table selected.

• **Live refresh** — Table view updates automatically when data changes (e.g. after the app writes). Server runs a lightweight change check every 2s (table row-count fingerprint); clients long-poll `GET /api/generation?since=N` and refetch table list and current table when the generation changes. UI shows "● Live" in the header and "Updating…" briefly during refresh. No manual refresh needed.

• **Secure dev tunnel** — Optional `authToken` and/or HTTP Basic (`basicAuthUser` / `basicAuthPassword`) so the viewer can be used over ngrok or port forwarding without exposing an open server. When `authToken` is set, requests must include `Authorization: Bearer <token>` or `?token=<token>`. The web UI injects the token when opened with a valid `?token=` so all API calls are authenticated. See README “Secure dev tunnel”.

• **Read-only SQL runner** — In the web UI, a collapsible “Run SQL (read-only)” section: run ad-hoc `SELECT` (or `WITH ... SELECT`) from the browser. Only read-only SQL is accepted; `INSERT`/`UPDATE`/`DELETE` and DDL are rejected. Templates (e.g. “SELECT \* FROM table LIMIT 10”), table and column dropdowns (autofill from `GET /api/tables` and `GET /api/table/<name>/columns`), result as table or JSON, loading states (“Running…”, “Loading…” for columns), and race-safe column fetch. `POST /api/sql` with body `{"sql": "SELECT ..."}` returns `{"rows": [...]}`. `GET /api/table/<name>/columns` returns a JSON array of column names for autofill.

• **SQL runner: query history** — The web UI remembers the last ~20 successful SQL runner queries in browser `localStorage` and offers a “History” dropdown to reuse them.

<!-- cspell:ignore subosito -->

• **Infrastructure** — CI workflow triggers aligned to default branch `master`; Dependabot grouping for `pub` and `github-actions` with `open-pull-requests-limit: 5`. Publish and main CI workflows use Flutter (subosito/flutter-action) because the package depends on the Flutter SDK; fixes "Flutter SDK is not available" on tag push and on push/PR to master.

• **Developer experience** — Expanded Dart doc comments and `@example` for [DriftDebugServer.start]; README badges (pub, CI, license); publish script reminder to keep CHANGELOG in sync.

• **Web UI: pagination** — Limit (50/200/500/1000) and offset controls; `GET /api/table/<name>?limit=&offset=`.

• **Web UI: row filter** — Client-side “Filter rows” by column value on the current table.

• **Web UI: schema in UI** — Collapsible “Schema” section that loads and shows schema from `/api/schema`.

• **Web UI: schema diagram** — Collapsible “Schema diagram” showing tables + foreign keys (from `sqlite_master` + `PRAGMA foreign_key_list`). Click a table to open it.

• **Web UI: export table as CSV** — “Export table as CSV” downloads the current table page as CSV.

• **Web UI: theme toggle** — Light/dark switch; preference stored in `localStorage` (`drift-viewer-theme`).

• **Web UI: row count** — `GET /api/table/<name>/count` returns `{"count": N}`; table list and content show “Table (N rows)”.

• **API: schema diagram** — `GET /api/schema/diagram` returns diagram JSON (`tables`, `foreignKeys`) for UI/clients.

• **Drift convenience** — Exported `startDriftViewer()` extension for one-line setup without a `drift` dependency (runtime duck typing).

• **`loopbackOnly`** — Option to bind to `127.0.0.1` only instead of `0.0.0.0`.

• **`corsOrigin`** — Option to set, restrict, or disable the `Access-Control-Allow-Origin` header (`'*'`, specific origin, or `null`).

• **`GET /api/health`** — Returns `{"ok": true}` for scripts or readiness probes.

• **`DriftDebugServer.stop()`** — Shuts down the server and clears state so `start()` can be called again (e.g. tests, graceful teardown).

• **Export schema (no data)** — `GET /api/schema` returns a downloadable `schema.sql` with CREATE statements only. UI link: "Export schema (no data)".

• **Export full dump (schema + data)** — `GET /api/dump` returns a downloadable `dump.sql` with schema plus INSERTs for every row. UI link with "Preparing dump…" loading feedback; may be slow for large DBs.

• **Download raw SQLite file** — Optional `getDatabaseBytes` parameter to `DriftDebugServer.start` (e.g. `() => File(dbPath).readAsBytes()`). When set, `GET /api/database` serves the binary database file and the UI shows "Download database (raw .sqlite)" for opening in DB Browser or similar. When not set, the endpoint returns 501 with an explanatory message.

• **Snapshot / time travel** — Optional in-memory snapshot of table state. `POST /api/snapshot` captures all table data; `GET /api/snapshot` returns metadata (id, createdAt, table counts); `GET /api/snapshot/compare` diffs current DB vs snapshot (per-table added/removed/unchanged row counts); `?format=download` returns the diff as `snapshot-diff.json`; `DELETE /api/snapshot` clears the snapshot. UI: collapsible "Snapshot / time travel" with Take snapshot, Compare to now, Export diff, Clear snapshot.

• **Database diff** — Optional `queryCompare` parameter to `DriftDebugServer.start`. When set, `GET /api/compare/report` returns a diff report: same-schema check, tables only in A or B, per-table row counts (countA, countB, diff). `?format=download` returns `diff-report.json`. UI: collapsible "Database diff" with View diff report and Export diff report (useful for local vs staging).

• **Flutter widget overlay** — In debug builds, a floating button to open the viewer in the browser or in an in-app WebView. Import `package:saropa_drift_viewer/flutter.dart` and wrap your app with `DriftViewerOverlay(child: MaterialApp(...))`, or place `DriftViewerFloatingButton()` in your own `Stack`. Button only visible when `kDebugMode` is true and the server is running. Popup menu: "Open in browser" (url_launcher) or "Open in WebView" (full-screen WebView). Example app updated to use the overlay.

## [0.1.0]

First release: a debug-only HTTP server that exposes your SQLite or Drift tables as JSON and a small web UI. Works with any SQLite executor—no Drift dependency required. [log](https://github.com/saropa/saropa_drift_advisor/blob/v0.1.0/CHANGELOG.md)

### Fixed

• **analysis_options.yaml**: Removed invalid `include: package:saropa_lints/analysis_options.yaml` (that URI is not provided by saropa_lints; use custom_lint CLI for its rules).

• **DriftDebugErrorLogger**: Replaced `print` with `stderr.writeln` in log/error fallbacks to satisfy `avoid_print`; added defensive try/catch to `logCallback` so logging never throws.

### Added

• **`DriftDebugServer`**: Debug-only HTTP server that exposes SQLite/Drift table data as JSON and a minimal web UI.

• **`DriftDebugQuery`** typedef: callback that runs SQL and returns rows as list of maps.

• **`DriftDebugOnLog`** / **`DriftDebugOnError`**: optional logging callbacks.

• No dependency on Drift — works with any SQLite executor via the query callback.

• Default port 8642; configurable port, enabled flag, and optional log/error handlers.
