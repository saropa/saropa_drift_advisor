# Toolbar label-density toggle (web viewer)

Triggered by the user's request: "add a toggle functionality to the toolbar
when i click on whitespace (not an icon) toggle the state: 1. icon with short
word explaining the icon with a dim bounding box (border); 2. current icon only
style" — followed by "persist this user setting". The debug web viewer's
toolbar row (`#toolbar-bar`) previously rendered icon-only buttons with no way
to surface a text label. This adds a two-state density toggle, flipped by
clicking the toolbar's bare whitespace, and persists the choice.

## Finish Report (2026-06-11)

This work will be reviewed by another AI.

### Scope

(A) Dart app code + web viewer assets. The change spans the Dart-embedded HTML
shell (`lib/src/server/html_content.dart`), the browser TypeScript bundle
(`assets/web/toolbar.ts`, `assets/web/state.ts`), the SCSS partial
(`assets/web/_toolbar.scss`), and the rebuilt artifacts (`bundle.js`,
`style.css`). Not the VS Code extension TS (B) and not docs-only (C).

### What changed

1. **Whitespace-click density toggle.** `toolbar.ts` `initToolbar()` now wires a
   click listener on `#toolbar-bar`. A click whose target is NOT inside a
   `.tb-icon-btn` or the `.tb-flyout` (i.e. bare strip, a `.tb-divider`, or the
   `.tb-spacer`) flips a `.tb-labeled` class on the toolbar. Real button clicks
   fall through to their existing handlers — the `closest('.tb-icon-btn,
   .tb-flyout')` guard returns early for them so the density does not toggle on
   a normal action.
2. **Two visual states.** Default (no class) = current icon-only. `.tb-labeled`
   (new SCSS in `_toolbar.scss`) = each button sizes to `width:auto`, gains a
   permanent dim `--border` bounding box, and renders its short word via
   `::after { content: attr(data-label) }`.
3. **Short labels via `data-label`.** Every toolbar button in
   `html_content.dart` gained a short `data-label` (Home, Tables, Search, SQL,
   Snapshot, Diff, Index, Schema, Code, Diagram, Size, Perf, Health, Import,
   Export, Settings, Mask, Theme, Share, History). `title` is left as the fuller
   tooltip, so the two long sidebar-toggle titles ("Toggle tables sidebar",
   "Toggle history sidebar") still tooltip in full while labeling as the short
   "Tables" / "History".
4. **Persistence.** New `TOOLBAR_LABELS_KEY = 'drift-viewer-toolbar-labels'` in
   `state.ts`. The chosen mode is written on toggle and restored on init, both
   wrapped in try/catch matching `sidebar.ts` (localStorage can throw in
   private-mode / restricted webview contexts; falls back to icon-only).

### Deep review notes

- **Logic & safety:** single delegated listener, no recursion, no async. The
  `closest()` guard cleanly separates whitespace from controls. localStorage
  guarded against throw.
- **Architecture:** label source is `data-label` (not `title`) so tooltips stay
  intact — the codebase already distinguishes the two. Persistence key follows
  the existing `drift-viewer-*` localStorage naming and the try/catch wrapper
  pattern from `sidebar.ts`. No new shared primitive; the `.tb-labeled` mode is
  scoped to `#toolbar-bar`.
- **Performance/UX:** pure CSS state flip; reduced-motion already covered by the
  existing `.tb-icon-btn` transition media query. The dim box gives the wider
  labeled hit targets a discrete affordance.

### Tests

- **Audited existing tests** referencing the touched symbols (`grep` for
  `tb-icon-btn`, `toolbar-bar`, `initToolbar`, `data-label`, `tb-labeled`,
  `TOOLBAR_LABELS`): `test/web_viewer_nl_modal_contract_test.dart`,
  `extension/src/test/hamburger-menu.test.ts`,
  `extension/src/test/tab-icons-accent.test.ts`. None pinned values my change
  removed — all still assert `id="toolbar-bar"`, `.tb-icon-btn`, and
  `function initToolbar`, which remain present.
- **Extended** `web_viewer_nl_modal_contract_test.dart` with a new test
  "Toolbar label toggle: data-labels, SCSS labeled mode, JS key + wiring"
  pinning the `data-label` attributes, the `.tb-labeled` SCSS hook +
  `content: attr(data-label)`, and the bundle's `TOOLBAR_LABELS_KEY` /
  `drift-viewer-toolbar-labels` / `classList.toggle("tb-labeled")` wiring.
- **Ran:** `dart test test/web_viewer_nl_modal_contract_test.dart` → 6/6 pass.
  `npm run typecheck:web` → clean. The two affected extension tests
  (hamburger-menu, tab-icons-accent) pass.
- **Note:** the full extension mocha run shows 1 failing test,
  `web-table-def-toggle.test.js` (expects a ▼ arrow in
  `assets/web/table-def-toggle.ts`). That file is a separate working-tree
  change outside this task — this task does not touch `table-def-toggle.ts`.

### Build artifacts

`npm run build` regenerated `assets/web/bundle.js` and `assets/web/style.css`.
Both contain the new `tb-labeled` references (verified). `npm run typecheck:web`
clean.

### l10n

The `data-label` words are user-visible. They live in the Dart-embedded HTML
shell (`html_content.dart`), which is the debug web viewer served to the
developer running the app — the same surface already holding all the other
hardcoded English toolbar `title`s and the tab/tool labels. This viewer shell is
not wired to the Flutter ARB l10n catalog (it is a debug-server HTML string, not
a Flutter widget tree), so the labels follow the existing convention of the
file. No ARB keys involved.

### Files changed

- `lib/src/server/html_content.dart` — `data-label` on every toolbar button.
- `assets/web/toolbar.ts` — whitespace-click density toggle + persistence.
- `assets/web/state.ts` — `TOOLBAR_LABELS_KEY`.
- `assets/web/_toolbar.scss` — `.tb-labeled` mode styles.
- `assets/web/bundle.js`, `assets/web/style.css` — rebuilt artifacts.
- `test/web_viewer_nl_modal_contract_test.dart` — new contract test.
- `CHANGELOG.md` — Unreleased entry.
- `plans/history/2026.06/2026.06.11/toolbar-label-toggle.md` — this report.

### Outstanding

None for this task. On-device visual verification of the labeled layout (wrap
behavior on a narrow viewport) is left to the manual test pass below.
