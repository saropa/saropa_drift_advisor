# Extension: Database view toolbar and openDashboard command

## Status

Fully implemented.

## Summary

- **Toolbar crowding** — The Database view title bar showed ~15 icons with no grouping. Primary actions (About, Open in Browser, Refresh, Health Score, Dashboard, Drift Tools menu) remain in the main toolbar; the rest (Schema Docs, Import Dataset, Global Search, Bookmarks, Isar→Drift, Snippet Library, Invariants, ER Diagram, Export Report, Add Package) were moved to the overflow group `1_more` so they appear under the (…) menu. A **Drift Tools menu** icon was added to the Database view so users have one entry point to the full tools quick pick.
- **openDashboard not found** — The command `driftViewer.openDashboard` is contributed in package.json and registered in code; if the extension had not yet activated when the user clicked the Dashboard icon, the command was not found. Added `onCommand:driftViewer.openDashboard` to `activationEvents` so VS Code activates the extension when the command is invoked, then executes it.

## Files changed

- `extension/package.json` — Added activation event `onCommand:driftViewer.openDashboard`. In `menus.view/title`: set `group` to `1_more` for generateSchemaDocs, importDataset, globalSearch, openBookmarks, isarToDrift, openSnippetLibrary, manageInvariants, showErDiagram, exportReport, addPackageToProject (Database view); added showToolsQuickPick to Database view with `group: navigation`.

## Tests

No code logic changed; existing `dashboard-commands.test.ts` covers command registration. Manual verification for toolbar layout and overflow menu. No new unit tests for package.json contributions.
