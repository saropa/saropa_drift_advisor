# Views support and dedicated Views screen (GitHub issue #32)

A database using SQLite views (notably PowerSync, which stores rows as JSON in
base tables and exposes the real data model through views) showed no views
anywhere in the viewer, and querying a view returned the literal text
"undefined" in every result cell. This record covers the root-cause fixes for
both symptoms plus the new dedicated Views screen built on top of them.

## Defects

### Defect 1 — views absent from the viewer
`ServerConstants.sqlTableNames` filtered `sqlite_master` to `type='table'`,
excluding views. That query feeds the sidebar tree, schema metadata, column
pickers, and the SQL field selector, so a view-based schema appeared empty even
though the data was present and queryable. The schema DDL dump
(`sqlSchemaMaster`) did not filter by type, which is why views still appeared in
the ER diagram — the inconsistency confirmed the table-list filter as the cause.

### Defect 2 — "undefined" in every queried-view cell
The extension's result contract is columnar: `{columns: string[], rows:
unknown[][]}`, indexed positionally by every consumer (SQL Notebook renderer,
`zipRow`, CSV/JSON export, watch/snapshot/diff). The server's `/api/sql` endpoint
returns object-rows (`{col: value}`) with no `columns` key. The VM-service
adapter derived `columns` via `Object.keys(rows[0])` but returned the rows still
as objects; the notebook then read `row[0]` on an object — `undefined` —
rendering `String(undefined)`. The HTTP adapter returned the raw payload with no
`columns` at all. The bug was not view-specific: it broke every Notebook query on
a live-app connection. Views were the only path that hit it, because the sidebar
(Defect 1) omitted them, leaving the Notebook as the sole way to reach a view.

## Fixes

- `sqlTableNames` now selects `type IN ('table','view')`. `PRAGMA table_info`
  resolves view columns identically, so all display consumers populate without
  further change.
- A separate `sqlBaseTableNames` (`type='table'`) was added for the orphan-table
  check, reached via `ServerUtils.getTableNames(query, includeViews: false)`. An
  orphan is a physical table absent from the declared Drift schema; a view is
  never declared there, so the view-inclusive list would have reported every view
  as a false orphan. All other `getTableNames` callers keep the view-inclusive
  default (browsing, comparison, reporting, schema metadata).
- A shared `objectRowsToColumnar` helper (`extension/src/shared-utils.ts`)
  converts object-rows to the columnar contract; both the VM-service adapter
  (`vm-service-api.ts`) and the HTTP adapter (`api-client-http-query.ts`) now call
  it, so both transports honor the same shape.

## Stale test fixtures (uncovered by the fix)

Five extension tests (`api-client`, `fk-navigator`, `snapshot-store`,
`snippet-runner`, `watch-manager`) stubbed `/api/sql` with the columnar
`{columns, rows[][]}` shape the server never emits. They passed only because the
pre-fix adapters were pass-throughs and the compiled `out/` directory was stale
(the pre-commit hook runs `tsc --noEmit`, not the test suite). These fixtures
masked the same object-row defect in the watch/snapshot/diff features. All five
were moved to the real object-row server shape and assert the converted columnar
output.

## Views screen

A dedicated Views tab in the web viewer (also rendered inside the VS Code
dashboard panel via the same bundle), reachable from the toolbar (next to Schema)
and the Home launcher.

- Backend: `GET /api/views` returns `[{name, sql}]` from `sqlite_master`
  (`SchemaHandler.getViewsList` + `sendViews`, `ServerConstants.sqlViewDefinitions`,
  route in `router.dart`). Routed independently of change detection — it reads
  `sqlite_master` directly with no PRAGMA/COUNT cost. Null stored DDL coerces to
  `''`; nameless rows are dropped.
- Frontend: tab registration in `state.ts` (icon, label, Home launcher, search
  keywords); panel markup + toolbar button in `html_content.dart`;
  `views-screen.ts` lists views, highlights each view's DDL, and runs a capped
  (`LIMIT 200`) `SELECT` through the read-only `/api/sql` path for the output,
  rendered via the shared `.drift-table` grid. A request token drops stale async
  output renders when the selection changes. Layout in `_views-screen.scss`
  (two-column, stacks below 720px), themed tab accents for midnight/showcase, and
  l10n keys in `strings-web-views.ts`. `bundle.js` and `style.css` rebuilt.

## Verification

- `dart analyze` (changed server files + test) — no issues.
- Web typecheck (`tsc -p tsconfig.web.json`) — clean.
- Affected Dart tests + new `getViewsList` group — passing.
- Full extension suite — 2856 passing, 0 failing.

## Commits

- `a58021f` — fix: show database views and return real values when querying them (#32)
- `2cbe494` — feat: dedicated Views screen in the web viewer (#32)
