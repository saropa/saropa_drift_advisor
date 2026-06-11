# Web viewer: resizable sidebar with drag bar

**Triggered by user request:** "since we only have 1 sidebar now, we should make
it resizable with a vertical bar. when set to zero (user hides, thats fine, just
make it wider so it is easier to grab. we can also remove the show/hide toggle
icons for the sidebar."

After the sidebar-consolidation work left the web viewer with a single swappable
left sidebar, this change gives that sidebar a drag handle on its right edge,
persists the chosen width, keeps the handle grabbable (widened) when the sidebar
is dragged to zero/hidden, and removes the now-redundant dedicated collapse icon
from the activity bar.

## Finish Report (2026-06-11)

### 1. Critical Note
This work will be reviewed by another AI.

### 2. Scope
- **(A)** Dart package web-viewer assets + server-generated HTML: `lib/src/server/html_content.dart`, `assets/web/*` (TS/SCSS/JS), and the Dart contract test.
- **(B)** VS Code extension: one extension contract test updated (`extension/src/test/hamburger-menu.test.ts`).
- **(C)** CHANGELOG.

### 3. Deep Review
- **Logic & Safety:** Drag controller uses pointer capture + window-level `pointermove`/`pointerup` so a fast drag that outruns the 6px bar still tracks and always releases. Width clamped to `[180, min(640, 60vw)]`; release under 120px snaps to hidden. No recursion; no timers; no async. `expandedWidth` (persisted) is kept separate from the collapsed flag (owned by `sidebar-panels.ts`) so hide→show restores the user's width. `localStorage` reads/writes are try/guarded like the sibling modules.
- **Architecture & Adherence:** Reused the existing collapse mechanism instead of inventing a parallel one — added shared `setSidebarCollapsed` / `isSidebarCollapsed` exports to `sidebar-panels.ts` (single owner of the collapsed flag) and had the resize module, the panel-icon click-to-hide, and the header toggle all route through them. Width is driven by one CSS custom property (`--app-sidebar-width`) — single source of truth — rather than duplicated literals.
- **Linter-Specific Integrity:** SKIPPED [A-NOT-IN-SCOPE] — not the saropa_lints project.
- **Performance & UI/UX:** Width transition is disabled during drag (`.app-sidebar-resizing`) so the sidebar tracks the pointer 1:1 instead of easing behind it. Handle is keyboard-operable (`role="separator"`, Arrow keys, Enter). When hidden, the handle widens 6→12px with a centered grip line so it stays discoverable. Resizer is `display:none` in the <=900px stacked layout where horizontal resize is meaningless.
- **Documentation Quality:** New `sidebar-resize.ts` carries a module header explaining the two-facts-stored-separately design; `_layout.scss` and `html_content.dart` comments explain why the handle stays in the row at zero width.
- **Refactoring:** No out-of-scope refactors performed.

### 4. Testing Validation
**A. Existing-test audit.** Grepped `test/` and `extension/src/test/` for the touched symbols (`tb-sidebar-toggle`, `app-sidebar`, `app-layout`, `app-sidebar-resizer`). Two tests pinned `id="tb-sidebar-toggle"`:
- `test/web_viewer_nl_modal_contract_test.dart` — updated to assert the toggle is **absent** and `id="app-sidebar-resizer"` is **present**.
- `extension/src/test/hamburger-menu.test.ts` — same: rewrote the "left sidebar toggle" case to "hides/shows via the drag bar".

**Runs:**
- `dart test test/web_viewer_nl_modal_contract_test.dart` → the sidebar contract test ("Single swappable sidebar…") **passes**. 2 failures in the SAME file are pre-existing and unrelated — they pin NL-mic symbols (`function stopNlMic`, NL modal shell) from a concurrent in-progress NL-query-wizard workstream, surfaced because rebuilding `bundle.js` regenerates from current (mid-development) source.
- `npm test` (extension) → 2701 passing; my updated sidebar assertion passes. 4 failures are pre-existing and unrelated: they require `data-tool="tables"`/`data-tool="search"` toolbar buttons, but those became `data-panel-btn` in the prior sidebar-consolidation commit (60e8b58) — not touched by this change.
- `npm run typecheck:web` → clean.
- `npm run build` → `bundle.js` + `style.css` regenerated; both contain the new resizer code/styles.

**B. New behavior.** Contract tests now pin the new shell (resizer present, collapse icon gone). The drag interaction itself is DOM/pointer behavior not covered by the existing static-asset contract tests; called out under "Not yet verified" for manual device check.

### 5. Localization
SKIPPED [A-NOT-IN-SCOPE for the Flutter ARB pipeline] — this is the Dart-package web viewer, not the Saropa Contacts Flutter app; there is no `app_en.arb` here. The one new user-facing string is `aria-label="Resize sidebar"` in the server-generated HTML. The established pattern for `html_content.dart` is inline English (26 inline `aria-label`s, zero `vt()`/l10n calls in that file); the web l10n overlay (`vt()`) operates at runtime on the bundle, not on this Dart-generated markup. The new aria-label follows the existing sibling pattern exactly.

### 6. Project Maintenance & Tracking
- CHANGELOG updated (Unreleased → Added: "Website: drag to resize the sidebar").
- README verified — no updates needed (no product-fact/count change).
- `package.json` / lockfiles — not a release/dependency change; untouched.
- guides reviewed — no user-facing guide affected.
- No bug archive — task did not close a `bugs/*.md` file.

### 7. Persist Finish Report
Finish report saved: plans/history/2026.06/2026.06.11/web-viewer-sidebar-resize.md

### 9. Files changed (this task)
- `lib/src/server/html_content.dart` — removed `#tb-sidebar-toggle` button; added `#app-sidebar-resizer`; updated doc header comment.
- `assets/web/_layout.scss` — sidebar width now `var(--app-sidebar-width, 300px)`; added resizer styles, collapsed-state widening + grip, resizing no-transition, narrow-viewport hide.
- `assets/web/sidebar-resize.ts` — NEW drag/keyboard resize controller.
- `assets/web/sidebar-panels.ts` — exported `setSidebarCollapsed`/`isSidebarCollapsed`; routed `togglePanel`/`toggleSidebarCollapsed` through them; removed dead `#tb-sidebar-toggle` wiring.
- `assets/web/state.ts` — added `APP_SIDEBAR_WIDTH_KEY`.
- `assets/web/app.js` — import + call `initSidebarResize()`.
- `assets/web/toolbar.ts` — updated comments (no collapse icon; resize bar owns hide/show).
- `assets/web/bundle.js`, `assets/web/style.css` — regenerated build artifacts.
- `test/web_viewer_nl_modal_contract_test.dart`, `extension/src/test/hamburger-menu.test.ts` — assertions updated for the resizer.
- `CHANGELOG.md` — Unreleased entry.

### Outstanding work
None for this task. Pre-existing unrelated failures (NL-mic wizard; data-tool tables/search) belong to other workstreams and are out of scope.
