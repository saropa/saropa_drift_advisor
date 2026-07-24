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
  three targeted regex patterns (header, standalone JSON `"version"` fields,
  `@vX.Y.Z` CDN tag). A `^`-anchored multiline match on the `"version"` key
  prevents corruption of nested example objects (e.g., the `"producer"` block
  with version `3.7.3`). Added `_read_api_md_header_version()` and
  `ensure_api_md_version_sync()` mirroring the server-constants pattern.
  `write_version(DART, ...)` now calls `sync_api_md_version` so `--bump` flows
  also update the doc.
- `scripts/modules/pipeline.py` -- added pre-bump and post-bump "API doc
  version" steps in the Dart analysis pipeline.
- `scripts/publish.py` -- added `"API doc version"` exit-code mapping.
- `CHANGELOG.md` -- corrected the maintenance note (was `4.2.3`, now `4.2.4`)
  and documented the new pipeline step.

### Verification

- `dart test test/version_sync_test.dart` -- 4/4 pass.
- Python round-trip test: `sync_api_md_version('9.9.9')` updates exactly the
  three JSON version fields, the header, and the CDN tag; `"version": "3.7.3"`
  in the producer example and `127.0.0.1` IP addresses are untouched;
  restoring to `4.2.4` yields byte-identical output.
