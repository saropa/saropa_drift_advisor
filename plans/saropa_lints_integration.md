# Optional Tighter Integration with saropa_lints

Strategies for optional but tighter integration between **saropa_drift_advisor** and **saropa_lints**, including extending saropa_lints, file-scoped runs, tiered detection, and other options.

---

## 1. Extending saropa_lints to Expose More to This Package

### Current state

- **drift_advisor** uses saropa_lints as a **dev_dependency**; `analysis_options.yaml` uses the analyzer plugin (`plugins: saropa_lints:` with `diagnostics:`). Linting runs in the IDE / `dart analyze` via the plugin.
- **saropa_lints** exposes: rules, tiers (`getRulesForTier`), baseline, report/baseline managers, `ProjectContext`, etc. via `package:saropa_lints`. It does **not** export the **scan** API (`ScanRunner`, `ScanConfig`, `ScanDiagnostic`, `loadScanConfig`) — those are used only by the internal `bin/scan.dart` CLI.

### Ways to extend saropa_lints for drift_advisor (and other consumers)

| Approach | Description | Owner |
|--------|-------------|--------|
| **Export a small scan API** | In saropa_lints, export `ScanRunner`, `ScanConfig`, `ScanDiagnostic`, and `loadScanConfig` from the main library (or a dedicated `saropa_lints/scan.dart` export). Then drift_advisor can depend on saropa_lints and call the runner programmatically (e.g. from a script or optional CLI step) without shelling out. | saropa_lints |
| **Tier + file list in scan** | Extend `ScanRunner` to accept an optional list of Dart file paths (in addition to or instead of directory discovery). Config (enabled rules) can still come from the project’s `analysis_options.yaml`; only the file set changes. | saropa_lints |
| **Programmatic tier override** | Allow scan to use a tier name (e.g. `recommended`, `pedantic`) in addition to reading from config, so drift_advisor can run “recommended only” or “pedantic” without changing the project’s analysis_options. | saropa_lints |
| **Stable report format** | If scan keeps writing to `reports/<date>/<timestamp>_scan_report.log`, document the format (e.g. file path per line, then rule/line/severity) or add a machine-readable output (e.g. `--format json`) so drift_advisor can parse results without depending on screen-scraping. | saropa_lints |

**Concrete first step in saropa_lints**

- Add a **public scan API**: e.g. a new file `lib/scan.dart` that exports `ScanRunner`, `ScanConfig`, `loadScanConfig`, `ScanDiagnostic`, and (if added) `ScanRunner.runWithFiles(List<String> dartFiles)` or `ScanRunner(targetPath, {List<String>? files})`. Keep `bin/scan.dart` using this API so behavior stays the same.

---

## 2. Running saropa_lints Against Specific Files (e.g. From a Log)

### Current state

- **`dart run saropa_lints scan [path]`** treats `path` as a **directory**. The runner uses `_findDartFiles(directory)` to discover all `.dart` files under that directory (with standard exclusions: `.dart_tool/`, `build/`, `bin/`, `example`, `.g.dart`, etc.). There is **no** option to pass a list of specific files.
- So: **saropa_lints is not currently runnable against a fixed list of files** (e.g. files named in a log or report).

### Making it runnable against specific files

| Option | Where | What |
|--------|--------|-----|
| **CLI: `--files` / stdin** | saropa_lints `bin/scan.dart` | Add e.g. `--files file1.dart file2.dart` or read paths from stdin (one path per line). Runner still needs a project root to resolve `analysis_options.yaml` (and optionally `analysis_options_custom.yaml`). So: `dart run saropa_lints scan . --files a.dart b.dart` or `echo "lib/a.dart" \| dart run saropa_lints scan . --files-from-stdin`. |
| **API: file list in ScanRunner** | saropa_lints `ScanRunner` | Add an optional parameter, e.g. `ScanRunner(targetPath: root, dartFiles: ['lib/a.dart', 'lib/b.dart'])`. When `dartFiles` is non-null, use it instead of `_findDartFiles(targetPath)`. Config loading still uses `targetPath` (project root). |
| **Parse a log in drift_advisor** | drift_advisor | If the “log” is a **saropa_lints scan report** (`reports/.../..._scan_report.log`), parse it to extract file paths (e.g. lines that look like file paths), then call saropa_lints (CLI with `--files` once that exists, or API with that list) to re-scan only those files. If the log is a **drift_advisor report** (e.g. from `report.py`), it currently doesn’t list Dart files — only step names and pass/fail. You could later add an optional “files touched” section to the report and use that as the file list. |

**Recommendation**

- In **saropa_lints**: add `ScanRunner(targetPath, {List<String>? dartFiles})` and, when `dartFiles` is provided, skip `_findDartFiles` and use `dartFiles` (resolved against `targetPath` if relative). Then add `--files` (and optionally `--files-from-stdin`) to `bin/scan.dart` that forwards to this API.
- In **drift_advisor**: keep integration **optional** (e.g. a script or a CI step that only runs if saropa_lints is available and a report/log with file paths exists). Use the new `--files` or API when available.

---

## 3. Using saropa_lints’ Detection Levels (Obvious → Pedantic)

### Tiers in saropa_lints

Tiers are **cumulative**; each tier adds more rules (see `lib/src/init/cli_args.dart` and `lib/src/tiers.dart`):

| Tier | Id | Description (from cli_args) |
|------|----|-----------------------------|
| **essential** | 1 | Critical: crashes, security holes, memory leaks |
| **recommended** | 2 | Essential + accessibility, performance patterns |
| **professional** | 3 | Recommended + architecture, testing, documentation |
| **comprehensive** | 4 | Professional + thorough coverage |
| **pedantic** | 5 | All rules (may include opinionated / “bullshit”-level) |

There is also a separate **stylistic** set (formatting, naming, etc.); it can be combined via init options.

So: from “obvious/critical” (essential) through “pedantic” (everything, including strict style and file-length rules), you can already choose a level by which rules are enabled in `analysis_options.yaml` (via `dart run saropa_lints init --tier <tier>`).

### Using tiers in an optional integration

| Strategy | How |
|----------|-----|
| **Tier in config only** | drift_advisor (and its users) already use a tier by running `init --tier recommended` (or similar). Any scan run (full dir or file list) uses that config. No change needed for “use one tier.” |
| **Tier override for scan** | If saropa_lints adds a `--tier` flag to the **scan** command (and/or to the scan API), drift_advisor could run e.g. “scan only these files with **essential**” (fast, only critical) or “scan with **pedantic**” (full strictness) without editing analysis_options. Useful for: “quick check on changed files with essential” vs “full pedantic on demand.” |
| **Severity filtering** | Scan output already has severity (ERROR, WARNING, INFO). drift_advisor could filter to e.g. ERROR only for “blocker” integration, or ERROR + WARNING for “advisory.” |
| **Rule-set filtering** | If saropa_lints exposed which rule belongs to which tier (it already has this internally), a “tier” could be applied at report time: e.g. “only show diagnostics from essential/recommended” and hide pedantic-only diagnostics in a “strict” or “optional” view. |

**Concrete options**

- **In saropa_lints**: Add optional `--tier <name>` to `bin/scan.dart`. When present, ignore the project’s `diagnostics:` for “enabled set” and use `getRulesForTier(tier)` instead (still use the project’s analysis_options for paths/config location). Expose the same in the scan API, e.g. `ScanRunner(..., tier: 'recommended')`.
- **In drift_advisor**: Optional script or CI step that runs e.g. `dart run saropa_lints scan . --tier essential` for a quick gate, or `--tier pedantic --files-from-stdin` for a focused strict check on listed files. Document that pedantic may include noisy/opinionated rules and that users can ignore or baseline them.

---

## 4. What Else Can We Do?

- **Baseline-aware runs**  
  saropa_lints already supports baseline files (paths and per-rule baselines). drift_advisor could document or optionally run scan with baseline so that “existing known issues” don’t fail the build; only new violations do.

- **Single “lint” step in drift_advisor CI**  
  In the same pipeline that runs extension analyze/publish, add an optional step: e.g. run `dart run saropa_lints scan .` (and later `--files ...` or `--tier essential`) and fold the exit code or report path into the existing report (e.g. `report.py` appends “Lint” pass/fail and timing). Keeps integration optional (skip if saropa_lints not installed or not desired).

- **Parse scan report and attach to drift_advisor report**  
  If drift_advisor already writes to `reports/YYYYMMDD/`, it could run `saropa_lints scan` and then copy or link the generated `..._scan_report.log` into the same folder and reference it in the drift_advisor summary (e.g. “Lint report: reports/20260319/..._scan_report.log”).

- **VS Code extension**  
  The drift_advisor extension could offer a command like “Run saropa_lints on workspace” or “Run saropa_lints on selected files” that shells out to `dart run saropa_lints scan ...` (and later `--files`) and shows the output in the Output channel or a simple report view. Optional feature, only enabled when the user has saropa_lints (e.g. in the workspace or globally).

- **Drift-specific rule set**  
  saropa_lints already has `lib/src/rules/packages/drift_rules.dart`. drift_advisor could document or recommend enabling drift rules when using Drift, and optionally run scan with a “drift-focused” subset (e.g. essential + drift rules) for a lighter, relevant check.

- **Stable JSON output**  
  If saropa_lints adds `--format json` to scan, drift_advisor (or the extension) could consume it for structured display, filtering by tier/severity, or merging with other tool outputs.

---

## Summary Table

| Goal | Current | Suggested change |
|------|---------|------------------|
| Use saropa_lints from drift_advisor programmatically | Only via analyzer plugin; no scan API | Export scan API in saropa_lints; optional script/step in drift_advisor that calls it |
| Run lints on specific files (e.g. from a log) | Scan only accepts directory | Add `dartFiles` to ScanRunner and `--files` / `--files-from-stdin` to scan CLI |
| Choose “obvious” vs “pedantic” | Tier is fixed by init in analysis_options | Add optional `--tier` to scan (and API) so drift_advisor can run essential vs pedantic without changing config |
| Optional but tight integration | Loose (shared config, no shared steps) | Add optional lint step to drift_advisor CI/scripts; optionally parse scan report; extension command to run scan |

All of the above can stay **optional**: drift_advisor continues to work without any of it; tighter integration is opt-in via scripts, CI, or extension features.

---

## Implemented in drift_advisor

- **Copy scan report into reports/YYYYMMDD/ and reference in summary** — When the extension pipeline runs the Lint (saropa_lints) step, the generated `*_scan_report.log` is copied into the same `reports/YYYYMMDD/` folder as the run's summary report (same timestamp) and a "Lint report: reports/YYYYMMDD/<timestamp>_saropa_lints_scan_report.log" line is added to the summary. Implemented in `report.save_report(..., lint_report_path=...)`, pipeline return of `lint_report_path`, and publish.py threading of `ext_lint_report` into `_print_results`.
