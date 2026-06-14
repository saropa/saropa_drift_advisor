# Publish workflow fix: exclude docs/ and trim package bloat

The pub.dev publish workflow failed at the `dart pub publish --dry-run` step
with exit code 65. A newly added top-level `docs/launch/` directory tripped
pub's layout rule that reserves the singular `doc/` name, producing a "rename
top-level docs to doc" warning. The dry-run treats any warning as a failure, so
every push to the publish workflow aborted before the actual publish step.

A related defect surfaced while inspecting the package manifest: the published
archive carried directories consumers never need. When a `.pubignore` exists,
pub stops consulting `.gitignore` entirely, so `.gitignore`'d paths (`build/`,
generated `doc/api/`) and developer-only directories (`bugs/`, `plans/`,
`reports/`, `scripts/`, `tool/`) were bundled into the package.

## Finish Report (2026-06-14)

### Scope

(C) packaging config plus (A) one Dart test. No `lib/` runtime code, no
extension code, no localized strings.

### Changes

- `.pubignore` — added root-anchored exclusions: `/docs/` (fixes the exit-65
  layout warning), `/build/` and `/doc/api/` (`.gitignore`'d build output and
  generated API docs that pub bundled because `.pubignore` overrides
  `.gitignore`), and `/bugs/`, `/plans/`, `/reports/`, `/scripts/`, `/tool/`
  (developer-only directories). All patterns are root-anchored so nested
  directories of the same name elsewhere in the tree are unaffected.
- `test/version_sync_test.dart` — added a regression test asserting `.pubignore`
  excludes the top-level `docs/` directory, accepting any of the anchored or
  bare forms. Pins the fix so the publish-blocking warning cannot return
  unnoticed.
- `CHANGELOG.md` — documented both the publish fix and the package trim under
  the 4.0.1 Maintenance block.

### Verification

- `dart test test/version_sync_test.dart` — 3 tests pass, including the new
  `docs/` exclusion guard and the pre-existing `assets/web/` anchor guard.
- `dart analyze test/version_sync_test.dart` — no issues found.
- `dart pub publish --dry-run` — package validation reports 0 layout warnings;
  archive size reduced to ~2 MB. The single remaining "warning" in a dirty
  working tree is the standard uncommitted-changes notice, which is absent in
  CI's clean checkout.

### Outstanding

None for the pub.dev publish path. The VS Code Marketplace publish step is a
separate concern (extension version collision) tracked independently.
