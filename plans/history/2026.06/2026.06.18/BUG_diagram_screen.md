# Feature: search, type filter, and match toggles on the diagram screens

Status: Fixed

Add field-level filtering controls to every diagram surface so a user can quickly
find tables and columns by field name or column type, and choose whether matches
are merely emphasized or whether everything else is hidden.

This applies to all three diagram surfaces:

1. **ER Diagram panel** — `extension/src/er-diagram/` (interactive SVG, command `driftViewer.showErDiagram`).
2. **Schema Diagram panel** — `extension/src/diagram/` (positioned HTML boxes, command `driftViewer.schemaDiagram`).
3. **Web viewer diagram** — `assets/web/diagram.ts` (SVG grid in the standalone web app).

---

## Controls to add (toolbar on each surface)

1. **Search box** — a text input that filters by **field (column) name** and **column
   type as a string** (e.g. typing `integer` matches every `INTEGER` column). Matching is
   case-insensitive substring. Table name is also matched so a search for a table finds it.

2. **Type filter** — a dropdown populated from the distinct column types present in the
   current schema (plus an "All types" default). Selecting a type narrows the match set to
   columns of exactly that type. Combines with the search box (logical AND).

3. **Two match-mode toggles:**
   - **Highlight matches** (default ON) — matching columns/tables get a visual emphasis: an
     accent border on the table plus a chevron/marker next to each matching field. Nothing is
     hidden; non-matches stay visible but dimmed.
   - **Hide non-matching** (default OFF) — non-matching columns are removed from their table,
     and tables with no matching column (and whose name does not match) are hidden entirely,
     along with their relationship edges.

   The two toggles are independent and may be combined.

---

## Match rules

- A **column matches** when: `(search empty OR name/type contains search)` **AND**
  `(type filter is "All" OR column type equals the selected type)`.
- A **table matches** when: any of its columns match, **OR** (with no type filter set) the
  table name contains the search text.
- When the search box is empty **and** the type filter is "All", every table and column
  matches — no emphasis, no hiding (the diagram looks exactly as it does today).

---

## Acceptance criteria

- [ ] Each surface shows the search box, type filter, and the two toggles in its toolbar.
- [ ] Typing `integer` (or any type name) highlights/keeps only columns of that type.
- [ ] The type dropdown lists exactly the distinct types in the loaded schema.
- [ ] Highlight mode emphasizes matches without removing anything.
- [ ] Hide mode removes non-matching fields and fully drops tables with no match (and their edges).
- [ ] Clearing the search and resetting the type filter restores the original diagram.
- [ ] All new user-facing strings are externalized to the l10n catalogs (no hardcoded English):
      `extension/src/l10n/strings-panel-schema.ts` for the two extension panels,
      `assets/web/l10n/strings-web-settings.ts` for the web viewer.

---

## Finish Report (2026-06-18)

### Summary

The three schema-diagram surfaces previously offered no way to find a field or
column type within a large schema: a user had to scan every table box by eye.
This change adds an identical filter toolbar — search box, column-type dropdown,
and two match-mode toggles — to all three surfaces.

### Surfaces changed

1. **ER Diagram panel** (`extension/src/er-diagram/`)
   - `er-diagram-html.ts`: builds a second toolbar row (search input, type
     `<select>` populated from the schema's distinct column types, Highlight and
     Hide toggle buttons). Attribute values escaped via `escapeHtml`.
   - `er-diagram-script-helpers.ts`: adds `filterActive`, `columnMatches`,
     `tableNameMatches`, `nodeMatches`, `visibleColumns`, `nodeDisplayHeight`.
     `renderTableNode` now takes the displayed-column list and applies
     `match`/`dim` classes plus a leading chevron on matches; `getColumnY` takes
     the displayed-column list so edges attach correctly after columns are hidden.
   - `er-diagram-script.ts`: adds filter state (`filterText`, `filterType`,
     `highlightOn` default true, `hideOn` default false), computes the visible
     node/edge set, and wires the four controls to re-render in place.
   - `er-diagram-styles.ts`: `.toolbar-filter`, `.filter-input`, and
     `.er-column.match/.dim` + `.er-node.match/.dim`; canvas height reduced to
     `calc(100vh - 88px)` for the second toolbar row.

2. **Schema Diagram panel** (`extension/src/diagram/diagram-html.ts`)
   - Sticky toolbar with the same four controls. A client-side `applyFilter`
     toggles `match`/`dim`/`hidden` classes on column rows, table boxes, and FK
     lines via new `data-name`/`data-type`/`data-table`/`data-from`/`data-to`
     attributes. Two-pass per table so a name-only match keeps all its columns.

3. **Web viewer diagram** (`assets/web/diagram.ts`, `assets/web/_data-display.scss`)
   - `renderDiagram` builds the toolbar once into `#diagram-container` with a
     separate re-paintable `#diagram-canvas`, so re-painting on each keystroke
     does not steal focus from the search input. `paintDiagram` applies the same
     match rules (highlight/dim, or drop non-matching tables/columns and any FK
     line whose endpoint vanished). SCSS adds `.diagram-filter` and
     `.diagram-col.match/.dim` + `.diagram-table.match/.dim`.

### Match rules

A column matches when the search text appears in its name OR type string AND
(no type filter set OR its type equals the selected type), case-insensitive. A
table matches when any column matches, or — with no type filter — its name
contains the search text. Empty search + "All types" matches everything (the
diagram renders unchanged).

### Localization

All control strings are externalized: `panel.schema.filter.*` in
`extension/src/l10n/strings-panel-schema.ts` for the two extension panels, and
`viewer.settings.diagram.filter.*` in `assets/web/l10n/strings-web-settings.ts`
for the web viewer. Source keys are English-only until the translation pipeline
runs; no machine translation was triggered.

### Tests

`extension/src/test/er-diagram-resize.test.ts` assertions that pinned the old
`renderTableNode(node)` / `getColumnY(node, columnName)` signatures were updated
to the new parameter lists, and a new case pins the filter control handlers and
matching helpers in the composed script. Full extension suite: 2854 passing, 0
failing. Web build (`npm run build`) and `typecheck:web` pass.

### Verification limits

Behavior is verified at the code/test level (composed-script string assertions,
type checks, builds). The visual highlight/hide rendering inside the live VS Code
webviews and the running web viewer was not exercised on a device.
