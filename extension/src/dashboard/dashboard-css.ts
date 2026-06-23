/** Dashboard webview styles (extracted from dashboard-html for modularization).
 * Holds the base, layout, and widget-shell styles; the widget-content and modal
 * styles live in dashboard-css-widgets.ts and are appended below. The design
 * tokens this references (var(--status-*), var(--grade-*), etc.) are injected
 * centrally by secureWebviewHtml — see views/design-tokens.ts. */

import { getDashboardWidgetCss } from './dashboard-css-widgets';
import { scopeCss } from '../webview-scope-css';

/**
 * `scope` is used only by the Drift Tools Hub, which embeds this stylesheet next
 * to another pane's CSS in one document; a wrapper selector (e.g.
 * `.pane-dashboard`) prefixes every rule so the panes cannot collide on shared
 * selectors (`body`, `.btn`, `.header`, `.grid`). The standalone Dashboard panel
 * passes NO argument and gets byte-identical output.
 */
export function getDashboardCss(scope?: string): string {
  return scopeCss(`
* { box-sizing: border-box; }
body {
  font-family: var(--vscode-font-family);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  margin: 0;
  padding: 0;
}
.dashboard { padding: 16px; }
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--vscode-widget-border);
}
.header h1 { margin: 0; font-size: 18px; font-weight: 500; }
.header-actions { display: flex; gap: 8px; }
.btn {
  padding: 6px 12px;
  border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
  background: var(--vscode-button-secondaryBackground, var(--surface-3));
  color: var(--vscode-button-secondaryForeground, var(--text));
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
.btn-primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border-color: var(--vscode-button-background);
}
.btn-primary:hover { opacity: 0.9; }

.grid {
  display: grid;
  gap: 12px;
  min-height: 200px;
}
.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  padding: 48px;
  opacity: 0.6;
}

.widget {
  border: 1px solid var(--vscode-widget-border);
  border-radius: 4px;
  background: var(--vscode-editor-background);
  display: flex;
  flex-direction: column;
  position: relative;
  transition: border-color 0.15s, box-shadow 0.15s, opacity 0.2s, transform 0.2s;
}
.widget:hover { border-color: var(--vscode-focusBorder); }
.widget.dragging { opacity: 0.5; }
.widget.drag-over { box-shadow: 0 0 0 2px var(--vscode-focusBorder); }

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--vscode-widget-border);
  background: var(--vscode-sideBar-background);
  border-radius: 3px 3px 0 0;
  cursor: move;
}
.widget-title {
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.widget-actions { display: flex; gap: 4px; }
.widget-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--vscode-foreground);
  cursor: pointer;
  border-radius: 3px;
  font-size: 12px;
  opacity: 0.6;
  display: flex;
  align-items: center;
  justify-content: center;
}
.widget-btn:hover { opacity: 1; background: var(--vscode-list-hoverBackground); }

.widget-body {
  flex: 1;
  padding: 10px;
  overflow: auto;
  font-size: 12px;
}

.widget-resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  cursor: se-resize;
  background: linear-gradient(135deg, transparent 50%, var(--vscode-widget-border) 50%);
  border-radius: 0 0 3px 0;
}
` + getDashboardWidgetCss(), scope);
}
