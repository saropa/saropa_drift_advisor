# Saropa Drift Advisor -- Web UI Design Language

This document defines **how to organise, group, and present controls** so
the interface is immediately comprehensible. Token values (colours, spacing)
are secondary to the structural rules here -- get grouping right first,
then apply the palette.

Every SCSS partial and every HTML layout in `html_content.dart` must
conform to these rules. Deviations require a code comment citing this file.

---

## 1. The Compartment Principle

> **Controls that act on the same object live inside the same visual box.
> Controls that act on different objects must not share a box.**

A "visual box" is any bounded region: a card with a border, a fieldset
with a legend, a toolbar segment separated by a divider, or a distinct
background band. The user should never have to guess which controls
belong together.

### What this means in practice

- If a button operates on a dropdown's selection (Save, Delete, Export,
  Import for "Saved queries"), those controls and that dropdown must be
  inside a single bordered container with a visible label.
- If a control is unrelated (e.g. "Show as: Table/JSON"), it must not
  sit in the same row or container. A CSS gap alone is not enough --
  use a visual break (divider, different background, or separate container).

### Anti-patterns (current violations)

| Location | Problem |
|----------|---------|
| SQL panel row 2 | "Saved queries" dropdown + Save + Del + Export + Import sits in the same flat `div.sql-toolbar` as the unrelated "Show as" selector. Nothing visually groups the bookmark controls together or separates them from the format control. |
| SQL panel row 1 | Template + Table + Fields (query builder) shares the same toolbar with Run (execution) and History (recall). Three concerns, one flat row, no separation. |
| SQL panel row 3 | "Ask in English..." sits alone in its own toolbar row, wasting a full-width band for one button. It belongs with the query input area it targets. |
| ~~Tools toolbar~~ | Resolved: the toolbar row and FAB are replaced by a single hamburger menu on the tab bar. See section 4. |
| Pagination bar | Page nav, advanced offset toggle, row count, and sample button share one flat toolbar. |

---

## 2. Grouping Patterns

### 2a. Control Group (`.control-group`)

A bordered, labelled cluster of related controls.

```
+-- Saved Queries --------------------------+
| [dropdown v]  [Save] [Delete] [Export] [Import] |
+-----------------------------------------------+
```

Rules:
- **Always has a visible label** -- either a `<legend>` in a `<fieldset>`,
  or a heading/label pinned to the top-left of the group.
- **Visible border** at rest (not just on hover). Use `--border` token,
  opaque enough to read on the theme background.
- **Internal gap**: `--space-2` (8px) between controls within the group.
- **External margin**: `--space-4` (16px) minimum between adjacent groups.
- Buttons inside a group act on the group's primary control (the
  dropdown, the input, etc.). If a button doesn't act on that control,
  it doesn't belong in the group.

### 2b. Toolbar Section Divider

When groups share a single toolbar row (e.g. pagination), separate them
with a visible vertical divider:

```
[ < ] [ 1 ] [ 2 ] [ 3 ] [ > ]  |  Rows 1-50 of 200  |  [Sample]
```

- Divider: `1px solid var(--border)`, full height of the toolbar,
  with `--space-3` (12px) horizontal margin on each side.
- Each segment between dividers is a self-contained logical unit.

### 2c. Section Card

For feature-level compartments (the SQL editor, the snapshot tool,
the search panel), use a card with:
- Visible border and a distinct background from the page.
- A section heading identifying the tool.
- All of that tool's controls and output contained within the card.

---

## 3. The SQL Panel -- Target Layout

The current SQL panel is the worst offender. Here is the target
decomposition. Each numbered box is a visually distinct container.

```
+== Run SQL (read-only) ===============================================+
|                                                                       |
|  [1. QUERY BUILDER ]                                                  |
|  +-- Build Query ------------------------------------------------+   |
|  | Template: [dropdown v]  Table: [dropdown v]  Fields: [multi]  |   |
|  | [lock] [Apply template]                                       |   |
|  +---------------------------------------------------------------+   |
|                                                                       |
|  [2. EDITOR ]                                                         |
|  +---------------------------------------------------------------+   |
|  | SELECT * FROM "affirmations" LIMIT 10            [Run]        |   |
|  |                                                               |   |
|  +---------------------------------------------------------------+   |
|  [Ask in English...]   <-- positioned as a subtle link below editor   |
|                                                                       |
|  [3. HISTORY & BOOKMARKS ]  side by side                              |
|  +-- Recent History -------+  +-- Saved Queries ----------------+    |
|  | [dropdown v]            |  | [dropdown v]                    |    |
|  |                         |  | [Save] [Delete] [Export] [Import]|   |
|  +-------------------------+  +----------------------------------+    |
|                                                                       |
|  [4. RESULTS ]                                                        |
|  +-- Results  (10 rows) ----------- Show as: [Table v] ---------+    |
|  | id | version | text | focus | type_name                      |    |
|  | 1  | 1       | My focused work... | Focus | productivity_... |    |
|  | ...                                                           |    |
|  +---------------------------------------------------------------+    |
|                                                                       |
+======================================================================+
```

Key changes from current:
1. **Query builder** is its own bordered group. The user can see at a
   glance: "these controls build a template query."
2. **Editor + Run** are together. Run is the editor's action, not the
   template's. "Ask in English..." is a secondary entry point to the
   editor, placed near it.
3. **History and Bookmarks** are separate groups, side by side. Each
   has its own label. Bookmark actions (Save/Delete/Export/Import) are
   visually inside the bookmark group, not floating in a generic toolbar.
4. **"Show as"** moves into the results header because it controls
   result display, not query construction. It sits in the results
   container's title bar, right-aligned.

---

## 4. Navigation Hierarchy

The UI has **two** navigation surfaces:

```
Primary   — Tab bar         → where the user works (always visible)
Secondary — Hamburger menu  → everything else (tools, settings, preferences)
```

There is no dedicated toolbar row and no floating action button.
Every action that is not a tab lives behind one menu.

### 4a. Tab Bar -- Primary Navigation

The tab bar is the **only persistent navigation control**. It holds
the core views the user switches between constantly.

```
[☰]  [ Tables ]  [ Search ]  [ Run SQL ]  [ Snapshot × ]  [ DB diff × ]
 │    ---------- permanent ----------      ------ dynamic, closable ------
 hamburger
```

- Three **fixed tabs** (Tables, Search, Run SQL) are always present
  and cannot be closed. "Tables" is active on page load.
- **Dynamic tabs** appear when a tool is opened from the hamburger
  menu. They have a close button (`×`) and disappear when dismissed.
- The hamburger button is fixed to the **left edge** of the tab bar,
  visually distinct from the tabs (it opens a menu, not a panel).

### 4b. Hamburger Menu -- Secondary Actions

A single dropdown menu accessed from the hamburger button. It
consolidates **all non-tab actions** into one place: tool launchers
and app-wide settings.

**Design principles:**

- **Tools and settings in one menu, clearly separated.** Tool
  launchers (open a new tab) occupy the top of the menu. App-wide
  settings (toggle sidebar, cycle theme, mask data, share) occupy
  the bottom, below a heavy divider. The user never confuses
  "open a tool" with "change a setting".
- **Grouped by purpose, labelled for standalone comprehension.**
  Each tool group has a heading that makes sense without seeing
  the items beneath it. Headings like "Time Travel" fail this
  test -- prefer "Snapshots & Comparison". A user scanning the
  menu should understand each section's purpose from its heading
  alone.
- **No duplication.** If a view has a permanent tab, it must not
  also appear in the menu. The menu is for things that are not
  already one click away.
- **Dismisses on action, outside click, or Escape.** Opening a
  tool from the menu creates the tab and closes the menu. Settings
  toggles (theme, mask, sidebar) apply immediately without closing,
  so the user can adjust multiple settings in sequence.
- **Scales gracefully.** Adding a new tool means adding one menu
  item. No layout reflow, no responsive breakpoint concerns, no
  new toolbar buttons competing for horizontal space.

---

## 5. Colour Contrast

All text and interactive controls must meet **WCAG 2.1 AA** minimums:
- **Normal text** (< 18px / < 14px bold): **4.5 : 1** against background.
- **Large text** (>= 18px / >= 14px bold): **3 : 1** against background.
- **UI components** (borders, icons, focus rings): **3 : 1** against adjacent colour.

### Light theme current failures

| Token               | Current value              | On background | Ratio  | Required | Verdict |
|----------------------|----------------------------|---------------|--------|----------|---------|
| `--muted`            | `#6b7a9e`                  | `#f8faff`     | ~3.5:1 | 4.5:1    | FAIL    |
| `--border`           | `rgba(143,168,255,0.18)`   | `#ffffff`     | ~1.2:1 | 3:1      | FAIL    |
| `--border-subtle`    | `rgba(143,168,255,0.09)`   | `#ffffff`     | ~1.1:1 | 3:1      | FAIL    |
| Button borders       | `rgba(143,168,255,0.15)`   | `#ffffff`     | ~1.15:1| 3:1      | FAIL    |

### Target palette (light)

| Token               | New value     | On `#f8faff` | Ratio  |
|----------------------|---------------|--------------|--------|
| `--muted`            | `#556685`     | `#f8faff`    | ~5.2:1 |
| `--border`           | `#c2cde0`     | `#ffffff`    | ~1.8:1 opaque hairline |
| `--border-subtle`    | `#dce3f0`     | `#ffffff`    | ~1.4:1 zebra only |
| Button/input borders | `#a8b5cc`     | `#ffffff`    | ~2.3:1 visible at rest |

### Border rules

1. **Structural** (cards, panels, inputs, buttons): clearly visible at rest.
   Opaque values. Never `alpha < 0.35` on white.
2. **Decorative** (zebra stripes, subtle dividers): may be faint but never
   the only cue -- pair with background colour or spacing.

### All themes

Each theme must pass the same WCAG ratios. Test every token against
`--bg`, `--surface`, and `--bg-pre`. Use browser DevTools contrast
overlay before committing.

---

## 6. Spacing Scale

**4px base** geometric scale. No arbitrary values.

| Token          | Value   | Use for                                      |
|----------------|---------|----------------------------------------------|
| `--space-1`    | `0.25rem` (4px)  | Inline icon gaps, tight badge padding |
| `--space-2`    | `0.5rem`  (8px)  | Related controls within a group       |
| `--space-3`    | `0.75rem` (12px) | Between label and control; divider margin |
| `--space-4`    | `1rem`    (16px) | Between sibling groups in a section   |
| `--space-6`    | `1.5rem`  (24px) | Between sections on the same surface  |
| `--space-8`    | `2rem`    (32px) | Between major regions                 |
| `--space-12`   | `3rem`    (48px) | Page-level breathing room             |

### Rules

- **Same group, same gap.** Controls within a `.control-group` use
  `--space-2`.
- **Between groups, step up.** Adjacent `.control-group` containers:
  `--space-4` minimum.
- **Between sections, step up again.** Query builder to editor:
  `--space-6`. Editor to results: `--space-6`.
- **Containers pad inward at their hierarchy level:**
  - Inline controls: `--space-1` vertical, `--space-2` horizontal.
  - Groups: `--space-2` vertical, `--space-3` horizontal.
  - Cards/panels: `--space-4` vertical, `--space-6` horizontal.
  - Page regions: `--space-6` all sides minimum.

---

## 7. Typography Hierarchy

| Token         | Size      | Use                                         |
|---------------|-----------|---------------------------------------------|
| `--text-xl`   | 1.35rem   | Page title only (one per view)              |
| `--text-lg`   | 1.125rem  | Section headings inside panels              |
| `--text-base` | 1rem      | Body text, card descriptions                |
| `--text-sm`   | 0.875rem  | Buttons, table cells, labels                |
| `--text-xs`   | 0.75rem   | Badges, timestamps, secondary metadata      |
| `--text-min-readable` | 12px | Absolute floor -- nothing smaller    |

### Rules

- **One `--text-xl` per page.**
- **Group labels use `--text-xs` uppercase, `--muted` colour, `600` weight.**
  Same pattern as `.sidebar-section-title`. Consistent everywhere.
- **Monospace** (`--font-mono`) is for SQL, cell values, and code only.

---

## 8. Interactive States

Every clickable element must have four visible states:

| State          | Visual cue                                      |
|----------------|--------------------------------------------------|
| **Rest**       | Visible border or background differentiation     |
| **Hover**      | Border colour change OR background shift         |
| **Focus**      | `2px solid var(--link)` outline, `2px` offset    |
| **Disabled**   | `opacity: 0.5` + `cursor: not-allowed`           |

### Prohibited

- Buttons that look like plain text at rest.
- Hover-only opacity changes.
- `border: 1px solid transparent` on interactive elements.
- Labels like "Del" when "Delete" fits. Abbreviations that save 3
  characters but cost comprehension are not allowed.

---

## 9. Button Tiers

| Tier       | Class          | When to use                          |
|------------|----------------|--------------------------------------|
| Primary    | `.btn-primary`  | One per visual group (Run, Save, Apply) |
| Secondary  | `.header-btn`, `.hamburger-item`   | Contextual actions, menu items |
| Tertiary   | `.export-link`  | Low-priority or dense lists          |
| Danger     | `.btn-danger`   | Destructive actions only             |

- **Max one primary per visual group.**
- **Destructive buttons (Delete) must be visually distinct** -- either
  `.btn-danger` (red) or at minimum a red icon/text colour.
  Never the same style as Save/Export.

---

## 10. Card and Panel Rules

- Visible border at rest (not just on hover/expanded).
- Internal padding: `--space-4` vertical, `--space-6` horizontal.
- Card-to-card margin: `--space-4` minimum.
- Section heading inside card: always present, top-left, `--text-sm` bold.
  The user must be able to identify the card's purpose without reading
  its contents.

---

## 11. Data Table Rules

- Header row: background differentiation from body.
- Cell padding: `0.6rem 0.75rem` minimum.
- Pinned columns: visible right border.
- Alternating row colour must be visible, not calibration-dependent.
- **Result count and format selector** belong in the table's header bar,
  not in a separate toolbar above.

---

## 12. Motion

- Micro-interactions: `0.15s ease`.
- Panel expand/collapse: `0.2s ease`.
- Background animations: `>= 15s` cycle, low amplitude.
- **Always honour `prefers-reduced-motion: reduce`.**

---

## 13. Responsive Behaviour

| Breakpoint | Layout change                                    |
|------------|--------------------------------------------------|
| > 1100px   | Full labels on all toolbar buttons               |
| 901-1100px | Hide longest toolbar labels                      |
| 700-900px  | Hide medium labels; sidebar stacks above content |
| < 700px    | Icon-only toolbar; tighter padding               |

- Touch targets: `44px` minimum on `@media (pointer: coarse)`.
- Sidebar collapse must not reflow content.

---

## 14. Accessibility Checklist

Before merging any SCSS or layout change:

- [ ] Contrast checker on all four themes
- [ ] Tab through every interactive element -- focus ring visible?
- [ ] All buttons have accessible names (not just icons)?
- [ ] `prefers-reduced-motion` -- no animation?
- [ ] Touch targets >= 44x44px?
- [ ] 200% zoom -- no horizontal scroll on main content?
- [ ] Every control group has a visible label?
- [ ] Destructive actions visually differentiated?

---

## 15. File Organisation

| Partial               | Responsibility                              |
|-----------------------|---------------------------------------------|
| `_themes.scss`        | CSS custom property definitions per theme   |
| `_base.scss`          | Reset, type scale tokens, element defaults  |
| `_header.scss`        | App header bar                              |
| `_layout.scss`        | Two-column flex layout, sidebar/main split  |
| `_sidebar.scss`       | Sidebar sections, table list, pin buttons   |
| `_buttons.scss`       | All button tiers                            |
| `_hamburger-menu.scss`| Hamburger menu: trigger, dropdown, items    |
| `_tab-bar.scss`       | Tab navigation and panel containers         |
| `_cards.scss`         | Feature cards, export toolbar, icon setup   |
| `_data-table.scss`    | Data grid, pagination, cell actions, popups |
| `_sql-editor.scss`    | SQL panel: query builder, editor, bookmarks |
| `_theme-effects.scss` | Showcase/midnight glassmorphism and animation|

- One concern per file.
- No SCSS variables for colours -- CSS custom properties only.
- Compiled output is `style.css`. Never edit directly.

---

## 16. Theme Beautification -- Why The Themes Look Flat

The four themes are supposed to provide distinct visual identities. In
practice they all look nearly identical: white boxes on white (light /
showcase), dark boxes on dark (dark / midnight). The claimed glassmorphism
and animations are not visibly working. This section diagnoses why and
defines the target for each theme.

### 16a. Why Glassmorphism Is Invisible

Glassmorphism requires **three ingredients** working together:

1. **A colourful, moving background** behind the frosted surface.
2. **Semi-transparent surfaces** (`background: rgba(...)`) so the background
   bleeds through.
3. **`backdrop-filter: blur(...)`** to frost what bleeds through.

The current code has (2) and (3) but **(1) is broken** in both fancy themes:

| Theme     | Problem |
|-----------|---------|
| Showcase  | Background gradient uses near-white pastels (`#e0e7ff` to `#faf5ff` to `#fce7f3`). Frosting white over near-white produces no visible effect. The gradient shift animation moves imperceptible colours. |
| Midnight  | Background gradient uses near-identical dark navies (`#0a0d18` to `#111833` to `#0f1a2e` to `#151040`). Delta between stops is ~5-10 lightness units -- invisible to the eye. The "ambient orb" uses `rgba(143,168,255,0.08)` -- 8% opacity, invisible against dark backgrounds. |

**Fix:** The background must have enough colour range that frosted surfaces
*show something*. This means bolder gradient stops with at least 15-20%
lightness delta between them, and animated elements at >= 15% opacity.

### 16b. Theme Identity Targets

Each theme must be **immediately recognisable** without reading its name.
A user switching themes should see a dramatic visual change, not a subtle
tint shift.

#### Light -- Clean Professional

- **Personality:** Crisp, airy, confident. Think modern SaaS dashboard.
- **Background:** Solid `#f8faff` (keep current). No animation.
- **Surfaces:** Opaque white `#ffffff` with visible borders and
  multi-layer shadows for depth.
- **Accent:** Slate-blue `#435389`. Authoritative, not playful.
- **Key differentiator from Showcase:** No transparency, no blur,
  no animation. Clean edges, visible shadows, professional.
- **Target border colour:** Opaque `#c2cde0` (visible hairline on white).
- **Cards:** Visible border + layered shadow. On hover: deeper shadow +
  subtle lift (`translateY(-1px)`).
- **Buttons:** Solid backgrounds with visible borders at rest. No
  transparency. Shadow on hover for depth.

#### Dark -- GitHub-Style Dark

- **Personality:** Focused, low-distraction, high-contrast. The "get work
  done" theme.
- **Background:** `#141619` (keep current). No animation.
- **Surfaces:** `#1c1e21` with visible `#3e4043` borders.
- **Accent:** Blue `#58a6ff` (keep current -- GitHub style).
- **Key differentiator from Midnight:** No glow, no animation, no
  transparency. Clean edges, functional.
- **Cards:** `1px solid #3e4043` border visible at rest. On hover:
  border lightens to `#555`.
- **Buttons:** Visible `#3e4043` borders at rest. On hover: border
  lightens, subtle background shift.

#### Showcase -- Frosted Violet Glass

- **Personality:** Beautiful, premium, playful. The "show off" theme.
- **Background:** Animated gradient with **saturated** pastel stops --
  must be colourful enough that frosted surfaces visibly tint.
  Target stops: lavender `#c7d2fe`, pink `#fbc7d4`, peach `#fed7aa`,
  sky `#bae6fd`, back to lavender. These are 40-60% saturated, not
  the current 90-95% lightness near-whites.
- **Surfaces:** `rgba(255,255,255,0.45)` header, `rgba(255,255,255,0.35)`
  sidebar, `rgba(255,255,255,0.55)` cards. Lower opacity than current
  so the gradient shows through.
- **Blur:** `blur(20px) saturate(1.8)` -- stronger than current to
  create the characteristic frosted-glass diffusion.
- **Accent:** Violet `#6d28d9` (keep). Gradient primary buttons.
- **Key differentiator from Light:** You can see the colourful gradient
  moving behind every surface. Cards appear to float on coloured fog.
- **Expanded card rainbow border:** Keep the animated gradient mask
  border -- it works, it just needs the surrounding context to be
  more interesting.
- **Entrance animations:** Keep the fade/slide-in on cards and sidebar
  titles.

#### Midnight -- Deep Aurora Glow

- **Personality:** Dramatic, atmospheric, immersive. The "dark premium"
  theme. Should feel like looking through a window at a northern lights
  display, with the UI floating in front.
- **Background:** Animated gradient with **wider colour range**. Target
  stops: deep navy `#0a0e1a`, indigo `#1a1050`, deep teal `#0a2030`,
  dark purple `#200840`, back to navy. These have visible hue shifts,
  not the current monochrome navy.
- **Ambient orb:** Raise from `0.08` to `rgba(143,168,255,0.18)` minimum.
  Add a second orb in a warm colour (`rgba(167,139,250,0.12)`) drifting
  on a different cycle. The orbs should be *visible* -- the user should
  notice soft light moving behind the UI.
- **Surfaces:** `rgba(23,28,54,0.55)` header, `rgba(20,24,48,0.45)`
  sidebar, `rgba(30,35,65,0.50)` cards. Lower opacity than current.
- **Blur:** `blur(24px) saturate(1.5)` -- heavier blur for the deep
  glass effect.
- **Accent:** Periwinkle `#8fa8ff` (keep). Glow effects on hover.
- **Key differentiator from Dark:** Visible aurora movement behind
  surfaces. Glow halos on expanded cards and focused inputs.
  Translucent surfaces instead of opaque ones.
- **Expanded card:** Periwinkle glow pulse should be clearly visible:
  `box-shadow: 0 0 24px rgba(143,168,255,0.15)` minimum on expanded.
- **Input focus glow:** When a textarea or input gets focus, add a
  periwinkle glow ring: `box-shadow: 0 0 0 3px rgba(143,168,255,0.2)`.

### 16c. Animation Visibility Rules

- **Background gradients must shift through visibly different colours.**
  If you squint and the gradient looks like one solid colour, the stops
  are too close together.
- **Minimum opacity for ambient elements:** `0.15` for glowing orbs,
  `0.25` for shimmer effects. Below this they are invisible.
- **Animation speed:** Background shifts 18-25s (slow, ambient).
  Hover transitions 0.15-0.3s (responsive). Entrance animations
  0.3-0.5s (noticeable but not slow).
- **Entrance animations must start from a visibly different state:**
  `opacity: 0; translateY(12px)` minimum. The current `translateY(8px)`
  is too subtle at 60fps.
- **Stagger cascade for card lists:** Each card delays by `0.06s` more
  than the previous one. Apply via `animation-delay` on nth-child or
  inline `style` from Dart.

### 16d. Surface Depth System

Every theme needs a clear visual hierarchy of depth. Three levels:

| Level       | What                           | Light                  | Dark                  | Showcase                       | Midnight                        |
|-------------|--------------------------------|------------------------|-----------------------|--------------------------------|---------------------------------|
| **Ground**  | Page background                | `#f8faff` opaque       | `#141619` opaque      | Animated gradient              | Animated aurora gradient        |
| **Surface** | Cards, sidebars, panels        | `#ffffff` + shadow     | `#1c1e21` + border    | `rgba(255,255,255,0.55)` frosted | `rgba(30,35,65,0.50)` frosted |
| **Elevated**| Popups, modals, expanded cards | `#ffffff` + deep shadow| `#242628` + glow      | `rgba(255,255,255,0.7)` + shadow | `rgba(35,40,72,0.65)` + glow  |

The user must be able to distinguish all three levels at a glance.
This means:
- **Light/Dark:** Shadows do the work. Ground has no shadow. Surface
  has a subtle multi-layer shadow. Elevated has a deep shadow.
- **Showcase/Midnight:** Transparency does the work. Ground is the
  gradient. Surface frosts it at medium opacity. Elevated frosts it
  at higher opacity with added shadow/glow.

### 16e. Specific Token Targets by Theme

#### Light (no animation changes needed)

| Token | Current | Target | Why |
|-------|---------|--------|-----|
| `--border` | `rgba(143,168,255,0.18)` | `#c2cde0` | Opaque, visible hairline |
| `--border-subtle` | `rgba(143,168,255,0.09)` | `#dce3f0` | Visible zebra stripe |
| `--muted` | `#6b7a9e` | `#556685` | WCAG AA on white |
| `--bg-pre` | `#ffffff` | `#ffffff` | Keep -- depth comes from shadow |
| Feature card shadow | Current 3-layer | Strengthen bottom layer to `rgba(0,0,0,0.06)` | Visible lift off background |

#### Dark (no animation changes needed)

| Token | Current | Target | Why |
|-------|---------|--------|-----|
| `--border` | `#3e4043` | `#4a4d52` | Slightly lighter for visibility |
| `--border-subtle` | `#2d2f33` | `#363840` | Visible but subtle |
| `--muted` | `#b0b3b8` | Keep | Already passes AA |
| Feature card border | `1px solid #3e4043` | `1px solid #4a4d52` | Visible at rest |

#### Showcase (animation + transparency changes)

| Element | Current | Target | Why |
|---------|---------|--------|-----|
| Body gradient stops | `#e0e7ff, #faf5ff, #fce7f3, #dbeafe, #ede9fe` | `#c7d2fe, #fbc7d4, #fed7aa, #bae6fd, #c7d2fe` | Colourful enough to see through frost |
| Header bg | `rgba(255,255,255,0.55)` | `rgba(255,255,255,0.45)` | More bleed-through |
| Sidebar bg | `rgba(255,255,255,0.42)` | `rgba(255,255,255,0.35)` | More bleed-through |
| Card bg | `rgba(255,255,255,0.6)` | `rgba(255,255,255,0.50)` | More bleed-through |
| Blur strength | `blur(18px)` header | `blur(20px) saturate(1.8)` | Stronger frost |
| `--border` | `rgba(143,168,255,0.18)` | `rgba(255,255,255,0.5)` | White frost edge, visible on pastel bg |
| Card hover shadow | Current subtle | `0 8px 32px rgba(99,102,241,0.12)` | Visible float |

#### Midnight (animation + transparency changes)

| Element | Current | Target | Why |
|---------|---------|--------|-----|
| Body gradient stops | `#0a0d18, #111833, #0f1a2e, #151040, #0e1528` | `#0a0e1a, #1a1050, #0a2030, #200840, #0a0e1a` | Visible hue variation |
| Orb opacity | `rgba(143,168,255,0.08)` | `rgba(143,168,255,0.18)` | Actually visible |
| Second orb | None | `rgba(167,139,250,0.12)`, offset cycle | Depth, movement |
| Header bg | `rgba(23,28,54,0.65)` | `rgba(20,25,50,0.55)` | More aurora bleed |
| Sidebar bg | `rgba(30,34,54,0.5)` | `rgba(20,24,48,0.45)` | More aurora bleed |
| Card bg | `rgba(35,40,72,0.55)` | `rgba(28,33,62,0.50)` | More aurora bleed |
| Blur strength | `blur(20px)` header | `blur(24px) saturate(1.5)` | Heavier frost |
| Expanded card glow | `0 0 30px rgba(143,168,255,0.08)` | `0 0 24px rgba(143,168,255,0.15)` | Visible halo |
| Input focus | Blue box-shadow only | Add `0 0 0 3px rgba(143,168,255,0.2)` | Glow ring |

### 16f. Per-Theme Violations

| # | Theme | Current | Rule broken | Fix |
|---|-------|---------|-------------|-----|
| TH1 | Showcase | Background gradient near-white, invisible | Theme Identity (16b) | Saturated pastel stops per 16e |
| TH2 | Showcase | Surface opacity too high (0.55-0.6) | Glassmorphism (16a) | Lower to 0.35-0.50 |
| TH3 | Showcase | `--border` same as light theme | Theme Identity (16b) | White frost edge `rgba(255,255,255,0.5)` |
| TH4 | Midnight | Background gradient monochrome navy | Theme Identity (16b) | Wider hue range per 16e |
| TH5 | Midnight | Orb at 8% opacity | Animation Visibility (16c) | Minimum 18% |
| TH6 | Midnight | No second orb | Theme Identity (16b) | Add warm-toned orb on offset cycle |
| TH7 | Midnight | Surface opacity too high | Glassmorphism (16a) | Lower to 0.45-0.55 |
| TH8 | Midnight | Expanded card glow invisible | Animation Visibility (16c) | `0.15` minimum glow opacity |
| TH9 | Light | Borders invisible (`rgba` < 0.2) | Contrast (5) | Opaque `#c2cde0` |
| TH10 | Light | No visible surface depth | Depth System (16d) | Strengthen card shadows |
| TH11 | Dark | Borders blend into background | Contrast (5) | Lighten to `#4a4d52` |
| TH12 | All | Card entrance `translateY(8px)` too subtle | Animation Visibility (16c) | `translateY(12px)` |
| TH13 | All | No stagger on card cascade | Animation Visibility (16c) | `0.06s` nth-child delay |

---

## Appendix A: Current Violations Audit

Every item below maps a current UI element to the rule it breaks and the
concrete fix. Checked off as each is resolved.

### Tools Toolbar

| # | Current state | Rule broken | Fix |
|---|---------------|-------------|-----|
| T1 | 12 buttons at identical size, no grouping | Compartment (1) | Add vertical dividers between groups: Navigation (Tables, Search) / Time-travel (Snapshot, DB diff) / Analysis (Index, Size, Perf, Health) / Structure (Schema, Diagram) / Data I/O (Import, Export). |
| T2 | All buttons same visual weight | Button Tiers (9) | Navigation group buttons get a bolder or tinted treatment to signal "you are here" vs "open a tool". |
| T3 | `gap: 0.5rem` uniform | Spacing (6) | Intra-group: `--space-1` (4px). Inter-group: `--space-3` (12px) + divider. |

Files: `html_content.dart` (group wrappers), `_buttons.scss` (divider styles), `_toolbar-responsive.scss` (collapse behaviour).

### SQL Panel -- Query Builder Row

| # | Current state | Rule broken | Fix |
|---|---------------|-------------|-----|
| S1 | Template / Table / Fields / Lock / Apply template share a row with Run and History | Compartment (1) | Bordered "Build Query" group for template controls. Move Run to editor. Move History to its own group. |
| S2 | "Apply template" ambiguous | Labels (8) | Rename to "Insert template" or remove (redundant when lock is on). |
| S3 | `<select multiple>` for Fields -- no selection feedback | Usability | Replace with dropdown showing selected count. Lower priority. |

Files: `html_content.dart` lines 289-307, `_sql-editor.scss`.

### SQL Panel -- Bookmarks Row

| # | Current state | Rule broken | Fix |
|---|---------------|-------------|-----|
| S4 | Bookmark controls + unrelated "Show as" in one flat toolbar | Compartment (1) -- worst violation | Wrap bookmarks in bordered "Saved Queries" group. Move "Show as" to results header. |
| S5 | "Del" instead of "Delete" | Labels (8) | Rename. |
| S6 | "Save" -- save what? | Labels (8) | Context becomes clear once inside "Saved Queries" group. |
| S7 | "Export" / "Import" -- same words as toolbar data export | Labels (8) | Inside the group, context is clear. Add download/upload icons to reinforce. |
| S8 | Delete styled identically to Save | Button Tiers (9) | Use `.btn-danger` or red text/icon. |
| S9 | No visual separation from "Show as" | Compartment (1) | "Show as" moves to results header. |

Files: `html_content.dart` lines 308-317, `_sql-editor.scss`.

### SQL Panel -- Ask in English Row

| # | Current state | Rule broken | Fix |
|---|---------------|-------------|-----|
| S10 | Alone in a full-width toolbar row | Spacing (6) | Move below the SQL textarea as a subtle link or secondary button. |

Files: `html_content.dart` line 318-319, `_sql-editor.scss`.

### SQL Panel -- Editor Area

| # | Current state | Rule broken | Fix |
|---|---------------|-------------|-----|
| S11 | Run button is in query builder toolbar, not near the textarea | Compartment (1) | Move Run adjacent to textarea (floating top-right or slim bar below). |
| S12 | Textarea border invisible in light theme | Contrast (5) | Inherits from `--border` fix. |

Files: `html_content.dart`, `_sql-editor.scss`.

### SQL Panel -- Results Area

| # | Current state | Rule broken | Fix |
|---|---------------|-------------|-----|
| S13 | "Show as" detached in toolbar above | Compartment (1) | Move into results header bar. |
| S14 | Row count floats loosely above table | Data Table (11) | Incorporate into results header. |
| S15 | Chart controls appear without a container | Compartment (1) | Wrap in results container. |

Files: `html_content.dart` lines 315-316/340-342, `_sql-editor.scss`.

### Tab Bar

| # | Current state | Rule broken | Fix |
|---|---------------|-------------|-----|
| TB1 | Inactive text uses `--muted` on white -- ~3.5:1 | Contrast (5) | Inherits from `--muted` palette fix. |
| TB2 | Close button invisible until hover | States (8) | Show at `opacity: 0.4` at rest. |

Files: `_themes.scss`, `_tab-bar.scss`.

### Pagination Bar

| # | Current state | Rule broken | Fix |
|---|---------------|-------------|-----|
| P1 | Page nav + offset + count + Sample in one flat toolbar | Compartment (1) | Add dividers between groups. |
| P2 | "Advanced" toggle is borderless text | States (8) | Visible border or background. |

Files: `html_content.dart` lines 227-248, `_data-table.scss`.

### Header Bar

| # | Current state | Rule broken | Fix |
|---|---------------|-------------|-----|
| H1 | Masthead status button has `background: none; border: none` | States (8) | Pill/badge style. |
| H2 | Header buttons nearly invisible in light theme | Contrast (5) | Inherits from border palette fix. |

Files: `_masthead.scss`, `_themes.scss`, `_header.scss`.

### Sidebar

| # | Current state | Rule broken | Fix |
|---|---------------|-------------|-----|
| SB1 | Labels use `--muted` | Contrast (5) | Inherits from palette fix. |
| SB2 | Pin button invisible until hover | States (8) | Rest opacity `0.3`. |

Files: `_sidebar.scss`, `_themes.scss`.

### Global: Contrast Tokens

| # | Token | Current | Target |
|---|-------|---------|--------|
| C1 | `--muted` (light) | `#6b7a9e` | `#556685` |
| C2 | `--border` (light) | `rgba(143,168,255,0.18)` | `#c2cde0` |
| C3 | `--border-subtle` (light) | `rgba(143,168,255,0.09)` | `#dce3f0` |
| C4 | Light button borders | `rgba(143,168,255,0.15)` | inherit `--border` or `#a8b5cc` |
| C5 | Showcase/midnight | Various low-alpha | Per-theme audit needed |

Files: `_themes.scss`, `_header.scss`, `_cards.scss`, `_tables-browse.scss`, `_fab.scss` (remove per-theme rgba overrides).

### Global: Spacing Tokens

| # | Current state | Fix |
|---|---------------|-----|
| SP1 | No spacing tokens; raw rem everywhere | Add `--space-*` to `:root` in `_base.scss`. |
| SP2 | `.sql-toolbar` gap `0.5rem` for all rows | `--space-2` within groups, `--space-4` between. |
| SP3 | Card padding `0.85rem 1.25rem` | `--space-4` vertical, `--space-6` horizontal. |
| SP4 | Toolbar `gap: 0.5rem` | `--space-1` within groups, `--space-3` between + dividers. |

Files: `_base.scss`, then migrate all partials incrementally.

### Implementation Priority

1. **Contrast tokens** (C1-C5) -- highest impact, lowest risk, no layout changes.
2. **Theme beautification** (TH1-TH13) -- most visible improvement; fixes the
   "all themes look the same" problem and makes glassmorphism/animations actually
   work. Do alongside or immediately after contrast tokens since both touch
   `_themes.scss` and `_theme-effects.scss`.
3. **SQL panel compartmentalisation** (S1, S4-S15) -- worst UX pain point.
4. **Toolbar grouping** (T1-T3) -- visual dividers, no reflow.
5. **Spacing tokens** (SP1-SP4) -- systematic, benefits everything.
6. **Interactive state fixes** (H1, TB2, P2, SB2) -- small targeted fixes.
7. **Label fixes** (S2, S5-S7) -- do alongside compartment work.
