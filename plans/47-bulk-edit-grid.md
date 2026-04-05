# Feature 47: Bulk Edit Grid (Extension + Web UI)

**Supersedes:** BUG-013 (13-no-web-ui-write-operations.md)

---

## Overview

A spreadsheet-like inline editor for table data. Users edit **many cells and rows** in a **single pending batch**, then **commit** that batch as one transaction. The extension records **previous values** (`oldValue`) on each cell change so edits can be merged, described in SQL, and reversed within the session via **undo/redo**.

### Two surfaces

| Surface | Capability |
|--------|-------------|
| **Extension** | Full bulk-edit grid: multi-cell edits, add/delete rows, batch commit, undo/redo, SQL preview. |
| **Web UI** | Inline cell editing when `writeQuery` is configured: single-cell or single-row at a time, explicit Save/Cancel, delete with confirmation. |

---

## Phase 1: Shipped

Everything below is implemented and tested.

### Extension editing infrastructure

```
extension/src/editing/
  change-tracker.ts           # PendingChange list, undo/redo snapshots, oldValue/newValue on cell edits
  editing-bridge.ts           # Webview message bridge + schema validation
  editing-bridge-script.ts    # Injected JS: dblclick cell edit, right-click delete, add row, Ctrl+Z undo
  sqlite-cell-value.ts        # Type / NOT NULL / BLOB validation before pending apply
  sql-generator.ts            # SQL from pending changes (preview + batch statements)
  apply-order.ts              # FK-aware dependency sorting for safe multi-table commits
  pending-changes-provider.ts # Tree view of pending edits
  pending-changes-persistence.ts # Debounced workspace state saving + restore prompt + conflict detection
  pending-edits-status-bar.ts # Status bar showing pending edit count
  editing-commands.ts         # All editing-related command registrations
extension/src/bulk-edit/
  bulk-edit-panel.ts          # Dashboard webview: open viewer, preview SQL, apply, undo, discard
```

### Server

- **`POST /api/edits/apply`** — JSON `{ "statements": [...] }`; each string validated as `UPDATE` / `INSERT INTO` / `DELETE FROM`; runs `BEGIN IMMEDIATE` → statements → `COMMIT` (or `ROLLBACK` on failure). Requires `writeQuery`. Advertised as capability `editsApply`.
- **`GET /api/health`** — reports `writeEnabled: true` when `writeQuery` is set.
- **`GET /api/schema/metadata`** — includes `notnull` and `foreignKeys` for validation and ordering.

### Commands registered

| Command | What it does |
|---------|-------------|
| `driftViewer.editTableData` | Opens BulkEditPanel; validates table has PK (error if missing) |
| `driftViewer.generateSql` | Opens side-by-side SQL preview of pending changes |
| `driftViewer.commitPendingEdits` | FK-aware batch apply with modal confirmation |
| `driftViewer.undoEdit` / `redoEdit` | Snapshot-based undo/redo |
| `driftViewer.discardAllEdits` | Discard all with confirmation |
| `driftViewer.removeChange` | Remove a single change from the tree view |

### Inline editing UX (extension table viewer)

| Item | Status |
|------|--------|
| Double-click cell to edit; Escape cancels without commit | Done |
| Tab / Enter commits cell edit (blur) | Done |
| BLOB columns blocked from inline editing (validation + DOM skip) | Done |
| Ctrl/Cmd+Z → pending undo (when not in cell input) | Done |
| Row insert validation aligned with cell rules | Done |
| Rejected row insert removes provisional DOM row | Done |
| Validation copy + nullable NULL hint | Done |
| Pending edits status bar + discoverable SQL preview command title | Done |
| Persistent draft of pending changes (workspace) + restore prompt | Done |
| Draft conflict detection: re-reads affected rows on restore, warns if DB changed | Done |
| Table cells carry `data-raw-value` for correct NULL/value round-trips in editing | Done |
| Table headers carry `data-col-type` for client-side BLOB/PK detection | Done |

### Change tracker design

- **Cell edits** store `table`, `pkColumn`, `pkValue`, `column`, `oldValue`, `newValue`. Re-editing the same cell updates `newValue` but preserves `oldValue` (the original DB state).
- **Undo/redo** operates on snapshots of the entire pending list.
- **Persistent draft** saves to `workspaceState` (debounced 450ms). On activate, prompts Restore/Discard if a draft exists.

### Webview message protocol

**Webview → extension:**

```typescript
{ command: 'cellEdit', table, pkColumn, pkValue, column, oldValue, newValue }
{ command: 'rowDelete', table, pkColumn, pkValue }
{ command: 'rowInsert', table, values: Record<string, unknown> }
{ command: 'undo' }
{ command: 'redo' }
{ command: 'discardAll' }
```

**Extension → webview:**

```typescript
{ command: 'pendingChanges', changes: PendingChange[] }
{ command: 'cellEditRejected', table, pkColumn, pkValue, column, oldValue, reason }
{ command: 'editingEnabled', enabled: boolean }
{ command: 'rowInsertRejected', table }
```

### Safeguards (extension)

1. **Capability check** — UI only enables edit/delete when server reports `writeEnabled: true`.
2. **Primary key required** — `showErrorMessage` when table has no PK; editing disabled.
3. **Read-only columns** — PK columns and BLOB columns are not editable inline.
4. **Validation before pending** — Type and NOT NULL checks via schema metadata; rejected edits revert the cell.
5. **Parameterized writes** — Server builds SQL from validated parameters, not raw user SQL.
6. **FK-aware commit ordering** — Deletes before updates before inserts, ordered by dependency graph.
7. **Modal confirmation** — Commit requires explicit "Apply" in a modal dialog.
8. **Commit failure preserves queue** — On error, pending edits remain so the user can fix and retry. Error message includes statement count and rollback detail.
9. **Draft conflict detection** — On restore, re-reads affected rows from the DB and warns if any `oldValue` no longer matches (value changed, row deleted). Best-effort: skips gracefully if the server is unreachable.

### Tests

- `change-tracker.test.ts`: cell edit merging, undo/redo, discard, `replacePendingChanges`.
- `editing-bridge.test.ts`: message handling, validation rejection, schema load failure.
- `sqlite-cell-value.test.ts`: type rules, NOT NULL, `validateRowInsert` parity.
- `sql-generator.test.ts`: literal escaping, UPDATE/INSERT/DELETE shape.
- `pending-changes-persistence.test.ts`: deserialization validation, draft conflict detection (value mismatch, deleted rows, multi-table, NULL handling, SQL injection escaping, SQL failure resilience).

### Dependencies

| Dependency | Usage |
|-----------|-------|
| `api-client.ts` | `schemaMetadata()`, `applyEditsBatch()`, `health()`, `sql()` |
| `data-management/dependency-sorter.ts` | FK-ordered transaction execution |
| `data-management/dataset-types.ts` | `IFkContext` shared FK interface |
| Server `writeQuery` callback | Required for executing changes |

---

## Phase 2: Next (concrete, scoped)

### 2a. Dedicated bulk edit panel (extension)

The current editing flows through the shared table viewer webview. A dedicated full-screen "bulk edit" panel would provide:

- Grid with all pending changes visible at once
- Toolbar: Undo, Redo, Discard, Preview SQL, Commit
- Page navigation for large tables
- Full keyboard navigation (Tab/Enter/Escape across cells)

**Files:** `extension/src/bulk-edit/bulk-edit-panel.ts` (skeleton exists, needs full grid)

### 2b. Commit failure detail

When the server rejects a batch, surface **which statement** failed (if the server reports it). Currently the error message shows the count and the server error string but not the specific failing SQL. This depends on whether the server includes the failing statement index in its error response.

---

## Phase 3: Web UI parity (BUG-013)

The web UI is currently read-only. This phase adds inline editing for browser-only users.

### Expected behavior

- When `writeEnabled` is reported in `/api/health`, show edit/delete controls.
- Double-click a cell to enter edit mode.
- Show Save/Cancel buttons on the edited row.
- Track pending changes visually (highlight modified cells).
- Require explicit "Save" action (no auto-save).
- Confirmation dialog for DELETE, including row identity (e.g. "Delete row where id = 42?").
- Escape cancels cell edit and reverts.
- Unsaved-changes prompt on navigation/refresh.

### Web-specific safeguards

1. **Single edit at a time (v1)** — One cell or row in edit mode; Save/Cancel before starting another.
2. **No bulk delete (v1)** — Single-row delete only.
3. **Primary key required** — Same as extension.
4. **Read-only columns** — PK and BLOB columns not editable.

### Web UI convergence note

The single-edit-at-a-time constraint is a v1 simplification. The web UI should eventually converge to batch editing (matching the extension model) once the UX is validated. The constraint is **not permanent** — it reduces initial scope and prevents accidental data loss in a less-controlled environment (browser tabs can close unexpectedly).

### Files

```
lib/src/server/html_content.dart   # Inline edit when writeEnabled
assets/web/app.js                  # Client-side editing logic (mirrors editing-bridge-script.ts patterns)
```

---

## Phase 4: Future (aspirational)

These depend on other features that may not yet exist. Do not build until the dependency ships.

| Item | Depends on |
|------|-----------|
| Anomaly → bulk edit shortcuts ("Fix Anomalies" action) | Anomaly Viewer with fix actions |
| Pre-commit invariant validation preview | Data Invariant Checker (27) |
| "Create Branch Before Edit" safety action | Data Branching (37) |
| "Paste Rows" action from clipboard | Clipboard Import (55) |
| Bulk edit events in Unified Timeline | Unified Timeline (6.1) |
| Committed SQL captured in DVR | Query Replay DVR (26) |

---

## Known Limitations

- **Primary key required** — tables without a PK cannot be edited (hard gate, not a warning).
- **BLOB columns** — not editable inline; skipped in the grid and rejected by validation.
- **Commit-time errors** — FK violations, uniqueness constraints, and other server errors surface at commit, not during cell edit. The entire transaction rolls back; pending edits are preserved for retry.
- **No optimistic concurrency** — no row versioning; last commit wins unless the DB rejects the update. Draft restore checks `oldValue`s against live DB, but concurrent edits between restore and commit are not detected.
- **Composite primary keys** — the schema model supports them but the inline editing script assumes a single PK column (`pkColumn` singular).
- **Pagination** — editing rows off the current page depends on which rows the viewer has loaded.
- **No multi-cell selection** — no Excel-style drag-select or paste in the current injected script.
- **Computed/generated columns** — trigger side effects are not modeled in the grid.
- **Persistent draft** is best-effort — workspace storage quota errors are silently ignored.
