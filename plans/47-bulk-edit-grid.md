# Feature 47: Bulk Edit Grid (Extension + Web UI)

**Supersedes:** BUG-013 (13-no-web-ui-write-operations.md)

## Implementation status (2026-03)

**Shipped (extension + server):** Transactional batch apply via **`POST /api/edits/apply`** and VM **`ext.saropa.drift.applyEditsBatch`** (validated `UPDATE` / `INSERT INTO` / `DELETE FROM` only; all statements validated before any `BEGIN`). **Bulk Edit** panel (command + table context menu), **Apply Pending Edits to Database**, FK-aware commit ordering when schema metadata includes foreign keys, and matching health/capability fields (`editsApply`, `writeEnabled`, etc.).

**Still open:** Full browser spreadsheet parity (BUG-013), optional anomaly→bulk-edit shortcuts, and other items under [Known Limitations](#known-limitations).

## What It Does

A spreadsheet-like inline editor for table data across both the **VS Code extension** and the **web UI**. Users edit **many cells and rows** in a **single pending batch** (not separate files—edits are recorded as a list of operations). When ready, they **commit** that batch (one transaction on the server in the ideal design). Preview the generated SQL before executing. The extension records **previous values** (`oldValue`) on each cell change so edits can be merged, described in SQL, and reversed within the session via **undo/redo**; explicit Save/Cancel in the web UI.

**Implementation note:** Much of the extension-side plumbing already lives under `extension/src/editing/` (e.g. `change-tracker.ts`, `editing-bridge.ts`, `sql-generator.ts`, `sqlite-cell-value.ts`, pending changes tree view). A dedicated full-screen “bulk edit panel” and web UI parity remain **planned**; the table viewer webview currently supports inline edit where wired.

## Scope: Two Surfaces

| Surface | Capability |
|--------|-------------|
| **Extension** | Full bulk-edit grid: multi-cell edits, add/delete rows, batch commit, undo/redo, SQL preview. |
| **Web UI** | Inline cell editing when `writeQuery` is configured: single-cell or single-row edit at a time, explicit Save/Cancel, delete with confirmation. Edit/delete only shown when server reports write capability. |

The web UI is currently read-only; this plan includes parity so browser-only users get write capability (see [Web UI parity](#web-ui-parity-bug-013)).

## User Experience

1. Right-click a table → "Edit Data" or command palette → "Saropa Drift Advisor: Edit Table Data"
2. Spreadsheet-style grid opens:

```
╔══════════════════════════════════════════════════════════════════╗
║  EDIT DATA — users (1,250 rows)                                 ║
║  Showing rows 1-50                    [+ Add Row] [Commit (3)]  ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  │   │ id   │ name          │ email              │ age │ active ║
║  ├───┼──────┼───────────────┼────────────────────┼─────┼────────║
║  │   │ 1    │ Alice Smith   │ alice@example.com  │ 32  │ 1      ║
║  │ ✎ │ 2    │ Bob Jones     │ bob@example.com    │ 28  │ 1      ║
║  │   │ 3    │ Carol Davis   │ carol@example.com  │ 45  │ 1      ║
║  │ ✎ │ 42   │ [Dave Wilson ]│ dave@example.com   │ 29  │ [0  ]  ║
║  │   │ ...  │               │                    │     │        ║
║  │ ✚ │ NEW  │ [           ] │ [                ] │ [ ] │ [ ]    ║
║  │ 🗑 │ 88   │ ~~Eve Park~~ │ ~~eve@example.com~~│ ~~51~~│ ~~1~~  ║
║  │   │      │               │                    │     │        ║
║                                                                  ║
║  ┌─ Pending Changes (3) ────────────────────────────────────┐  ║
║  │  ✎ UPDATE users SET name='Dave Wilson', active=0          │  ║
║  │     WHERE id=42                                           │  ║
║  │  ✚ INSERT INTO users (name, email, age, active)           │  ║
║  │     VALUES ('New User', 'new@test.com', 25, 1)           │  ║
║  │  🗑 DELETE FROM users WHERE id=88                         │  ║
║  │                                                           │  ║
║  │  [Undo Last] [Discard All] [Preview SQL] [Commit]        │  ║
║  └───────────────────────────────────────────────────────────┘  ║
╚══════════════════════════════════════════════════════════════════╝
```

3. Click a cell to edit its value inline
4. Tab between cells, Enter to confirm
5. Click "+ Add Row" to add a blank row at the bottom
6. Click the row gutter to select → Delete key to mark for deletion
7. "Preview SQL" shows the exact SQL that will execute
8. "Commit" sends all changes as a transaction

### Commit Confirmation

```
Commit 3 Changes?
──────────────────
  1 UPDATE, 1 INSERT, 1 DELETE

  [Preview SQL]  [Cancel]  [Commit]
```

---

## Web UI parity (BUG-013)

**Component:** Web UI · **File:** `lib/src/server/html_content.dart` · **Severity:** Significant

### Problem

The web UI is entirely read-only for data browsing. Even when the server is started with a `writeQuery` callback (which enables the import endpoint), there is no inline cell editing, row insertion, or row deletion in the web UI. Browser-only users have no write capability beyond the import feature.

### Impact

- Users debugging data issues cannot quickly fix a value without writing SQL.
- Inline editing would be far more convenient than import for single-row fixes.
- Browser-only users have a significantly reduced feature set compared to extension users.

### Expected behavior (web UI)

- When `writeQuery` is configured, allow inline cell editing in the data table.
- Double-click a cell to enter edit mode.
- Show a save/cancel button pair on the edited row.
- Track pending changes visually (highlight modified cells).
- Require explicit "Save" action (no auto-save to prevent accidents).
- Confirmation dialog for destructive changes (DELETE), including row identity (e.g. "Delete row where id = 42?").
- Escape cancels the current cell edit and reverts to the original value.
- When leaving the table/tab or refreshing with unsaved changes: "You have unsaved changes. Leave anyway?"

Edit and delete controls must only be shown when the server reports write capability (see Safeguards).

### Safeguards (both extension and web UI)

1. **Capability check** — Expose write capability in `/api/health` (e.g. `writeEnabled: true` when `writeQuery` is set). UI shows edit/delete only when writes are allowed; avoids dead buttons and 501 when not configured.

2. **Single edit at a time (web UI v1)** — In the web UI, allow only one cell (or one row) in edit mode; user must Save or Cancel before starting another edit.

3. **Primary key required** — Only allow updates/deletes when the table has a clear primary key. Disable or hide edit/delete for tables without safe row identity.

4. **Read-only columns** — Do not allow editing of computed/generated or server-marked read-only columns.

5. **Validation before Save** — Validate types and constraints **before** applying an edit to the pending list (extension: schema from `/api/schema/metadata` including `notnull`, shared rules with clipboard import). Rejected edits revert in the webview; server/FK errors may still appear at commit time. Optionally surface server validation errors instead of a generic "Save failed."

6. **Unsaved-changes prompt** — On table change, tab switch, or refresh: if there are unsaved changes, confirm before leaving.

7. **Esc to cancel** — Escape cancels the current cell edit and reverts to the original value.

8. **DELETE confirmation copy** — In the DELETE dialog, include the row's primary key or a short summary (e.g. "Delete row where id = 42?").

9. **No bulk delete in web UI v1** — Only single-row delete (e.g. row action or context menu). Defer multi-select bulk delete to a later iteration.

10. **Parameterized writes on server** — Any write endpoint must build SQL from parameters (table, primary key, column names from schema), not raw user SQL. Preserves the read-only-SQL + writeQuery model and avoids injection.

---

## Files (as implemented vs planned)

**Implemented (extension — editing session):**

```
extension/src/editing/
  change-tracker.ts           # PendingChange list, undo/redo snapshots, oldValue/newValue on cell edits
  editing-bridge.ts           # Webview message bridge + injected script (dblclick cell edit, etc.)
  sql-generator.ts            # SQL from pending changes
  sqlite-cell-value.ts        # Type / NOT NULL validation before pending apply
  pending-changes-provider.ts # Tree view of pending edits
extension/src/test/
  change-tracker.test.ts
  editing-bridge.test.ts
  sqlite-cell-value.test.ts
  sql-generator.test.ts
```

**Planned (full “bulk grid” productization):**

```
extension/src/bulk-edit/      # Dedicated panel (initial dashboard shipped in bulk-edit-panel.ts)
  bulk-edit-panel.ts         # Toolbar webview: open viewer, preview SQL, apply batch, undo/discard
```

**Shipped (commit + panel):**

- **HTTP** `POST /api/edits/apply` — JSON `{ "statements": [ "UPDATE …", … ] }`; each string validated as a single `UPDATE` / `INSERT INTO` / `DELETE FROM`; runs `BEGIN IMMEDIATE` → statements → `COMMIT` (or `ROLLBACK` on failure). Requires `writeQuery`. Advertised as capability `editsApply` when writes are enabled.
- **VS Code** — `driftViewer.commitPendingEdits` applies pending operations in **FK-aware order** (deletes → cell updates → inserts; table order from `DependencySorter` when `schemaMetadata({ includeForeignKeys: true })` succeeds). **`ext.saropa.drift.applyEditsBatch`** supports the same batch when the extension uses VM Service. `driftViewer.editTableData` opens the bulk-edit panel; context menu on tables when connected.

**Web UI parity (BUG-013):**

```
lib/src/server/html_content.dart   # Inline edit when writeEnabled; assets/web/app.js patterns
# Server: notnull in GET /api/schema/metadata (done); writeQuery for commits; writeEnabled in /api/health when set
```

## Dependencies

- `api-client.ts` — `schemaMetadata()` (tables with columns: `name`, `type`, `pk`, **`notnull`** for validation), `sql()`
- `data-management/dependency-sorter.ts` (from Feature 20a) — FK-ordered transaction execution for multi-table commits
- `data-management/dataset-types.ts` (from Feature 20a) — `IFkContext` shared interface for FK constraint validation
- Server: `writeQuery` callback required for executing changes

## Architecture

### Change tracker (as implemented)

`ChangeTracker` holds an ordered list of `PendingChange` items: **cell** (update), **insert**, **delete**.

- **Cell edits** store `table`, `pkColumn`, `pkValue`, `column`, **`oldValue`**, **`newValue`**. If the user edits the same cell again before commit, **`newValue` is updated** but **`oldValue` stays the value from before the first pending edit**—so the batch still knows how to revert that cell to the original DB value in SQL.
- **Undo / redo** operate on **snapshots of the entire pending list** (not a single SQL transaction): each mutating operation pushes the previous list onto an undo stack; **Undo** restores the prior snapshot. This gives stepwise reversal of the editing session.
- State is **in memory only** (see [Session history and persistence](#session-history-and-persistence)).

Pseudocode shape (simplified; see `extension/src/editing/change-tracker.ts`):

```typescript
type PendingChange = CellChange | RowInsert | RowDelete;

interface CellChange {
  kind: 'cell';
  id: string;
  table: string;
  pkColumn: string;
  pkValue: unknown;
  column: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
}
// + RowInsert, RowDelete with table / pk / values as in source
```

### SQL generator

`generateSql(changes: readonly PendingChange[])` in `extension/src/editing/sql-generator.ts` walks pending changes, groups by table, and emits `UPDATE` / `INSERT` / `DELETE` with `sqlLiteral()` escaping. **`generateSqlStatements`** (used for commit) respects **FK-aware phase ordering** via `apply-order.ts` + `data-management/dependency-sorter.ts` before sending the batch to the server.

### Webview message protocol (current extension bridge)

Implemented in `editing-bridge.ts` (injected script + `handleMessage`).

**Webview → extension:**

```typescript
{ command: 'cellEdit', table: string, pkColumn: string, pkValue: unknown, column: string, oldValue: unknown, newValue: unknown }
{ command: 'rowDelete', table: string, pkColumn: string, pkValue: unknown }
{ command: 'rowInsert', table: string, values: Record<string, unknown> }
{ command: 'undo' }
{ command: 'redo' }
{ command: 'discardAll' }
```

**Extension → webview:**

```typescript
{ command: 'pendingChanges', changes: PendingChange[] }
{ command: 'cellEditRejected', table, pkColumn, pkValue, column, oldValue, reason }  // validation failed; revert cell
{ command: 'editingEnabled', enabled: boolean }
```

**Planned** for a dedicated bulk panel: `previewSql`, `commit`, `loadPage`, `committed`, `init`, etc.

### Grid keyboard navigation (target UX)

Full Tab/Enter/Escape navigation across the whole grid is **planned** for the dedicated bulk panel. The **current** injected script (table viewer webview) now includes **quick wins**: double-click cell edit with `Escape` cancelling without committing, **Tab** / **Enter** committing by blurring the input (Tab prevents focus trap), **Ctrl/Cmd+Z** undoing the last pending operation when the inline editor is **not** focused (so undo does not fight the browser’s own text undo).

### Quick wins shipped (extension table viewer)

| Item | Status |
|------|--------|
| Cell editor class + Escape removes blur listener (no accidental commit after cancel) | Done (`cell-inline-editor`, guarded blur in injected script) |
| Tab commits cell edit (blur) | Done |
| Ctrl/Cmd+Z → pending undo (when not in cell input) | Done |
| Row insert validation aligned with `parseCellEditForColumn` / cell rules | Done (`validateRowInsert`) |
| Rejected row insert removes provisional DOM row | Done (`data-drift-pending-insert`, `rowInsertRejected`) |
| Validation copy + nullable NULL hint | Done (`CELL_EDIT_HINT` on cell + insert warnings) |
| Pending edits status bar + discoverable SQL preview command title | Done (`pending-edits-status-bar.ts`, command title **Preview SQL from Pending Edits**) |
| Persistent draft of pending changes (workspace) + restore prompt | Done (`pending-changes-persistence.ts`, debounced save, restore on activate) |

## Server-Side Changes

None directly, but requires the existing `sql()` endpoint to support write operations (INSERT, UPDATE, DELETE). The `writeQuery` callback must be available on the server.

## package.json Contributions

```jsonc
{
  "contributes": {
    "commands": [
      {
        "command": "driftViewer.editTableData",
        "title": "Saropa Drift Advisor: Edit Table Data",
        "icon": "$(edit)"
      }
    ],
    "menus": {
      "view/item/context": [{
        "command": "driftViewer.editTableData",
        "when": "viewItem == driftTable && driftViewer.serverConnected",
        "group": "4_edit"
      }]
    }
  }
}
```

## Wiring in extension.ts

`setupEditing()` in `extension-editing.ts` constructs `ChangeTracker`, `EditingBridge` (with `() => client.schemaMetadata()` for validation), the pending-changes tree view, **debounced draft persistence** to `workspaceState`, a **status bar** item when `changeCount > 0`, and (after microtask delay) **`offerRestoreDraft`** if a non-empty serialized draft exists and the tracker is empty. The main table **webview** attaches the editing bridge so inline edits flow to the tracker.

A dedicated **`driftViewer.editTableData`** command that opens a **BulkEditPanel** (as sketched below) is **planned**; today, editing is tied to the shared dashboard/table viewer webview.

```typescript
// Planned wiring shape (PK check before opening a dedicated editor)
const tables = await client.schemaMetadata();
const tableMeta = tables.find((t) => t.name === table);
const pkCol = tableMeta?.columns.find((c) => c.pk)?.name;
if (!pkCol) {
  vscode.window.showWarningMessage(
    `Table "${table}" has no primary key — editing requires a PK column.`,
  );
  return;
}
// BulkEditPanel.createOrShow(context.extensionUri, client, tableMeta, pkCol);
```

## Session history and persistence

| Concern | Behavior |
|--------|----------|
| **Previous value** | Each `CellChange` stores **`oldValue`** and **`newValue`**. Re-editing the same cell updates **`newValue` only**; **`oldValue` remains** the first-seen value so generated `UPDATE` still reflects “from original row state → latest edit.” |
| **Undo / redo** | **In-memory** stacks of full pending-change snapshots (`ChangeTracker.undo` / `redo`). Reverses editing **session** steps until **Discard** or reload. |
| **After SQL commit** | Reverting data is **not** automatic; that would require DB transactions, reverse SQL from stored `oldValue`s, or a snapshot/branch feature—**out of scope** for pending-queue undo. |
| **Persistent draft** | **Implemented (workspace).** `PendingChange[]` is saved to `workspaceState` under `driftViewer.pendingEditsDraft.v1` (debounced). Empty queue clears storage. On activate, an **empty** tracker + non-empty draft prompts **Restore** / **Discard saved draft**. **Future:** conflict detection if the DB changed; tie clear semantics to server **commit** when that flow exists. |

## Testing

- `change-tracker.test.ts`: cell edits preserve `oldValue` when `newValue` is updated; undo/redo; discard; `replacePendingChanges` clears undo/redo and applies restored list.
- `editing-bridge.test.ts`: message handling; invalid values rejected when schema is supplied.
- `sqlite-cell-value.test.ts`: type and NOT NULL rules; `validateRowInsert` parity with cell validation.
- `sql-generator.test.ts` (where present): literals, UPDATE/INSERT/DELETE shape, empty changeset.
- `changeCount` is the **number of pending operations** (cell/insert/delete entries), not “unique rows only.”

## Integration Points

### Shared Services Used

| Service | Usage |
|---------|-------|
| SchemaIntelligence | Cached table/column metadata for grid headers |
| RelationshipEngine | FK validation before commit (check referenced rows exist) |

### Consumes From

| Feature | Data/Action |
|---------|-------------|
| Schema Intelligence Cache (1.2) | Column types, PK identification |
| Data Invariant Checker (27) | Pre-commit validation against invariants |
| Anomaly Detection | Highlight anomalous values in grid |
| Clipboard Import (55) | "Paste Rows" action imports clipboard data |

### Produces For

| Feature | Data/Action |
|---------|-------------|
| Unified Timeline (6.1) | Bulk edit events logged |
| Real-time Mutation Stream (22) | Generated SQL captured as mutations |
| Data Branching (37) | "Create Branch Before Edit" safety action |
| Query Replay DVR (26) | Committed SQL recorded in DVR |

### Cross-Feature Actions

| From | Action | To |
|------|--------|-----|
| Bulk Edit Grid | "Preview Invariant Violations" | Invariant check on pending changes |
| Bulk Edit Grid | "Create Branch" | Data Branch before commit |
| Bulk Edit Grid | "Paste Rows" | Clipboard Import |
| Bulk Edit Grid | "View in Diagram" | ER Diagram centered on table |
| Table Data Viewer | "Edit Mode" | Bulk Edit Grid for table |
| Anomaly Viewer | "Fix Anomalies" | Bulk Edit Grid with affected rows |
| Invariant Violation | "Fix Rows" | Bulk Edit Grid with violating rows |

### Health Score Contribution

| Metric | Contribution |
|--------|--------------|
| Data Quality | Edits that fix anomalies improve score |

### Unified Timeline Events

| Event Type | Data |
|------------|------|
| `bulk-edit` | `{ table, inserts, updates, deletes, timestamp }` |

### Pre-Commit Validation Pipeline

Before committing changes, the Bulk Edit Grid validates through multiple systems:

```
Pending Changes
    │
    ├── 1. FK Validation (RelationshipEngine)
    │   └── Check all FK references exist
    │
    ├── 2. Invariant Check (InvariantManager)
    │   └── Preview which invariants would fail
    │
    ├── 3. Anomaly Check (AnomalyDetector)
    │   └── Flag if changes create new anomalies
    │
    ▼
Commit or Show Warnings
```

### Integration with Anomaly Viewer

"Fix" actions in Anomaly Viewer open Bulk Edit Grid with affected rows:

```typescript
// Anomaly → Bulk Edit flow
vscode.commands.registerCommand('driftViewer.fixAnomalyRows', (anomaly) => {
  BulkEditPanel.createOrShow(context.extensionUri, client, anomaly.table, {
    filter: `WHERE ${anomaly.condition}`,  // Pre-filter to anomalous rows
    highlightColumns: anomaly.affectedColumns,
  });
});
```

---

## Known Limitations

- Requires a **primary key** column for stable row identity — tables without a PK cannot be edited safely
- **BLOB** columns: not supported for inline grid edits (binary not edited as text)
- **Extension:** type / NOT NULL validation runs **before** an edit enters the pending list (invalid edits are rejected and the cell reverts). **Commit-time** errors (FK, uniqueness, server) are still possible when SQL runs
- **Web UI:** validation parity when inline editing ships there
- **Persistent draft** is workspace-local and best-effort — storage quota errors are ignored; restored edits may not match live DB state until a **commit** path validates it
- Undo applies to the **pending edit session** (snapshot undo), not to **already-committed** SQL
- No **optimistic concurrency** (row versions) — another writer can change the same row; last commit wins unless the DB rejects the update
- Pagination may limit which rows are visible in the viewer — editing rows off the current page depends on product behavior
- No multi-cell selection / Excel-style paste in the current injected script
- **FK** and other DB constraint failures often surface at **commit** (or server execution), not only during cell edit
- Computed/generated columns and trigger side effects are not modeled in the grid
