# Web UI: Tools Toolbar and Tabbed Tools

## Status

Fully implemented.

## Summary

- **Tools moved out of sidebar** — Snapshot, Database diff, Index suggestions, Size analytics, Query performance, Data health, Import, Schema, and Diagram are no longer collapsible cards in the sidebar. Sidebar now contains only Search, Export, and Tables.
- **Tools toolbar** — Horizontal strip above main content with one button per tool (icon + label; labels hide on narrow screens). Clicking a tool opens it in a dedicated tab.
- **Tab system** — Fixed tabs: Tables (default), Run SQL. Dynamic tabs: one per tool when opened; each has a close (×) button. Only the active tab’s panel is visible; switching uses a short opacity transition.
- **Lazy load** — Schema and Diagram fetch data on first tab switch via `onTabSwitch`; `ensureDiagramInited` and `loadSchemaIntoPre` run when their tab is shown.
- **FK navigation** — Still switches to Run SQL tab and expands the runner if collapsed; no dependency on removed sidebar toggles.

## Files changed

- `lib/src/server/html_content.dart` — Removed Tools section from sidebar. Added tools toolbar, tab bar, tab panels; moved table view (pagination, format bar, content) into `#panel-tables`; wrapped SQL runner in `#panel-sql`; added one `#panel-*` per tool with same element IDs for JS compatibility.
- `assets/web/style.css` — Tools toolbar, tab bar, tab buttons, close button, tab panels, tool panel body; responsive hide of toolbar labels; 0.15s opacity transition on tab panels.
- `assets/web/app.js` — Tab API: `switchTab`, `openTool`, `closeToolTab`, `initTabsAndToolbar`; toolbar/tab event binding; `onTabSwitch` for schema/diagram lazy load; diagram init no longer requires sidebar toggle; schema toggle guarded when element missing; FK navigation uses `switchTab('sql')`.

## Tests

No new unit tests for web viewer. Existing server and handler tests unchanged.
