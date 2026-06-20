# Dependabot dependency upgrades

Six open Dependabot dependency-bump pull requests had gone stale: each was branched from an
older `main`, so after the v4.1.4 release moved the manifests and lockfiles, every PR reported
merge conflicts and could not be merged as-is. This task brought all six current and merged
them, including a TypeScript major-version bump that was compile-verified before landing.

## Finish Report (2026-06-20)

### Scope

Dependency manifest and lockfile bumps only — no application logic, no extension TypeScript
source, no Dart source authored here. Changes touch the VS Code extension's build/dev
dependencies (B), the root build/dev dependencies, and CI configuration (C). All six diffs were
authored by Dependabot and merged on GitHub; nothing was hand-edited in the dependency files.

### What was done

Six pull requests were squash-merged into `main`:

- **#34** — `@types/vscode` `1.115.0` → `1.125.0`, `mocha` `11.3.0` → `11.7.6` (`extension/`, dev).
- **#31** — `js-yaml` `4.1.1` → `4.2.0` (`extension/`, dev).
- **#33** — CI `actions/checkout` `6` → `7`.
- **#27** — `sass` `1.99.0` → `1.101.0` (root, dev).
- **#25** — `typescript` `5.9.3` → `6.0.3` (`extension/`, dev).
- **#23** — `typescript` `5.9.3` → `6.0.3` (root, dev).

### Why the conflicts occurred and how they were resolved

Dependabot PRs edit `package.json` and the lockfile against the `main` they were branched from.
After v4.1.4 those files had moved, so the PRs were `CONFLICTING`/`DIRTY`. Each squash-merge
moved `main` again and re-invalidated the remaining PRs' lockfiles — the standard stale-PR
cascade. Rather than resolve conflicts by hand, `@dependabot rebase` was issued on the affected
PRs; Dependabot regenerated each branch against current `main`, clearing the lockfile conflicts.
PRs were then merged in waves, rebasing whatever remained after each wave.

### Verification

TypeScript `6.0.3` is a major version, carrying real risk of breaking the build. Before merging
#25 and #23 it was tested against current `main` via `npx -p typescript@6.0.3 tsc --noEmit`:

- Extension project (`extension/tsconfig.json`) — exit 0, no errors.
- Root web bundle (`tsconfig.web.json`) — exit 0, no errors.

After merge and `npm install`, the extension's `postprepare` → `compile` chain
(`tsc -p ./` + `verify-nls` + `verify:nls-coverage`) ran on the installed TypeScript 6 and
passed: 250 NLS keys aligned, coverage data current.

### Notes

- `npm install` reported 2 low-severity advisories from transitive dependencies. Clearing them
  requires `npm audit fix --force` (breaking changes); left unaddressed as out of scope.
- These are dev/build/CI dependencies only; shipped extension and package runtime behavior is
  unchanged.
