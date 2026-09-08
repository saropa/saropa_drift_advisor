# Publish pipeline: VS Code API compatibility check hard-failed with no recovery path

The "VS Code API compatibility" quality-gate step in the publish pipeline exited the entire run on failure with no retry/ignore option, unlike every sibling step (Dependencies, Remote sync, Dependabot PRs). A Dependabot bump of `@types/vscode` to `^1.136.0` crossed the `engines.vscode ^1.134.0` floor and forced a full pipeline restart from scratch to recover.

## Root cause

`check_engines_vscode_compat()` in `scripts/modules/ext_build.py` correctly detects a `@types/vscode` version newer than `engines.vscode` (this check exists specifically to catch the mismatch before it surfaces as a hard `vsce package` failure much later in the run). The calling step in `scripts/modules/pipeline.py`, however, used the same `if not run_step(...): return "", False, None` shape as a plain non-recoverable gate, rather than the retry/ignore loop pattern already established for other transient/fixable failures in the same file.

## Fix

- `scripts/modules/pipeline.py`: the "VS Code API compatibility" step now runs inside a `while True` loop offering `[R]etry, [F]ix, [I]gnore, [C]ancel` (default: `fix`), matching the Dependencies/Remote sync/Dependabot PRs pattern. On cancel, the failed-check entry is preserved in `results` rather than popped and discarded, so the run summary still shows the step ran and failed.
- `scripts/modules/ext_build.py`: added `fix_engines_vscode_compat()`, invoked by the `fix` choice. It pins `@types/vscode` down to the `engines.vscode` floor (the lower-risk of the two remedies the check message already suggests — keeps existing VS Code users rather than raising the floor), rewriting `package.json` via a targeted regex substitution on the raw text so key order and formatting are preserved (no `json.dump` round-trip). It then runs a package-scoped `npm install @types/vscode@<pinned> --save-dev` (not a bare `npm install`) to update the lockfile, and re-runs the check to confirm the fix landed.
- `extension/package.json`: `@types/vscode` pinned from `^1.136.0` to `^1.134.0` as the immediate unblock for the run that surfaced this.

## Review notes

A multi-angle code review flagged two additional issues in the new code, both fixed:
- `fix_engines_vscode_compat` originally opened `package.json` twice (once via `json.load`, once via a raw `fh.read()`) to get parsed and unparsed views of the same file; changed to a single read followed by `json.loads`.
- The original auto-fix always ran a bare `npm install` (full dependency resolve) to pick up a one-line devDependency bump; changed to a package-scoped install.

The review also surfaced a large, pre-existing compile-breaking issue unrelated to this task: `extension/src/diagnostics/diagnostic-types.ts` is deleted in the working tree (mid-split into `diagnostic-code-types.ts` / `diagnostic-context-types.ts` / `diagnostic-issue-types.ts` / `diagnostic-defaults.ts`), but 19 files (the `diagnostics/index.ts` barrel plus 18 checker/provider files) still import from the now-missing module, which will fail `npm run compile`. This predates the session and was not touched; it needs a separate pass to repoint the remaining imports or restore the file.

## Tests

Added `scripts/tests/test_ext_build_vscode_compat.py` (9 cases) covering `check_engines_vscode_compat` (pass at/below floor, fail above floor, missing-field skip, unparseable-range skip) and `fix_engines_vscode_compat` (pin rewrite preserves other JSON fields, install is scoped to the one package, install failure surfaces as a failed step while the pin is still applied, missing fields refuse to auto-fix). All 9 pass, plus the existing 5-case `test_ext_build_line_limits.py` suite (unaffected, run to confirm no regression).
