# Web UI: Toolbar and tab styling; Export as tab

## Status

Fully implemented.

## Summary

- **Toolbar buttons** — Tools toolbar (Search, Snapshot, DB diff, Index, Size, Perf, Health, Import, Schema, Diagram, Export) styled with surface/background, shadow, hover/focus states, and icon+label spacing so they read as primary actions.
- **Tab bar** — Tabs use a wider header area (min-height 2.75rem, padding 1.25rem), rounded top corners only, active tab shares background with content and border so the selected tab clearly connects to the panel. Tab panels have a full border except top; 0.15s opacity transition on switch.
- **Export as tab** — Export moved from sidebar into a toolbar button that opens an **Export** tab. Tab contains narrative text explaining Schema, Full dump, Database, and Table CSV, plus the same download links (IDs preserved for existing JS). Sidebar shows a single line directing users to the Export tab.
- **Export diff report in new tab** — DB diff panel "Export diff report" link opens in a new browser tab so the current DB diff view is preserved.

## Files changed

- `lib/src/server/html_content.dart` — Export toolbar button; sidebar Export replaced with one-line note; new `#panel-export` with narrative and export links; DB diff "Export diff report" link uses `target="_blank"` and `rel="noopener noreferrer"` to open in a new tab.
- `assets/web/style.scss` — `.tools-toolbar`, `.toolbar-tool-btn`, `#tab-bar`, `.tab-btn` / `.tab-btn.active` / `.tab-btn-close`, `#tab-panels`, `.export-narrative`.
- `assets/web/style.css` — Built from SCSS.
- `assets/web/app.js` — `TOOL_LABELS.export = 'Export'`.
- `CHANGELOG.md` — [Unreleased] entry. `README.md` — Export and toolbar bullets updated.

## Tests

No new unit tests. Export links still bound by ID; manual verification for toolbar/tab styling and Export tab flow.
