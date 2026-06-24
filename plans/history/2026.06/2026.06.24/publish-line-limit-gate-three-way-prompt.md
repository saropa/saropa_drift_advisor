# Publish line-limit gate: three-way prompt

The Step 7 quality check in the publish pipeline previously gated an over-cap
`.ts` file count behind a binary "Continue anyway? [Y/n]" prompt where `No`
aborted the entire publish. The gate now offers three proceed-style options —
retry, continue, ignore — and removes the abort path, since a line-limit
overrun is advisory rather than release-blocking.

## What changed

- `scripts/modules/ext_build.py` — `check_file_line_limits()` replaced its
  `ask_yn("Continue anyway?", default=True)` call with
  `ask_choice("Line limit exceeded.", choices=("retry", "continue", "ignore"),
  default="retry", eof_default="continue")`:
  - **retry** (interactive default) re-invokes `check_file_line_limits()` so the
    operator can trim the offending files and re-scan.
  - **continue** proceeds and records the violation count in the success line.
  - **ignore** proceeds and drops the warning.
  - `eof_default="continue"` is a terminal (non-retry) choice on purpose: a
    closed stdin in CI must not map to retry, which would re-scan the same
    unchanged files forever.
  - The unused `ask_yn` import was dropped; `ask_choice` was added.

- `CHANGELOG.md` — documented under the 4.1.11 Maintenance block.

## Why no abort

The prior `No` branch returned `False`, which propagated through `run_step` to
abort the publish. A file exceeding the 300-line production cap (500 for
`*.test.ts`) is a code-hygiene warning, not a correctness or release blocker, so
the operator should always be able to ship while the file is being split. The
three options all proceed; the distinction is whether the run re-scans (retry)
or records vs. suppresses the warning (continue vs. ignore).

## Tests

Added `scripts/tests/test_ext_build_line_limits.py` (5 cases, all passing via
`python -m unittest tests.test_ext_build_line_limits`):

- no violation passes without prompting;
- `*.test.ts` uses the higher cap (400 lines passes under the 500 test cap);
- continue proceeds (`ask_choice` called once);
- ignore proceeds (`ask_choice` called once);
- retry re-scans then terminates on a later terminal choice (`ask_choice`
  called twice, recursion both re-scans and converges).

Each case points `EXTENSION_DIR` / `REPO_ROOT` at a temp tree and patches
`ask_choice` to drive the branch deterministically.
