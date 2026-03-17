# Saropa Drift Adviser — UI Redesign Plan

Plan to evolve the web viewer from a functional but visually flat interface into a clear, modern, and pleasant UI while keeping the same capabilities and CDN-based asset delivery.

**Implementation status:** Complete. Phases 1–4 implemented, including Phase 4.1 icons via Google Material Symbols Outlined (CDN). Feature headers, Theme/Share buttons, and export links use icon + text; expand/collapse arrow is CSS ::before. See CHANGELOG and `bugs/history/20260317/027-ui-redesign-complete.md`.

---

## Current state (summary)

- **HTML** (`lib/src/server/html_content.dart`): Single long page; everything in one flow. Header is an `<h1>` with inline buttons (Theme, Share, Polling, Live). Export options are a single paragraph of links. Feature list is many `.collapsible-header` / `.collapsible-body` pairs; table list is a plain `<ul id="tables">`.
- **CSS** (`assets/web/style.css`, source `assets/web/style.scss`): System font, basic light/dark variables, minimal spacing, flat buttons, no typographic scale, no cards or surfaces, no icons. Good foundations (variables, focus, connection banner) but no visual hierarchy or “product” feel.
- **JS** (`assets/web/app.js`): Renders table list as `<li><a>table (n rows)</a></li>`; collapsibles toggle `.collapsed` and arrow (▼/▲). No layout or structure changes required for a visual-only redesign.

---

## Goals

1. **Clear hierarchy** — Header, primary actions, and navigation read as distinct from content.
2. **Scannable layout** — Features and table list easy to scan; export and tools feel like actions, not wall-of-text.
3. **Consistent components** — Buttons, inputs, cards, and links share a small design system.
4. **Refined aesthetics** — Typography, color, and spacing that feel intentional and professional, not default.
5. **Preserve behavior** — No change to URLs, APIs, or JS logic beyond class names / markup where needed for new styles.

---

## Phase 1: Layout and header

**Objective:** Introduce semantic layout and a proper app header so the page doesn’t feel like one long document.

### 1.1 Semantic structure (HTML)

- Wrap the top bar in `<header class="app-header">`: title, version badge, Theme, Share, Polling, Live. Keep existing IDs for JS.
- Optionally wrap “Run SQL”, search bar, export line, and feature list in `<main class="app-main">` and use a wrapper for the left column content if moving to a two-column layout later.
- Keep `<ul id="tables">` and `<div id="content">` as-is for now; we can move them into a sidebar in Phase 3.

**Files:** `lib/src/server/html_content.dart`

### 1.2 Header styling (CSS)

- **Sticky header:** `position: sticky; top: 0; z-index: 100; background: var(--bg); border-bottom: 1px solid var(--border);` (or a dedicated `--header-bg` for slight elevation).
- **Layout:** Flexbox or grid: left = “Saropa Drift Adviser” + version; right = Theme, Share, Polling, Live. Consistent padding (e.g. 1rem 1.5rem) and vertical alignment.
- **Title:** Slightly larger font size (e.g. 1.35rem), font-weight 600. Version badge: smaller, `var(--muted)`.
- **Header actions:** Style as small buttons (padding, border-radius, hover state). “Live” and “Polling: ON” can look like pills or badges; keep green for Live.
- **Body:** Add `padding-top` or ensure first element under the header has enough margin so content doesn’t sit under the sticky bar.

**Files:** `assets/web/style.css` (and `style.scss` if that’s the source of truth)

### 1.3 Export line

- Replace the single `<p class="meta">` full of links with a short **export toolbar**: e.g. “Export:” followed by icon+text or text buttons for “Schema”, “Full dump”, “Database”, “Table CSV”. Use a small gap and optional separator (e.g. `|` or margin) so it reads as one control strip, not a paragraph.
- Style as secondary actions (e.g. `color: var(--muted);` with hover to `var(--link)`), or as small outlined buttons.

**Files:** `html_content.dart`, `style.css` / `style.scss`

---

## Phase 2: Typography, color, and components

**Objective:** Define a simple design system so the whole page feels cohesive and intentional.

### 2.1 Typography

- **Font stack:** Keep `system-ui` as fallback but add a primary font (e.g. “DM Sans”, “Inter”, or “Source Sans 3” from Google Fonts, or a system stack like `ui-sans-serif, system-ui, sans-serif`). Load one webfont in `<head>` if needed.
- **Scale:** Define a small type scale in CSS variables, e.g. `--text-xs`, `--text-sm`, `--text-base`, `--text-lg`, `--text-xl` (sizes and optionally line-heights). Use these for body, meta, labels, and headings.
- **Headings:** Use the scale for `.collapsible-header` and any new section titles so hierarchy is clear (e.g. section headers 1rem, page title 1.35rem).

**Files:** `html_content.dart` (optional `<link>` for font), `style.css` / `style.scss`

### 2.2 Color and surfaces

- **Surfaces:** Add variables if needed, e.g. `--surface` or `--card-bg` slightly different from `--bg` (e.g. dark theme: `#252525` vs `#1a1a1a`) for cards and dropdowns.
- **Borders:** Keep `--border`; optionally add `--border-subtle` for dividers.
- **Links and actions:** Keep `--link`; ensure buttons use the same accent or a “primary” variant (e.g. filled button for “Run”, “Analyze”) and “secondary” (outline or muted) for “Share”, “Export schema”, etc.
- **Contrast:** Ensure focus rings and active states meet accessibility; keep existing `.highlight` and `.highlight-active` for search.

**Files:** `style.css` / `style.scss`

### 2.3 Buttons and inputs

- **Primary buttons** (e.g. Run, Analyze, Take snapshot): Background `var(--link)` or a dedicated `--btn-primary-bg`, white text, padding e.g. 0.5rem 1rem, border-radius 6px, hover darken/lighten.
- **Secondary/outline:** Border `var(--border)`, background transparent or `var(--bg-pre)`, same padding/radius.
- **Small actions:** Same style at smaller font/padding for “Share”, “Del”, “Prev”, etc.
- **Inputs and selects:** Consistent height, padding, border, border-radius; focus ring. Reuse or extend existing `.search-bar input/select/button` and `.sql-runner` styles so all toolbars feel the same.

**Files:** `style.css` / `style.scss`

### 2.4 Collapsible sections as cards

- Wrap each feature block (header + body) in a **card** container: e.g. `<div class="feature-card">` containing the existing `.collapsible-header` and `.collapsible-body`.
- Card style: `background: var(--surface)` or `var(--bg-pre)`, `border: 1px solid var(--border)`, `border-radius: 8px`, padding (e.g. 0.75rem 1rem), margin-bottom 0.75rem. Optional light shadow in light theme.
- **Collapsible header:** Slightly bolder, same link color; optional left border or icon to show it’s clickable. Arrow ▼/▲ can stay or be replaced later with a chevron icon.
- **Expanded state:** Optional: when `.collapsible-body` is not `.collapsed`, add a class to the card (e.g. `.feature-card.expanded`) for a stronger border or background so the open section is obvious.

**Files:** `html_content.dart` (add wrapper divs and/or classes), `style.css` / `style.scss`, optionally `app.js` if we add `.expanded` on the card when opening.

---

## Phase 3: Navigation and table list

**Objective:** Make features and tables easier to scan and navigate without changing URLs or hash behavior.

### 3.1 Two-column layout (optional)

- **Left column (sidebar):** Search bar, export toolbar, then feature list (collapsible headers), then table list. Fixed or sticky so it stays visible while scrolling the main content.
- **Right column (main):** SQL runner (when expanded), `#content` (table view, schema, diagram, etc.), and any in-page results. This matches the mental model “pick feature or table on the left, see content on the right.”
- **Implementation:** CSS Grid or Flexbox on a wrapper: e.g. `grid-template-columns: 280px 1fr` with min-width on the sidebar. On narrow viewports, stack (sidebar above main) or collapse sidebar to a drawer.
- **Tables list:** Give `#tables` a clear heading (“Tables”) and style list items as small cards or rows (name + row count) with hover and active state (e.g. when `location.hash` matches). Reuse `--link` and optionally an “active” background for the current table.

**Files:** `html_content.dart` (wrapper structure), `style.css` / `style.scss`, optionally `app.js` to set an “active” class on the current table link from hash/loadTable.

### 3.2 Table list styling

- Each table: `display: block` or flex; padding 0.35rem 0.5rem; border-radius 4px; hover background. Current table: e.g. `background: var(--highlight-bg)` or a subtle `--link` tint so the blue “selected” state is clear.
- Row count: keep “(n rows)” in muted, smaller font so the table name stands out.

**Files:** `style.css` / `style.scss`, optionally `app.js` (set `aria-current="true"` or class on the active table link).

---

## Phase 4: Polish and optional extras

**Objective:** Small improvements that increase clarity and perceived quality.

### 4.1 Icons (optional)

- Add a small set of SVG icons (inline or sprite) for: Run SQL, Snapshot, Diff, Index, Size, Performance, Data health, Import, Schema, Diagram, Theme, Share, Export. Use them in headers or next to labels so sections are scannable at a glance.
- Keep text labels; icons are supplementary. Ensure icon+text is still readable with increased tap/click target (see bug 010).

### 4.2 Micro-interactions

- Subtle transitions on collapsible expand/collapse (e.g. `max-height` or opacity on `.collapsible-body`).
- Button hover/active states already partially present; ensure all primary/secondary buttons have a clear hover and focus state.
- Copy toast already exists; keep as-is or slightly refine position and animation.

### 4.3 Connection banner and accessibility

- Keep connection banner styling; ensure it still sits above everything and is readable.
- Preserve existing focus styles and `.sr-only`; add visible focus rings where missing (e.g. header buttons, export links).
- Ensure new layout is keyboard-navigable and that “Skip to main content” is unnecessary or added if we add a lot of nav.

---

## File checklist

| File | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|---------|---------|---------|---------|
| `lib/src/server/html_content.dart` | Header + export structure, optional `<main>` | — | Wrapper + sidebar structure, feature cards | Optional icon markup |
| `assets/web/style.css` / `style.scss` | Header, export bar | Type scale, colors, buttons, cards | Grid/flex layout, table list, active state | Icons, transitions, focus |
| `assets/web/app.js` | — | Optional `.expanded` on card | Optional active class on table link | — |

---

## Out of scope (for this plan)

- Changing CDN delivery or moving to a different build (e.g. bundler). Keep loading `style.css` and `app.js` from jsDelivr.
- New features (e.g. keyboard shortcuts, more export formats). Only UI/styling and structural markup.
- Backend or API changes.

---

## Success criteria

- Header is clearly separated and sticky; primary actions are easy to find.
- Export options look like a toolbar, not a paragraph.
- Feature sections look like cards with clear expand/collapse.
- Table list is easy to scan and the current table is visually indicated.
- Light and dark themes both look intentional and consistent.
- No regressions in behavior (navigation, search, SQL run, exports, collapsibles).

This plan can be implemented incrementally: Phase 1 and 2 give the biggest visual gain with minimal structural change; Phase 3 improves navigation; Phase 4 is optional polish.
