# Publish pipeline: husky format gate aborts release commit

The release commit (`python scripts/publish.py dart`) failed at the husky
pre-commit hook with "Dart formatting issues detected" whenever an unformatted
`.dart` file reached the git index, requiring a manual retry on every
occurrence. The fix formats Dart sources at stage time so the index always
matches what the hook verifies.

## Finish Report (2026-06-24)

### Defect

The husky `pre-commit` hook runs `dart format --set-exit-if-changed .` whenever
`.dart` files are staged and aborts the commit (exit 1) if any file is
unformatted. The publish pipeline formats early — `format_code()` runs
`dart format .` during the Dart analysis phase — but the commit happens at the
end of the pipeline. Two paths leave unformatted content in the index at commit
time:

1. **`--resume` runs skip the entire analysis phase** (`_resume_from_checkpoint`
   jumps straight to publish), so the early `dart format .` never runs.
2. On a full run, any step between analysis and commit, or a manual edit, can
   re-dirty a `.dart` file after it was formatted.

In the observed failure the worktree copy of `test/server_robustness_test.dart`
was formatted (the hook reformatted it), but the staged/index copy was the
pre-format version, so the hook rejected the commit. An existing retry loop in
`git_commit_and_push` recovers (re-stage + re-commit picks up the hook's
reformat), but it requires an interactive retry every time.

### Fix

Format at the single chokepoint every Dart release commit passes through —
immediately before `git add`, inside the existing stage+commit retry loop.

- `scripts/modules/target_config.py`: added `TargetConfig.format_before_stage`
  (default `False`); set `True` on the `DART` target only. The `EXTENSION`
  target stages `extension/` and `scripts/` — no `.dart` files — so the hook's
  format gate never fires for it, and formatting there would be wasted work.
- `scripts/modules/git_ops.py`: `git_commit_and_push` runs `dart format .` from
  the repo root before staging when `config.format_before_stage` is set
  (read via `getattr` with a `False` default for backward compatibility with
  configs that predate the flag). A non-zero format result routes through the
  same `_decide_after_git_failure` retry/skip/abort prompt as other git
  failures, and never reaches `git add`.
- `CHANGELOG.md`: Maintenance entry under 4.1.9.

This closes the gap on every path — full run, `--resume`, and any mid-pipeline
re-dirtying — because formatting now happens at stage time rather than only in
the analysis phase.

### Tests

`scripts/tests/test_git_ops.py` — extended `_make_config` with a
`format_before_stage` parameter and added `TestFormatBeforeStage`:

- `test_format_runs_before_add_when_enabled` — pins that `dart format .` is the
  first subprocess call, before `git add`.
- `test_format_skipped_when_disabled` — pins that no `dart format` call is made
  when the flag is off (extension target).
- `test_format_failure_prompts` — pins that a failing format prompts and never
  stages.

All 16 tests in the module pass (`python -m unittest tests.test_git_ops`).
Existing tests are unaffected: their `SimpleNamespace` config defaults the flag
to `False`, so the format step is skipped and their `run()` call sequences are
unchanged.
