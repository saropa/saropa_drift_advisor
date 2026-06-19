# Feature: search, type filter, and match toggles on the diagram screens

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
