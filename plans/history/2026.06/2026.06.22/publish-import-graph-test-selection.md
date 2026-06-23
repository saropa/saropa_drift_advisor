# Publish: import-graph affected-test selection

The publish pipeline ran the entire `flutter test` suite on every release, which
was slow. `run_tests` now selects only the tests actually affected by the
release's changes, computed from the package import graph rather than a filename
guess.

## Finish Report (2026-06-22)

### Background

`scripts/modules/dart_build.py` `run_tests` previously invoked a bare
`flutter test` (whole suite, every publish). The goal was to run only the tests
a release touches. An intermediate version mapped a changed source `foo.dart` to
`foo_test.dart` by basename; that heuristic is blind to coverage that exists
through imports — e.g. `drift_debug_server_io.dart` has no `*_io_test.dart` yet
is exercised by `handler_integration_test.dart` and `drift_debug_server_test.dart`
via the package's conditional barrel export, so the heuristic wrongly reported it
as untested. Dart/Flutter exposes no affected-test signal to the CLI (the VS Code
Test Explorer's "outdated" state is editor-only and unavailable to a headless
`flutter test`), so the impact set must be computed in the script.

### Change

`run_tests` now performs import-graph impact selection:

- `_changed_dart_files` diffs the working tree plus committed history against the
  most recent git tag (the previous release). `PUBLISH_TEST_BASELINE=<rev>`
  overrides the baseline; unreadable history falls back to the full suite.
- `_direct_deps` parses each Dart file's `import` / `export` / `part` directives
  as whole statements (spanning to the terminating `;`, with block comments
  stripped), so a multi-line conditional export
  (`export 'stub.dart'\n  if (dart.library.io) 'io.dart';`) contributes BOTH
  branch targets. Relative and `package:<name>/...` targets resolve to
  repo-relative paths; `dart:` and other-package targets are dropped.
- `_select_affected_tests` builds the whole-package adjacency graph, computes each
  `*_test.dart`'s transitive closure (memoized iterative DFS, closure includes the
  test itself), and selects every test whose closure intersects the changed set.
  A changed `lib/` file reached by no test is returned as an uncovered gap.
- `run_tests` runs the selected files via `_run_flutter_test`; it logs uncovered
  library files as a genuine coverage gap and skips when nothing is affected.
  `PUBLISH_FULL_TESTS=1` forces the full suite.

### Defect fixed during implementation

The first import-graph parser matched directives per line, so the wrapped
conditional export's continuation line (carrying the `io.dart` branch) was
skipped and the io implementation was reported as an uncovered gap. Switching to
statement-spanning directive parsing resolved it: dry-run against the live tree
now selects 30 affected tests with zero false gaps.

### Verification

- New `scripts/tests/test_dart_build_delta.py` (5 cases): multi-line conditional
  export parsing, change-to-io selecting the test that reaches it via the barrel
  with no false gap, an uncovered source being reported-not-selected, a changed
  test selecting itself, and scoped selection not over-including unrelated tests.
- `python -m unittest discover -s scripts/tests`: 87 tests pass.
- Dry-run of `_select_affected_tests` against the current tree: 30 tests
  selected, uncovered set empty.

### Notes for maintainers

- The selection is deltas-by-impact: a `lib/` file imported by no test is logged
  and skipped, not escalated to a full run (a deliberate speed trade). Use
  `PUBLISH_FULL_TESTS=1` for the strong gate.
- Resolution stays inside the package; cross-package and SDK imports are ignored
  by design, so the graph cannot pull in tests outside this repo.
