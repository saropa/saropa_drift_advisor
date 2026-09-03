# PROPOSAL: Virtualize the data grid and cut per-cell render cost — 1000 rows currently means ~60,000 elements and an O(rows x cols x pinned) build

**Status: Open**

Created: 2026-09-02
Type: UX improvement / Performance
Related diagnostics: none

---

## Summary

`buildDataTableHtml` renders every row of the current page as one concatenated HTML string, emitting three elements per cell, then the caller assigns the whole thing to `content.innerHTML`. At the maximum page size (1000 rows) a 20-column table produces roughly 60,000 elements per render, and every interaction that changes any view option — filter, column pin, column hide, PII mask toggle, display format, pagination — rebuilds all of it. Row virtualization plus a few mechanical hoists in the inner loop would make the grid cost proportional to what is on screen rather than to the page size.

---

## Motivation

The viewer exists to look at real tables, and the pagination limit offers 1000 rows as a first-class choice:

```bash
grep -n "LIMIT_OPTIONS" assets/web/state.ts
```

```
118:export const LIMIT_OPTIONS = [50, 200, 500, 1000];
```

Raw SQL results are capped an order of magnitude higher on the server:

```bash
grep -n "maxSqlResultRows\|maxLimit\|defaultLimit" lib/src/server/server_constants.dart
```

```
15:  static const int maxLimit = 1_000;
16:  static const int defaultLimit = 200;
47:  static const int maxSqlResultRows = 10_000;
```

Each cell emits three elements — `<td>`, `<span class="cell-text">`, `<button class="cell-copy-btn">` — plus a fourth (`<a class="fk-link">`) for foreign keys and a fifth (`<button class="cell-expand-btn">`) for truncated BLOBs:

```bash
sed -n '282,301p' assets/web/table-view.ts
```

```
      var copyBtn = '<button type="button" class="cell-copy-btn" data-raw="' + esc(displayStr) + '" title="' + esc(vt('viewer.table.grid.copyValueTitle')) + '">&#x2398;</button>';
      ...
      var expandBtn = blobTruncated
        ? '<button type="button" class="cell-expand-btn" title="' + esc(vt('viewer.table.grid.expandValueTitle')) + '">&#x26F6;</button>'
        : '';
      var tdClass = pinned.indexOf(k) >= 0 ? ' class="col-pinned"' : '';
      var tdAttrs = ' data-column-key="' + esc(k) + '"' + tdClass;
      /* cell-text wrapper allows CSS truncation with ellipsis while copy button stays visible on hover */
      /* FK link keeps data-value as rawStr so navigation filter uses real key; displayed text is displayStr (masked when on). */
      if (fk && !isNull) {
        html += '<td' + tdAttrs + '><span class="cell-text"><a href="#" class="fk-link" style="color:var(--link);text-decoration:underline;" ';
        html += 'data-table="' + esc(fk.toTable) + '" ';
        html += 'data-column="' + esc(fk.toColumn) + '" ';
        html += 'data-value="' + esc(rawStr) + '">' ;
        html += cellContent + ' &#8594;</a></span>' + expandBtn + copyBtn + '</td>';
      } else {
        html += '<td' + tdAttrs + '><span class="cell-text">' + cellContent + '</span>' + expandBtn + copyBtn + '</td>';
      }
```

Three loop-invariant computations sit inside the per-cell body:

- `pinned.indexOf(k)` — a linear scan of the pinned-columns array, executed once per cell (`table-view.ts:288`), and again per header cell (`:222`). `pinned` is fixed for the whole render, and the answer depends only on the column.
- `esc(vt('viewer.table.grid.copyValueTitle'))` — a constant string, re-looked-up and re-escaped for every cell.
- `esc(k)` for `data-column-key` — the column name, re-escaped once per cell instead of once per column.

The whole grid is rebuilt for every view change, because `renderTableView` has only a full-replacement path:

```bash
grep -n "innerHTML" assets/web/table-view.ts
```

```
648:    content.innerHTML = '<p class="meta">' + metaText + '</p><p class="meta">' + vt('viewer.table.results.loading') + '</p>';
674:          content.innerHTML = buildBothViewSectionsHtml(name, metaText, qbHtml, tableHtml, schema, defHtml);
687:          if (dataBody) dataBody.innerHTML = '<p class="meta">' + metaText + '</p>' + defHtml + qbHtml + tableHtml;
699:      content.innerHTML = '<p class="meta">' + metaText + '</p>' + defHtml + qbHtml + tableHtml;
```

and every caller that changes a display option goes through it:

```bash
grep -rn "renderTableView(" assets/web/*.ts assets/web/*.js | grep -v bundle.js
```

```
assets/web/pagination.ts:147:      renderTableView(S.currentTableName, S.currentTableJson);
assets/web/query-builder.ts:340:        renderTableView(S.currentTableName, S.currentTableJson);
assets/web/table-list.ts:64:      renderTableView(name, data);
assets/web/table-list.ts:71:          renderTableView(name, data);
assets/web/table-view.ts:799:      renderTableView(S.currentTableName, S.currentTableJson);
assets/web/app.js:376: ... row filter (input)
assets/web/app.js:377: ... row filter (keyup)
assets/web/app.js:384: ... row display: all
assets/web/app.js:390: ... row display: matching
assets/web/app.js:403: ... search scope
assets/web/app.js:512: ... refreshed rows
assets/web/app.js:580: ... re-render
```

Each rebuild additionally regenerates the table-definition panel (`buildTableDefinitionHtml`) and the query builder (`buildQueryBuilderHtml`) and re-binds every handler (`bindQueryBuilderEvents`, `bindColumnTableEvents`, `bindResultsToggle`, `applySearch`, `renderBreadcrumb`) — see `assets/web/table-view.ts:650-705`.

---

## Detection / Behavior

### Should flag (problematic)

Loop-invariant work in the per-cell body:

```js
filtered.forEach(function(row) {
  visible.forEach(function(k) {
    ...
    var copyBtn = '<button ... title="' + esc(vt('viewer.table.grid.copyValueTitle')) + '">&#x2398;</button>';
    var tdClass = pinned.indexOf(k) >= 0 ? ' class="col-pinned"' : '';
    var tdAttrs = ' data-column-key="' + esc(k) + '"' + tdClass;
```

and a render whose cost scales with page size rather than viewport:

```js
html += '<tr>';   // repeated for all `filtered.length` rows, every render
```

### Should pass (correct)

Per-column values hoisted out of the row loop, computed once:

```js
// pinned/esc(k)/tooltip do not vary per row; hoisting turns an
// O(rows x cols x pinned) build into O(rows x cols) with O(cols) setup.
var copyTitleAttr = ' title="' + esc(vt('viewer.table.grid.copyValueTitle')) + '"';
var pinnedSet = Object.create(null);
pinned.forEach(function (k) { pinnedSet[k] = true; });
var tdAttrsByCol = Object.create(null);
visible.forEach(function (k) {
  tdAttrsByCol[k] = ' data-column-key="' + esc(k) + '"' + (pinnedSet[k] ? ' class="col-pinned"' : '');
});
```

and a windowed body that renders only the visible slice plus a small overscan, backed by spacer rows so the scrollbar geometry is unchanged.

---

## Edge Cases

1. **Sticky headers and horizontal scroll** — the grid is already wrapped in `#data-table-scroll-wrap` (`wrapDataTableInScroll`, `table-view.ts:319`), so a scroll container exists to hang a virtualization listener on. Should pass.
2. **In-page search / highlight** — `applySearch` walks the rendered DOM and stores `Element[]` in `S.searchMatches` (`state.ts:57`). Virtualization means a match may not be rendered when it is navigated to. This must be reworked to index the *data*, not the DOM, before windowing lands. Needs discussion — this is the main design risk.
3. **Copy / expand buttons hold data in attributes** — `data-raw` on each copy button is the cell's value. Windowing removes those nodes on scroll, so copy must read from the row data rather than the DOM. This is desirable anyway; it also shrinks the emitted HTML substantially.
4. **Column drag-to-reorder** — headers are `draggable="true"` (`table-view.ts:225`) and are not part of the windowed body, so header interactions are unaffected. Should pass.
5. **Ctrl+F / browser find** — native find cannot see unrendered rows. This is the standard virtualization trade-off and should be called out in the UI (the existing in-app search becomes the answer, once edge case 2 is handled). Needs discussion.
6. **Small tables** — below a threshold (say 200 rows) windowing is pure overhead. Render fully under the threshold and window above it. Should pass.
7. **PII masking and display-format toggles** — these change cell *content*, not row *count*, so with windowing they become a re-render of the visible slice only. Should pass, and is a direct win.

---

## Alternatives Considered

- **Cap the page size at 200.** Cheapest fix, but removes a legitimate capability and does nothing for the 10,000-row SQL result path.
- **Patch the DOM incrementally instead of replacing `innerHTML`.** Would help the toggle cases but not the initial 1000-row cost, and introduces diffing complexity in a codebase that deliberately uses string building.
- **Pull in a grid library.** Rejected on blast radius — `bugs/044_proposal_infra_web_bundle_size_minify_and_sqlite_only_formatter.md` documents that the bundle is already 1.14 MB and inlined into every page response; adding a grid dependency moves in the wrong direction.
- **`content-visibility: auto` on rows.** A one-line CSS change that lets the browser skip layout for off-screen rows. It does **not** reduce element count or the string-build cost, but it is nearly free and worth measuring first as a stopgap.

---

## Decision

<!-- Fill in when the proposal is accepted or declined -->

---

## Implementation Notes

Suggested order, cheapest and least risky first:

1. **Hoists only** (no behaviour change, no virtualization): move `pinned.indexOf` to a precomputed set, hoist the constant copy-button title, and precompute `tdAttrs` per column. Purely mechanical; measurable with the console timing snippet below.
2. **Measure** before committing to windowing:

   ```js
   // Paste in the viewer console with a table loaded.
   console.time('render'); /* toggle the PII mask or change the row filter */ console.timeEnd('render');
   document.querySelectorAll('#data-table *').length;   // element count for the current page
   ```

3. **`content-visibility: auto`** on `#data-table tbody tr` in `assets/web/_data-table.scss` — cheap, reversible, and may be sufficient below 1000 rows. Remember that `style.css` is generated; edit the SCSS.
4. **Windowing**, gated behind a row-count threshold, and only after the search-index rework in edge case 2.
5. Land `plans/history/2026.09/20260903/036_web_viewer_row_filter_double_render_per_keystroke.md` first — it removes a 2x multiplier on all of the above for one deleted line.

Every step needs `npm run build:js` to reach users, and there is currently no gate enforcing that (`bugs/015_infra_bundle_js_has_no_staleness_gate.md`), nor any gate running the viewer tests (`bugs/016_infra_web_typecheck_and_tests_never_gated.md`).

---

## Commits

<!-- Add commit hashes as implementation lands -->
