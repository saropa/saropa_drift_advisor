# Bug: Booleans Showing as Integers in the UI

## Overview

SQLite stores booleans as `INTEGER` (0 or 1). The Dart backend already derives the semantic Drift type and sends `driftType: 'bool'` in schema API responses, but no UI surface consumes it for display. The data grid falls back to a column-NAME heuristic that only recognizes some boolean names; the VS Code sidebar ignores semantics entirely. Boolean columns whose names don't match the heuristic render as `0`/`1`.

## Current State (verified against code)

### Backend (COMPLETE — no work needed)
- `lib/src/start_drift_viewer_extension.dart:187` — derives `driftType` from Drift's `GeneratedColumn` when the host wires the integration.
- `lib/src/server/schema_handler.dart:331–395` — enriches `GET /api/schema/metadata` columns with `driftType` from the host's `declaredSchema` callback.
- `lib/src/server/schema_handler.dart:621–622` — `GET /api/schema/declared` serializes `driftType` per column.
- `lib/src/server/server_types.dart:99–104` — `driftType` vocabulary: `'dateTime' | 'bool' | 'int' | 'double' | 'string' | 'blob'`. Null for raw SQLite hosts.
- Proof the plumbing works end-to-end: `assets/web/nl-to-sql.ts` already consumes `driftType` for NL-to-SQL date/bool detection.

### Web app data grid (the actual bug site)
The "View Table Data" panel in VS Code is the Dart-served web app loaded into a webview (`extension/src/panel.ts`), so grid fixes land in `assets/web/`, not `extension/src/`.

1. **`driftType` is dropped on the floor:** `loadColumnTypes` (`assets/web/table-view.ts:25–35`) fetches `/api/schema/metadata` but keeps only `c.type` (line 31) — `c.driftType` never reaches the renderer.
2. **Name heuristic is the only bool signal:** `formatCellValue` (`assets/web/table-view.ts:69–88`) shows true/false only when `isBooleanColumn(columnName)` matches (`table-view.ts:45–50`): prefixes `is_ / has_ / can_ / should_ / allow_ / enable` plus four exact names. Any other boolean column (`verified_flag`, `notifications`, camelCase names, etc.) renders as an integer.
3. **Broken suffix regex in the heuristic:** `table-view.ts:48` uses `/_(enabled|active|...)\$/` — in a JavaScript regex, `\$` matches a literal dollar-sign character, not end-of-string, so the entire suffix branch (`_enabled`, `_active`, `_deleted`, …) never matches anything. Looks ported from Dart, where `$` needs escaping in strings.
4. **Cell editor uses the same heuristic:** `assets/web/cell-edit.ts:95` gates its bool editing behavior on `isBooleanColumn` too.

### VS Code extension sidebar
- `extension/src/api-types.ts:11–15` — `ColumnMetadata` has no `driftType` field; the JSON carries it but the type drops it.
- `extension/src/tree/tree-items.ts:6–13` — `columnIcon` keys off the SQLite storage type only (`INTEGER`/`REAL` → number icon); `tree-items.ts:113` shows `column.type` (`INTEGER`) as the description. Boolean columns are indistinguishable from ints.

### Example backend response
`GET /api/schema/metadata` for a table with a boolean column:
```json
{
  "tables": [
    {
      "name": "users",
      "columns": [
        { "name": "id", "type": "INTEGER", "driftType": "int", "pk": true, "notnull": true },
        { "name": "is_active", "type": "INTEGER", "driftType": "bool", "pk": false, "notnull": true }
      ]
    }
  ]
}
```
`driftType` is present only when the host supplied the `declaredSchema` callback (raw SQLite hosts and older servers omit it).

---

## Required Changes

### 1. Web grid — use `driftType` as the exact bool signal
- Extend `loadColumnTypes` (`assets/web/table-view.ts:25–35`) to also keep `c.driftType` per column (e.g. store `{ type, driftType }` or a parallel map — whichever disturbs `colTypes` consumers least).
- In `formatCellValue` (`table-view.ts:69`), check `driftType === 'bool'` first (exact); keep the name heuristic as the fallback for raw/legacy hosts where `driftType` is absent.
- Apply the same signal in the cell editor gate (`assets/web/cell-edit.ts:95`).
- Fix the broken suffix regex at `table-view.ts:48` (`\$` → `$`) so the heuristic fallback works as intended.

### 2. Extension sidebar — semantic type in icon and label
- Add `driftType?: string` to `ColumnMetadata` (`extension/src/api-types.ts:11`).
- In `columnIcon` (`extension/src/tree/tree-items.ts:6`), return `symbol-boolean` when `driftType === 'bool'` before the storage-type checks.
- In the column item description (`tree-items.ts:113`), show the semantic type (`bool`) when known, falling back to the storage type.

### 3. Custom SQL query results
When a query's result column can be matched by name to a known table's schema, resolve its `driftType` and format bools per change 1. Unmatched columns (expressions, aliases, unknown context) fall back to raw integer display without error.

### Fallback behavior (all surfaces)
`driftType` absent — raw SQLite host, no `declaredSchema` callback, or older server — degrades to today's behavior (storage type + name heuristic). No crashes, no missing columns.

---

## Verification

- [ ] **Grid, heuristic-miss name (manual, running app):** a Drift `boolean()` column named e.g. `notifications` shows true/false in the data grid (previously `0`/`1`).
- [ ] **Grid, suffix name (manual, running app):** a column named `user_active` matches the fixed suffix regex even without `driftType`.
- [ ] **Cell editor (manual, running app):** bool editing behavior triggers on `driftType === 'bool'` columns.
- [x] **Sidebar:** boolean columns show the boolean icon and `bool (INTEGER)` description — unit-tested in `extension/src/test/drift-tree-provider-items.test.ts` (bool icon + label, plus no-driftType fallback).
- [ ] **Custom query (manual, running app):** a SELECT including a boolean column formats as true/false; unmatched expression columns stay numeric.
- [x] **Fallback:** with no `declaredSchema` callback, every changed path degrades to the previous behavior (name heuristic / storage type) — `driftType` is optional at every read site.
- [x] **Code checks:** extension `npm run lint` (tsc --noEmit) clean; web `npm run typecheck:web` clean; web bundle builds; scoped tree-items test file passes (17/17).

## Implementation (COMPLETE — code level)

- `assets/web/table-view.ts` — `formatCellValue` takes an optional `driftType` and formats `driftType === 'bool'` exactly; `buildDataTableHtml` resolves per-table drift types via new `schemaDriftTypesForTable` (optional `tableName` param for the search tab); suffix regex `\$` → `$` fixed; new `isUnambiguousDriftBoolColumn` for table-less SQL results.
- `assets/web/search-tab.ts` — passes the searched table's name so drift-type lookup can't read the wrong table.
- `assets/web/cell-edit.ts` — bool validation gate checks `colMeta.driftType === 'bool'` before the name heuristic.
- `assets/web/sql-runner.ts` — SQL result cells render true/false (raw value on hover) for columns that are bool in every declaring table; copy/export stays raw.
- `extension/src/api-types.ts` — `ColumnMetadata.driftType?` added.
- `extension/src/tree/tree-items.ts` — boolean icon (`symbol-boolean`) and `bool (INTEGER)` description.
- `CHANGELOG.md` — two Fixed entries under 4.1.19.

Remaining: the four manual running-app checks above.
