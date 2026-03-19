# BUG-022: Version constant is stale (reports 1.5.0, actual is 1.6.1)

## Severity: Minor (but misleading)

## Component: Server

## File: `lib/src/server/server_constants.dart`

## Description

The `packageVersion` constant in `server_constants.dart` is set to `'1.5.0'`
but the actual package version in `pubspec.yaml` is `1.6.1`. This causes the
health endpoint (`GET /api/health`) and the web UI header to report an incorrect
version number.

## Impact

- Users and extension clients see wrong version in health check responses
- Debugging version-specific issues is harder when the reported version is wrong
- The VS Code extension may make incorrect compatibility decisions based on the
  reported version

## Steps to Reproduce

1. Start the debug server
2. Request `GET /api/health`
3. Observe: response contains `"version": "1.5.0"`
4. Check `pubspec.yaml` — actual version is `1.6.1`

## Expected Behavior

- Update `packageVersion` to match `pubspec.yaml`
- Consider automating version sync (e.g., a pre-publish script that updates the
  constant from pubspec.yaml)
- Add a CI check that verifies the constant matches pubspec.yaml

## Resolution

**Status: FIXED**

All three items addressed:

1. **Constant already synced** — `packageVersion` was already updated to `'1.6.1'`
   matching `pubspec.yaml`.
2. **Publish script already automates sync** — `sync_server_constants_version()`
   in `scripts/modules/target_config.py` updates the constant whenever the Dart
   package version is bumped via the publish workflow.
3. **CI guard added** — new `test/version_sync_test.dart` reads `pubspec.yaml` at
   test time and asserts it matches `ServerConstants.packageVersion`. This runs in
   `flutter test` (and therefore in the GitHub Actions CI pipeline), catching any
   future drift before merge.
