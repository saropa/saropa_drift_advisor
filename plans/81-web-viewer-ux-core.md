# 81 — Web viewer UX core: keyboard, sorting, dialogs, navigation state, error surfacing

**Status: Open** (2026-09-02). Not started. Source: master web-developer review of the browser viewer, 2026-09-02.

This plan is self-contained. A sub-agent implementing any task below needs only this file, the repo, and the skills named in "Ground rules". Sibling plans: `plans/82-web-viewer-visual-system.md` (CSS/design tokens) and `plans/83-web-viewer-accessibility-and-i18n.md` (ARIA, keyboard semantics, shell strings). Bugs filed separately and NOT duplicated here: `bugs/075` (title typo), `bugs/080` (pagination params), `bugs/081` (icon font offline), `bugs/082` (`--mono` typo), `bugs/083` (dead navigate-away setting), `bugs/084` (nested interactive controls), `bugs/036` (row-filter double render), `bugs/073` (grid virtualization).

---

## Ground rules for every task

- Load skills `drift-advisor-architecture-contract`, `drift-advisor-change-control`, `drift-advisor-testing-and-validation` before editing.
- Surface: `assets/web/*.ts` + `assets/web/app.js` (source), `lib/src/server/html_content.dart` (shell). `assets/web/bundle.js` is **generated and committed** — after any TS change run `npm run build:js` from the repo root and commit the bundle. `assets/web/style.css` is generated from SCSS via `npm run build:style`; never edit it.
- Gates that actually run: `npm run typecheck:web` (tsc, no emit) and `npm run test:web` (`node --test assets/web/test/**/*.test.mjs`). Neither is wired into husky or CI (`bugs/016`), so run them by hand and paste the output in the finish report. Dart shell tests: `flutter test test/html_content_test.dart --no-pub` (background).
- Every function, condition, and bug fix gets a comment explaining WHY. Uncommented code is unfinished.
- New user-visible strings go through `vt('key')` in `assets/web/l10n/strings-web-*.ts`; never literal English at the call site.
- `esc()` from `assets/web/utils.ts` on every server-derived value that reaches `innerHTML`.
- CHANGELOG `[Unreleased]` entry per task, no dates, referencing this file.
- Commit per task with a descriptive subject and body. No attribution lines.

---

## A1. Ctrl/Cmd+Enter runs SQL; stop hijacking Ctrl+F

**Evidence.** `grep -n "ctrlKey\|metaKey" assets/web/*.ts assets/web/app.js` returns only `app.js:354` (Ctrl+G → next search match) and `app.js:358` (Ctrl+F → focus the in-app search input, `preventDefault`). `sql-runner.ts:501-503` binds only `input` on `#sql-input`; the Run button (`html_content.dart:594`) is mouse-only. Ctrl+F is the browser's own find, and the app takes it over on every screen.

**Change.**
1. `sql-runner.ts`, next to the existing `input` binding: add a `keydown` listener on `#sql-input` — `(e.ctrlKey || e.metaKey) && e.key === 'Enter'` → `e.preventDefault()`, then call the same function the Run button's click handler calls (do not `click()` the button; call the function so a disabled-while-busy button is respected by the same guard). Comment: Ctrl+Enter is the universal run shortcut in SQL tools; `metaKey` covers macOS.
2. `app.js:358-362`: delete the Ctrl+F override. Keep Ctrl+G only while the Search panel is the active sidebar panel (`sidebar-panels.ts` exposes the active panel via `data-active-panel` on `#app-sidebar`); otherwise let the browser have it.
3. Update the Run button `title` in the shell to include the shortcut, via the l10n path (see plan 83 task C6 — if that has not landed, add a key in `strings-web-sql.ts` and set `title` from `sql-runner.ts` init).

**Verify.** Manual: type SQL, press Ctrl+Enter, result grid appears; press Ctrl+F on the Tables screen, browser find opens. `npm run typecheck:web`, `npm run test:web`.

---

## A2. Column sorting on the Tables grid (server-side)

**Evidence.** No `aria-sort`, no header click handler in `table-view.ts:205-234`; `<th>` drag is bound to reordering (`app.js:668-717`). The only ordering escape is Sample (`ORDER BY RANDOM()`, `app.js:499`) or hand SQL. Server route `/api/table/<name>` reads only `limit`/`offset` (`router.dart:647-652`).

**Change.**
1. Server (`lib/src/server/`): add `orderBy` and `dir` query params to the table endpoint. Validate `orderBy` against the table's actual column list (PRAGMA table_info — the schema handler already has this) and `dir` against `{asc, desc}`; reject anything else with 400. Quote the identifier with the existing identifier-quoting helper (see `sqlite-drift-reference` skill for quoting rules). Add constants `queryParamOrderBy`/`queryParamDir` in `server_constants.dart` beside `queryParamLimit`. Document in `doc/API.md` and re-stamp its version header.
2. Client: `state.ts` gains `sortColumn: string | null`, `sortDir: 'asc' | 'desc'`; persist in `saveTableState`/`restoreTableState` (`persistence.ts`). The URL helper introduced by `bugs/080` appends the two params when set.
3. `table-view.ts` header build: add a click handler (delegated at document level like the other grid handlers in `app.js:637-819`) on `th[data-column-key]` that cycles none → asc → desc → none, sets `aria-sort` on the active header, and reloads the table via `loadTable`. Keep drag-to-reorder: a click without movement sorts; a drag reorders (use a small `mousedown`/`mouseup` distance threshold, comment why).
4. Header markup: sort indicator as a `<span aria-hidden="true">` glyph; `scope="col"` on every `<th>` (plan 83 C5 wants this too — do it here).
5. Reset sort when the table changes or "Clear state" is clicked (`app.js` clear-table-state handler).

**Tests.** Dart: `test/router_test.dart` (or the existing table-handler test) — valid `orderBy` returns ordered rows; unknown column → 400; `dir=DROP` → 400. Web: extend the URL helper test with sort params.

---

## A3. Replace the 48 native `alert`/`confirm`/`prompt` calls

**Evidence.** `grep -n "\balert(\|\bconfirm(\|\bprompt(" assets/web/*.ts assets/web/app.js` — 27 / 14 / 7. Full list: `app.js:535,545,548,556,557,569,572,788,804,814` · `cell-edit.ts:134,141,147,163,364` · `history-sidebar.ts:411` · `query-builder-multi.ts:404` · `query-builder.ts:266,285,328,431,437,458` · `session.ts:32,35,38,44,65,214` · `settings.ts:365,379` · `sql-history.ts:99,108,114,145,147` · `tabs.ts:232` · `tools-analytics.ts:198` · `tools-compare.ts:126,179,202,207` · `tools-import.ts:160,164,194,214`. Worst: `app.js:804,814` use `confirm()` to report a failure; `session.ts:35,38` use `prompt()` as a clipboard fallback.

**Change.**
1. New module `assets/web/modal.ts` exporting `showModal({ titleKey, bodyText, actions: [{labelKey, kind: 'primary'|'danger'|'default', value}] }): Promise<value>` and `showPromptModal({titleKey, labelKey, defaultValue}): Promise<string|null>`. One `<div id="app-modal" role="dialog" aria-modal="true" aria-labelledby=… hidden>` added to the shell before `#copy-toast`. Implement: focus the first action on open, trap Tab inside, Escape resolves with the cancel value, return focus to the opener on close. This is the one dialog implementation plan 83 task C4 relies on — build it correctly once.
2. Non-blocking success/failure messages use the existing `#copy-toast` (`table-view.ts:117-129` `showCopyToast`); generalize it to `showToast(text, kind)` and give the element `role="status" aria-live="polite"` in the shell.
3. Migrate call sites file by file. Mapping: `confirm` → `showModal` with two actions; `alert` reporting an error → `showModal` single OK, or `showToast('error')` when non-blocking is acceptable; `prompt` → `showPromptModal`; `session.ts:35,38` clipboard fallback → a read-only input in a modal with a Copy button.
4. Strings: every title/label through `vt()`; add keys to `strings-web-misc.ts`.

**Tests.** `assets/web/test/modal.test.mjs` — the module must be DOM-light enough to esbuild; test the promise resolution values and that Escape resolves with cancel using a minimal DOM shim (see `assets/web/test/helpers.mjs` for the pattern). Manual: every migrated site exercised once; list them in the finish report.

---

## A4. Tabs and active screen survive reload; Back/Forward work

**Evidence.** `grep -n "pushState\|popstate\|hashchange" assets/web/*.ts assets/web/app.js` → 0. `app.js:230` always `openTool('home')`. Deep links are read once at boot: `#TableName` (`app.js:985-997`), `?sql=` (`sql-runner.ts:621-640`), `?session=` (`session.ts:285-290`). `table-list.ts:112` sets `href="#name"` but `:153` prevents default, so the hash never changes; `updateTableListActive` (`table-list.ts:35-38`) compares against a hash nothing sets.

**Change.**
1. `tabs.ts`: on every `switchTab`/open/close, persist `{ openTabs: string[], activeTab: string }` to `localStorage` under a new `drift-viewer-open-tabs` key (register it in `persistence.ts` `collectProjectStorageKeys` so origin-change purge and Settings "clear all" cover it). On boot (`app.js:230` region) restore the set: reopen table tabs via `openTableTab`, tool tabs via `openTool`, then switch to the saved active tab; fall back to Home if empty.
2. URL: mirror the active tab into `location.hash` (`#tbl:users`, `#sql`, …) with `history.pushState` on user-initiated switches and `replaceState` on restores. Add a `popstate` listener that calls `switchTab` for the hash. Keep the existing one-shot `?sql=` and `?session=` readers.
3. Fix `updateTableListActive` to compare `data-table` against `S.currentTableName` instead of the hash.
4. Storage version: add `drift-viewer-storage-version` = 1 in `persistence.ts`; on mismatch run a migration switch (currently no-op) — this closes the "no version field" gap so future key changes have a hook.

**Tests.** `assets/web/test/tabs-state.test.mjs` covering the serialize/restore round trip (split the pure part of `tabs.ts` into `tabs-state.ts` if needed so it esbuilds DOM-free). Manual: open 3 tabs, reload → same 3 tabs and active one; Back returns to the previous tab.

---

## A5. `applySearch` must not rewrite every `<td>`; debounce inputs

**Evidence.** `search.ts:100-112` sets `td.innerHTML = highlighted + copyBtn.outerHTML` on every cell for every keystroke, dropping the `<span class="cell-text">` wrapper and the `.cell-expand-btn` built at `table-view.ts:296-302`. Called from `table-view.ts:677,693,702` on every render. `schema-explorer.ts:440` binds `input` → full `render` with no debounce. (`app.js:376-377` double binding is `bugs/036`; land that first.)

**Change.**
1. `search.ts`: highlight only inside `td.querySelector('.cell-text')`; leave siblings untouched. Store the original text on the span (`data-orig`) so clearing the search restores it without a re-render.
2. Debounce the search input and `schema-explorer.ts:440` at ~150 ms using one shared `debounce()` in `utils.ts` (comment: coalesce keystrokes; full rebuilds cost ~60k elements at the 1000-row page size).
3. `table-list.ts:64,71`: the second `renderTableView` after `/count` exists only to refresh the pagination status; replace it with `updatePaginationBar(o.count)` alone if the status text is all that changes (verify by reading `renderTableView`'s use of `tableCounts`).

**Tests.** Extend `assets/web/test/table-view-bools.test.mjs` or add `search-highlight.test.mjs`: after highlight, `.cell-expand-btn` count is unchanged and `.cell-text` still wraps the value.

---

## A6. One `apiFetch` helper; no silent failures; HTTP status visible

**Evidence.** Dominant pattern `fetch(...).then(r => r.json())` (e.g. `sql-runner.ts:539`, `table-list.ts:59`, `tools-import.ts:234`) — an HTML 401/500 surfaces as "Unexpected token <". Only `app.js:451` and `tools-compare.ts:248,276` check a status (501). Silent `.catch(() => {})` / console-only: `table-list.ts:73,259`, `history-sidebar.ts:353,404,417`, `app.js:902,929,1041`, `session.ts:309`, `sql-runner.ts:183-186`. `connection.ts` logs 19 `console.log` lines per transition.

**Change.**
1. `utils.ts`: `export async function apiFetch(url, opts)` → wraps `fetch` with `S.authOpts()`, checks `r.ok`, reads `content-type`, and throws `ApiError { status, message, body }` with a localized message per class (401/403 → auth, 404, 5xx, network). Comment the failure mode it replaces.
2. Migrate the sites listed above plus the main data paths (`table-list.ts`, `sql-runner.ts`, `tools-*.ts`, `performance.ts`, `history-sidebar.ts`). Every previously silent `.catch` reports via `showToast('error', …)` from A3 (or inline status text where one exists).
3. `connection.ts`: gate `console.log` behind a `DEBUG_CONNECTION` flag read from a `drift-viewer-pref-debugLog` pref (add the toggle in Settings via `settings.ts`).

**Tests.** `assets/web/test/api-fetch.test.mjs` with a stubbed `fetch`: non-JSON 500 → `ApiError(500)`; 401 → auth message; JSON 200 → parsed body.

---

## A7. Offline disabling covers every network-bound control

**Evidence.** `state.ts:328-333` `OFFLINE_DISABLE_IDS` lists 11 Tables/SQL ids. Import Run, Snapshot Take/Compare, Index/Size/Perf/Anomaly Analyze, Compare View, Migration Preview, and export links stay enabled while disconnected. `.offline-disabled` uses `pointer-events:none` (`_connection-banner.scss:15`), which leaves controls keyboard-activatable.

**Change.**
1. Extend `OFFLINE_DISABLE_IDS` with `import-run, snapshot-take, snapshot-compare, index-analyze, size-analyze, perf-refresh, anomaly-analyze, compare-view, migration-preview, export-dump, export-database, export-csv, export-json, declared-load, sql-format`.
2. In the function that applies the class (grep `offline-disabled` in `connection.ts`/`app.js`), also set the `disabled` attribute on buttons and `aria-disabled="true"` + `tabindex="-1"` on anchors, and restore on reconnect. Comment: `pointer-events:none` does not remove keyboard activation.
3. Per-panel Import guidance: when `driftWriteEnabled` is false, show a read-only notice in `#panel-import` and disable `#import-run` up front instead of after the POST fails (`tools-import.ts` init; the write flag is already read in `app.js:69-73`).

**Tests.** Unit: the id list is exported — assert every id exists in the shell (Dart test reading `HtmlContent.buildIndexHtml()` for each id, or a node test reading the Dart file as text).

---

## A8. Small correctness cleanups (one commit)

- Delete `assets/web/sidebar.ts` (never imported; duplicates `sidebar-panels.ts`) and `APP_SIDEBAR_PANEL_KEY` / `saropa_app_sidebar_collapsed` in `state.ts:205`. Grep first: `grep -rn "sidebar.ts\|APP_SIDEBAR_PANEL_KEY" assets/web extension/src`.
- `performance.ts:198` "Clear" gets a confirmation (via A3 modal).
- `tabs.ts:183,283`: double-click-a-tab closes all other tabs — move that to the tab context menu or require the modal confirm; accidental double-clicks are common.
- `persistence.ts:147`: validate `columnConfig.order` entries against the live column list so a stale config cannot hide every column.
- `session.ts:103-107,273` and `tools-import.ts:51,57`: wrap `vt()` values in `esc()` before `innerHTML` (translation catalogs are a sink otherwise). `session.ts:235` and `tools-import.ts:214`: remove double-escaping (`esc()` into `textContent`/`confirm`).

---

## Order and dependencies

1. Land bugs 080, 036 first (tiny, unblock measurement).
2. A3 (modal + toast) — A6, A7, A8 depend on it.
3. A1, A5, A8 — independent, can run in parallel sub-agents on separate files.
4. A6, A7.
5. A2 (server + client), A4 — larger, sequential after the above so they build on `apiFetch` and the modal.

## Conductor review checklist (per task PR)

- [ ] `bundle.js` rebuilt and committed in the same commit as the TS change.
- [ ] `npm run typecheck:web` and `npm run test:web` output pasted.
- [ ] No new literal English in TS; new keys present in `strings-web-*.ts`.
- [ ] Every new function/condition commented with WHY.
- [ ] CHANGELOG `[Unreleased]` entry, no date, references this plan.
- [ ] Manual verification steps from the task's **Verify** line performed and listed.

## Closure

When all tasks ship, append a finish report (`## Finish Report (yyyy-mm-dd)`) with surfaces changed, tests, and commits, then `git mv` this file to `plans/history/yyyy.mm/yyyymmdd/81-web-viewer-ux-core.md`.
