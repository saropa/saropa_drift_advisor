# Saropa Capture rename — extension ID changed

## Summary

Saropa Log Capture was renamed to Saropa Capture in v9.8.0. The extension ID changed from `saropa.saropa-log-capture` to `saropa.saropa-capture`. Settings prefix changed from `saropaLogCapture.*` to `saropaCapture.*`. Command IDs changed from `saropaLogCapture.*` to `saropaCapture.*`.

Old command IDs are aliased in the new extension, so command invocations still work. But `getExtension('saropa.saropa-log-capture')` returns `undefined` — the new extension only registers under `saropa.saropa-capture`.

## Files that need code changes

- `extension/src/debug/log-capture-bridge.ts:54` — `getExtension('saropa.saropa-log-capture')` → `'saropa.saropa-capture'`
- `extension/src/suite/cross-discovery.ts:39` — `extensionId: 'saropa.saropa-log-capture'` → `'saropa.saropa-capture'`
- `extension/src/test/cross-discovery.test.ts:54,64` — test assertions using old ID
- `extension/src/suite/suite-command-allowlist.ts:11` — `'saropaLogCapture.'` → `'saropaCapture.'`
- `extension/src/suite/suite-notes-html.ts:33` — display string
- `extension/src/l10n/strings-host.ts:64` — user-facing string
- `extension/src/l10n/strings-panel-health.ts:69,72` — user-facing strings
- `extension/package.nls.json:198,199` — setting descriptions
- `.vscode/settings.json:56` — `saropaLogCapture.integrations.adapters` → `saropaCapture.integrations.adapters`

## Files that need doc/comment updates

- JSDoc/comments in `log-capture-api-types.ts`, `log-capture-bridge.ts`, `log-capture-api.ts`, `diagnostics-mirror.ts`, `drift-health-panel.ts`, `drift-health.ts`, `suite-commands.ts`, `suite-diagnostics.ts`, `suite-mirror-files.ts`, `suite-findings-widget.ts`, `assets/web/sql-runner.ts`
- `README.md:334`, `ABOUT_SAROPA.md:95`, `doc/API.md`, `doc/EXTENSION_API.md`

## Priority

The `getExtension` call in `log-capture-bridge.ts` and `cross-discovery.ts` is the critical path — suite integration breaks silently without it.
