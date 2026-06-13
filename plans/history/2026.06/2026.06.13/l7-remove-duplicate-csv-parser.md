# Removed the duplicate, weaker CSV parser (audit L6/L7)

Two CSV parsers existed: `DriftDebugImportProcessor.parseCsvLines` (the one the import path actually calls, made RFC-4180-correct under audit M10) and a weaker `ServerUtils.parseCsvLines` that split on `\n` before parsing quotes and trimmed quoted content. The weaker copy was used only by its own unit tests, never by production code — a latent hazard (a future caller could pick the wrong one).

## Finish Report (2026-06-13)

This work will be reviewed by another AI. — (chat-time note; not part of the durable record.)

### Scope

(A) Dart package code (`lib/`) + Dart test. No extension/Flutter/docs beyond the changelog.

### What changed

- **`lib/src/server/server_utils.dart`** — removed the duplicate `parseCsvLines` (replaced with a short note pointing to the canonical implementation). `ServerUtils` lives under `src/` and is not part of the public package API, so this is an internal cleanup.
- **`test/server_context_test.dart`** — removed the four tests that exercised the deleted method (the canonical parser is covered by `drift_debug_import_test.dart`, including the M10 fidelity cases).

### Scope note

The untracked `.bak` files flagged in the audit (`analysis_options_custom.yaml.bak`, `assets/web/app.js.bak`) are NOT tracked in git, so they have no commit impact and were left in place rather than deleting untracked user backups. Other duplicated helpers noted in the audit (multiple snake/pascal-case converters, repeated `makeId`) are spread across several files and are deferred — low value relative to the change risk.

### Verification

- `dart analyze lib/` — no issues.
- `test/server_context_test.dart` and `test/drift_debug_import_test.dart` pass (118 in those two files).

### Outstanding

The other helper dedups (case converters, makeId) remain as noted; they are independent low-value cleanups.
