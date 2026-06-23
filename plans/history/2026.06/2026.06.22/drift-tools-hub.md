# Drift Tools Hub

The Drift Tools sidebar exposed each tool as an isolated tree item with no single
entry point; there was no place to see structural and quality signals together or
to browse the full toolbox at a glance. This work adds a composed "Drift Tools
Hub" webview that previews the Dashboard and Health Score side by side and indexes
every tool in a grouped, collapsible launcher.

## Finish Report (2026-06-22)

### Scope

VS Code extension only (TypeScript under `extension/`) plus the user-facing
CHANGELOG. No Flutter/Dart application code is touched.

### What was built

A new singleton webview panel (`driftViewer.openDriftToolsHub`, tab title "Saropa
Drift Tools"), opened from the top of the Drift Tools tree ("Drift Tools Hub") or
the command palette. The panel:

1. Renders two **read-only preview panes** (Dashboard, Health Score) composed from
   the real engine markup and live data, side by side, each with an "Open full
   screen" button to the standalone interactive panel. Health-card drill-down
   (`data-command` / `data-action-command`) is forwarded from inside the hub.
2. Indexes **every Drift Tools sidebar command (25 tools)** in a grouped,
   collapsible launcher using the same six categories as the tree (Getting
   Started, Schema & Migrations, Health & Quality, Data Management, Visualization,
   Tools). Each group header carries an icon, a tool count, and a one-line note;
   each tile carries a semantic icon; the destructive Clear All Tables tile gets a
   caution accent.
3. Adds a hero band with Rescan and an "Open website" link to `https://saropa.com/`.

### Composition model and the two hazards handled

The hub assembles output from engines built to run standalone. Two failure modes
were addressed at the host level so neither engine is rewritten:

- **`acquireVsCodeApi()` once-per-document.** Avoided entirely by composing the
  panes as read-only snapshots WITHOUT their engine scripts; only the hub's own
  single script acquires the API. No API shim is needed.
- **CSS collision on shared bare selectors.** Both panels' stylesheets own
  `body`, `.btn`, `.header`, `.card`, etc. A new `scopeCss(css, scope)` transform
  prefixes every rule under a pane wrapper (`.pane-health` / `.pane-dashboard`).
  `getHealthCss()` / `getDashboardCss()` gained an optional `scope` argument;
  with no argument the output is byte-identical, so the standalone panels are
  unchanged.

### Scan lifecycle

`openDriftToolsHub` shows a loading shell immediately (hero + two "scanning…"
panes + the fully usable launcher), then runs both pane scans concurrently under
one cancellable `withProgress` notification, guarded by an in-flight lock so a
re-open or Rescan does not double-spawn. Assembly is skipped if the panel was
disposed or the scan canceled. A failed or canceled pane renders an inline
placeholder without blanking the other.

### Security

Webview messages arrive over untrusted `postMessage`. Command ids forwarded to
`executeCommand` are validated against the `driftViewer.` namespace prefix
before dispatch. The panel reuses the central `secureWebviewHtml` CSP choke point
(per-render nonce; `script-src` nonce-only).

### Icons

Inline stroke SVGs using `currentColor` (theme-adaptive) rather than the codicon
font, deliberately avoiding a new bundled asset, `localResourceRoots`, and a
font-src CSP directive for what is decoration. An unknown icon name falls back to
a neutral dot.

### Files

New: `extension/src/webview-scope-css.ts`, `extension/src/hub/hub-html.ts`,
`hub-panel.ts`, `hub-commands.ts`, `hub-icons.ts`, `hub-tiles.ts`, `hub-css.ts`,
`extension/src/l10n/strings-panel-hub.ts`, and the tests
`extension/src/test/webview-scope-css.test.ts`, `hub-html.test.ts`.

Edited (additive, backward-compatible): `health/health-css.ts`,
`health/health-html.ts` (added `buildHealthFragment`), `dashboard/dashboard-css.ts`,
`dashboard/dashboard-html.ts` (added `buildDashboardFragment`),
`extension-feature-commands.ts` (registers the hub module),
`l10n.ts` (registers the hub string registry), `tree/tools-tree-provider.ts`
(Getting Started entry), `package.json` + `package.nls.json` (command + title),
regenerated `l10n/nls-coverage-data.ts`, and `CHANGELOG.md`.

### Verification

- `tsc -p ./` clean.
- `npm run compile` green (tsc + `verify-nls` + `verify:nls-coverage`).
- 14 new tests pass (CSS scoping identity + collision isolation; hub composition
  contract: both panes present, styles scoped, exactly one script, every tile
  wired across all groups, one `<details>` per group, single danger tile, failed
  pane isolation).
- 118 existing dashboard / health / tools-tree tests pass unchanged (132 total in
  the affected set), confirming the no-argument CSS path stayed byte-identical and
  the new tree entry did not break tree assertions.

### Known limitations / non-goals

- The preview panes are read-only; layout editing, snapshot/compare, and the
  Code-Health-style persisted report stay on the standalone panels reached via
  "Open full screen". The live Dashboard editor relies on a per-panel message
  protocol the hub does not host.
- The launcher grid and pane set are fixed to the current toolset; adding a third
  preview pane would need a generalized pane registry.
- The hub does not gate tiles by live connection state; tools that need a running
  app surface their own disconnected guidance when invoked. The guidance note
  states this.

## Finish Report (2026-06-22) — Sidebar slimmed to a launcher

Follow-up to the Hub: with the Hub now indexing every tool grouped by category,
the docked "Drift Tools" sidebar tree (`driftViewer.toolbox`,
`ToolsTreeProvider`) duplicated that catalog. The tree was slimmed to a thin
launcher and moved to the top of the Saropa activity-bar container.

### Scope

VS Code extension only (`tools-tree-provider.ts` + its test, `package.json`) plus
CHANGELOG. No Flutter/Dart code.

### What changed

- `ToolsTreeProvider` no longer builds six categories of per-tool items. Its root
  is now a flat launcher:
  1. `ToolLauncherItem` — a prominent "Drift Tools Hub" entry running
     `driftViewer.openDriftToolsHub`, with the extension version as its
     description. It is a separate class from `ToolCommandItem` specifically
     because `ToolCommandItem.applyConnectionState` clears `description` when
     wiring the enabled state, which would have erased the version.
  2. `ToolCommandItem` package-setup gate ("Add Saropa Drift Advisor") shown only
     while the dependency is absent; not connection-gated.
  3. `ToolsStatusItem` connection row reflecting live server state, opening the
     connection-help panel (`driftViewer.showTroubleshooting` with a
     `'disconnected'` argument) when no server is connected.
- `getChildren` returns the flat list at root and `[]` for any element (no
  nesting); `getTreeItem` applies connection state only to `ToolCommandItem`.
- `package.json` reorders the `driftViewer` views so `toolbox` precedes
  `databaseExplorer` and `pendingChanges` — the launcher is now the first view in
  the activity-bar container.

### Entry points after the change

The Hub is reachable from the launcher's top entry and from the command palette
("Saropa Drift Advisor: Open Drift Tools Hub", which carries no `commandPalette`
`when: false` exclusion). The standalone Dashboard remains reachable via "Saropa
Drift Advisor: Open Dashboard" and from inside the Hub.

### Compatibility

`ToolsTreeProvider`'s public surface used by other modules (`connection-ui-state`,
`extension-providers`, `polling-commands`) is unchanged — they call only the
constructor, `setConnected`, `setPackageInstalled`, and `refresh`, none of which
inspected the category structure.

### Verification

- `tsc -p ./` clean; `npm run compile` green (tsc + `verify-nls` +
  `verify:nls-coverage`).
- `tools-tree-provider.test.ts` rewritten to pin the slim launcher (Hub leads,
  version shown, flat list, gate install-state visibility, always-clickable Hub,
  status-row wiring). The polling test (constructs the provider only) is
  unaffected. `mocha --grep "ToolsTreeProvider|polling"` → 22 passing.

### Known follow-up

- The connection-status row now appears both in the slimmed launcher and in the
  Database explorer view directly below it. If the duplication reads as noise, the
  launcher's row can be dropped since the Database view already carries one.
