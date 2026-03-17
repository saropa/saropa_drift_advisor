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
- Confirmation dialog for destructive changes (DELETE), including row identity in the copy (e.g. "Delete row where id = 42?")
- Escape key cancels the current cell edit and reverts to the original value
- When leaving the table/tab or refreshing with unsaved changes, prompt: "You have unsaved changes. Leave anyway?"

Edit and delete controls must only be shown when the server reports write capability (see Safeguards).

## Safeguards

Implement the following to minimize user error and accidental data loss:

1. **Capability check** — Expose write capability in `/api/health` (e.g. `writeEnabled: true` when `writeQuery` is set). UI shows edit/delete only when writes are allowed; avoids dead buttons and 501 when not configured.

2. **Single edit at a time** — Allow only one cell (or one row) in edit mode; user must Save or Cancel before starting another edit.

3. **Primary key required** — Only allow updates/deletes when the table has a clear primary key. Disable or hide edit/delete for tables without safe row identity.

4. **Read-only columns** — Do not allow editing of computed/generated or server-marked read-only columns.

5. **Validation before Save** — Validate types and constraints in the UI before sending; show inline errors. Optionally surface server validation errors instead of a generic "Save failed."

6. **Unsaved-changes prompt** — On table change, tab switch, or refresh: if there are unsaved changes, confirm before leaving.

7. **Esc to cancel** — Escape cancels the current cell edit and reverts to the original value.

8. **DELETE confirmation copy** — In the DELETE dialog, include the row's primary key or a short summary (e.g. "Delete row where id = 42?").

9. **No bulk delete (v1)** — Only single-row delete (e.g. row action or context menu). Defer multi-select bulk delete to a later iteration.

10. **Parameterized writes on server** — Any new write endpoint must build SQL from parameters (table, primary key, column names from schema), not raw user SQL. Preserves the read-only-SQL + writeQuery model and avoids injection.
