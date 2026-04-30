<!--
  Archived 2026-04-30: phases 1–4 shipped per plan status. Stub: ../../../../47-bulk-edit-grid.md
-->

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

### Implementation status (2026-04-30)

| Phase | Status |
|-------|--------|
| **1** | Shipped (see below). |
| **2a** — dedicated bulk panel grid, paging, redo, keyboard nav | Shipped in `extension/src/bulk-edit/bulk-edit-panel.ts` (incl. Arrow/Home/End/Enter/Escape on grid, Ctrl+Enter apply). |
| **2b** — commit failure shows failing statement | Shipped: server JSON keys + extension toast actions (Preview / copy). |
| **2c** — acceptance tests | Shipped: composite-PK command guard, bridge PK validation, integration semicolon + failure payload tests. |
| **3** — web parity | **Shipped (v1)** — Save/Cancel, single active edit, delete confirm, `beforeunload` guard, single-column PK gate, dirty cell/row highlight before save, **Retry save** / **Reload table** after failed cell save, confirm-to-reload after failed row delete. |
| **4** | Shipped (see Phase 4 table); plan-37 **git-style data branches** remain future work — interim safety uses **DB snapshots** + timeline refresh. |

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

## Phase 2: Shipped (detail + prerequisites)

**Summary:** 2a–2c are implemented; see **Implementation status** above. The prerequisites below were required **before** that work and are now satisfied.

### Phase 2 prerequisites (shipped before 2a–2c)

These safeguards were required before expanding editing surface area:

1. **Single-column PK hard gate** — editing commands must reject tables with zero PK columns **or** composite PKs (`pkCount !== 1`) until protocol and SQL generation support composite keys end-to-end.
2. **Strict statement validation contract** — `/api/edits/apply` only accepts one mutation statement per array item (single `UPDATE` / `INSERT INTO` / `DELETE FROM`), rejects multi-statement payloads and trailing executable SQL.
3. **Web save conflict policy (v1 explicit)** — web inline Save uses last-write-wins semantics in v1; on server constraint failure, keep local edited state and show retry/reload guidance.
4. **Phase gate tests** — add targeted tests for the above gates before implementing new UI features.

### 2a. Dedicated bulk edit panel (extension)

**Shipped:** `extension/src/bulk-edit/bulk-edit-panel.ts` — paged grid of pending changes, toolbar (Undo, Redo, Discard, Preview SQL, Commit), wiring to the same apply flows as the table viewer, **keyboard grid navigation** (Tab to the grid region, Arrow Up/Down, Home/End for page bounds, Enter opens table viewer, Escape clears row highlight — no longer mapped to Discard), and toolbar shortcuts to **Data invariants**, **Paste from clipboard**, **Query DVR**, and **Capture DB snapshot** (interim “branch before edit” safety until plan 37).

### 2b. Commit failure detail

**Shipped:** On statement failure, `POST /api/edits/apply` error JSON can include `failedIndex` and `failedStatement`; the extension formats the message and offers **Preview SQL** / **Copy Failed SQL** on commit errors.

### 2c. Acceptance and tests for Phase 2

- Extension command test: `driftViewer.editTableData` rejects composite PK tables with a user-facing warning.
- Bridge test: editing messages are rejected when `pkColumn` is missing/blank.
- Server test: `/api/edits/apply` rejects semicolon-chained payloads in one statement item.
- Manual UX check: pending edits remain after failed apply and can be retried.

---

## Phase 3: Web UI parity (BUG-013)

**Shipped (v1):** Inline editing when `writeEnabled` and a single PK column — double-click to edit, Save/Cancel, delete with confirm, `beforeunload` guard, single active edit, dirty highlight when the draft differs from the loaded value, **Retry save** / **Reload table** after server/network save failure, and optional reload after failed delete.

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
3. **Exactly one PK column required (v1)** — Same gate as extension; composite PK tables are read-only for now.
4. **Read-only columns** — PK and BLOB columns not editable.
5. **Explicit conflict behavior (v1)** — Last-write-wins by default; if commit fails (constraint/transaction error), preserve local edit state and show retry/reload options.

### Web UI convergence note

The single-edit-at-a-time constraint is a v1 simplification. The web UI should eventually converge to batch editing (matching the extension model) once the UX is validated. The constraint is **not permanent** — it reduces initial scope and prevents accidental data loss in a less-controlled environment (browser tabs can close unexpectedly).

### Files

```
lib/src/server/html_content.dart   # Inline edit when writeEnabled
assets/web/app.js                  # Client-side editing logic (mirrors editing-bridge-script.ts patterns)
```

### 3a. Acceptance and tests for Phase 3

- UI test/manual script: only one active row edit; second edit attempt is blocked.
- Navigation guard test: unsaved web edit prompts before leaving/refreshing.
- Delete confirmation test: dialog includes stable row identity text.
- Server+UI behavior test: failed Save preserves row edit state and displays actionable error.

---

## Phase 4: Integrations (shipped where dependencies exist)

| Item | Depends on | Status |
|------|-----------|--------|
| Anomaly → bulk edit shortcuts ("Fix Anomalies" action) | Anomaly Viewer with fix actions | **Shipped:** Anomalies panel toolbar **Bulk edit table…** → quick-pick → `driftViewer.editTableData` with single-PK guard. |
| Pre-commit invariant validation preview | Data Invariant Checker (27) | **Shipped (light):** Bulk panel **Data invariants…** opens `driftViewer.manageInvariants` for manual review before commit. |
| "Create Branch Before Edit" safety action | Data Branching (37) | **Shipped (interim):** bulk panel **Capture DB snapshot…** runs `driftViewer.captureSnapshot` (row-level snapshot store + VS Code **Drift Database** timeline). Full git-style branches remain [37-data-branching.md](../../../../37-data-branching.md). |
| "Paste Rows" action from clipboard | Clipboard Import (55) | **Shipped:** Bulk panel **Paste from clipboard…** runs `driftViewer.clipboardImport`. |
| Bulk edit events in Unified Timeline | Unified Timeline (6.1) | **Shipped:** successful batch apply triggers `SnapshotStore.capture(client, { bypassDebounce: true })` so timeline row-count entries update immediately; output channel line retained for session logs. |
| Committed SQL captured in DVR | Query Replay DVR (26) | **Shipped:** each `writeQuery` call (including each `POST /api/edits/apply` statement) already flows through `QueryRecorder.recordWrite` when DVR recording is active; bulk panel adds **Query DVR** shortcut. |

---

## Known Limitations

- **Primary key required** — tables without a PK cannot be edited (hard gate, not a warning).
- **BLOB columns** — not editable inline; skipped in the grid and rejected by validation.
- **Commit-time errors** — FK violations, uniqueness constraints, and other server errors surface at commit, not during cell edit. The entire transaction rolls back; pending edits are preserved for retry.
- **No optimistic concurrency** — no row versioning; last commit wins unless the DB rejects the update. Draft restore checks `oldValue`s against live DB, but concurrent edits between restore and commit are not detected.
- **Composite primary keys** — intentionally blocked for editing in v1; the inline editing protocol currently assumes a single `pkColumn`.
- **Pagination** — editing rows off the current page depends on which rows the viewer has loaded.
- **No multi-cell selection** — no Excel-style drag-select or paste in the current injected script.
- **Computed/generated columns** — trigger side effects are not modeled in the grid.
- **Persistent draft** is best-effort — workspace storage quota errors are silently ignored.
