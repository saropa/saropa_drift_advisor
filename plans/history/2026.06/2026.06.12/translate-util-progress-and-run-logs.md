# Translate util — live progress bar, WPM/ETA, and run logs

The runtime localization translate pass printed only a single line per locale
(`de: translating 1494 keys…`) and then ran silently for minutes, giving the
operator no sense of throughput or how long a locale would take, and leaving no
durable record of what each run translated or dropped. A long NLLB run that was
interrupted produced just `wrote 448 translations` with nothing to inspect
afterward. The translate command also rendered coverage percentages and the
engine name in plain text, so a ten-locale audit summary could not be scanned at
a glance.

This change adds per-locale progress feedback, a journaled record of every run,
and severity coloring across the translate util's summaries. No machine
translation is performed by the change.

## Finish Report (2026-06-12)

### 1. Critical Note

This work will be reviewed by another AI.

### 2. Scope

**(C) docs/scripts only.** The change touches the Python publish/localization
toolchain under `scripts/modules/` and its unit test. No Flutter/Dart app code
(`lib/`, `test/`) and no VS Code extension (`extension/`) source is modified.

### 3. Deep Review

- **Logic & Safety.** The per-locale loop tracks three counters with distinct
  roles: `processed` (items, drives the bar position so it reaches 100% exactly
  when the translatable set is exhausted), `processed_words` (drives the WPM rate
  and ETA, counting work done including brand-dropped keys), and `done` (shipped
  values, the reported total). The progress meter and both log files are closed
  in `finally` blocks, so a `KeyboardInterrupt` or an `EngineUnavailableError`
  mid-locale still flushes the in-place line, persists the bundles atomically
  (unchanged prior behavior), and prints the log paths. The log-path reporting is
  in an outer `try/finally` wrapping the whole locale loop, so every early
  `return` (abort, refusal) still surfaces the journal locations.
- **Architecture & Adherence.** Display concerns live in `scripts/modules/display.py`
  alongside the existing `heading`/`ok`/`dim` helpers and the publish-log tee;
  `ProgressMeter`, `coverage_color`, and `_fmt_duration` extend that module rather
  than introducing a parallel one. The translate-run journal (`_TranslateLogger`)
  lives next to its sole consumer in `actions.py`. Report paths reuse the existing
  `reports/<YYYYMMDD>/<stamp>_*` convention already used by the audit report and
  the publish log.
- **Performance & UI/UX.** The meter redraws a single carriage-return line on a
  TTY and degrades to one milestone line per ~10% on a non-TTY (pipe / file / CI),
  so a redirected run does not fill with control characters. Rate and ETA are
  derived from words rather than key count because translation keys span a single
  word to whole paragraphs; a word-rate settles quickly while an item-count ETA
  swings. The non-finite ETA before the first completion renders as `--:--`
  rather than raising.
- **Documentation.** `ProgressMeter` and `_fmt_duration` carry doc headers stating
  why the rate is word-based and how the non-TTY fallback behaves; `_TranslateLogger`
  documents why both files are created eagerly (an empty error log is positive
  evidence of a clean run, not a missing file). The `run_translate_action`
  docstring gains a paragraph describing the progress bar and the two journals.
- **Refactoring.** No out-of-scope cleanup was performed.

### 4. Testing Validation

**A. Existing-test audit.** Grepped `scripts/tests/` for the changed symbols
(`run_translate_action`, `ProgressMeter`, `coverage_color`, `_TranslateLogger`).
The only reference is `test_l10n_toolchain.py`:
`test_translate_writes_bundles_with_injected_fake` calls `run_translate_action`
with an injected fake translator. Because the action now writes a journal under a
reports directory, that test was updated to pin `reports_dir`/`timestamp` to its
existing temp tree (so it no longer writes into the real repo `reports/` folder)
and to assert that both `<stamp>_translate.log` and `<stamp>_translate_errors.log`
are created and that the log path is surfaced via `emit`. The menu-dispatch test
`test_translate_all_dispatches_directly` (which passes a sandbox `reports_dir`
into `interactive_menu`) is kept hermetic by `interactive_menu` forwarding an
explicit caller-supplied reports dir to the translate action, while real menu
runs pass `None` so the action stamps its own dated `reports/<date>/` folder.

**B. New behavior.** The updated test now also exercises the journal-file creation
and path reporting. A standalone smoke check exercised `coverage_color` (red /
yellow / green thresholds), `_fmt_duration` (`--:--` for infinity, `01:15`,
`1:02:05`), and `ProgressMeter` in non-TTY mode (milestone lines, no carriage
returns).

**Command run:** `python -m unittest tests.test_l10n_toolchain -v` (from
`scripts/`) → **33 tests OK.** The non-TTY milestone output is visible in the run
(the test stdout is a pipe), confirming the fallback path. The three edited Python
files byte-compile clean (`py_compile`).

### 5. Localization (l10n) Validation

SKIPPED [C-NOT-IN-SCOPE] — no Flutter UI strings changed. The strings touched are
operator-facing terminal output of a developer build script, exempt from the ARB
pipeline (dev/CLI strings). The translate util this change instruments is itself
the runtime-l10n toolchain, but its console output is not end-user UI.

### 6. Project Maintenance & Tracking

- CHANGELOG: updated under the existing `[Unreleased]` → Maintenance block with a
  one-paragraph entry describing the progress bar, WPM/ETA, run logs, and coloring.
- README verified — no updates needed (no product facts changed).
- `package.json` / lockfiles: not touched (no release or dependency change).
- TODOs/plans: none closed by this change.
- guides reviewed — no user-facing product behavior changed.
- LAUNCH_TEST: not applicable — no app/extension feature; this is build tooling.
- No bug archive — task did not close a `bugs/*.md` file.

### 7. Persist Finish Report

Finish report saved: plans/history/2026.06/2026.06.12/translate-util-progress-and-run-logs.md

### 9. Files Changed

- `scripts/modules/display.py` — add `coverage_color`, `_fmt_duration`, and the
  `ProgressMeter` class (TTY in-place bar + non-TTY milestone fallback); add
  `import time`.
- `scripts/modules/l10n/actions.py` — add `_TranslateLogger` (paired success /
  error journals under `reports/<date>/`); resolve a dated reports dir + stamp;
  drive a per-locale `ProgressMeter`; record shipped and dropped keys; color the
  translate output and the audit-action coverage summary; print both log paths in
  a `finally` so they appear even on abort. New optional `reports_dir`/`timestamp`
  parameters on `run_translate_action`.
- `scripts/modules/l10n/cli.py` — color the interactive-menu audit summary
  (coverage by severity, engine name highlighted); forward an explicit
  caller-supplied reports dir to the translate action while letting real runs
  stamp their own dated folder.
- `scripts/tests/test_l10n_toolchain.py` — sandbox the translate-action test's
  journal into its temp tree and assert both log files exist and the path is
  surfaced.
- `CHANGELOG.md` — Maintenance entry under `[Unreleased]`.
- `plans/history/2026.06/2026.06.12/translate-util-progress-and-run-logs.md` —
  this report.

### Outstanding work

None. The feature is code-complete and the targeted test suite is green. On-device
or live-NLLB rendering of the bar was not exercised (no translation run is
performed by, or permitted from, this change); the bar/rate/ETA logic is covered
by the non-TTY unit path and the helper smoke checks.
