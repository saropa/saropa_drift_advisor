# 83 — Web viewer accessibility and i18n: landmarks, names, live regions, keyboard patterns, shell strings

**Status: Open** (2026-09-02). Not started. Source: master web-developer review of the browser viewer, 2026-09-02.

Self-contained: a sub-agent needs only this file, the repo, and the skills named below. Siblings: `plans/81-web-viewer-ux-core.md` (A3 builds the shared modal this plan's C4 relies on; A7 adds `disabled` to offline controls) and `plans/82-web-viewer-visual-system.md` (B2 contrast, B3 reduced-motion). Bugs tracked separately and NOT duplicated here: `bugs/075` (title typo), `bugs/081` (icon font offline — its label fallback needs C2's `aria-label`s), `bugs/084` (nested interactive controls in tabs and table list).

---

## Ground rules

- Load `drift-advisor-architecture-contract`, `drift-advisor-change-control`, `drift-advisor-docs-and-writing` (section 7, the l10n rule), `drift-advisor-testing-and-validation`.
- Surfaces: the shell `lib/src/server/html_content.dart` (Dart string, served by the debug server), behavior `assets/web/*.ts` + `assets/web/app.js`, strings `assets/web/l10n/strings-web-*.ts` (bundled English registry; `vt('key', ...args)` from `assets/web/l10n.ts`), translated overlays `assets/web/l10n/web.<locale>.json` (ten locales: de es fr it ja ko pt-br ru zh-cn zh-tw).
- `assets/web/bundle.js` is generated and committed: `npm run build:js` after any TS change, commit the bundle. `style.css` likewise via `npm run build:style`.
- Gates to run by hand (none are in husky/CI, `bugs/016`): `npm run typecheck:web`, `npm run test:web`, and `flutter test test/html_content_test.dart --no-pub` (background) for shell assertions.
- Every function, condition, and fix gets a WHY comment. New strings go through `vt()`. `esc()` on every server-derived value in `innerHTML`.
- Accessibility claims are verified with the browser's Accessibility pane (Chromium DevTools → Elements → Accessibility) and one screen reader pass (NVDA on Windows). Name what was checked in the finish report.
- CHANGELOG `[Unreleased]` `### Improved` entry per task, no dates, referencing this file.

---

## C1. Page basics: `lang`/`dir`, `<main>`, skip link, `color-scheme`, per-screen `document.title`

**Evidence.** `html_content.dart:132` is bare `<html>` — no `lang`, no `dir` (WCAG 3.1.1 Level A), even though the server has already resolved the locale (`buildIndexHtml(l10nLocale: …)`, `:77`; resolution in `generation_handler.dart:247`). No `<main>` or `role="main"` anywhere (`:303` is `<div class="app-main-content">`). No skip link (`grep -rn "skip-link\|Skip to" lib/src/server assets/web` → 0); the toolbar at `:181-231` puts 24 buttons before content. No `<meta name="color-scheme">` despite two dark themes. `grep -rn "document.title" assets/web/*.ts assets/web/app.js` → 0: the title never changes across 15 tool tabs and N table tabs (WCAG 2.4.2).

**Change.**
1. `html_content.dart:132` → `<html lang="${l10nLocale?.isNotEmpty == true ? l10nLocale : 'en'}" dir="ltr">`. Comment: the locale is already known here; a Japanese UI served without `lang` is read with an English voice. `dir` is static `ltr` today (no RTL catalogs shipped, `l10n.ts:63` `KNOWN_LOCALES`); leave a comment that RTL requires the logical-property pass noted in C8.
2. `:303` → `<main class="app-main-content" id="main-content">`. Check `_layout.scss` selectors (`.app-main-content`) still match — they are class-based, so yes; confirm.
3. First child of `<body>` (`:146`, before the loading overlay): `<a class="skip-link" href="#main-content">Skip to content</a>`; text via C6's `data-l10n` pass. SCSS in `_base.scss`: visually hidden until `:focus-visible`, then fixed top-left, `z-index` above the toolbar, `--btn-primary-bg`/`fg`.
4. `<head>`: `<meta name="color-scheme" content="light dark">`. Also set `color-scheme: dark` on `body.theme-dark`/`body.theme-midnight` in `_themes.scss` so scrollbars and native form controls follow the theme.
5. `tabs.ts` `switchTab` (`:36-53`): set `document.title = vt('viewer.title.pattern', tabLabel, ServerConstants-derived app name)`. The app name is available from the masthead `.masthead-name` text or `/api/health`; read it once at boot into `state.ts`. Pattern "<Tab> – Saropa Drift Advisor". This closes `bugs/075` as a side effect only if the base title is also sourced from the constant — do that fix under 075, not here.

**Tests.** `test/html_content_test.dart`: `buildIndexHtml(l10nLocale: 'de')` contains `<html lang="de"`; default contains `lang="en"`; contains `<main `; contains `skip-link`; contains `name="color-scheme"`.

---

## C2. Accessible names for 26 icon-only buttons; toolbar tooltips through l10n

**Evidence.** In the shell, `<button>…<span class="material-symbols-outlined" aria-hidden="true">…</span></button>` with no text and no `aria-label` occurs at `html_content.dart:182, 189, 190, 191, 192, 195, 196, 198, 199, 200, 201, 202, 204, 205, 206, 207, 209, 210, 211, 216, 219, 227, 231, 292, 293, 424, 822, 823, 824` (29; `schema-explorer.ts:457` later fixes 822-824 → 26 remain). They rely on `title` alone, which Dragon ignores, JAWS forms mode drops, and touch never shows. `toolbar.ts` never touches `title`/`data-label` (23 `data-label`s, all hardcoded English). `#live-indicator` (`:63`) is a `<button>` carrying `aria-live` — misuse; live regions belong on non-interactive elements.

**Change.**
1. Shell: add `aria-label="…"` to each of the 26 buttons, mirroring `data-label` (toolbar) or `title` (history refresh/clear `:292-293`, SQL lock `:424`). The English stays in markup as the pre-boot fallback.
2. `toolbar.ts` init: a `relabelToolbar()` pass that, for every `[data-tool], [data-panel-btn], #tb-mask-toggle, #tb-theme-trigger, #tb-share-btn`, sets `title`, `aria-label`, and `data-label` from `vt('viewer.toolbar.<tool>.label')` / `vt('viewer.toolbar.<tool>.title')`. Add the keys to `strings-web-nav.ts`. Comment: the shell is a Dart string with no access to the JS catalog, so labels are re-applied at boot (same pattern as `schema-explorer.ts:457`).
3. `#live-indicator`: remove `aria-live`; C3 adds a separate status region for connection changes.
4. `bugs/081`'s label-fallback option depends on this: once every icon button has `aria-label`/`data-label`, the "icons unavailable" mode can show text for all of them.

**Verify.** Accessibility pane: each toolbar button shows a computed name from `aria-label`. `grep -c 'aria-label' lib/src/server/html_content.dart` ≥ 54 (28 existing + 26).

---

## C3. Live regions: toasts, statuses, banner role conflict

**Evidence.** `grep -rn "aria-live" assets/web/*.ts` → 0; every live region is static in the shell. `#copy-toast` (`:908`) has no `role`/`aria-live` — `showCopyToast` (`table-view.ts:117-129`) is the app's primary async-confirmation channel and is never announced. `#connection-banner` (`:165`) has `role="alert"` **and** `aria-live="polite"` — `alert` implies assertive; the two conflict. `#sda-loading-msg` (`:161`) error text has no live region. `role="status"` appears once in TS. `#nl-modal-error` (`:574`) is `role="status"` for an error.

**Change.**
1. `#copy-toast` → `role="status" aria-live="polite" aria-atomic="true"`. When plan 81 A3 generalizes it to `showToast(text, kind)`, `kind === 'error'` sets `role="alert"` on the fly (swap the attribute before setting text so AT sees the change).
2. `#connection-banner`: keep `role="alert"`, drop `aria-live="polite"` on the container; keep `aria-live="polite"` on `#banner-diagnostics` (`:168`) so the 1-second countdown ticks do not spam as alerts — actually set `aria-live="off"` there and announce only the "Next retry in Ns" once per state change from `connection.ts:95-110` via a separate polite region. Comment the reasoning: a per-second alert is unusable.
3. Add `role="status"` to `#sql-error` (→ `role="alert"`), `#import-status`, `#compare-status`, `#snapshot-status`, `#export-*-status` spans, `#schema-explorer-summary`; `#nl-modal-error` → `role="alert"`; `#sda-loading-msg` → `role="alert"` wrapper.
4. A single hidden polite region `#sr-status` for connection state changes ("Connection lost", "Reconnected"), written from `connection.ts` `setConnected/setDisconnected/setReconnecting`, replacing the `aria-live` removed from the button in C2.

**Verify.** NVDA: copy a cell → "Copied" announced; run a bad query → error announced; pull the server → "Connection lost" announced once, countdown silent.

---

## C4. Dialog focus management; `aria-hidden` on focusable content

**Evidence.** Six dialog-like surfaces, none with focus-in/trap/return except the theme flyout (`toolbar.ts:155-156`): `#cell-value-popup` (`:910`, has role+modal+Escape), `#column-chooser` (`:900`, `aria-modal` but **no role**, no Escape), `#analysis-compare-overlay` (`analysis.ts:78-85`, `aria-modal` without `role="dialog"`, Escape at `:175`), `#hb-stmt-flyout` (`heartbeat-statements.ts:35`, role but no `aria-modal`), history occurrences dialog (`history-sidebar.ts:278-279`). `grep -n "focus()" assets/web/analysis.ts assets/web/history-sidebar.ts assets/web/heartbeat-statements.ts` → 1 (and it focuses the SQL input, not a return target). `#column-chooser` and `#column-context-menu` (`:895`) are "closed" via `aria-hidden` only — buttons stay in tab order unless CSS uses `display:none` (verify in `_data-table.scss:440-460`). `sidebar-panels.ts:57,71,129` sets `aria-hidden` on `#app-sidebar` while it still contains focusable inputs (WCAG 4.1.2). `#app-sidebar-resizer` (`:302`) is a focusable `role="separator"` with no `aria-valuenow/min/max`.

**Change.**
1. Depends on plan 81 A3's `modal.ts` (focus first action, Tab trap, Escape, focus return). Extract its trap/return into `assets/web/focus-trap.ts` exporting `trapFocus(container): () => void` (returns a release function that also restores focus). Comment: one implementation, five consumers.
2. Apply `trapFocus` to the five surfaces above on open; release on close. Add `role="dialog"` to `#column-chooser` and `#analysis-compare-overlay`; `aria-modal="true"` to `#hb-stmt-flyout`; Escape handler to `#column-chooser`.
3. Replace `aria-hidden` toggling with the `hidden` attribute (or `inert` — check the project's browser floor in `CONTRIBUTING.md`; `inert` is fine for current Chromium/Firefox/Safari) on `#column-chooser`, `#column-context-menu`, and the collapsed sidebar in `sidebar-panels.ts`. Comment: `aria-hidden` on focusable content leaves ghost tab stops.
4. Resizer: set `aria-valuemin="0"`, `aria-valuemax` (the max width in `sidebar-resize.ts`), and update `aria-valuenow` on every drag/keypress in `sidebar-resize.ts:116-127`.

**Tests.** `assets/web/test/focus-trap.test.mjs` with a minimal DOM shim (pattern in `assets/web/test/helpers.mjs`): Tab from last focusable wraps to first; release restores the opener. Manual: open each dialog by keyboard, Tab around, Escape, confirm focus lands back on the trigger.

---

## C5. Keyboard patterns: tablist, disclosure buttons, grid headers, radiogroup, diff glyphs

**Evidence.**
- Tabs: `tabs.ts:132-133` sets `role="tab"`/`aria-controls`, `:47` maintains `aria-selected`; `grep -n "tabindex\|keydown" assets/web/tabs.ts` → 0. No roving tabindex, no arrow keys, tabpanels not focusable. The 14 static panels reference `aria-labelledby="tab-*"` ids that exist only once a tab is created.
- `.collapsible-header[data-collapsible]` is a `<div>` emitted 8× (`schema.ts:69,73,103,107,135,139`; `search-tab.ts:154,158`) wired only by a delegated click at `app.js:250` — not focusable, no `aria-expanded`. `#pagination-advanced-toggle` (`:339`) toggles `#pagination-advanced` with no `aria-expanded`/`aria-controls`.
- `tools-analytics.ts:54`: `<code style="cursor:pointer" onclick="navigator.clipboard.writeText(…)">` — inline handler on a non-interactive element.
- Grid: `table-view.ts:222-231` `<th draggable="true">` with no `scope="col"`, no `aria-sort` (plan 81 A2 adds sort + scope; this task must not duplicate — only verify after A2 lands). Cell popup opens on double-click only; no Enter path.
- `.cell-copy-btn`/`.cell-expand-btn` are `display:none` until `td:hover` (`_data-table.scss:371,398,407,427`) — keyboard-unreachable; the expand button is the only way to see a truncated BLOB. `long-press-copy.ts` is touch-only.
- `html_content.dart:283-287`: `role="radiogroup"` containing `<button aria-pressed>` — invalid composition.
- `analysis.ts:182`: added/removed rows differ only by `rgba(124,179,66,0.15)` vs `rgba(229,115,115,0.15)` background (WCAG 1.4.1 Level A).
- `_data-display.scss:57`: `.diagram-table:focus { outline: none }` replaced by a 1px stroke delta.

**Change.**
1. Tablist: in `switchTab`, set `tabindex="0"` on the selected tab and `"-1"` on the rest; add one `keydown` listener on `#tab-bar` for ArrowLeft/ArrowRight/Home/End that moves focus and calls `switchTab`; Delete closes the focused tab. Give each `.tab-panel` `tabindex="0"`. Emit the static panels' `aria-labelledby` only when the tab exists — simplest: `switchTab` sets it on activation and removes it on close.
2. Collapsible headers: emit `<button type="button" class="collapsible-header" data-collapsible aria-expanded="true" aria-controls="<body id>">`; `app.js:250` handler flips `aria-expanded`. SCSS: `.collapsible-header` gets `all: unset`-style button reset + existing styles + `:focus-visible` ring. Same for `#pagination-advanced-toggle` (add `aria-expanded`/`aria-controls`).
3. `tools-analytics.ts:54` → a `<button class="copy-inline">` with `aria-label`, delegated click handler, no inline `onclick`.
4. Cell buttons: `_data-table.scss` — replace `display:none`/`inline-flex` with `opacity:0; pointer-events:none` and reveal on `td:hover, td:focus-within, .cell-copy-btn:focus-visible` (`opacity:1; pointer-events:auto`), mirroring the working `.table-pin-btn` pattern at `_sidebar.scss:138-192`. Add `keydown` Enter/Space on `td[tabindex]`? No — keep cells non-focusable; the buttons themselves are focusable once visible-on-focus. Comment why.
5. History filter bar: `role="radiogroup"` → `role="group"` (buttons keep `aria-pressed`), or convert to `role="radio"` + `aria-checked` with arrow keys. Prefer `role="group"` — least change.
6. Diff rows (`analysis.ts:182`): prefix first cell with `+`/`−` in a `<span aria-hidden>` plus `<span class="sr-only">` "Added"/"Removed" via `vt()`, and wrap the row content in `<ins>`/`<del>`. Keep the tint.
7. `_data-display.scss:57`: restore `outline: 2px solid var(--link); outline-offset: 2px` on `.diagram-table:focus-visible`.
8. `.offline-disabled` (`_connection-banner.scss:15`, `pointer-events:none`) keeps controls keyboard-activatable — plan 81 A7 sets the `disabled` attribute; verify here after A7.

**Verify.** Keyboard-only walkthrough: Tab to tab bar, arrows switch tabs, Delete closes; Tab into a grid row, focus a copy button, Enter copies; open Schema, Tab to a section header, Enter collapses, AT reads expanded/collapsed.

---

## C6. Shell strings through l10n (~350 hardcoded English occurrences)

**Evidence.** The TS side is clean (737 `vt(` calls, 768 keys, 0 hardcoded `title=`/`aria-label=`/`placeholder=` assignments). The shell `html_content.dart` is the hole: 124 `title=`, 28 `aria-label=`, 9 `placeholder=` (3 re-set at runtime), 23 `data-label=`, 35 `<option>` labels, ~64 prose nodes, 72 `<button>` labels, 6 `<a>` labels. Examples: `:63` (`● Online` + title), `:171` `Retry now`, `:191` `Ask in English`, `:239` `Search`, `:284-287` filter buttons, `:333-337` pagination buttons + 5 aria-labels, `:460` NL hint, `:485-545` the whole NL cheat-sheet, `:876` the 70-word export narrative. Ten shipped catalogs cannot translate any of it. Home, heartbeat, and views panels already use the correct pattern (empty markup + `vt()` at init, `:309-311`, `:740-745`, `:835-839`).

**Change.** A declarative relabel pass instead of per-panel init code:
1. `assets/web/l10n-dom.ts` exporting `applyDomL10n(root = document)`: for `[data-l10n]` set `textContent = vt(key)`; `[data-l10n-title]` → `title`; `[data-l10n-aria-label]` → `aria-label`; `[data-l10n-placeholder]` → `placeholder`; `[data-l10n-label]` → `data-label`. For `<option data-l10n>` set `textContent`. For elements with HTML content (the export narrative with `<strong>`, the NL help footer with `<code>`), use `data-l10n-html` and a key whose value is trusted catalog HTML — run it through a strict allowlist sanitizer (`<strong>`, `<code>`, `<em>` only) before `innerHTML`, because `web.<locale>.json` is a translation artifact, not trusted markup (the server already escapes `</script>` in it, `html_content.dart:116`). Comment all of this.
2. Call `applyDomL10n()` in `app.js` boot before the loading overlay hides and before `initHomeScreen`. Keep the English text in the shell as the pre-boot fallback so the static page is never blank.
3. Annotate the shell in slices (one commit each): (a) masthead + banner + toolbar, (b) sidebar panels, (c) Tables panel + pagination + display bar, (d) Search tab, (e) SQL runner + builder + subbar + chart controls, (f) NL Ask panel incl. the cheat-sheet (`<li><code>` examples are English phrases the converter *recognizes* — translate the section headings and prose; leave the example phrases in English and say so in a comment, since `nl-to-sql.ts` matches English keywords), (g) tool panels snapshot/compare/index/size/perf/anomaly/import/schema/views/declared/diagram/export, (h) column menu/chooser/cell popup.
4. Keys go in the matching `strings-web-*.ts` registry (`nav`, `table`, `sql`, `tools`, `settings`, `misc`). Add every new key to all ten `web.<locale>.json` files with the English value (the coverage audit tracks them as untranslated; translation is a separate operator-run step and must not be run here).
5. `<title>` and `<html lang>` are C1; `data-label`/`aria-label` on toolbar buttons are C2 — C6 (a) must build on C2's key names, not invent new ones.

**Tests.** `assets/web/test/l10n-dom.test.mjs`: with a DOM shim, `applyDomL10n` sets text/title/aria-label/placeholder from the registry; unknown key leaves the English fallback; `data-l10n-html` strips a `<script>` and keeps `<strong>`. Dart: `test/html_content_test.dart` asserts no `title="` attribute remains without a sibling `data-l10n-title` on the annotated slices (write it as a regex count that must reach 0 at the end of slice (h)).

---

## C7. Forms and error association; `Intl` formatting

**Evidence.** Orphan `<label>` with no `for` and no wrapped control: `html_content.dart:351` (Display → `#display-format-toggle`), `:780` (Table → `#import-table`), `:782` (Format → `#import-format`). Unnamed inputs: `#home-feature-search` (`:318`, name and placeholder injected only after boot), `#schema-explorer-search` (`:818`, placeholder only), `#schema-explorer-type` (`:819`, a `<select>` with nothing). No `aria-describedby` from any input to its error (`#sql-error`, `#import-status`, `.cell-edit-error`), no `aria-invalid` on invalid cell edits (`_data-table.scss:82-84` is a red border only). `Intl.` appears once in TS (`settings.ts:34`); six `toLocale*('en-US')` hardcodes: `nl-to-sql.ts:1181`, `schema-explorer-logic.ts:87`, `schema-explorer.ts:190,260` (+2 more from `grep -rn "'en-US'" assets/web/*.ts`); bare `toLocaleString()` for dates at `analysis.ts:31`, `history-sidebar.ts:228`, `session.ts:32,237,276`, `sql-history.ts:40` follows the browser locale, not `getActiveLocale()`; hand-built relative time at `heartbeat-statements.ts:25-28`; plurals via paired keys (`tabs.ts:228-231`) — insufficient for `ru` (3 forms), which ships.

**Change.**
1. Shell: add `for=` to the three orphan labels; `aria-label` (via C6 `data-l10n-aria-label`) on the three unnamed inputs.
2. `sql-runner.ts`: when showing `#sql-error`, set `aria-describedby="sql-error"` and `aria-invalid="true"` on `#sql-input`; clear on success. `cell-edit.ts`: same on the edit input with the `.cell-edit-error` element (give it an id per edit). `tools-import.ts`: `aria-describedby` from `#import-file` to `#import-status`.
3. New `assets/web/format.ts`: `formatNumber(n)`, `formatDateTime(d)`, `formatRelative(ms)` built on `Intl.NumberFormat`, `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat` with `getActiveLocale()`; cache the formatter instances (construction is expensive; comment). Replace the six `'en-US'` sites, the six bare date sites, and `heartbeat-statements.ts:25-28`. `settings.ts:34` moves onto the same helper.
4. Plurals: add `vtPlural(keyBase, n)` in `l10n.ts` using `Intl.PluralRules(getActiveLocale()).select(n)` to pick `keyBase.one/few/many/other`; migrate `tabs.ts:228-231` and any other `.singular/.plural` pairs (`grep -n "Plural\|\.plural\|\.singular" assets/web/*.ts`). Existing two-form keys keep working: fall back `few/many → other → plural`.

**Tests.** `assets/web/test/format.test.mjs`: `formatNumber(1234)` under `de` → `1.234`, under `en` → `1,234`; `vtPlural` under `ru` selects `few` for 3. Existing `nl-to-sql.test.mjs` must still pass after the `en-US` change (its expectations may encode `en-US` output — update deliberately, do not loosen).

---

## C8. Deferred, documented here so nobody re-investigates

- **RTL.** No `dir` handling, zero logical CSS properties (`grep -E "margin-inline|padding-inline|inset-inline|border-inline" assets/web/*.scss` → 0) against dozens of `margin-left`/`right:`/`border-left`/`text-align:left`/`translateX`. No RTL catalog ships. Not worth a logical-property pass until an `ar`/`he` catalog is planned; note in `plans/deferred/` if that changes.
- **Midnight theme contrast is not computable** — translucent surfaces over an animated gradient (`_themes.scss:70-96`). Plan 82 B3 removes the animation from scrolling surfaces; a static fallback layer behind text would make it measurable. Decide after B3.

---

## Order

C1 → C2 → C3 (small, independent, each one commit) → C4 (after plan 81 A3) → C5 → C7 → C6 in slices (largest; last so the key names from C2/C3/C5 are settled). C8 stays deferred.

---

## Conductor review checklist (per task)

- The diff touches only the files the task names; `bundle.js`/`style.css` are rebuilt and included when TS/SCSS changed.
- Every added element/attribute has a WHY comment in the shell or the emitting TS.
- No new English literal at a call site; keys exist in the registry and in all ten `web.<locale>.json` files.
- `npm run typecheck:web` and `npm run test:web` output pasted; Dart shell test pasted when the shell changed.
- Accessibility pane evidence named (which control, computed name/role/state) and one NVDA statement of what was announced.
- CHANGELOG entry present, no date, references this file.

---

## Closure

When all of C1–C7 are merged: append a `## Finish Report (yyyy-mm-dd)` with `### Surfaces changed`, `### Tests`, and the accessibility evidence; move this file to `plans/history/yyyy.mm/yyyymmdd/83-web-viewer-accessibility-and-i18n.md`; update the CHANGELOG pointers to the archived path.
