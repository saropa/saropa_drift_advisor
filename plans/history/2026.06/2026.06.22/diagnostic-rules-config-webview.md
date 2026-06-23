# Diagnostic Rules Configuration Webview

Clicking a rule in the "Drift Advisor Rules" sidebar failed with "…is not a
registered configuration" because three settings the extension read and wrote
(`driftViewer.diagnostics.disabledRules`, `driftViewer.diagnostics.severityOverrides`,
`driftViewer.logVerbosity`) were never declared in the manifest. The fix
registers all three and replaces the sidebar mute/unmute tree with a full
Configure Diagnostic Rules webview, also surfaced as a tile in the Drift Tools Hub.

## Defect

Three configuration keys were used in code via `WorkspaceConfiguration.get()` and
`.update()` but were absent from `contributes.configuration.properties` in
`extension/package.json`:

- `driftViewer.diagnostics.disabledRules` — written by the old rules sidebar
  toggle and by the `driftViewer.disableDiagnosticRule` quick-fix.
- `driftViewer.logVerbosity` — written by the Set Log Verbosity command.
- `driftViewer.diagnostics.severityOverrides` — read by the diagnostic config
  loader (and now written by the new panel).

VS Code refuses to persist an unregistered key to Workspace Settings, so any
`.update()` on one threw "X is not a registered configuration" and the write was
rejected. Reads of an unregistered key fall back to the default silently, which
is why the failure surfaced only on a write (the sidebar toggle), not on load.

## Changes

### Configuration registration (the underlying fix)
- Registered the three keys in `extension/package.json` with correct types and
  defaults: `disabledRules` (string array), `severityOverrides` (object whose
  values are the `error`/`warning`/`info`/`hint` enum), `logVerbosity`
  (`quiet`/`normal`/`verbose`, default `verbose`).
- Added their `%config.*.description%` strings to `extension/package.nls.json`.
- Added a manifest-validation guard (`extension/src/test/extension-manifest-validation.test.ts`)
  asserting every setting the extension writes via `update()` is declared in
  `contributes.configuration.properties`. This class of bug previously had no
  test. The guard list is maintained by hand because section/key correlation
  across `getConfiguration(section)` + `update(key)` call sites is not reliably
  derivable by static scan.

### Configure Diagnostic Rules webview (replaces the sidebar tree)
- New `extension/src/diagnostics/rules-config-panel.ts` (singleton webview) and
  `extension/src/diagnostics/rules-config-html.ts` (pure, testable HTML builder).
  Lists every `DIAGNOSTIC_CODES` entry grouped by category with its live finding
  count, an enable/disable toggle, and a severity-override dropdown
  (Default / Error / Warning / Info / Hint). A filter box narrows by code or
  description; Enable-All and Reset-Severities clear `disabledRules` /
  `severityOverrides` respectively. Selecting the Default severity option drops
  the override key so the map never accumulates dead entries.
- The panel reads disabled/severity state from live config and counts from a
  getter on every render, holding no rule state of its own; it re-runs analysis
  and re-renders after each write, and re-renders on the diagnostic manager's
  `onDidRefresh` so counts track the latest cycle.
- New l10n slice `extension/src/l10n/strings-panel-rules.ts`, registered in
  `extension/src/l10n.ts`; all user-facing copy resolves through `t()`.
- Removed the old `rules-tree-provider.ts`, the `driftViewer.rules` view, and the
  `rules.toggleRule` / `rules.refresh` commands. Added `driftViewer.openRulesConfig`
  to `contributes.commands` and wired it in `extension/src/extension-diagnostics.ts`.
- Added a "Configure Rules" entry to the Drift Tools sidebar tree
  (`extension/src/tree/tools-tree-provider.ts`), no server connection required
  (rule enable/disable and severity are pure settings edits).

### Drift Tools Hub tile
- Added a "Configure Rules" tile to the hub launcher grid
  (`extension/src/hub/hub-html.ts` `HUB_TILES`) plus its
  `panel.hub.tile.configureRules` string in `extension/src/l10n/strings-panel-hub.ts`.
  The hub already routes any `driftViewer.*` tile id through `executeCommand`, so
  no handler change was needed.

## Verification
- `tsc --noEmit` clean.
- NLS checks pass (`verify-nls`, `verify:nls-coverage`).
- New tests: `rules-config-html.test.ts` (5 cases: single script tag, toggle
  state, selected severity option, count/summary, HTML escaping) and the manifest
  registration guard; the hub tile test iterates `HUB_TILES` and covers the new
  tile. All pass.
- The activation disposable-count assertion in `extension.test.ts` was updated
  from the old rules-tree value to 236 for the webview wiring. A separate,
  concurrent "Drift Tools Hub" workstream subsequently registered its
  `openDriftToolsHub` command, bumping the live count to 237; that count belongs
  to the hub workstream and is left for it to reconcile on commit, since the
  webview/config changes here add no further disposables.
