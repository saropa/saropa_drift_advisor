# Migration Safety Hardening

Follow-up to the migration-safety-diagnostics work (same date). The prior commit
(`a064e0e`) shipped `no-schema-snapshots` and `schema-version-mismatch`
diagnostics plus `declaredSchemaVersion` threading, but the `/finish` handoff
reflection identified six confidence concerns and three unstated assumptions
that warranted hardening.

## Changes

### Hardening items addressed

1. **Monorepo findFiles globs.** `_checkSchemaSnapshots` glob patterns changed
   from root-anchored (`drift_schemas/**`) to recursive (`**/drift_schemas/**`
   and `**/test/generated_migrations/**`) so sub-packages inside monorepos are
   detected.

2. **Test mock state isolation.** `afterEach` blocks in
   `best-practice-provider.test.ts` and `schema-provider.test.ts` now reset
   `workspace.workspaceFolders` to `undefined` to prevent leaked mock state
   between test files sharing the same process.

3. **Dart-side test coverage for PRAGMA user_version parsing.** New
   `test/schema_version_test.dart` (8 tests) covers:
   - `declaredSchemaVersion` threading through `ServerContext` (present and absent)
   - `Router.getDbSchemaVersion()`: int return, non-int (null), empty rows
     (null), query throws (null + error logged)
   - `ServerUtils.normalizeRows` key-casing behavior

4. **Web stub parity.** `declaredSchemaVersion` parameter added to
   `drift_debug_server_stub.dart` `start()` — omission caused a compilation
   error on web targets (architecture invariant #4: io/stub parameter parity).

5. **Analyzer ignore comment.** Added explanatory comment above
   `// ignore: require_catch_logging` in `_deriveDeclaredSchemaVersion` to
   satisfy `prefer_commenting_analyzer_ignores`.

### Generate SchemaVerifier Test code action

The `no-schema-snapshots` diagnostic now has `hasFix: true` and offers a
Quick Fix code action that triggers `driftViewer.generateSchemaVerifierTest`.

- **schema-verifier-codegen.ts**: Generates a Drift `SchemaVerifier` test
  scaffold with fresh-create and upgrade-path test groups.
- **migration-gen-commands.ts**: Registers the command handler, prompts for
  the database import path (with `.dart` validation), generates the code,
  opens in an untitled editor, and shows a guidance message.
- **package.json / package.nls.json**: Command declaration and NLS key.
- **best-practice-codes.ts**: `hasFix` flipped to `true`.
- **best-practice-provider.ts**: `provideCodeActions` returns a Quick Fix for
  `no-schema-snapshots` that invokes the command.

### Test helper extension

`createTestContext()` in `test/helpers/test_helpers.dart` now accepts an
optional `queryRecorder` parameter, enabling tests that construct a `Router`
(which requires a non-null `QueryRecorder`) without building a full server.

### Review-driven fixes

- Removed unused `dbClassName` parameter from `generateSchemaVerifierTest`
  and its corresponding input prompt (the generated template never used it).
- Fixed JSDoc on `dbImportPath` (example showed `package:` prefix, but the
  template prepends it).
- Added try/catch + `showErrorMessage` to the command handler for consistency
  with the sibling `generateMigration` command.

## Finish Report (2026-07-20)

All TypeScript tests pass (3100). All Dart tests pass (8 in
`schema_version_test.dart`). Extension disposable count updated 254 to 255 for
the new command registration. `findFiles` test stub updated to match the
recursive glob pattern. CHANGELOG updated under [4.2.3].
