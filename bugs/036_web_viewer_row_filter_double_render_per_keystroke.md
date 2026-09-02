# BUG: `#row-filter` has both `input` and `keyup` handlers — every keystroke rebuilds the entire data grid twice, undebounced

**Status: Open**

Created: 2026-09-02
Component: Server (web viewer)
File: `assets/web/app.js` (lines 376-377), `assets/web/table-view.ts` (lines 172-315, 626-705)
Severity: Performance — Medium

---

## Summary

Two listeners are registered on the same `#row-filter` input, and both call `renderTableView` with no debounce. `renderTableView` regenerates the complete results grid as one HTML string and assigns it to `content.innerHTML`. So typing one character re-parses and re-lays-out the whole table twice; at the maximum page size of 1000 rows that is roughly 120,000 elements constructed and discarded per keypress. `keyup` also fires for keys that produce no `input` event (Shift, arrows, Ctrl), so navigating within the filter box triggers full re-renders that change nothing.

---

## Attribution Evidence

Positive — both handlers and the render path live in this repo:

```bash
sed -n '376,377p' assets/web/app.js
```

```
    document.getElementById('row-filter').addEventListener('input', function() { if (S.currentTableName && S.currentTableJson) { renderTableView(S.currentTableName, S.currentTableJson); saveTableState(S.currentTableName); } });
    document.getElementById('row-filter').addEventListener('keyup', function() { if (S.currentTableName && S.currentTableJson) renderTableView(S.currentTableName, S.currentTableJson); });
```

There is no debounce anywhere on this path:

```bash
grep -rn "debounce\|setTimeout" assets/web/table-view.ts
# Expected: 0 matches
```

`renderTableView` replaces the whole content subtree rather than patching it:

```bash
grep -n "innerHTML" assets/web/table-view.ts
```

```
648:    content.innerHTML = '<p class="meta">' + metaText + '</p><p class="meta">' + vt('viewer.table.results.loading') + '</p>';
674:          content.innerHTML = buildBothViewSectionsHtml(name, metaText, qbHtml, tableHtml, schema, defHtml);
687:          if (dataBody) dataBody.innerHTML = '<p class="meta">' + metaText + '</p>' + defHtml + qbHtml + tableHtml;
699:      content.innerHTML = '<p class="meta">' + metaText + '</p>' + defHtml + qbHtml + tableHtml;
805:    if (searchResults && searchResults.innerHTML.indexOf('<table') >= 0) {
```

Each render also rebuilds the table-definition panel and the query builder, not just the grid — `renderDataHtml` calls `buildTableDefinitionHtml(name)` and `buildQueryBuilderHtml(name, colTypes)` on every pass (`assets/web/table-view.ts:650`, `:668`), then re-binds every event handler (`bindQueryBuilderEvents`, `bindColumnTableEvents`, `bindResultsToggle`, `applySearch`, `renderBreadcrumb`).

Per data cell, `buildDataTableHtml` emits three elements minimum — a `<td>`, a `<span class="cell-text">`, and a `<button class="cell-copy-btn">`:

```bash
sed -n '282,296p' assets/web/table-view.ts
```

```
      var copyBtn = '<button type="button" class="cell-copy-btn" data-raw="' + esc(displayStr) + '" title="' + esc(vt('viewer.table.grid.copyValueTitle')) + '">&#x2398;</button>';
      ...
      var tdAttrs = ' data-column-key="' + esc(k) + '"' + tdClass;
      /* cell-text wrapper allows CSS truncation with ellipsis while copy button stays visible on hover */
```

and the maximum page size is 1000 rows:

```bash
grep -n "LIMIT_OPTIONS" assets/web/state.ts
```

```
118:export const LIMIT_OPTIONS = [50, 200, 500, 1000];
```

Negative attribution — the viewer's grid rendering is not inherited from a sibling package:

```bash
grep -rn "row-filter\|buildDataTableHtml" ../saropa_lints/ ../saropa_dart_utils/
# Expected: 0 matches
```

**Emit site(s):** `assets/web/app.js:376` (`input` handler), `assets/web/app.js:377` (`keyup` handler), `assets/web/table-view.ts:626` (`renderTableView`), `assets/web/table-view.ts:172` (`buildDataTableHtml`).

---

## Environment

- OS: any
- Browser: any
- VS Code version: also reproduces in the panel, which loads the same bundle
- Extension version: 4.2.5
- Dart SDK version: as pinned by `pubspec.yaml`
- Flutter SDK version: any
- Database type and version: SQLite via Drift 2.31
- Connection method: browser at `http://127.0.0.1:8642`
- Relevant non-default settings: page size set to 1000 in the pagination bar
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Start the example app so the server binds 8642, and open the viewer in a browser.
2. Seed or open a table with at least 1000 rows and ~20 columns.
3. Set the pagination **limit** dropdown to **1000** (mouse selection in the pagination bar).
4. Open the browser's Performance panel and start recording.
5. Click into the **row filter** input in the toolbar and type a five-character word at normal speed.
6. Stop recording and inspect the flame chart.

Reproduces on every attempt.

---

## Expected Behavior

One re-render per settled input, debounced (~150-250 ms), so a five-character word costs one or two grid rebuilds. Keys that do not change the value (Shift, arrows, Ctrl) cost nothing.

---

## Actual Behavior

The flame chart shows **two** `renderTableView` invocations per character — one from `input`, one from the following `keyup` — for ten rebuilds across five characters. Each rebuild constructs the full grid string, assigns it to `content.innerHTML`, and re-binds every handler. At 1000 rows × 20 columns each rebuild creates roughly 60,000 elements (a `<td>`, a `<span>` and a `<button>` per cell), so a five-character word churns on the order of 600,000 elements.

Pressing Shift or an arrow key inside the filter box triggers a `keyup` with no `input`, producing a full rebuild that changes nothing.

---

## Error Output

### VS Code Developer Tools Console

No errors — the cost is silent. It shows only as long task frames in the Performance panel.

### Extension Output Channel

Nothing — no network traffic is involved; filtering is client-side (`filterRows` in `assets/web/search.ts`).

### Terminal / Command Output

n/a.

### Stack Traces

None.

---

## Duplicate-Emission Check

Two listeners, one input element, one repository:

| Event | Site | Extra work |
|---|---|---|
| `input` | `assets/web/app.js:376` | `renderTableView` + `saveTableState` |
| `keyup` | `assets/web/app.js:377` | `renderTableView` |

The `keyup` handler adds no behaviour the `input` handler does not already provide — `input` fires for typing, paste, cut, drag-drop and IME composition commits, all of which `keyup` misses or duplicates.

---

## Screenshots / Recordings

Not attached — a Performance-panel recording as described in step 6 is the reproduction artefact; the doubled `renderTableView` frames are visible without annotation.

---

## Minimal Reproducible Example

Without any profiler, instrument the render directly from the console:

```js
// Paste in the viewer's console, then type one character in the row filter.
let n = 0;
const el = document.getElementById('content');
new MutationObserver(() => { console.log('content rebuilt', ++n); }).observe(el, { childList: true });
```

One keystroke logs `content rebuilt 1` and `content rebuilt 2`.

---

## What I Already Tried

- [x] Read both handlers — confirmed identical guard condition and identical render call.
- [x] Grepped `assets/web/table-view.ts` for any debounce or `setTimeout` — none.
- [x] Confirmed `renderTableView` also rebuilds the table-definition panel and query builder each pass, so the cost is larger than the grid alone.
- [x] Confirmed the maximum page size is 1000 (`state.ts:118`), so the worst case is reachable through the normal UI, not a contrived setting.

---

## Regression Info

- Last working version: unknown; both handlers are present at 4.2.5.
- First broken version: present in 4.2.5.
- What changed: the `keyup` handler appears to predate `input` (a common older idiom) and was not removed when `input` was added — the two lines are adjacent and structurally near-identical, with only `saveTableState` differing.

---

## Root Cause

`input` and `keyup` are both bound to `#row-filter` and both trigger a full, unmemoised re-render. `input` alone is the correct event for value changes; `keyup` is redundant for value changes and over-broad for non-value keys. Neither is debounced, and `renderTableView` has no incremental path — it always regenerates the entire subtree.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- **Who is affected:** anyone filtering a table with more than a few hundred rows — which is the normal case for the tool's purpose.
- **What is blocked:** interactive filtering. On a large page size the input visibly lags behind typing.
- **Data risk:** none.
- **Frequency:** every keystroke in the row filter.

---

## Fix Sketch

1. Delete the `keyup` handler at `assets/web/app.js:377`. `input` already covers typing, paste, cut and IME commits; `keyup` adds only duplicate work plus spurious renders on modifier keys.
2. Debounce the surviving handler, and comment why:

   ```js
   // Filtering re-renders the whole grid (renderTableView replaces content.innerHTML),
   // so an undebounced per-keystroke render rebuilt ~60k elements per character at the
   // 1000-row page size. Coalesce to one render once typing settles. `input` alone is
   // correct here: it fires for typing, paste, cut and IME commits, which the removed
   // `keyup` handler both duplicated and, for non-value keys, over-triggered.
   let rowFilterTimer = null;
   document.getElementById('row-filter').addEventListener('input', function () {
     clearTimeout(rowFilterTimer);
     rowFilterTimer = setTimeout(function () {
       if (S.currentTableName && S.currentTableJson) {
         renderTableView(S.currentTableName, S.currentTableJson);
         saveTableState(S.currentTableName);
       }
     }, 200);
   });
   ```

3. Add a regression test under `assets/web/test/` asserting exactly one listener is bound to `#row-filter` and that N rapid `input` events produce one render. Note that such a test currently runs in no gate — see `bugs/016_infra_web_typecheck_and_tests_never_gated.md`.
4. The deeper cost (full-subtree rebuild, no virtualization) is tracked separately in `bugs/073_proposal_ux_data_grid_virtualization_and_render_cost.md`; this fix removes the multiplier without waiting for that work.
