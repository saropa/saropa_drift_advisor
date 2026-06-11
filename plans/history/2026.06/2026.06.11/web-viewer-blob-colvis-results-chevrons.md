# Web viewer: BLOB previews, column show/hide, smarter results header, right-aligned chevrons

Ad-hoc request against the debug web viewer's table screen (`assets/web/table-view.ts`
and friends). The user asked for four independent improvements: (1) stop BLOB columns
from freezing the grid, (2) add a per-column show/hide control to the Table definition
panel, (3) make the results header report rows *and* columns without redundant
"126 of 126" counts, and (4) move collapsible-section chevrons to the right edge,
dimmed, as a global style-guide change.

## Finish Report (2026-06-11)

### Scope
Web-viewer client assets (TypeScript/SCSS → `bundle.js`/`style.css`) plus one extension
contract test. No Flutter/Dart app logic changed (only the generated `bundle.js` that
Dart contract tests read).

### Changes

**1. BLOB previews — `table-view.ts`, `_data-table.scss`**
- Added `BLOB_PREVIEW_CHARS = 48` and `isBlobType(colType)`.
- In `buildDataTableHtml`, BLOB cells now render `esc(value.substring(0, 48))` plus a
  dimmed `…`, instead of escaping the full (potentially MB-sized) value into the text
  node. Root cause of the freeze: CSS `text-overflow: ellipsis` still forces the browser
  to lay out the entire clipped line. Substring-before-`esc()` caps the work to a few
  characters; the full value stays in the copy button's `data-raw` attribute (attributes
  are not laid out), so it remains available for copy/expand — single source, no
  duplication.
- Truncated cells gain a hover `.cell-expand-btn` (⛶, `right: 30px`, beside copy) that
  reads the sibling copy button's `data-raw` and opens the existing cell-value popup.
  Wired via a new delegated click handler in `app.js`.

**2. Column show/hide — `table-view.ts`, `app.js`, `_query-builder.scss`**
- `buildTableDefinitionHtml` emits a `Show` header column and a per-row
  `.table-def-colvis` checkbox (`data-col-key`, checked from `columnConfig.hidden`).
- New delegated `change` handler in `app.js` toggles the column in `columnConfig.hidden`
  via the existing `ensureColumnConfig` / `setColumnConfig` / `applyColumnConfigAndRender`
  path — the same single source used by the column chooser and the header right-click
  "Hide" menu, so all three stay in sync and persist per table.

**3. Results header — `table-view.ts`, `query-builder.ts`**
- New shared `buildResultsLabel(rowCount, totalRows, visibleCols, totalCols)`: rows print
  `"126 of 1,126 rows"` only when the total differs from the page count, else `"126 rows"`;
  columns collapse the same way; joined with `" / "`. Used by both the main table view and
  the query-builder result heading.

**4. Right-aligned dimmed chevrons — `_data-table.scss`, `_query-builder.scss` + JS**
- The ▲/▼ glyphs were embedded in heading text on the left in `--link` color. They are now
  right-aligned (`margin-left: auto`), muted (`var(--muted)`, opacity 0.55) CSS `::after`
  chevrons keyed off the existing collapse-state classes (`.results-collapsed`,
  `.td-collapsed`, and `.is-collapsed` on `#qb-toggle`).
- Removed the arrow characters and the textContent-swap logic from
  `table-view.ts` (`bindResultsToggle` + `buildTableDefinitionHtml`),
  `query-builder.ts` (`#qb-toggle`), and `table-def-toggle.ts`.
- Non-collapsible multi-table QB section labels were marked `.qb-header-static` and get no
  chevron (`content: none`, default cursor) — they were never interactive.

### Tests
- **Audited** `web-table-def-toggle.test.ts`: it asserted the module *embedded* the ▲/▼
  glyphs (old contract). Rewrote those assertions to assert the module embeds **no** arrow
  glyphs (chevron is now CSS). Updated the stale messages and the docstring comment.
- **Added** `web-table-view-blob-colvis.test.ts` (13 cases) pinning: BLOB preview cap +
  gated expand button + `right: 30px` style; `.table-def-colvis` checkbox driven by
  `columnConfig.hidden`; `buildResultsLabel` collapse logic + slash separator + no arrow
  prefix; chevron `::after` right-aligned + muted for all three headings; static QB labels
  suppress the chevron.
- **Ran:** `npm run compile` then full extension mocha suite → **2690 passing**.
  Dart web contract tests (`web_viewer_table_definition_test.dart`,
  `web_app_size_tab_contract_test.dart`, `web_viewer_nl_modal_contract_test.dart`) → all
  pass. `tsc -p tsconfig.web.json --noEmit` → clean.

### Build
`npm run build:js` (bundle.js 402.7 kb) + `npm run build:style` (style.css) regenerated so
the committed outputs match the sources.

### Note on commit provenance
A concurrent session committed the underlying `.ts`/`.scss` sources for these features into
HEAD (commits a803deb, 120508d) with a stale `bundle.js`/`style.css`. Commit `dd9c9fe`
rebuilt those outputs to match the committed sources and added the changelog + test fix.

### Files
- `assets/web/table-view.ts` — BLOB preview, colvis checkbox, `buildResultsLabel`, chevron text removal
- `assets/web/app.js` — expand-button + colvis delegated handlers
- `assets/web/query-builder.ts` — `buildResultsLabel` use, `#qb-toggle` is-collapsed
- `assets/web/query-builder-multi.ts` — static section labels, arrow removal
- `assets/web/table-def-toggle.ts` — chevron text-swap removal
- `assets/web/_data-table.scss` — `.cell-expand-btn`, `.cell-blob-ellipsis`, results chevron
- `assets/web/_query-builder.scss` — `.table-def-vis`, table-def + qb chevrons, static suppression
- `assets/web/bundle.js`, `assets/web/style.css` — rebuilt outputs
- `CHANGELOG.md` — Added/Changed/Improved entries
- `extension/src/test/web-table-def-toggle.test.ts` — assertions inverted for CSS chevron
- `extension/src/test/web-table-view-blob-colvis.test.ts` — new contract tests

### Outstanding
None for the four requested behaviors. On-device/in-browser visual confirmation is a manual
step (see What to test) — automated coverage is source/bundle-contract only, which cannot
prove rendered pixels.
