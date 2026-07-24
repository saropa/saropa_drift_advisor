# Publish Pipeline: doc/API.md Version Sync

CI failed on both jobs for the v4.2.4 release because `doc/API.md` still
contained version `4.2.3` while `ServerConstants.packageVersion` had been
bumped to `4.2.4`. The `version_sync_test.dart` test (added in the same
release) caught the drift but the publish pipeline had no step to prevent it.

## Finish Report (2026-07-24)

### Root Cause

`doc/API.md` was not included in the version-sync chain. The publish script
already synced `server_constants.dart` and `add-package.ts` from pubspec, but
`doc/API.md` was a manual-edit file with no automation.

### Changes

**Immediate fix:** Updated all five version references in `doc/API.md` from
`4.2.3` to `4.2.4` (header, three JSON `"version"` fields, jsDelivr CDN tag).

**Pipeline automation (prevents recurrence):**

- `scripts/modules/constants.py` -- added `API_MD_PATH`.
- `scripts/modules/target_config.py` -- added `sync_api_md_version()` with
  old-to-new replacement: reads the current header version and replaces only
  that exact semver in three contexts (header, standalone JSON `"version"`
  fields, jsDelivr `@vX.Y.Z` CDN tag anchored to `cdn.jsdelivr.net`).
  Unrelated semver text, nested example objects (e.g., the `"producer"` block
  with version `3.7.3`), and IP addresses are never matched. Dry-run mode
  (`dry_run=True`) returns a change report without writing. Added
  `_read_api_md_header_version()`, `_read_api_md_content()`,
  `_apply_api_md_replacements()`, and `ensure_api_md_version_sync()` mirroring
  the server-constants pattern. `write_version(DART, ...)` now calls
  `sync_api_md_version` so `--bump` flows also update the doc.
- `scripts/modules/pipeline.py` -- added pre-bump and post-bump "API doc
  version" steps in the Dart analysis pipeline.
- `scripts/publish.py` -- added `"API doc version"` exit-code mapping.
- `CHANGELOG.md` -- corrected the maintenance note (was `4.2.3`, now `4.2.4`)
  and documented the new pipeline step.

### Verification

- `dart test test/version_sync_test.dart` -- 4/4 pass.
- `test_target_config_api_md.py` -- 20/20 pass. Covers: replacement of header,
  JSON fields, and CDN tag; preservation of producer example version, IP
  addresses, unrelated prose semver, and unanchored `@v` tags; round-trip
  identity; dry-run reporting and no-write guarantee; `ensure_api_md_version_sync`
  guard rails (invalid pubspec, missing header, dry-run, match/mismatch).
