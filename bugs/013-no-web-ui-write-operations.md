# BUG-013: No write operations from the web UI (even when writeQuery is configured)

## Severity: Significant

## Component: Web UI

## File: `lib/src/server/html_content.dart`

## Description

The web UI is entirely read-only for data browsing. Even when the server is
started with a `writeQuery` callback (which enables the import endpoint), there
is no inline cell editing, row insertion, or row deletion capability in the web
UI.

The VS Code extension has full edit tracking with undo/redo, but the web UI does
not expose any of this functionality. Users who access the debug server via
browser (e.g., when not using VS Code) have no write capability beyond the
import feature.

## Impact

- Users debugging data issues cannot quickly fix a value without writing SQL
- The import feature exists but inline editing would be far more convenient for
  single-row fixes
- Browser-only users have a significantly reduced feature set compared to VS Code
  extension users

## Steps to Reproduce

1. Start the server with `writeQuery` callback configured
2. Open the web UI in a browser
3. Browse to a table with data
4. Try to click on a cell to edit it — not possible
5. The only write path is the Import section (upload a file)

## Expected Behavior

- When `writeQuery` is configured, allow inline cell editing in the data table
- Double-click a cell to enter edit mode
- Show a save/cancel button pair on the edited row
- Track pending changes visually (highlight modified cells)
- Require explicit "Save" action (no auto-save to prevent accidents)
- Consider a confirmation dialog for destructive changes (DELETE)
