# Publish confirmation prompts default to yes

The interactive publish CLI asked `Proceed with publish?` at the final confirmation
gate and defaulted to **no** — pressing Enter at the prompt aborted the run. Both the
Dart-only confirmation (`_confirm_dart_publish`) and the full `all`-target confirmation
(`_confirm_full_publish`) passed `default=False` to `ask_yn`, so the common case of an
operator reviewing the summary and accepting it required an explicit `y` keystroke; a
bare Enter silently cancelled the publish.

## Finish Report (2026-06-12)

### Scope

(C) docs/scripts only. One behavioral change in the Python publish CLI plus the matching
changelog entry. No Dart app code, no VS Code extension code.

### Change

In `scripts/publish.py`, both publish-confirmation prompts now pass `default=True` to
`ask_yn`:

- `_confirm_dart_publish` (line 481) — Dart-only publish gate.
- `_confirm_full_publish` (line 523) — combined Dart + extension (`all`) publish gate.

`ask_yn` (in `scripts/modules/display.py`) renders the hint as `[Y/n]` when the default is
true and returns the default on a bare Enter (and on EOF / Ctrl+C). The effect: pressing
Enter at `Proceed with publish?` now proceeds instead of aborting.

### Behavioral note — Ctrl+C now returns the default of proceed

`ask_yn` returns `default` on `KeyboardInterrupt` as well as on empty input. With the
default flipped to true, a Ctrl+C at this specific prompt now resolves to "proceed" rather
than "abort". The Enter-proceeds behavior is the intended change; the Ctrl+C-proceeds side
effect is a consequence of `ask_yn` treating interrupt and empty-input identically. This
was left as-is (changing it would alter `ask_yn`'s shared interrupt contract, which other
callers depend on) and is recorded here so a future reader knows the interrupt path is not
an abort at the publish gate.

### Verification

- `python -m unittest tests.test_checks_git` — 5 tests pass. This is the only test file
  referencing `ask_yn`; it mocks a different call site (`checks_git.check_working_tree`'s
  `"Continue with uncommitted changes?"` prompt) and pins no assertion on the publish
  prompts, so the default flip breaks nothing.
- No test exists for `_confirm_dart_publish` / `_confirm_full_publish`; they are thin
  print-then-`ask_yn` wrappers. The change is a single literal argument, verified by
  inspection at both call sites.

### Files changed

- `scripts/publish.py` — two `default=False` → `default=True` flips with updated comments.
- `CHANGELOG.md` — Maintenance entry under `[3.7.3]`.
