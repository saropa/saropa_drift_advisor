# BUG: Tab close button is a `<button>` inside a `<button>`, and the table pin button is a `<button>` inside an `<a href>` — invalid HTML that corrupts the accessibility tree of the two most-used widgets

**Status: Fixed**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Server (web viewer, `assets/web/`)
File: `assets/web/tabs.ts` (lines 128-179); `assets/web/table-list.ts` (lines 111-154)
Severity: UX / accessibility — Medium (WCAG 4.1.1/4.1.2; screen readers and keyboard users get a broken or duplicated control)

---

## Summary

The HTML content model forbids interactive content inside `<button>` and inside `<a href>`. Both are violated: every tab in the tab bar appends its `×` close `<button>` as a child of the tab's own `<button>`, and every row in the Tables sidebar appends its pin `<button>` as a child of the row's `<a href>`. The HTML parser tolerates it when built via DOM APIs, but assistive technology does not: the inner button is either hoisted out of the outer control's accessible name (so the tab reads as "users ×, button"), announced as two nested buttons, or dropped entirely, depending on browser and screen reader. Keyboard focus order also becomes browser-dependent — Firefox and Chromium disagree on whether the inner button receives focus.

---

## Attribution Evidence

Positive — both constructions live in this repo:

```bash
sed -n '128,131p;164,175p' assets/web/tabs.ts
```

```
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tab-btn';
  ...
  var closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'tab-btn-close';
  ...
  btn.appendChild(closeBtn);
```

```bash
sed -n '111,114p;134,136p;150p' assets/web/table-list.ts
```

```
    var a = document.createElement('a');
    a.href = '#' + encodeURIComponent(t);
    a.className = 'table-link' + (t === S.currentTableName ? ' active' : '');
    ...
    var pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = 'table-pin-btn' + (isPinned ? ' pinned' : '');
    ...
    a.appendChild(pinBtn);
```

Both are in the shipped bundle:

```bash
grep -n "btn.appendChild(closeBtn)\|a.appendChild(pinBtn)" assets/web/bundle.js
```

The existing extension test for tab icons does not assert the nesting is valid:

```bash
grep -n "closeBtn\|tab-btn-close" extension/src/test/tab-icons-accent.test.ts
# Expected: 0 matches
```

Negative attribution — not a sibling package:

```bash
grep -rn "tab-btn-close\|table-pin-btn" ../saropa_lints/ ../saropa_dart_utils/
# Expected: 0 matches
```

**Emit site(s):** `assets/web/tabs.ts:175`, `assets/web/table-list.ts:150`.

---

## Environment

- OS: any
- Browser: Chromium and Firefox behave differently (see Actual Behavior)
- VS Code version: also reproduces in the panel (same bundle)
- Extension version: 4.2.5
- Dart SDK version: as pinned by `pubspec.yaml`
- Flutter SDK version: any
- Database type and version: n/a
- Connection method: browser at `http://127.0.0.1:8642`
- Relevant non-default settings: none
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Open the viewer with at least two tables and open two table tabs.
2. Open DevTools → Elements, select a `.tab-btn`, and open the Accessibility pane.
3. With a screen reader running (NVDA on Windows, VoiceOver on macOS), Tab to a tab button and listen to the announcement.
4. Press Tab again.
5. Repeat steps 2-4 on a row in the Tables sidebar.

Reproduces on every attempt.

---

## Expected Behavior

Step 3 announces "users, tab, selected" (or similar). Step 4 moves focus to a separately announced "Close users, button". Sidebar rows announce the table name as a link and the pin as a separate toggle button.

---

## Actual Behavior

Chromium: the tab announces as "users × button" — the close glyph is folded into the outer button's name and the inner button is unreachable by Tab in some versions. Firefox: two focus stops, with the inner one announced without context. Pin buttons inside links behave similarly: NVDA reads "users link, button" as one item. The DevTools Accessibility pane shows the nested control flagged.

---

## Error Output

### VS Code Developer Tools Console

Nothing at runtime. Serializing either widget and feeding it to the W3C validator reports "Element button must not appear as a descendant of the button element" / "…of the a element".

### Extension Output Channel

Nothing.

### Terminal / Command Output

n/a.

### Stack Traces

None.

---

## Duplicate-Emission Check

Two sites, two widgets, same root cause. `pagination.ts:191` (`li.appendChild(pinBtn)`) is the column-chooser list and is **correct** — the button is a child of the `<li>`, not of another control. Do not change it.

---

## Screenshots / Recordings

Not attached — the Accessibility pane is the reproduction artefact.

---

## Minimal Reproducible Example

```js
// Viewer console with a table tab open:
document.querySelector('.tab-btn button')          // → the nested close button (should be null)
document.querySelector('#tables a button')          // → the nested pin button (should be null)
```

---

## What I Already Tried

- [x] Read both builders end to end; the click handlers already special-case the inner control (`tabs.ts:179` checks `e.target !== closeBtn`; `table-list.ts:145-147` stops propagation), which is the workaround for a problem the structure created.
- [x] Confirmed the SCSS for both widgets (`_tab-bar.scss`, `_sidebar.scss:138-192`) positions the inner button absolutely or as a flex sibling, so it does not depend on being a child of the control.

---

## Regression Info

- Last working version: never.
- First broken version: whichever releases introduced closeable tabs and table pinning.
- What changed: nothing since.

---

## Root Cause

Both widgets were built as "one clickable element with a secondary button inside" for simplicity of hit-testing. HTML's content model does not allow that, and the workaround click handlers hide the structural problem from sighted mouse users only.

---

## Changes Made

### Tab bar

- **`assets/web/tabs.ts`** — `createClosableTab()` no longer does
  `btn.appendChild(closeBtn)`. It builds a `<div class="tab-item">` and appends
  the tab `<button>` and the close `<button>` into it as siblings, then inserts
  the *wrapper* into `#tab-bar` (including on the `opts.prepend` path). The
  function still returns `btn`, so every caller that reads `data-tab` or
  toggles classes is unaffected.
- **`assets/web/tabs.ts`** — the wrapper carries **no role**. A first pass at
  this fix set `role="presentation"` on it with the rationale that this "keeps
  `#tab-bar` (`role="tablist"`) owning the `role="tab"` buttons through the
  wrapper". Code review flagged the comment; on investigation both the comment
  *and* the proposed remedy were wrong, in opposite directions:
  - WAI-ARIA 1.2 defines an owned element as "any DOM descendant of the
    element, any element specified as a child via `aria-owns`, or any DOM
    descendant of the owned child". Ownership already reaches through an
    intermediate box, so no role was needed to preserve it.
  - axe-core's `aria-required-children` descends into a child (instead of
    counting it as an owned role) when the child has no role, no global ARIA
    attribute and is not focusable. axe assigns `<div>` no implicit role
    (`lib/standards/html-elms.js` has no `implicitRole` for `div`) and
    `getRole(…, {noPresentational:true})` returns `null` for
    `presentation`/`none`. A bare `<div>` and a `role="presentation"` `<div>`
    are therefore handled **identically** — the attribute was a no-op, and
    removing it does not by itself change any axe result.

  It was removed because it documented a rule that does not exist, not because
  it fixed anything.
- **Accepted deviation — `#tab-bar` stays `role="tablist"`.** Because ownership
  reaches through the wrapper regardless of its role, the close `<button>` is an
  owned non-`tab` child of the tablist in every sibling-based layout. axe-core
  reports that ("Element has children which are not allowed"), because it
  treats `tablist`'s `requiredOwned: ['tab']` as an allowlist. ARIA itself does
  not: §5.2.6 *Required Owned Elements* says only that "at least one instance of
  one required owned element is expected" — a minimum, not an exclusive list —
  and is silent on additional owned roles. This is a linter finding stricter
  than the normative text, not a spec violation. Alternatives weighed:
  - *Close buttons outside the tablist*: each `×` must overlay its own tab in a
    horizontally scrolling bar, needing JS-synced absolute positioning, and Tab
    order would degrade to "all tabs, then all close buttons". Not viable.
  - *Re-role `#tab-bar` to `toolbar`* (no `requiredOwned`, so axe-clean): costs
    every AT user the `tab` role, `aria-selected` and the tab/tabpanel
    relationship — "users, button" instead of "users, tab, selected, 3 of 7".
    A certain regression traded for a linter rule. Rejected.
  - *APG Tabs' optional `Delete` key with an `aria-hidden` `×` glyph*: spec- and
    axe-clean, and the only pattern the APG actually sanctions for closable
    tabs (there is no APG close-button pattern), but it removes a control
    sighted keyboard users can reach by Tab. Rejected as a UX regression.

  Also confirmed from axe's role table: `tab` has `childrenPresentational: true`,
  so the original nested close button could **never** have been exposed — the
  sibling structure is mandatory, not merely preferable.
- **`assets/web/tabs.ts`** — `createClosableTab()` now seeds
  `aria-selected="false"` at construction. A `role="tab"` with no
  `aria-selected` has an undefined selected state and AT announces nothing
  about it; `switchTab()` sets the real value immediately after every call
  site, but the element is no longer ever in the accessibility tree without it.
- Close buttons already carry a per-tab accessible name:
  `aria-label = vt('viewer.nav.tab.closeNamed', label)` ("Close users"). The key
  exists in `strings-web-nav.ts` and in all ten locale JSONs, so no new string
  was needed.
- **`assets/web/tabs.ts`** — removed the workarounds the nesting forced:
  `closeBtn`'s `e.stopPropagation()` and the tab button's
  `e.target !== closeBtn && !closeBtn.contains(e.target)` guard. A click on the
  close button can no longer reach the tab button, so there is nothing to
  filter.
- **`assets/web/tabs.ts`** — added `isClosableTab(btn)` and routed both
  closeability probes through it (`closeOtherTabs()` and
  `initTabsAndToolbar()`). Both previously used
  `btn.querySelector('.tab-btn-close')`, which only worked while the close
  control was a child. The helper requires the parent to actually be
  `.tab-item`; a bare `btn.parentElement` fallback would resolve to `#tab-bar`
  for permanent tabs and match some *other* tab's close button, wrongly
  reporting every permanent tab as closeable.
- **`assets/web/tabs.ts`** — `closeToolTab()` now removes the `.tab-item`
  wrapper rather than the button alone; otherwise the sibling close button
  would be orphaned in the tab bar as a stray `×`.
- **`assets/web/_tab-bar.scss`** — added `.tab-bar .tab-item`
  (`display:flex; align-items:stretch; position:relative`) as the new flex item
  of the tab bar; moved `.tab-bar .tab-btn-close` to
  `position:absolute; right:1.25rem; top:50%; transform:translateY(-50%)`
  (dropping its `margin-left`) and widened `.tab-bar .tab-btn`'s right padding
  from `1.25rem` to `3.1rem` to reserve the same slot the close button used to
  occupy in flow. Tab width, label position, close-glyph position and the
  active tab's background/border/accent span are unchanged; the tab's own
  chrome still paints across the full width because the chrome stayed on
  `.tab-btn`.
- **`assets/web/_tab-bar.scss`, `_theme-midnight.scss`, `_theme-showcase.scss`**
  — each `.tab-bar .tab-btn:hover` rule gained a second selector,
  `.tab-bar .tab-item:hover .tab-btn:not(.active)`. Hovering the close button
  used to trigger the tab's hover by descent; as a sibling it no longer does,
  so without this the tab would go flat under the cursor. `:not(.active)`
  preserves the active tab's background, which previously won by source order.
  No other theme rule needed changing: `--tab-accent` is still set on
  `.tab-btn[data-tab-type=…]` and is still consumed by `.tab-btn`.

### Tables sidebar

- **`assets/web/table-list.ts`** — `renderTableList()` no longer does
  `a.appendChild(pinBtn)`. The pin `<button>` is appended to the row's `<li>`
  as a sibling of the `<a>`. The pin handler's `e.preventDefault()` /
  `e.stopPropagation()` were removed: the button is no longer inside the link,
  so its clicks never reach the link's handler and there is no navigation to
  suppress.
- **`assets/web/_sidebar.scss`** — no positioning change was required:
  `.table-pin-btn` was already `position:absolute` against
  `.table-list li { position: relative }`, so it lands in exactly the same
  place as a sibling. The comment above the rule was updated to record why.
  `.table-list a:hover` gained a mirror selector
  `.table-list li:hover > a:not(.active)` for the same reason as the tab bar —
  hovering the pin used to light the row by descent.

### Not changed (deliberately)

- `assets/web/pagination.ts:191` (`li.appendChild(pinBtn)`, column chooser) was
  already correct.
- `assets/web/long-press-copy.ts` needed no edit: it excludes
  `.table-pin-btn, .tab-btn-close` before any `closest()` walk, and its
  `closest('.tab-btn[data-tab]')` / `closest('a.table-link[data-table]')`
  lookups still resolve correctly now that the secondary controls sit outside
  those elements.
- `extension/src/test/tab-close-others.test.ts` asserts the source contains
  `.querySelector('.tab-btn-close')`; that literal survives inside
  `isClosableTab()`.

### Tests

- **`assets/web/test/no-nested-interactive-controls.test.mjs`** (new) — asserts
  `tabs.ts` never contains `btn.appendChild(closeBtn)` and does build the
  `.tab-item` wrapper with both controls as siblings; that the wrapper carries
  **no** role (`!src.includes("wrap.setAttribute('role'")`) so the disproven
  `role="presentation"` rationale cannot come back; that the tab button keeps
  `role="tab"` and `aria-selected`, so a future "make the linter green" pass
  cannot quietly drop tab semantics; that
  `table-list.ts` never contains `a.appendChild(pinBtn)` and appends the pin to
  the `<li>`; and that the two SCSS hover-mirror rules exist. These are
  source-level assertions because the builders are DOM-heavy and the web suite
  has no headless DOM.

`assets/web/bundle.js` and `assets/web/style.css` are generated and were
deliberately left untouched; both must be rebuilt (`npm run build`) before the
fix ships.

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- **Who is affected:** screen-reader and keyboard users on every tab and every sidebar row.
- **What is blocked:** reliably closing a tab or pinning a table without a mouse.
- **Data risk:** none.
- **Frequency:** every tab, every sidebar row.

---

## Fix Sketch

Make the secondary control a **sibling** inside a non-interactive wrapper, keep the class names so the SCSS and every existing test hook survive.

`tabs.ts`:

```ts
// A <button> may not contain another <button> (HTML content model), and AT
// merges or drops the inner one. Wrap tab + close as siblings; the wrapper
// carries role="presentation" so the tablist still sees only role="tab".
var wrap = document.createElement('div');
wrap.className = 'tab-wrap';
wrap.setAttribute('role', 'presentation');
wrap.appendChild(btn);        // role="tab"
wrap.appendChild(closeBtn);   // sibling, not child
tabBar.appendChild(wrap);
```

Then `tabs.ts:179` no longer needs the `e.target !== closeBtn` guard, and `closeToolTab`/`switchTab` lookups that use `tabBar.querySelector('[data-tab="…"]')` are unaffected because `data-tab` stays on `btn`. Check any code that assumes `btn.parentElement === tabBar` (grep `tab-bar` in `tabs.ts`) and any test in `extension/src/test/tab-icons-accent.test.ts`.

`table-list.ts`:

```ts
// <a href> may not contain a <button>. Make the pin a sibling of the link
// inside the <li>; SCSS already lays them out with flex.
li.appendChild(a);
li.appendChild(pinBtn);
```

and move `display:flex; align-items:center` from `.table-link` to `.table-list li` in `_sidebar.scss` if it is not already there. Drop the `e.preventDefault(); e.stopPropagation();` in the pin handler once it is no longer inside the link.

Verification: the console snippet above returns `null` for both; a node test under `assets/web/test/` can esbuild `tabs.ts`'s pure builder if it is split out DOM-free, otherwise cover it with the extension mocha test that already exercises `createClosableTab`. Rebuild and commit `bundle.js`; CHANGELOG `### Fixed`.


---

## Finish Report (2026-09-02)

Closed as part of a five-bug web-viewer batch (080-084). Consolidated record, including the
cross-cutting verification and the code-review round that followed the first pass:
`plans/history/2026.09/20260902/080-084-web-viewer-batch-report.md`.

### Verification applied to this fix

- `npm run build` — `bundle.js` and `style.css` regenerated from source; no generated file was
  hand-edited at any point.
- `npm run typecheck:web` — exit 0.
- `npm run test:web` — 338 tests, 338 pass, 0 fail.
- Extension mocha, full suite — 3151 passing, 0 failing. An earlier revision of this report
  described this run as "scoped to the 14 specs that assert on the changed sources". It was not
  scoped. `extension/.mocharc.yml` sets `spec: out/test/**/*.test.js`, and mocha *merges* CLI file
  arguments (and `--spec`) with that key rather than overriding it, so naming files on the command
  line ran the whole suite. The full suite passing is a stronger result than a scoped run, only a
  differently-described one.
- Extension mocha, genuinely scoped to the 15 specs that reference the changed web sources
  (`--no-config --no-package --require test/register-mock.js --timeout 5000`) — 303 passing,
  0 failing.
- `dart test test/html_content_test.dart test/web_viewer_nl_modal_contract_test.dart` — 41 passing.

### Defect and resolution

Each tab appended its close `<button>` inside the tab's own `<button>`, and each sidebar row
appended its pin `<button>` inside the row's `<a href>`. Both violate the HTML content model and
corrupt the accessibility tree.

Both controls are now siblings within a wrapper. Geometry is preserved by absolute positioning
against reserved padding, so the rendered result is unchanged; hover parity rules were added
across all three themes because the inner control previously triggered the outer hover by descent.

An initial `role="presentation"` on the tab wrapper was removed after investigation showed it
documented a rule that does not exist: axe-core treats a role-less `<div>` and a
`role="presentation"` `<div>` identically, and ARIA ownership reaches through any wrapper. The
close button is therefore an owned non-`tab` child of the `tablist` whatever the wrapper carries.
`role="tablist"` was retained as a documented deviation rather than downgrading the bar to
`role="toolbar"`: axe's `requiredOwned` allowlist is stricter than ARIA's normative "at least one
instance" text, and the downgrade would cost every assistive-technology user the `tab` role,
`aria-selected`, and set-position announcement — a certain regression traded for linter silence.
The rejected alternatives and the trade-off are recorded in the code comment.
