# Publish Pipeline: Retry Prompts on Failure

The publish pipeline (`scripts/modules/pipeline.py`) aborted immediately when
the remote sync or dependency steps failed, forcing a full re-run after manual
fixes. Three call sites now wrap the failing step in a retry loop using the
existing `ask_choice` helper, offering retry (default) / ignore / cancel.

## Changes

- **`_run_ext_dev_checks` — remote sync (Step 5):** wrapped in retry/ignore/cancel
  loop. On retry, re-runs `check_remote_sync` (which re-fetches origin). On
  ignore, records `"Remote sync (ignored)"` as a passing result.
- **`_run_ext_dev_checks` — dependencies (Step 6):** same retry/ignore/cancel
  wrapper around `ensure_dependencies`.
- **`run_dart_analysis` — Dart remote sync:** same wrapper for the Dart-leg
  remote sync check.
- All three use `eof_default="cancel"` to prevent infinite retry on closed stdin,
  matching the established pattern from the lint and test retry loops.

## Finish Report (2026-07-20)

**Scope:** scripts only (C). No Dart/TypeScript code changes.

**Pattern:** The retry loop follows the exact structure of the existing lint
step (line ~245) and test step (line ~277) retry loops — `while True` /
`run_step` / `results.pop()` dedup / `ask_choice` / branch on choice.

**Risk:** Low. The `ask_choice` function and retry pattern are battle-tested
in the same file. The only behavioral change is that three previously-fatal
steps now pause for user input instead of aborting.
