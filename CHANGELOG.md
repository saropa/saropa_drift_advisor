# Changelog

<!-- MAINTENANCE NOTES -- IMPORTANT --

  Format follows Keep a Changelog; versions use SemVer. Omit dates in `## [x.y.z]` headers (pub.dev shows publish dates). Project links and archive location are in the intro below.

  Each release (and [Unreleased]) opens with one plain-language line for humans—user-facing only, casual wording—then end it with:
  `[log](https://github.com/saropa/saropa_drift_advisor/blob/vX.Y.Z/CHANGELOG.md)` substituting X.Y.Z.

  **Audience separation** — User-facing sections (Added, Fixed, Changed, Improved) describe impact, not implementation. Infrastructure, build tooling, code refactoring, publish pipeline, SDK/linter/formatter changes, and internal test additions go inside a collapsed `<details><summary>Maintenance</summary>` block at the bottom of each release. Users skip it; contributors expand it.

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
**3.0.3** lives in [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md).

---

## Links

  **pub.dev** — [pub.dev / packages / saropa_drift_advisor](https://pub.dev/packages/saropa_drift_advisor)

  **VS Code marketplace** - [marketplace.visualstudio.com / items ? itemName=Saropa.drift-viewer](https://marketplace.visualstudio.com/items?itemName=Saropa.drift-viewer)

  **Open VSX Registry** - [open-vsx.org / extension / saropa / drift-viewer](https://open-vsx.org/extension/saropa/drift-viewer)
  
  **Repo** - [github.com / saropa / saropa_drift_advisor](https://github.com/saropa/saropa_drift_advisor)

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

## [4.1.6]

Internal code cleanup only — no user-facing change. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.6/CHANGELOG.md)

<details><summary>Maintenance</summary>

- **Modularized six extension source files that exceeded the line-count gate** (production cap 300 lines, test cap 500). Each original file stays the public entry point — importers and tests are unchanged — and the extracted logic moved to a sibling file following the existing `-helpers` / `-checks` split convention:
  - `saropa-lints-diagnostics.ts` (303) → pure report parsing/mapping (severity map, JSON parse, per-file diagnostic mapping, interfaces) moved to new `saropa-lints-report.ts`; the original re-exports them so the test imports still resolve.
  - `dashboard/dashboard-css.ts` (302) → widget-content and modal styles moved to new `dashboard/dashboard-css-widgets.ts`, appended by `getDashboardCss`.
  - `diagnostics/diagnostic-manager.ts` (376) → diagnostic-building/suppression filtering and the inline-suppression quick-fix builder moved to new `diagnostics/diagnostic-apply.ts` (`buildDiagnosticsByFile`, `buildSuppressionQuickFixes`).
  - `diagnostics/providers/data-quality-provider.ts` (316) → data-skew and null-rate check logic plus the null-by-design / SQL-probe helpers moved to new `diagnostics/providers/data-quality-checks.ts`; the provider now only holds the VS Code wiring.
  - `er-diagram/er-diagram-script.ts` (320) → the webview event-handler block (drag/pan/zoom, context menu, toolbar, filters, message/resize listeners) moved to new `er-diagram/er-diagram-script-events.ts`, concatenated into the same IIFE alongside the existing helpers.
  - `test/data-quality-provider.test.ts` (512) → the shared `createContext` fixture moved to new `test/data-quality-test-helpers.ts`, and the `provideCodeActions` suite moved to new `test/data-quality-provider-actions.test.ts`.
  - Verified: `tsc --noEmit` clean and the full test suite (2905 tests) passes.

</details>

---

## [4.1.5]

A quick fix to stop the debug server from printing its startup banner twice in your logs, plus a few behind-the-scenes dependency updates. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.5/CHANGELOG.md)

### Fixed

- **Duplicate "DRIFT DEBUG SERVER" startup banner.** When `DriftDebugServer.start()` was called twice in quick succession (or concurrently), both calls bound the same port and printed the startup banner, so the banner appeared twice in the logs. The "already running" check now also covers a start that is still in flight, so only one banner is ever printed.

<details><summary>Maintenance</summary>

- **Re-entrancy guard in `_DriftDebugServerImpl.start`.** The running-state guard tested `_server`, which is assigned only after the awaits in `start` (`loadPersistedSnapshots`, `HttpServer.bind`). A second concurrent/rapid `start()` passed the guard while the first was still binding; with `shared: true` (SO_REUSEPORT) both binds succeeded and both printed the banner. Added a synchronous `bool _starting` flag set before the first await and cleared in a `finally`; the start body moved to a private `_startInternal` so the flag is cleared on every exit path (return, throw, or successful bind). File: `lib/src/drift_debug_server_io.dart`.
- **Dependency upgrades (Dependabot).** TypeScript `5.9.3` → `6.0.3` (root and `extension/`); `sass` `1.99.0` → `1.101.0` (root); `js-yaml` `4.1.1` → `4.2.0` (`extension/`); `mocha` `11.3.0` → `11.7.6` (`extension/`); CI `actions/checkout` `6` → `7`. TypeScript 6 (a major version) was confirmed to type-check both the extension (`tsc -p ./`) and the root web bundle (`tsconfig.web.json`) with zero errors, and the extension `compile` step (`tsc` + NLS verify + NLS coverage) passes on it. Dev/build dependencies only — no change to shipped runtime behavior.
- **`@types/vscode` kept at `^1.115.0`.** Dependabot's group bump raised it to `^1.125.0`, but `vsce package` rejects `@types/vscode` newer than `engines.vscode` (`^1.115.0`) — the type definitions must not promise APIs beyond the minimum supported VS Code. Pinned back to match the engine so the extension stays installable on VS Code 1.115+.
- **Publish pipeline now pre-checks `@types/vscode` vs `engines.vscode`.** Added a "VS Code API compatibility" quality step (`scripts/modules/ext_build.py::check_engines_vscode_compat`, wired into Step 7 of the extension pipeline) so a future `@types/vscode` bump that exceeds `engines.vscode` fails fast with an actionable message instead of blowing up at the `vsce package` step deep in the run.

</details>

---

## [4.1.4]

Snapshots, branches, hovers, and the lineage/impact tools now work against databases whose tables have no rowid — including PowerSync, which exposes its tables as views and uses WITHOUT ROWID system tables. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.4/CHANGELOG.md)

### Fixed

- **"no such column: rowid" on PowerSync and other rowid-less databases.** Several features ordered or keyed table rows by `rowid`, but views and `WITHOUT ROWID` tables (such as PowerSync's `ps_updated_rows`) have no `rowid` column, so those reads threw `no such column: rowid` and the feature failed. Snapshot, branch, snapshot-diff, and hover previews now order by each table's primary key (or omit ordering when none is declared), and the lineage, impact, global-search, mutation-stream, constraint-validator, and data-narrator tools key rows by the primary key — or an `id` column on a view — instead of `rowid`. ([#32](https://github.com/saropa/saropa_drift_advisor/issues/32))
- **Far fewer noise warnings from the null-rate / unused-column checks.** Run against a live debug database, these checks flagged hundreds of columns that are NULL on purpose — event timestamps like `blocked_at`, phonetic search helpers, columns with a declared default — and every column on demo-only or partially-loaded tables, where a null rate measured on a handful of rows means nothing. The checks now skip columns that are null-by-design and let you mark unrepresentative tables with the new `driftViewer.diagnostics.userDataTables` setting, while still surfacing genuine content gaps on fully-loaded tables.

### Added

- **`driftViewer.diagnostics.userDataTables` setting.** List the tables whose live debug rows are not representative of production (user/demo data, or static reference tables that load lazily). Null-rate and unused-column analysis is skipped for them.

<details><summary>Maintenance</summary>

- **Null-rate false-positive suppression (`BUG_data_quality_null_checker_false_positives`).** `data-quality-provider.ts` `_checkHighNullRates` now skips (a) whole tables in `config.userDataTables` (FP-1, unrepresentative live data) and (b) null-by-design columns via `_isNullByDesign` (FP-2): columns declared `.withDefault(...)` / `.clientDefault(...)`, `.autoIncrement()`, or nullable with a `*_at` / `*_phonetic` name suffix. The Dart parser now captures defaults — new optional `IDartColumn.hasDefault` set from `HAS_DEFAULT_RE` in `dart-parser.ts`. New config plumbing: optional `IDiagnosticConfig.userDataTables`, read in `diagnostic-config.ts`, contributed as `driftViewer.diagnostics.userDataTables` (array) in `package.json` + `package.nls.json` (regenerated `nls-coverage-data.ts`, 250 keys). Test helper `createDartFile` accepts per-column declaration overrides (`MockColumnSpec`); added parser tests for `hasDefault` and provider tests for both FP classes plus over-suppression guards (non-nullable `*_at` and a plain high-null column on a representative table still report). Full suite 2905 passing.
- **rowid-free SQL helpers.** Two new helpers under `extension/src/sql/`: `samplingOrderBy(pkColumns, descending?)` returns an `ORDER BY` over the declared PK (always valid, including for `WITHOUT ROWID` tables, which SQLite requires to declare a PK) or an empty clause when no PK exists; `rowKeyColumn(columns)` picks a row-identity column preferring the PK, then a literal `id` column (the PowerSync table-view case), then `rowid` only as a last resort. Applied to the sampling sweeps (`timeline/snapshot-store.ts`, `branching/branch-manager.ts`, `timeline/snapshot-commands.ts`, `hover/drift-hover-provider.ts`) and to the keyed-operation sites (`lineage/*`, `impact/*`, `global-search/global-search-engine.ts`, `mutation-stream/mutation-stream-panel.ts`, `constraint-wizard/constraint-validator.ts`, `narrator/narrator-commands.ts`). The hover preview now fetches schema metadata before its data read so the order clause can use the PK. Added `test/sampling-order.test.ts`, `test/row-key.test.ts`, and a rowid-less-sweep regression test in `test/snapshot-store.test.ts` that asserts no emitted sweep references `rowid`; full suite 2897 passing.

</details>

A fix so the new Rules sidebar can't error out while the extension is reloading. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.3/CHANGELOG.md)

### Fixed

- **"No view is registered with id: driftViewer.rules" on activation.** The Drift Advisor Rules view used an eager registration call that throws if the editor hasn't re-read the extension manifest yet (which happens right after a reload), and that error could interrupt the rest of diagnostics setup. The view now registers with the tolerant API that never throws and simply wires up once the view is available.

<details><summary>Maintenance</summary>

- **Rules view registration hardened.** `extension-diagnostics.ts` now calls `vscode.window.registerTreeDataProvider('driftViewer.rules', …)` instead of `createTreeView`. `createTreeView` resolves the view eagerly and throws "No view is registered with id" when the loaded manifest lacks the contribution (JS reloaded before `package.json` was re-read), which aborted the remaining provider/command registrations in `setupDiagnostics`. `registerTreeDataProvider` does not validate the id at call time and the `TreeView` handle was unused. Added `registerTreeDataProvider` to the `vscode` test mock (`vscode-mock.ts`); full suite 2883 passing.

</details>

---

## [4.1.2]

Silence advisor findings right in your Dart source — one column or a whole file — and manage every rule from a new sidebar that shows how noisy each one is and lets you mute it in one click. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.2/CHANGELOG.md)

### Added

- **In-code suppression.** Silence a finding from the Dart source, the way Dart's own `// ignore:` works, with a dedicated marker:
  - Field level: `// drift-advisor:ignore high-null-rate` on the line above a column getter (or as a trailing comment) silences that code for that column.
  - File level: `// drift-advisor:ignore-file high-null-rate` anywhere silences that code for the whole file.
  - The code list is optional — a bare `// drift-advisor:ignore` / `ignore-file` silences every advisor code — and accepts several comma- or space-separated codes.
- **One-click "Ignore" quick fixes.** Every advisor finding's lightbulb now offers "Ignore … for this column" and "Ignore … in this file", which insert the right directive for you — no typing, and the finding clears immediately.
- **A "Drift Advisor Rules" sidebar.** A new view lists every rule grouped by category with its live finding count and on/off state, noisiest first. Click a rule to mute or un-mute it everywhere — the fast way to tame a workspace with hundreds of findings without hand-editing settings.

<details><summary>Maintenance</summary>

- **Inline suppression engine.** New `diagnostics/suppression.ts` parses `// drift-advisor:ignore[-file]` directives (CRLF-safe, case-insensitive marker, codes lowercased; full-line directive targets the next non-blank line, trailing directive targets its own line). `IDartFileInfo` gains a `suppressions` field populated in `dart-file-parser.ts`; `DiagnosticManager._applyDiagnostics` indexes suppressions by file URI and skips file-level and field-level (line-matched) hits centrally — no per-provider changes, so it covers every column-/table-scoped diagnostic automatically.
- **Suppression-insert commands.** `diagnostics/suppression-commands.ts` adds `driftViewer.suppressDiagnosticInColumn` / `…InFile`, registered in `extension-diagnostics.ts` with a refresh callback so the parser (which reads in-memory document text) honors the new directive before save. The two quick-fix actions are appended to every advisor diagnostic in `DiagnosticManager.provideCodeActions`.
- **Rules tree view.** `diagnostics/rules-tree-provider.ts` renders `DIAGNOSTIC_CODES` grouped by category with live counts from a new `DiagnosticManager.getCollectedCountsByCode()`; a new `onDidRefresh` event re-renders it after each cycle. `driftViewer.rules.toggleRule` writes `disabledRules`; `driftViewer.rules.refresh` is a view title button. Registered the `driftViewer.rules` view + four commands in `package.json` with NLS titles; regenerated `nls-coverage-data.ts`.
- **Tests.** `suppression.test.ts` (field/file/trailing/bare/multi-code/CRLF/case parsing); updated four `IDartFileInfo` construction sites and two code-action tests for the new actions; activation disposable count 232 → 238. Full suite 2883 passing.

</details>

---

## [4.1.1]

Columns that are entirely empty are now called out separately from merely sparse ones, you can silence a data-quality warning on a single column instead of the whole table, and advisory checks now show as informational hints instead of warnings. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.1/CHANGELOG.md)

### Changed

- **Advisory checks are now Information, not Warnings.** Heuristic, suggestion-style findings no longer show with a warning squiggle — they read as informational hints. Genuine defects (schema drift, integrity violations, orphaned/mismatched foreign keys) keep their Warning/Error severity. Reclassified to Information: high null rate, unused column, data skew, full-table scan, slow-query pattern, N+1 pattern, unindexed WHERE/JOIN, missing FK index, statistical anomalies, TEXT primary key, cascade-delete risk, and duplicate index. You can still re-tune any of these per code with `driftViewer.diagnostics.severityOverrides`.

### Added

- **A new "unused column" warning, split out from high null rate.** A column where *every* row is NULL is now reported as an unused column (nothing ever writes to it) rather than lumped in with columns that are merely mostly-NULL. The two are separate findings you can tune, disable, and suppress independently.
- **Per-column suppression for data-quality rules.** A new `driftViewer.diagnostics.columnExclusions` setting silences a rule on a single `table.column` — e.g. `{ "high-null-rate": ["users.middle_name"] }` for a column you expect to be mostly empty — without muting the rest of the table. Mirrors the existing `tableExclusions` setting.
- **A "Disable rule" quick fix on data-quality warnings.** High-null-rate, unused-column, and data-skew diagnostics now offer a lightbulb action to disable the rule, the same as the naming, best-practice, runtime, and compliance categories — no more hand-editing settings.
- **Saropa Lints findings now show in the Problems panel.** A new "Run Saropa Lints (Publish to Problems)" command runs the scanner and surfaces every finding as a real diagnostic — inline squiggles and Problems-panel entries you can click through — instead of only a text dump in an Output channel. A companion "Clear Saropa Lints Problems" command removes them. The original Output-channel command is unchanged.

<details><summary>Maintenance</summary>

- **Saropa Lints diagnostics ingestion.** New `SaropaLintsDiagnostics` (`extension/src/saropa-lints-diagnostics.ts`) owns a dedicated `saropa-lints` diagnostic collection. It runs `dart run saropa_lints scan . --format json` (the scanner's existing stable v1 JSON report — no saropa_lints change needed), parses stdout tolerantly (slices first `{`..last `}` to survive `dart run` build chatter), and maps each finding to a `vscode.Diagnostic`: `filePath`→Uri (relative paths resolved against the workspace root), 1-based line/column→0-based range, analyzer `severity` name→`DiagnosticSeverity` (case-insensitive, unknown→Information), `ruleName`→code, `correctionMessage` appended to the message. Exit code 1 (findings present) is treated as success, not failure; only a missing/invalid report is an error. Deliberately on-demand (not in the auto-refresh provider pipeline — a full analyzer scan is too costly per refresh) with its own collection (saropa_lints rules are toggled in the consumer's `analysis_options.yaml`, not via the advisor's `disabledRules`). Wired two commands in `saropa-lints-commands.ts` (`runSaropaLintsDiagnostics`, `clearSaropaLintsDiagnostics`) alongside the existing text-dump command; pure parse/map functions unit-tested in `saropa-lints-diagnostics.test.ts`; activation disposable count updated to 232.
- **Severity reclassification (13 codes Warning → Information).** Flipped `defaultSeverity` in the codes registry and the matching inline `severity:` at each emit site (the inline value overrides the registry default in `DiagnosticManager`, so both had to move). Codes: `high-null-rate`, `unused-column`, `data-skew` (data-quality-provider); `full-table-scan`, `slow-query-pattern`, `n-plus-one`, `unindexed-where-clause`, `unindexed-join` (performance-codes + slow-query/n-plus-one/query-pattern checkers); `missing-fk-index`, `anomaly` (schema-codes + index/anomaly checkers); `text-pk`, `cascade-risk`, `duplicate-index` (best-practice-codes + pk-checker). `slow-query-pattern` and `n-plus-one` previously escalated to Warning when pinned to a known call site — that escalation was removed (pin location still selected, severity now always Information). `anomaly` keeps Error for server-flagged integrity defects (which map to `orphaned-fk`). Updated four severity assertions in the provider tests.
- **100%-NULL split.** `DataQualityProvider._checkHighNullRates` now branches on the raw null count (`nullCount >= rowCount`, not the rounded percent — so 99.6% rounding to "100%" is not misclassified) to emit the new `unused-column` code; partial high-null stays `high-null-rate`. New code registered in `data-quality-codes.ts` (`extension/src/diagnostics/providers/data-quality-provider.ts`, `extension/src/diagnostics/codes/data-quality-codes.ts`).
- **`columnExclusions` config.** Added `columnExclusions: Map<string, Set<string>>` to `IDiagnosticConfig` (+ default), parsed in `loadDiagnosticConfig` like `tableExclusions`, and applied in `DiagnosticManager._applyDiagnostics` after the table check — keyed on `${table}.${column}` from `issue.data`. Registered the setting + NLS description (`extension/src/diagnostics/diagnostic-types.ts`, `diagnostic-config.ts`, `diagnostic-manager.ts`, `package.json`, `package.nls.json`).
- **Data-quality "Disable rule" code action.** `DataQualityProvider.provideCodeActions` now prepends the shared `driftViewer.disableDiagnosticRule` action for every data-quality code.
- **Tests.** Split coverage (100% → `unused-column`, 94% → `high-null-rate`) and the new disable-rule action in `data-quality-provider.test.ts`; column-exclusion suppress/sibling-not-suppressed cases in `diagnostic-manager.test.ts`; `columnExclusions` added to the shared provider test-context config builders.

</details>

---

## [4.1.0]

Database views now show up alongside tables, there's a dedicated Views screen for their definitions and output, and querying them returns real values instead of "undefined". [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.1.0/CHANGELOG.md)

### Added

- **A dedicated Views screen.** A new Views tab lists every view in your database; selecting one shows its `CREATE VIEW` definition and a sample of its output side by side. Reach it from the toolbar (next to Schema) or the Home launcher. Views are read-only, so this is a focused place to inspect them — handy when a tool like PowerSync exposes your whole data model through views.

### Fixed

- **Views now appear in the sidebar, schema, and column pickers.** The table list only ever queried base tables, so databases that expose their schema through views — PowerSync, for example, stores rows as JSON and fronts them with views — looked empty even though the data was there. Views are now listed everywhere tables are, with their columns resolved the same way.
- **Querying a view no longer shows "undefined" in every cell.** The SQL Notebook expected result rows in one shape but received them in another, so column headers were correct while every value rendered as the literal text "undefined". Results now display their real values, on both the live-app and HTTP connections.

<details><summary>Maintenance</summary>

- **Views included in the table-discovery query.** `ServerConstants.sqlTableNames` now selects `type IN ('table','view')` instead of `type='table'`. `PRAGMA table_info` resolves view columns identically, so the sidebar tree, schema metadata, and SQL field pickers populate without further change; write paths return empty for views (correct read-only behavior). GitHub issue #32 (`lib/src/server/server_constants.dart`).
- **Result rows normalized to the columnar contract in both transport adapters.** The server returns object-rows (`{col: value}`), but every extension consumer (notebook renderer, `zipRow`, CSV/JSON export, watch/snapshot/diff) indexes rows positionally against a `columns` array. The VM-service adapter derived `columns` but left rows as objects — so the notebook read `row[0]` on an object and rendered `String(undefined)` — and the HTTP adapter returned the raw payload with no `columns` at all. A shared `objectRowsToColumnar` helper now converts both to `{columns, rows[][]}`. Test fixtures that stubbed the never-emitted columnar response shape were moved to the real object-row shape. GitHub issue #32 (`extension/src/shared-utils.ts`, `extension/src/transport/vm-service-api.ts`, `extension/src/api-client-http-query.ts`).
- **New Views screen (web viewer).** `GET /api/views` returns `[{name, sql}]` from `sqlite_master` (new `SchemaHandler.getViewsList` + `sqlViewDefinitions`); the `views-screen.ts` tab renders the list, highlights each view's DDL, and runs a capped `SELECT` through the read-only `/api/sql` path for the output. New tab registration (`state.ts`), panel markup + toolbar button (`html_content.dart`), styles (`_views-screen.scss`), themed tab accents, and l10n keys (`strings-web-views.ts`). GitHub issue #32.
- **Migration preview new-table lookup made view-inclusive.** `CompareHandler._migrationNewTables` still filtered its single-object `sqlite_master` lookup to `type='table'`, so once the table list began including views a view-backed "new" object returned no CREATE statement and was silently dropped from the generated DDL (and `compare_handler_test` got empty `migrationSql`). The lookup now selects `type IN ('table','view')` to match `getTableNames`. GitHub issue #32 (`lib/src/server/compare_handler.dart`).

</details>

---

## [4.0.5]

Maintenance-only: the publish pipeline now offers **Retry** as the default action whenever a git step fails. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.0.5/CHANGELOG.md)

<details><summary>Maintenance</summary>

- **Git failure prompts in the publish pipeline now offer Retry (default), Skip, Abort** instead of just Skip/Abort. The common cause of a failed commit here is a husky pre-commit hook (`dart format` / saropa_lints) that rewrites a staged file and fails the first attempt; a bare Enter now re-runs the step. For commits, retry restarts from `git add` so the hook's reformatted files get re-staged. Tag creation and tag push use separate retry loops so retrying a push never tries to recreate an existing tag. EOF / Ctrl+C maps to Abort so a closed stdin cannot loop forever (`scripts/modules/git_ops.py`, `scripts/modules/display.py`).
- **Fixed a publish-pipeline ordering bug that shipped a drifted version constant.** The pipeline synced `ServerConstants.packageVersion` to pubspec.yaml *before* the version/CHANGELOG validation step could raise pubspec to the CHANGELOG's max version, so the constant could lag one release behind (pubspec `4.0.5`, constant `4.0.4`). `version_sync_test` then failed `flutter test` on `main` and on every dependabot PR branched from it, turning CI permanently red. The constant is now re-synced *after* version validation, and the lagging constant was corrected to `4.0.5` (`scripts/modules/pipeline.py`, `lib/src/server/server_constants.dart`).
- **CI Analyze step no longer fails on advisory `info`-level lints.** Both workflows now run `flutter analyze --fatal-warnings` instead of `--fatal-infos`. `saropa_lints` is a caret dependency with no committed lockfile, so CI resolves whatever version is newest at run time; a new saropa_lints minor adding an info-level rule would otherwise red Analyze on every PR — including unrelated dependency bumps — for non-blocking noise. Warnings and errors still fail the build, and the full saropa_lints quality pass still runs in `scripts/publish.py` before any release (`.github/workflows/main.yaml`, `.github/workflows/publish.yml`).

</details>

---

## [4.0.4]

The web viewer's Home tab is easier to read and to navigate: a plain-language overview of every tool, a fuzzy search box to jump to a feature by name, color-coded tool cards, and more breathing room between them. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.0.4/CHANGELOG.md)

### Added

- **Search for a feature on the Home tab.** A new search box filters the tool cards as you type and is fuzzy, so "theme", "diff", "redact", or "erd" all land on the right card even when that exact word is not the tool's name. Press Escape to clear it. This searches features, not your table data — the Search tool still does that.
- **A narrative overview under the Home heading.** The Home tab now opens with a short paragraph describing everything the viewer does, instead of leaving you to read it off the individual cards.
- **Clear button in the Ask-in-English panel.** A new button beside the dictation mic empties your question and starts a fresh query in one click.
- **Voice command keywords in the Ask panel.** When dictating, say "clear" / "start again" to empty the box, "run again" to re-run, or "what about last year" to re-ask your last question over a different time window. A new "Ask in English" setting turns this on or off (on by default) — turn it off to dictate those words literally.
- **Ask in English now answers two time windows at once.** "How many contacts were added this year and last month" returns both totals side by side in one result, instead of needing two separate questions.
- **Ask in English now understands "weekly", "monthly", and other time buckets.** "Show me the weekly contacts added" builds a calendar of recent weeks and counts each one — including weeks with zero, so gaps are visible — using a recursive query you would otherwise have to hand-write.
- **Format your SQL with one click.** The Run SQL editor has a new Format button, and queries are tidied automatically when you run them, apply a template, or send one over from Ask in English. SQL shown elsewhere — including the Schema view — is pretty-printed too.
- **Copy query results as Markdown, CSV, or JSON.** Buttons above the results table copy the whole result set (every page) to the clipboard in the format you pick.
- **Friendly chart axis labels.** Charts now show readable axis titles ("contacts_added" becomes "Contacts Added") by default; a toggle on the chart turns this off to show the raw column names.
- **Charts build themselves for Ask-in-English series.** When a question produces a series (a per-day/per-week count, or any breakdown), using it now draws the matching chart with the axes already set. A toggle in the Ask panel (on by default) turns this off.
- **Misspelled table names still find the right table.** Asking "how many activites…" now lands on your `activities` table instead of an unrelated one.
- **Find fields fast on every diagram.** The ER Diagram, Schema Diagram, and the web viewer's diagram each gained a toolbar: search by field name or column type (type "integer" to spotlight every integer column), pick a single type from a dropdown, and choose whether matches are just highlighted (a chevron and accent border, with everything else dimmed) or whether non-matching tables and fields are hidden outright. Clearing the search restores the full diagram.
- **The Schema tab is now a structured explorer, not just a wall of SQL.** Every table gets a card showing its columns with type, primary-key, foreign-key, and NOT NULL badges, plus quick stats (row count, column count, indexes, and how many tables it links to or is linked from). A filter box narrows the list by table or column name, and a type dropdown shows only tables that use a given column type. Cards flag problems at a glance: tables not declared in your Drift code, data-quality issues, foreign-key columns missing an index, and tables being written to right now. Copy buttons export the whole schema as SQL, Markdown, or JSON, and the raw DDL is still one click away at the bottom.

### Changed

- **Each Home tool card now carries its own color.** Every tool shows a colored accent (matching highlight on its card) so screens are easier to tell apart at a glance, and the cards have more space between them so the grid no longer feels crushed.

### Improved

- **The Ask panel's generated SQL is bigger and easier to read**, and the "Preview results" button now matches the rest of the app's buttons instead of looking like a plain browser default.
- **The estimated-cost panel and the results table on the Run SQL screen are now collapsible**, so you can fold either away to focus on the query.
- **Query result tables now match the rest of the app's table styling** — rounded corners, sticky header, zebra rows, and a footer that joins the table cleanly instead of the old mismatched corners.

### Fixed

- **The Ask panel's dictation mic no longer shows as a dead button in Firefox.** Browsers without speech recognition were still displaying the mic (it did nothing when clicked) because a style override defeated the markup that was meant to hide it. The mic now correctly disappears where dictation is unsupported.
- **The Run button shows its play icon again.** It had been rendering the words "play_arrow Run" after the first run, because restoring the button's busy state dropped the icon markup.
- **Charts no longer label the Y axis with the X axis's name.** The Y selector now defaults to a different (value) column than X, so a freshly drawn chart labels each axis correctly.
- **One-page results no longer show dead Prev/Next buttons.** Pagination only appears when the result set spans more than one page.

### Removed

- **Removed the "Tables panel" / "History panel" switches from the Home tab.** They duplicated the sidebar's own show/hide control; toggle the sidebar from its own chrome instead.

<details><summary>Maintenance</summary>

- Home tab (`assets/web/home-screen.ts`, `_home-screen.scss`, `state.ts`, `html_content.dart`): removed the sidebar-toggle markup, styles, and the `_syncHomeSidebarToggles` window hook (its three guarded callers in `sidebar-panels.ts`, `toolbar.ts`, `app.js` deleted). Added per-tool `color` to `HOME_LAUNCHERS`/`HOME_EXTRAS` (driven into a `--tool-accent` CSS custom property), a `HOME_SEARCH_KEYWORDS` synonym dictionary, a per-card token search index with a per-token substring/fuzzy-subsequence matcher, and runtime-populated title/lead/search strings via new `viewer.nav.home.*` l10n keys. Loosened grid gap and card padding.
- Ask-in-English panel (bug `plans/history/2026.06/2026.06.18/BUG_Microphone_button_not_work.md`, items 1–7):
  - Mic visibility: added `.nl-icon-btn[hidden]{display:none}` in `_sql-editor.scss` — the button's `display:inline-flex` was overriding the UA `[hidden]` rule, so the mic stayed visible (and dead) on browsers without the Web Speech API.
  - Generated-SQL preview enlarged (`_sql-editor.scss`): `min-height` 5rem→8rem, `font-size` 13px→`--text-sm`, color `--muted`→`--fg`. "Preview results" folded into the shared secondary-button selector group in `_buttons.scss` so it matches `.toolbar`/`.sql-toolbar` buttons.
  - Clear button: new `#nl-clear` control in `html_content.dart` wired to `clearNlQuestion()` in `nl-modal.ts` (empties the box, resets the refine base, re-previews).
  - Voice/keyword commands: `detectNlKeyword` + `applyTemporalSwap` (pure, exported) in `nl-to-sql.ts`; `interpretNlKeyword()` in `nl-modal.ts` consumes them in the mic `onresult` path. Gated by new `PREF_NL_KEYWORDS` (default true) with a settings toggle + `viewer.settings.ask.*` / `viewer.settings.group.ask` l10n keys.
  - Multi-window counts: `multiWindowCount()` emits one `SUM(CASE WHEN <window> THEN 1 ELSE 0 END)` per window for a count question naming 2+ windows.
  - Time-bucket series: `detectTimeBucket()` + `timeBucketSeries()` emit a `WITH RECURSIVE calendar(...)` + LEFT JOIN + GROUP BY for "weekly/monthly/…" so empty buckets still report 0.
  - Refactor: extracted `resolveDateColumn()` + `dayExpr()` from `temporalWhere()` (now takes an optional forced column) so the window and bucket builders share its column choice. New tests in `assets/web/test/nl-keywords-buckets.test.mjs` (31 cases); full web suite 218 pass.
- Run SQL screen (bug `plans/history/2026.06/2026.06.18/BUG_RUN_SQL_Screen.md`, items 1–11):
  - Run-button icon: `setButtonBusy` (`utils.ts`) now stashes/restores the button's `innerHTML` via a `data-busy-restore` attribute instead of restoring `textContent`, so icon spans survive a busy cycle (fixes the literal "play_arrow Run").
  - SQL formatting: added dependency `sql-formatter` (^15) and a `formatSqlSafe()` wrapper (`sql-format.ts`, SQLite dialect, uppercase keywords, fail-soft to original). Wired into the Run SQL editor (new `#sql-format` button + format on run / template / deep-link), the NL preview + Use + narrative (`nl-modal.ts`), and the Schema view (`schema.ts`, via `formatAndHighlightSchema`).
  - Collapsible cost: `renderExplainInfo` wraps the cost summary in a `<details>` (`.explain-collapsible`); styles in `_sql-editor.scss`.
  - Single-page pagination: `renderSqlResultPage` only emits the Prev/Next bar when `total > pageSize`.
  - Result table: SQL result now uses `.drift-table` + `.data-table-scroll-wrap` + `.table-status-bar` inside a collapsible `.results-table-wrap` (`bindResultsToggle`); removed the conflicting SQL-specific table CSS that double-rounded corners.
  - Copy/export: `rowsToMarkdown` / `rowsToCsv` / `rowsToJson` (exported, pure) + a copy toolbar that writes the full row set to the clipboard with a toast.
  - Chart axis labels: `humanizeColumnLabel()` (`charts.ts`) + `#chart-nl-labels` toggle (default on) in the chart toolbar; `app.js` render handler humanizes axis titles and re-renders on toggle.
  - Y-axis default: the run handler now seeds `#chart-y` to the first numeric (or second) column, distinct from `#chart-x`.
  - Fuzzy table resolution: `editDistance()` + `fuzzyResolveTable()` (`nl-to-sql.ts`) as a typo-recovery fallback in `resolveTable` (gated by a stopword set; accepts only an unambiguous winner).
  - Auto-chart: `#nl-auto-chart` toggle (default on) in the Ask panel; `useNlModal` stashes `window._nlAutoChart` and runs the query for `answerKind === 'group'`, consumed by the run handler to pick line/bar and render.
  - New l10n keys under `viewer.sql.result.*` (heading/copy). New web tests for fuzzy resolution + bucket series; full web suite 224 pass.
- Linter: disabled the `avoid_adjacent_strings` rule in `analysis_options.yaml` (set to `false`). Multi-line message literals split for readability are intentional here, so the rule's adjacent-string warnings were noise.
- Linter: disabled 52 Tier-3 saropa_lints rules in `analysis_options.yaml` that produced noise or false positives for this package — cutting the report from 426 to 44 issues. Removed two confirmed false-positive rules (`avoid_unassigned_fields` fired on `required this.x` constructor fields; `require_platform_check` fired on `dart:io` use inside `*_io.dart` files that never load on web), the documentation-mandate rules (`require_return_documentation`, `require_example_in_documentation`, `require_public_api_documentation`, `verify_documented_parameters_exist`, `avoid_unmarked_public_class`, `require_complex_logic_comments`), and a set of style-opinion rules (`avoid_default_tostring`, `no_magic_number`, `prefer_descriptive_test_name`, `prefer_correct_identifier_length`, and others). Kept ON the 13 rules that catch real correctness/quality issues (stream error handling, production logging, cache stampede, final fields, etc.) for follow-up fixes.
- Linter: disabled two more saropa_lints rules confirmed as false positives for this package's logging design — `prefer_logger_over_print` (every hit is an intentional, documented `print()`: the Android startup banner and failure messages that `developer.log` cannot surface in logcat) and `require_log_level_for_production` (every hit calls `ServerContext.log(String)`, a forwarder to the host's level-less `onLog` callback).
- Server: `HttpServer.listen` in `drift_debug_server_io.dart` now passes an `onError` (routes to `ServerContext.logError`) so a socket-accept failure is logged instead of escaping as an uncaught async error that would tear down the serving isolate (`require_stream_error_handling`).
- Server: `RateLimiter._WindowEntry` now owns its counter mutation via an `increment()` method and `windowSecond` is `final`; `ServerContext.changeDetectionMinInterval` is `final` and `changeDetectionEnabled` is mutated only through a new `setChangeDetection()` method (routed from `Router`). These make the immutability/ownership explicit and clear `prefer_final_fields` (which only checks same-class mutation).
- Server: added the explanatory comment each `// ignore:` directive needs on the line above it (10 sites across `error_logger.dart`, `drift_debug_server_io.dart`, `query_recorder.dart`, `anomaly_detector.dart`, `generation_handler.dart`, `snapshot_store.dart`) to satisfy `prefer_commenting_analyzer_ignores`; no behavior change.
- Linter: disabled the final 8 saropa_lints rules, taking the report to 0 — four are confirmed false positives filed upstream as bug reports in `saropa_lints/bugs/` (`move_variable_outside_iteration` flags a path var built from a loop-reassigned `dir`; `avoid_recursive_calls` flags depth-bounded JSON normalization recursion; `avoid_throw_objects_without_tostring` fires on a class that has a `toString()`; `require_permission_status_check` matches the name `startRecording` on an in-memory query recorder, not an OS permission API), two flag intentional code (`avoid_ios_debug_code_in_release` on the release-visible startup-failure banner; `avoid_throw_in_catch_block` on a deliberate wrap-and-rethrow that preserves cause + stack via `Error.throwWithStackTrace`), and two are low-value for a single-viewer local debug server (`require_future_timeout` on a local snapshot file read; `avoid_cache_stampede` on per-tag lazy asset caches). Per-line `// ignore:` cannot suppress these — saropa_lints' native-plugin report path skips analyzer ignore handling (also filed upstream as an infra bug).

Connecting the advisor to a running app no longer risks freezing the app at launch. [log](https://github.com/saropa/saropa_drift_advisor/blob/main/CHANGELOG.md)

### Fixed

- **The advisor's diagnostics no longer freeze the app's startup.** When the extension connected to a launching app, it immediately ran heavy whole-database scans — per-column NULL-rate aggregates over every table plus a full timeline snapshot — over the app's single live database connection. Stacked onto the app's own startup queries, they serialized on that one connection and stalled the app's main thread long enough to drop hundreds of frames and lock the screen. These scans now wait out a short grace period after connect so the app's launch finishes first, and the NULL-rate scan skips very large tables (their per-column stats remain available on demand via "Profile Column").

<details><summary>Maintenance</summary>

- Deferred the connect-time heavy sweep (row counts, NULL-rate diagnostics, timeline auto-capture) behind a startup grace window shared by the connect handler and the schema-watcher's initial post-connect poll, deduped through one timer; added a `MAX_ROWS_FOR_NULL_SCAN` cap in `DataQualityProvider`. Updated the activation disposable-count assertion for the new timer-cleanup disposable.

</details>

---

## [4.0.2]

Big schemas are easier to read now: a sidebar toggle groups related tables together (your `contacts` table sits with `contact_avatars`, `contact_groups`, and friends), and the toolbar got tidied up. The analysis panels, badges, and exported reports all follow your editor's light / dark / high-contrast theme instead of fighting it, and a few widgets that showed "NaN" or blank cells are fixed. [log](https://github.com/saropa/saropa_drift_advisor/blob/v4.0.2/CHANGELOG.md)

### Added

- **Group tables by name in the Database sidebar.** Related tables are bundled into expanded sections so a wide schema is much easier to scan — on by default. Tables are grouped by their entity stem, so a `contacts` table sits with `contact_avatars`, `contact_groups`, and the rest (singular/plural and `-s`/`-es` forms are matched). A toolbar toggle switches to a flat list; the choice is remembered per workspace. Pinned tables stay flat at the top either way.

### Changed

- **Reorganized the Database sidebar toolbar.** Everyday actions (Refresh, group toggle, Dashboard, Health Score, Ask in English, Tools) stay as inline buttons; the rest are sorted into labeled sections — Explore, Data, Quality, About — in the `…` overflow menu so they are easier to find. The "Ask in English" button now uses a sparkle icon.
- **Unified panel theming on one Saropa design-token palette.** Health grades, severity badges, and status colors across the analysis panels now draw from a shared token set bound to the editor's own theme, so they read consistently and follow your chosen light / dark / high-contrast theme instead of fixed colors that fought non-default themes. This covers the dashboard, health, anomalies, and invariants panels plus the query-cost, explain, schema-diff, time-travel, snapshot-diff, drift-health, commit-timeline, mutation-stream, profiler, constraint-wizard, isar-gen, branching, and seeder panels. The exported HTML report and schema-docs export adopt the same Saropa brand palette. Secondary buttons across panels gained reliable fallbacks so they always read as buttons. Deliberately left fixed: SQL syntax-highlight colors and the standalone ER-diagram SVG export.

### Fixed

- **Dashboard "Explore Drift Advisor" feature buttons now look like buttons.** In many color themes the secondary-button background blended into the card behind it and the buttons had no border, so they read as plain text. They now carry a visible border and theme-neutral fallbacks.
- **The Row Count widget no longer shows "NaN".** It read the count by array position, but the server returns each result row as an object keyed by column name, so the lookup missed and produced NaN. It now reads the value correctly and shows 0 for an empty table.
- **The Table Preview widget now shows column headers and cell values.** It expected positional rows and a separate column list, but the server returns rows as objects keyed by column name (and omits the column list over HTTP), so the preview rendered with no headers and blank cells. It now derives columns from the row data and fills the cells.
- **Foreign-key navigator, filter bar, in-grid edit buttons, and the SQL Notebook EXPLAIN badges now follow the editor theme.** The FK navigator overlay, the filter Save/Delete buttons, the in-grid delete/add-row buttons, and the SQL Notebook query-plan badges hardcoded fixed colors that washed out or clashed in light and high-contrast themes. The data-grid overlays (which live in the table viewer, not a themed panel) now use the editor's own theme variables; the SQL Notebook badges use the shared status tokens. The transient connecting/error screen also follows the theme instead of a fixed gray.

<details><summary>Maintenance</summary>

- **Fixed the publish workflow failing at `dart pub publish --dry-run` with exit code 65.** A new top-level `docs/launch/` directory tripped pub's "rename top-level docs to doc" layout warning, and the dry-run treats any warning as a failure. Excluded `docs/` via `.pubignore`.
- **Trimmed the published package from bloat (~2 MB archive).** Because pub ignores `.gitignore` once a `.pubignore` exists, `.gitignore`'d directories (`build/`, generated `doc/api/`) plus developer-only directories (`bugs/`, `plans/`, `reports/`, `scripts/`, `tool/`) were being bundled. All are now listed in `.pubignore`; consumers do not need them at runtime.
- **Added a regression test** (`test/version_sync_test.dart`) asserting `.pubignore` excludes the top-level `docs/` directory, so the publish-blocking pub layout warning cannot silently return.
- **Made the extension publish idempotent against store propagation lag.** Marketplace/Open VSX listings lag publish acceptance by minutes, so a `--resume` retry could read a stale older version, miss the version-skip guard, and re-attempt a publish the store rejected with "already exists" — aborting the pipeline even though the target version was already live. `publish_marketplace`/`publish_openvsx` now treat that rejection as success.
- **Repointed the design-token style-guide citations at their real source.** The `§` references in `design-tokens.ts` and `report-css.ts` cited `docs/design/SAROPA_DASHBOARD_STYLE_GUIDE.md`, a path that does not resolve in this repo — the guide is the shared cross-project source of truth and lives in the saropa_lints repo. The comments now point at the resolvable GitHub URL so the references are no longer dangling.
- **Extended the design-token migration to the second status-color cluster the first pass missed.** The initial token migration converted the fourteen panels that shared one hex set (`#22c55e`/`#ef4444`/…). A separate group of panels hardcoded a different palette — Bootstrap-style `#28a745`/`#dc3545`/`#e0a800` and fixed dark backgrounds — and so still ignored the editor theme. Converted those bare status hexes to the semantic tokens (`--status-good`/`--status-bad`/`--accent-warning`/`--accent-info`) and their `rgba()` tints to `color-mix` across query-cost, explain, schema-diff, time-travel, snapshot-diff, drift-health, commit-timeline, mutation-stream, profiler, er-diagram, constraint-wizard, isar-gen, branching, seeder, suite-notes, and the filter/editing bridge scripts. The standalone schema-docs export now adopts the brand fallback palette (with dark-mode support) like the report export. Theme-bound `var(--vscode-*, #hex)` fallbacks and intentionally-fixed colors (SQL syntax highlighting, the standalone ER-diagram SVG export) were left as-is. `tsc` clean; full mocha suite (2851) passing.

</details>

---

For versions 4.0.1 and prior, see [CHANGELOG_ARCHIVE.md](./CHANGELOG_ARCHIVE.md).
