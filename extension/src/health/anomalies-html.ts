import type { Anomaly } from '../api-types';

/**
 * Build HTML for the Anomalies webview panel.
 * Shows a filterable list of detected anomalies with severity icons.
 */
export function buildAnomaliesHtml(anomalies: Anomaly[]): string {
  if (anomalies.length === 0) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
  background: var(--vscode-editor-background); }
.empty { padding: 32px; text-align: center; opacity: 0.6; }</style>
</head><body><div class="empty">No anomalies found.</div></body></html>`;
  }

  const errorCount = anomalies.filter((a) => a.severity === 'error').length;
  const warnCount = anomalies.filter((a) => a.severity === 'warning').length;
  const infoCount = anomalies.filter((a) => a.severity === 'info').length;

  const rows = anomalies.map((a) => {
    const icon = severityIcon(a.severity);
    return `<tr class="anomaly-row" data-severity="${esc(a.severity)}">
      <td class="sev-cell sev-${esc(a.severity)}">${icon}</td>
      <td><span class="badge sev-badge-${esc(a.severity)}">${esc(a.severity)}</span></td>
      <td>${esc(a.message)}</td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 16px;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .header h1 { margin: 0; font-size: 18px; }
  .btn-group { display: flex; gap: 6px; }
  .btn {
    padding: 4px 12px;
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  }
  .btn:hover { opacity: 0.9; }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  }
  .filters {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    align-items: center;
  }
  .filter-btn {
    padding: 3px 10px;
    font-size: 12px;
    border: 1px solid var(--vscode-widget-border);
    background: transparent;
    color: var(--vscode-foreground);
    border-radius: 3px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .filter-btn:hover { background: var(--vscode-list-hoverBackground); }
  .filter-btn.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: var(--vscode-button-background);
  }
  .filter-count {
    font-size: 10px;
    opacity: 0.7;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th, td {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  th {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 11px;
    opacity: 0.7;
    position: sticky;
    top: 0;
    background: var(--vscode-editor-background);
  }
  tr:hover { background: var(--vscode-list-hoverBackground); }
  .sev-cell { width: 24px; text-align: center; font-size: 14px; }
  .sev-error { color: #ef4444; }
  .sev-warning { color: #eab308; }
  .sev-info { color: #3b82f6; }
  .badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
  }
  .sev-badge-error { background: #ef444433; color: #ef4444; }
  .sev-badge-warning { background: #eab30833; color: #eab308; }
  .sev-badge-info { background: #3b82f633; color: #3b82f6; }
  .hidden { display: none; }
</style>
</head>
<body>
<div class="header">
  <h1>Anomalies</h1>
  <div class="btn-group">
    <button class="btn btn-secondary" data-action="refresh">Refresh</button>
    <button class="btn" data-action="generateFixes">Generate Fix SQL</button>
  </div>
</div>

<div class="filters">
  <button class="filter-btn active" data-filter="all">All <span class="filter-count">(${anomalies.length})</span></button>
  ${errorCount > 0 ? `<button class="filter-btn" data-filter="error">\u2716 Errors <span class="filter-count">(${errorCount})</span></button>` : ''}
  ${warnCount > 0 ? `<button class="filter-btn" data-filter="warning">\u26A0 Warnings <span class="filter-count">(${warnCount})</span></button>` : ''}
  ${infoCount > 0 ? `<button class="filter-btn" data-filter="info">\u2139 Info <span class="filter-count">(${infoCount})</span></button>` : ''}
</div>

<table>
  <thead>
    <tr>
      <th></th>
      <th>Severity</th>
      <th>Message</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>

<script>
  const vscode = acquireVsCodeApi();

  // Severity filter toggle
  let activeFilter = 'all';
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      // Update active state on filter buttons
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      // Show/hide rows based on filter
      document.querySelectorAll('.anomaly-row').forEach((row) => {
        if (activeFilter === 'all' || row.dataset.severity === activeFilter) {
          row.classList.remove('hidden');
        } else {
          row.classList.add('hidden');
        }
      });
    });
  });

  // Header button actions
  document.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      vscode.postMessage({ command: actionBtn.dataset.action });
    }
  });
</script>
</body>
</html>`;
}

function severityIcon(severity: string): string {
  switch (severity) {
    case 'error': return '\u2716';
    case 'warning': return '\u26A0';
    default: return '\u2139';
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
