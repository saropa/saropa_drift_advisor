# Changelog

<!-- MAINTENANCE NOTES -- IMPORTANT --

  Format follows Keep a Changelog; versions use SemVer. Omit dates in `## [x.y.z]` headers (pub.dev shows publish dates). Project links and archive location are in the intro below.

  Each release (and [Unreleased]) opens with one plain-language line for humans—user-facing only, casual wording—then end it with:
  `[log](https://github.com/saropa/saropa_drift_advisor/blob/vX.Y.Z/CHANGELOG.md)` substituting X.Y.Z.

  **Audience separation** — User-facing sections (Added, Fixed, Changed, Improved) describe impact, not implementation. Infrastructure, build tooling, code refactoring, publish pipeline, SDK/linter/formatter changes, and internal test additions go inside a collapsed `<details><summary>Maintenance</summary>` block at the bottom of each release. Users skip it; contributors expand it.

  **pub.dev** — [pub.dev / packages / saropa_drift_advisor](https://pub.dev/packages/saropa_drift_advisor)

  **VS Code marketplace** - [marketplace.visualstudio.com / items ? itemName=Saropa.drift-viewer](https://marketplace.visualstudio.com/items?itemName=Saropa.drift-viewer)

  **Open VSX Registry** - [open-vsx.org / extension / saropa / drift-viewer](https://open-vsx.org/extension/saropa/drift-viewer)

-->

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
[GitHub](https://github.com/saropa/saropa_drift_advisor). History before
**2.6.0** lives in [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md).

---

## [3.3.6]

No more bogus "potential outlier" warnings on `lastModified` / `last_seen` style timestamp columns, and every anomaly and missing-index suggestion now appears exactly once in the Problems panel instead of twice. Outlier messages also now tell you how many rows were sampled. [log](https://github.com/saropa/saropa_drift_advisor/blob/v3.3.6/CHANGELOG.md)

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

For older versions (2.5.0 and prior), see [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md).
