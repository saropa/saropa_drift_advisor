# Web viewer bug batch 080-084 — consolidated finish report (2026-09-02)

Five defects in the browser-hosted web viewer were fixed in one batch: inert table pagination,
icons that rendered as literal ligature names when Google Fonts was unreachable, a stylesheet
reference to a non-existent design token, a settings toggle no code read, and two widgets built
with an interactive control nested inside another interactive control. Each is recorded in full
in its own archived bug file alongside this report; this document carries the cross-cutting
findings, the verification, and the decisions that span more than one bug.

---

## Scope

| Bug | Defect | Primary sources |
| --- | --- | --- |
| 080 | Pagination sent `S.limit`/`S.offset`; server reads `limit`/`offset` | `table-list.ts`, `search-tab.ts`, `utils.ts` |
| 081 | Icon font loaded only from a CDN, no offline fallback | `html_content.dart`, `toolbar.ts`, `_cards.scss`, `_toolbar.scss` |
| 082 | `var(--mono, ...)` — token is `--font-mono` | `_sql-editor.scss`, `_history-sidebar.scss` |
| 083 | `beforeunload` guard never read its own preference | `app.js` |
| 084 | Close button inside a button; pin button inside an anchor | `tabs.ts`, `table-list.ts`, tab/sidebar/theme SCSS |

Generated artifacts `assets/web/bundle.js` and `assets/web/style.css` were regenerated from
source at the end of the batch. No generated file was hand-edited at any point.

---

## Cross-cutting findings

### A code review after the first pass produced four findings, all upheld

The first implementation pass was reviewed before closure. Four findings were raised and all four
were acted on. Three concerned bug 081 and one concerned bug 084. Two are worth recording because
the reasoning generalizes.

**Font-availability detection has no single reliable API.** `document.fonts.check()` returns true
for a family with no matching `@font-face` rule at all — the browser reports the implicit system
fallback as available — so it returns true in precisely the offline case being detected. An empty
result from `document.fonts.load()` is equally untrustworthy in the other direction: `load()` only
matches CSS-connected `@font-face` rules, so a user with the icon family installed as a system
font gets an empty array while the glyphs render perfectly. Neither call is a verdict. The
resolution is to treat both as inputs and confirm with a rendering measurement before degrading.

**A reviewer's cited rule was itself wrong, and checking it changed the fix.** The review held
that `role="presentation"` on the tab wrapper promoted its children into the `tablist` and caused
an `aria-required-children` violation that a role-less wrapper would avoid. Reading axe-core's
`get-role.js` and `html-elms.js` established that a `<div>` has no implicit role and that
`presentation` resolves to `null` under `noPresentational`, so the two cases are handled
identically — the suggested remedy fixed nothing. ARIA's own definition of an owned element
reaches through any wrapper regardless of role. The violation is unavoidable for a closable tab
in a `tablist`; what remained was choosing which cost to pay, not how to avoid it.

### Two dead controls were nearly introduced while fixing one

Bug 083 is a control that no code reads. The first 081 fix forced the labeled toolbar layout
whenever the icon font was missing, which silently disabled the toolbar density toggle — the same
defect, in the same changeset that fixed it. The degraded layout is now a default that an explicit
user choice overrides. This is worth remembering: a "temporary" or "degraded" mode that ignores a
user preference is a dead control, not a graceful fallback.

### Preferences must be read at the point of use

Both 083 and the 081 density fix landed on the same rule. Reading a preference once at startup
makes the setting require a reload to take effect, which users experience as a broken control.
Both now read at the moment of use.

---

## Verification

| Gate | Result |
| --- | --- |
| `npm run build` | `bundle.js` + `style.css` regenerated, clean |
| `npm run typecheck:web` | exit 0 |
| `npm run test:web` | 338 tests, 338 pass, 0 fail |
| Extension mocha, 14 dependent specs | 3151 passing, 0 failing |
| `dart test` on the two dependent Dart suites | 41 passing |

Tests were re-run after bug references in source comments were repointed to this archive path.

Four regression suites were added: `table-data-url.test.mjs` (080),
`no-nested-interactive-controls.test.mjs` (084), `icon-font-fallback.test.mjs` (081), and
assertions extended in the existing web suites. The 081 suite deliberately contains paired tests
with identical stub environments and opposite expectations, which fail if the probe's three
branches are ever merged into one shared helper.

### Not verified

No browser or screen-reader session was run. Specifically outstanding:

- The 081 probe is proven only against stubbed measurement APIs. That a real engine's
  `measureText` and off-screen span layout produce the assumed width split, and that canvas
  ligature shaping behaves as assumed across Chromium, Firefox and WebKit, is unconfirmed.
- The 084 claim that the restructure is pixel-identical is derived from CSS box arithmetic, not
  observed rendering.
- Whether Chromium and Firefox compute `posinset`/`setsize` from role-matched siblings, and so
  whether "3 of 7" survives the interleaved close buttons, is unconfirmed. The decision holds
  either way: a degraded "3 of 14" still exceeds `role="toolbar"`, which reports no position.

---

## Defects found but deliberately not fixed here

- **Localization catalog corruption** — 108 strings across seven locale files carry
  machine-translation placeholder residue (`_PH0__`, `ph0__`, `PH0`) where `{0}` belongs, and
  `web.zh-tw.json` is written in Simplified Chinese. Some strings additionally carry hallucinated
  clauses absent from the English source. Filed as `bugs/085`; requires human translation review,
  not another automated pass, plus a placeholder-parity gate. Key-coverage checks pass, which is
  why this shipped undetected.
- **Six undefined design tokens** — `--error`, `--warning`, `--accent`, `--bg-hover`,
  `--bg-secondary`, `--link-rgb` are referenced with literal fallbacks and never declared.
  Substituting a guess would change rendered colors.
- **Duplicate JSON key** — `driftViewer.logVerbosity` is declared twice in
  `extension/package.json` (lines 1446 and 1770). Surfaced as an esbuild warning during the batch.
- **Over-promising settings sub-label** — `viewer.settings.format.confirmNavigateSub` describes
  broader behavior than the 083 guard implements; correcting English alone would desync ten
  locale catalogs.

---

## Note on working-tree provenance

During this batch, four files unrelated to it (`lib/src/server/router.dart`,
`lib/src/server/session_handler.dart`, `extension/src/editing/editing-bridge.ts`,
`extension/src/editing/sqlite-cell-value.ts`) became dirty, carrying comments referencing bugs
003, 007 and 009. A behavior-preserving edit also appeared inside `assets/web/toolbar.ts` between
two authored edits to that file. None of it originates from this batch, and none of it was
reverted or tidied. It is recorded here only so a future reader does not attribute those changes
to bugs 080-084.
