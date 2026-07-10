/**
 * Hub chrome CSS — the hero, two-pane preview grid, collapsible category
 * sections, launcher tiles, and guidance notes. Deliberately NOT scoped: these
 * classes are unique to the hub and each pane's stylesheet is scoped under
 * `.pane-*` (see webview-scope-css.ts), so there is nothing to collide with.
 *
 * Colors come from VS Code theme variables and the injected Saropa tokens
 * (`--brand`, `--status-bad`); `color-mix` blends an accent without hardcoding a
 * hex, so the result tracks the active theme.
 */
export function hubChromeCss(): string {
  return `
:root { color-scheme: light dark; }
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
  background: var(--vscode-editor-background); margin: 0; padding: 16px; }
svg { display: block; width: 100%; height: 100%; }

.hub-hero { display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 16px 18px; margin-bottom: 14px; border-radius: 10px;
  border: 1px solid var(--vscode-widget-border);
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--brand) 16%, transparent),
    color-mix(in srgb, var(--brand-2) 6%, transparent)); }
.hub-hero h1 { margin: 0; font-size: 18px; font-weight: 600; }
.hub-hero p { margin: 4px 0 0; font-size: 12px; opacity: 0.8; }
.hub-hero-actions { display: flex; gap: 8px; flex-shrink: 0; }
.hub-btn { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px;
  font-size: 12px; cursor: pointer; border-radius: 5px;
  border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground); }
.hub-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
.hub-btn.primary { background: var(--vscode-button-background);
  color: var(--vscode-button-foreground); border-color: var(--vscode-button-background); }
.hub-btn.primary:hover { opacity: 0.9; }
.hub-btn .btn-icon { width: 14px; height: 14px; }

.hub-note { display: flex; gap: 10px; align-items: flex-start; font-size: 12px;
  line-height: 1.5; margin: 0 0 16px; padding: 10px 12px; border-radius: 6px;
  border: 1px solid var(--vscode-widget-border);
  border-left: 3px solid var(--brand);
  background: color-mix(in srgb, var(--brand) 7%, transparent); }
.hub-note .note-icon { width: 16px; height: 16px; color: var(--brand); flex-shrink: 0;
  margin-top: 1px; }

.dash-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 22px; }
@media (max-width: 1100px) { .dash-grid { grid-template-columns: 1fr; } }
.dash-pane { border: 1px solid var(--vscode-widget-border); border-radius: 10px;
  overflow: hidden; display: flex; flex-direction: column; min-width: 0;
  background: var(--vscode-editor-background); }
.pane-head { display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--vscode-widget-border);
  background: var(--vscode-sideBar-background); }
.pane-head .pane-title { display: flex; align-items: center; gap: 8px; }
.pane-head .pane-title svg { width: 16px; height: 16px; color: var(--brand); }
.pane-head h2 { margin: 0; font-size: 13px; font-weight: 600; }
.pane-body { padding: 4px; overflow: auto; }
.pane-failed { padding: 24px; text-align: center; opacity: 0.7; font-size: 12px; }

.hub-launchers > h2 { font-size: 13px; font-weight: 600; margin: 0 0 12px; opacity: 0.85; }

.hub-group { border: 1px solid var(--vscode-widget-border); border-radius: 10px;
  margin-bottom: 12px; overflow: hidden; background: var(--vscode-editor-background); }
.hub-group > summary { list-style: none; cursor: pointer; display: flex; align-items: center;
  gap: 10px; padding: 12px 14px; user-select: none; }
.hub-group > summary::-webkit-details-marker { display: none; }
.hub-group > summary:hover { background: var(--vscode-list-hoverBackground); }
.hub-group[open] > summary { border-bottom: 1px solid var(--vscode-widget-border); }
.group-chevron { width: 14px; height: 14px; opacity: 0.6; flex-shrink: 0;
  transition: transform 0.15s ease; }
.hub-group[open] > summary .group-chevron { transform: rotate(90deg); }
.group-icon { width: 18px; height: 18px; color: var(--brand); flex-shrink: 0; }
.group-title { font-size: 13px; font-weight: 600; }
.group-count { font-size: 11px; min-width: 18px; height: 18px; padding: 0 6px;
  display: inline-flex; align-items: center; justify-content: center; border-radius: 9px;
  background: color-mix(in srgb, var(--brand) 18%, transparent); opacity: 0.9; }
.group-desc { font-size: 11px; opacity: 0.7; margin-left: auto; text-align: right; }
@media (max-width: 760px) { .group-desc { display: none; } }
.group-body { padding: 12px 14px 14px; }

.launcher-grid { display: grid; gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(184px, 1fr)); }
.launcher-tile { display: flex; align-items: center; gap: 10px; text-align: left;
  padding: 11px 12px; font-size: 12px; cursor: pointer; border-radius: 8px;
  border: 1px solid var(--vscode-widget-border);
  background: var(--vscode-editor-background); color: var(--vscode-foreground);
  transition: border-color 0.15s, background 0.15s, transform 0.1s; }
.launcher-tile:hover { border-color: var(--vscode-focusBorder);
  background: var(--vscode-list-hoverBackground); transform: translateY(-1px); }
.launcher-tile:active { transform: translateY(0); }
.tile-icon { width: 18px; height: 18px; flex-shrink: 0; opacity: 0.85;
  color: var(--vscode-foreground); }
.launcher-tile:hover .tile-icon { color: var(--brand); opacity: 1; }
.tile-label { line-height: 1.25; }
.launcher-tile.danger { border-color: color-mix(in srgb, var(--status-bad) 38%, var(--vscode-widget-border)); }
.launcher-tile.danger .tile-icon { color: var(--status-bad); opacity: 1; }
.launcher-tile.danger:hover { border-color: var(--status-bad);
  background: color-mix(in srgb, var(--status-bad) 9%, transparent); }

/* Global monitoring kill-switch status card (top of hub, below the hero).
   State color comes from the shared status tokens so it tracks the theme:
   green (--status-good) while monitoring runs, red (--status-bad) when the
   switch is engaged. */
.kill-switch-card { display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; margin-bottom: 14px; border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--status-good) 35%, var(--vscode-widget-border));
  background: color-mix(in srgb, var(--status-good) 7%, transparent); }
.kill-switch-card.killed {
  border-color: color-mix(in srgb, var(--status-bad) 45%, var(--vscode-widget-border));
  background: color-mix(in srgb, var(--status-bad) 9%, transparent); }
.kill-switch-badge { display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 11px;
  flex-shrink: 0; color: var(--status-good);
  background: color-mix(in srgb, var(--status-good) 16%, transparent); }
.kill-switch-card.killed .kill-switch-badge { color: var(--status-bad);
  background: color-mix(in srgb, var(--status-bad) 16%, transparent); }
.kill-switch-dot { width: 8px; height: 8px; border-radius: 50%;
  background: currentColor; }
.kill-switch-desc { font-size: 12px; opacity: 0.85; min-width: 0; }
.kill-switch-card .hub-btn { margin-left: auto; flex-shrink: 0; }
.kill-switch-card .hub-btn.danger {
  border-color: color-mix(in srgb, var(--status-bad) 45%, var(--vscode-widget-border));
  color: var(--status-bad); }
.kill-switch-card .hub-btn.danger:hover {
  background: color-mix(in srgb, var(--status-bad) 12%, transparent); }
`;
}
