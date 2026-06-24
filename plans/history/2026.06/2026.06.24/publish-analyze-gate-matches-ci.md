# Publish pre-flight analyze now matches CI (plugins intact, --fatal-warnings)

The publish pipeline's Dart analysis step stripped the `plugins:` block from
`analysis_options.yaml` and ran `flutter analyze --fatal-infos`, disabling
saropa_lints locally — the exact rules CI enforces with `flutter analyze
--fatal-warnings`. The local gate passed on code CI would reject, so the script
committed, tagged, pushed, and published the VS Code extension, and only then
did CI catch the warnings and block the pub.dev publish, leaving one store
updated and the other stale.

## Finish Report (2026-06-24)

### Defect

`modules/dart_build.run_analysis()` mutated `analysis_options.yaml` before
analyzing: it wrote a `.publish_backup`, rewrote the file with the `plugins:`
block removed, ran `flutter analyze --fatal-infos`, then restored the original
in a `finally`. Removing the plugins block meant saropa_lints — a custom
analyzer plugin wired in under `plugins:` — did not run during the local
pre-publish gate.

The publish CI (`.github/workflows/publish.yml`, triggered on a `v*` tag push)
runs `flutter analyze --fatal-warnings` against the committed
`analysis_options.yaml`, i.e. with the `plugins:` block present, so saropa_lints
DOES run there. Diagnostics such as `avoid_swallowing_exceptions`,
`require_catch_logging`, and `avoid_unnecessary_nullable_return_type` are
saropa_lints rules and surfaced only in CI.

The consequence was a two-store divergence. The local gate, blind to
saropa_lints, reported "Static analysis passed", and the pipeline proceeded to
commit, tag, push, and publish the VS Code extension locally via `vsce`. The
pushed tag then triggered the CI publish workflow, whose `flutter analyze
--fatal-warnings` step failed on the saropa_lints warnings and exited non-zero,
blocking the `dart pub publish` step. The extension shipped; pub.dev did not.

### Change

`run_analysis()` rewritten to run the CI command verbatim:
`flutter analyze --fatal-warnings`, with the `plugins:` block left intact. The
backup/strip/restore logic and the now-orphaned
`_analysis_options_without_plugins()` helper were deleted, along with the unused
`shutil` import. The threshold was moved from `--fatal-infos` to
`--fatal-warnings` deliberately, to match CI exactly: saropa_lints is an
unpinned caret dependency whose newest version can introduce an info-level rule
at any time, and CI tolerates info-level diagnostics for that reason; a local
`--fatal-infos` gate would fail on advisory noise CI would pass, reintroducing
divergence in the opposite direction.

The step executes inside `_run_dart_build_steps` during the analysis phase,
which completes before `_save_checkpoint` and `_run_publish` (commit / tag /
push). A failure therefore stops the publish locally, before any tag triggers CI
and before either store ships.

### Files

- `scripts/modules/dart_build.py` — `run_analysis()` rewritten to mirror CI;
  `_analysis_options_without_plugins()` and `import shutil` removed.
- `scripts/tests/test_dart_build_analyze.py` — new regression tests pinning the
  analyze command (`flutter analyze --fatal-warnings`, never `--fatal-infos`),
  asserting `run_analysis()` writes no `analysis_options*` file, and asserting a
  non-zero analyze exit fails the gate.
- `CHANGELOG.md` — `[4.1.10]` Maintenance entry.

The Dart source fixes that cleared the three reported diagnostics
(`drift_debug_server_io.dart`, `server/server_utils.dart`) were authored
separately and are documented in the same `[4.1.10]` Maintenance block.

### Verification

- `python -m unittest tests.test_dart_build_analyze` — 3 tests, OK.
- `python -m unittest tests.test_dart_build_delta` — 5 tests, OK (confirms the
  helper/import removal did not break the module).
- `flutter analyze` was not executed locally per project policy (the timing-out
  verification tool); the CI analyze step is the authoritative run and is now
  the exact command the local gate executes.

### Not closed by this change

`bugs/PROBABLE_marketplace_failure_blocks_open_vsx_publish.md` is a distinct
defect (a failed VS Code Marketplace publish returns before the Open VSX step
runs). It is unrelated to the analyze-gate divergence and remains open.
