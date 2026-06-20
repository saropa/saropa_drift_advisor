/** Dashboard widget-content and modal styles (split from dashboard-css for
 * modularization). Covers the inner rendering of each widget type (tables,
 * counters, charts, health/invariant/dvr/watch panels) and the modal surfaces
 * (widget picker, config form, layout actions). The design tokens this
 * references (var(--status-*), var(--grade-*), etc.) are injected centrally by
 * secureWebviewHtml — see views/design-tokens.ts. */

export function getDashboardWidgetCss(): string {
  return `
/* Widget content styles */
.loading { opacity: 0.5; text-align: center; }
.widget-body.refreshing { opacity: 0.5; pointer-events: none; }
.widget-body.refreshing::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 16px;
  height: 16px;
  margin: -8px 0 0 -8px;
  border: 2px solid var(--vscode-foreground);
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.empty-data { opacity: 0.5; text-align: center; font-style: italic; }
.widget-error { color: var(--vscode-errorForeground); }

.mini-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.mini-table th, .mini-table td {
  padding: 4px 6px;
  border: 1px solid var(--vscode-widget-border);
  text-align: left;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-table th {
  background: var(--vscode-sideBar-background);
  font-weight: 500;
}
.more-rows { opacity: 0.5; font-size: 10px; margin-top: 4px; }

.widget-table-stats .stat-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}
.stat-label { opacity: 0.7; }
.stat-value { font-weight: 500; }

.widget-counter {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
}
.counter-value { font-size: 28px; font-weight: bold; }
.counter-label { font-size: 11px; opacity: 0.7; margin-top: 4px; }

.chart-svg { max-width: 100%; height: auto; }
.pie-chart { max-width: 80px; margin: 0 auto; display: block; }

.widget-health {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.health-grade { font-size: 32px; font-weight: bold; }
.health-score { font-size: 12px; opacity: 0.7; }
.health-metrics { font-size: 10px; opacity: 0.7; display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.grade-a { color: var(--grade-a); }
.grade-b { color: var(--grade-b); }
.grade-c { color: var(--grade-c); }
.grade-d { color: var(--grade-d); }
.grade-f { color: var(--grade-f); }

.widget-invariants { font-size: 11px; }
.invariant-summary { font-weight: 500; margin-bottom: 8px; }
.invariant-summary.passing { color: var(--status-good); }
.invariant-summary.failing { color: var(--status-bad); }
.invariant-item { padding: 2px 0; opacity: 0.8; }
.invariant-item.error { color: var(--status-bad); }
.invariant-item.warning { color: var(--accent-warning); }

.widget-dvr {
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 100%;
}
.dvr-stat { text-align: center; }
.dvr-value { font-size: 18px; font-weight: 500; display: block; }
.dvr-label { font-size: 10px; opacity: 0.7; }

.widget-watch { text-align: center; }
.watch-table { font-weight: 500; margin-bottom: 4px; }
.watch-count { font-size: 16px; }
.watch-hint { font-size: 10px; opacity: 0.5; margin-top: 4px; }

.widget-text { white-space: pre-wrap; }

/* Modals */
.modal {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}
.modal.active { display: flex; }
.modal-content {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 6px;
  min-width: 320px;
  max-width: 480px;
  max-height: 80vh;
  overflow: auto;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--vscode-widget-border);
}
.modal-header h2 { margin: 0; font-size: 14px; }
.modal-close {
  background: none;
  border: none;
  color: var(--vscode-foreground);
  font-size: 18px;
  cursor: pointer;
  opacity: 0.6;
}
.modal-close:hover { opacity: 1; }

.widget-picker {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 16px;
}
.widget-type-card {
  padding: 12px;
  border: 1px solid var(--vscode-widget-border);
  border-radius: 4px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.widget-type-card:hover { border-color: var(--vscode-focusBorder); }
.widget-type-icon { font-size: 20px; margin-bottom: 4px; }
.widget-type-label { font-size: 12px; font-weight: 500; }
.widget-type-desc { font-size: 10px; opacity: 0.7; margin-top: 2px; }

#configForm { padding: 16px; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 11px; margin-bottom: 4px; opacity: 0.8; }
.form-group input, .form-group select, .form-group textarea {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--vscode-widget-border);
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border-radius: 3px;
  font-size: 12px;
}
.form-group textarea { min-height: 60px; resize: vertical; }
.form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }

.layout-actions { padding: 16px; display: flex; gap: 8px; }
.layout-actions input { flex: 1; }
`;
}
