# Launch Test Checklist

Manual, on-device/in-editor checks for user-facing features that automated tests cannot fully
cover (webview rendering, theme variants, cross-extension interaction). Run these in a real VS Code
window against a running Drift debug server.

## Saropa Suite integration (plan 67)

### Drift Health panel
- [ ] Run **Saropa Drift Advisor: Open Drift Health (Suite)**. The panel groups findings by table,
      with Advisor / Lints / Log Capture columns. Tables order by finding count.
- [ ] Severity filter (All / Errors / Warnings / Info) and the sort control work; cards/columns with
      no matching findings hide when filtered.
- [ ] A finding captured at a different commit shows a dimmed **stale** badge; a same-commit finding
      does not.
- [ ] A table-scoped finding shows a fix button only when the target command is installed; clicking
      it performs the action.

### Suite Findings dashboard widget
- [ ] Add the **Suite Findings** widget from the dashboard widget picker. It shows total / error /
      warning / per-tool counts, and an **Open Drift Health** button that opens the panel.
- [ ] With no findings it shows the clean state; with the server down it shows zero, not an error.

### Commit Timeline
- [ ] Run **Saropa Drift Advisor: Open Commit Timeline (Suite)** after a few debug sessions across
      commits. Rows are newest-first with a per-commit severity bar, per-tool counts, a current-commit
      badge, and a +/- delta versus the previous commit.

### Per-table deep links
- [ ] Click **View Table Data** on a table in the Database tree — the panel opens focused on that
      table (not the default view).
- [ ] `openSchemaForTable` (or a sibling deep-link) centers/highlights the table in the ER diagram.

### Cross-tool suggestions
- [ ] In a project whose `pubspec.yaml` depends on `saropa_lints` or `saropa_log_capture` without the
      matching extension installed, activation offers to install it once; dismissing it does not
      re-prompt on the next window.

## Visual design audit (R4 — still pending)
- [ ] **Drift Health, Commit Timeline, and Suite Findings panels render correctly in:** light, dark,
      and high-contrast themes; dyslexia-friendly font; RTL editor locale. Check contrast (WCAG AA),
      no overflow/misalignment at narrow and wide widths, and visible keyboard focus on all controls.
      This is the one manual check the code-level work could not self-verify headless.

## Database sidebar toolbar + table grouping

### Group tables by name
- [ ] Open the **Database** sidebar (left activity bar). Grouping is **on by default**: tables that
      share an entity stem appear under **expanded** group nodes — e.g. a **contact** group holding
      `contact_avatars`, `contact_groups`, etc., a **checklist** group, and so on. A plural base table
      joins its own group (`contacts` sits inside the **contact** group; `addresses` would sit with
      `address_lat_longs`). Tables with no mate (e.g. `activities`) stay flat.
- [ ] Click the **flat-list icon** in the header to switch to the ungrouped list; the **tree icon**
      switches back to groups.
- [ ] A group lists its member tables alphabetically; each table still expands to its columns +
      foreign keys.
- [ ] Reload the window — the grouped/flat choice is remembered (per workspace), and groups reopen
      expanded.
- [ ] Pin a table while grouped: it appears flat under **Pinned** at the top, not inside a group.

### Reorganized toolbar
- [ ] Inline header buttons are: Refresh, group toggle, Dashboard, Health Score, Ask in English
      (sparkle icon), Tools.
- [ ] The `…` overflow menu groups the rest into labeled sections separated by dividers: Explore
      (Open in Browser, DVR, Bookmarks, ER Diagram, Schema Docs), Data (Global Search, Import
      Dataset, Snippet Library, Isar→Drift, Branches), Quality (Suggest Refactorings, Invariants,
      Export Report, Clear Annotations), About (About Saropa, Add Package).
- [ ] When disconnected, the connection-gated buttons hide; Refresh, group toggle, and Tools remain.

## Dashboard panels — design-token theming + widget fixes

### Consistent, theme-aware colors across panels
- [ ] Open the **Dashboard**, **Health Score**, **Anomalies**, and **Invariants** panels. Health
      grades (A–F), severity badges, and pass/fail status now draw from the editor theme — switch
      between a light, a dark, and a high-contrast theme and confirm every status color stays
      legible (no washed-out or invisible text) and follows the theme rather than a fixed color.
- [ ] Export the **HTML report** (Tools → Export Report) and open it in a browser. The accent is
      Saropa orange (not the old blue); toggle the report's light/dark switch and confirm surfaces,
      text, and anomaly colors read correctly in both.
- [ ] Open the **Query Cost**, **Explain Query Plan**, **Schema Diff**, **Time-Travel**, **Snapshot
      Diff**, **Drift Health**, **Commit Timeline**, **Mutation Stream**, **Profiler**, **Constraint
      Wizard**, **Isar Gen**, **Branching**, and **Seeder** panels in a **light** theme. The
      green/amber/red status markers (index-search vs full-scan badges, added/removed/changed diff
      rows, health dots, timeline segments) now follow the editor theme — confirm they are legible on
      a light background (previously they used fixed dark-theme colors and washed out in light mode).
- [ ] Export **Schema Documentation** (Tools → Generate Schema Docs) and open it with the OS in dark
      mode. The doc now follows the OS color scheme (dark surfaces, light text) and uses the Saropa
      orange accent — it previously rendered a fixed indigo light palette regardless of OS theme.

### Feature discovery buttons look like buttons
- [ ] Open the **Dashboard**; the "Explore Drift Advisor" card's category actions (Schema Diff,
      Health Score, Seed Data, …) render as bordered buttons, not plain text links, in every theme.
- [ ] Secondary buttons across other panels (SQL Notebook, Snippet Library, Query Builder,
      Refactoring, Bulk Edit) remain visibly button-shaped on a theme with no secondary-button color.

### Row Count and Table Preview widgets
- [ ] Add a **Row Count** widget (Dashboard → Add Widget → Row Count → pick a table). It shows the
      numeric count, never "NaN". Point it at an empty table — it shows 0.
- [ ] Add a **Table Preview** widget for a populated table. It shows column headers and cell values
      (not blank cells).

## Icon font offline / degraded-mode verification (bugs 081, 084)

Three claims the automated test suite cannot prove — they require a real browser
rendering the real page. Budget: ~10 minutes.

### 1. Icons degrade gracefully when the font is blocked (~3 min)

This confirms the `icons-unavailable` CSS path fires and that every toolbar
button remains usable without the icon font.

1. Open the viewer in Chrome (any page with a Drift debug server).
2. Open DevTools → Network tab → click the **Block request URL** filter.
3. Add a pattern: `*fonts.g*` (blocks both `fonts.googleapis.com` and
   `fonts.gstatic.com`).
4. Hard-refresh (Ctrl+Shift+R).
5. **Expected:** every toolbar button shows a text label (Home, Tables,
   Search, SQL, …) or a small bullet marker (●) instead of the icon glyph.
   No button is invisible or an empty box. The `<html>` element has class
   `icons-unavailable` (check in Elements panel).
6. Click at least three toolbar buttons. Each must respond normally — the
   degraded state never disables a control.
7. Remove the request block, hard-refresh, and confirm icons return.

### 2. Close buttons identify their tab to a screen reader (~3 min)

This confirms the bug 084 restructure did not break accessible names.

1. With the viewer open, open at least two table tabs (click two different
   tables in the sidebar).
2. Open the **Accessibility** panel in DevTools (Elements → Accessibility tab
   in the sidebar, or the dedicated panel).
3. Click each tab's close button (the × beside the tab name).
4. **Expected:** each close button shows an accessible name that includes the
   table name — e.g. "Close users", "Close orders" — not a bare "Close tab"
   repeated for every button.
5. Each tab button shows `role: tab` and `aria-selected: true/false`.

### 3. Pin buttons are distinguishable and reflect state (~3 min)

1. In the Tables sidebar, pin one table (click the pin icon).
2. Inspect the pin button in the Accessibility panel.
3. **Expected (pinned):** `role: button`, `aria-pressed: true`, accessible
   name includes "Unpin".
4. **Expected (unpinned):** `aria-pressed: false`, name includes "Pin".
5. The pin button is a SIBLING of the table link (not nested inside it).
   In the Elements panel, both `<a>` and `<button class="table-pin-btn">`
   are direct children of the same `<li>`.
