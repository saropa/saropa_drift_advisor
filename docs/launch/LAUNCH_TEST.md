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
