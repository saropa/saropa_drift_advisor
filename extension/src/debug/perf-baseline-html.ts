import type { IPerfBaseline } from './perf-baseline-store';

/**
 * Build HTML for the Performance Baselines webview panel.
 * Shows a table of stored baselines with reset actions.
 */
export function buildPerfBaselineHtml(
  baselines: IPerfBaseline[],
): string {
  if (baselines.length === 0) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
  background: var(--vscode-editor-background); }
.empty { padding: 32px; text-align: center; opacity: 0.6; }</style>
</head><body><div class="empty">No performance baselines stored.</div></body></html>`;
  }

  // Sort by avg duration descending (slowest first) for quick triage
  const sorted = [...baselines].sort(
    (a, b) => b.avgDurationMs - a.avgDurationMs,
  );

  const rows = sorted.map((b, i) => {
    const updated = new Date(b.updatedAt).toLocaleString();
    const avgMs = Math.round(b.avgDurationMs);
    // Highlight slow baselines (> 100ms) with a subtle background
    const cls = avgMs > 100 ? 'slow-row' : '';
    return `<tr class="${cls}">
      <td class="sql-cell" title="${esc(b.normalizedSql)}"><code>${esc(truncate(b.normalizedSql, 80))}</code></td>
      <td class="num">${avgMs}ms</td>
      <td class="num">${b.sampleCount}</td>
      <td class="date-cell">${esc(updated)}</td>
      <td>
        <button class="action-btn" data-reset="${i}" title="Reset this baseline">Reset</button>
      </td>
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
  .btn-danger {
    background: #ef4444;
    border-color: #ef4444;
    color: #fff;
  }
  .btn-group { display: flex; gap: 6px; }
  .summary {
    font-size: 13px;
    opacity: 0.7;
    margin-bottom: 16px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th, td {
    text-align: left;
    padding: 6px 10px;
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
  .slow-row { background: #ef444411; }
  .num { text-align: right; font-family: var(--vscode-editor-font-family); }
  .sql-cell {
    max-width: 400px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sql-cell code {
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
  }
  .date-cell { font-size: 11px; opacity: 0.7; white-space: nowrap; }
  .action-btn {
    padding: 2px 8px;
    font-size: 11px;
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
    background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border-radius: 3px;
    cursor: pointer;
  }
  .action-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
  }
</style>
</head>
<body>
<div class="header">
  <h1>Performance Baselines</h1>
  <div class="btn-group">
    <button class="btn btn-danger" data-action="resetAll">Reset All</button>
  </div>
</div>
<div class="summary">${baselines.length} baseline(s) stored, sorted by avg duration (slowest first)</div>

<table>
  <thead>
    <tr>
      <th>SQL Pattern</th>
      <th style="text-align:right">Avg Duration</th>
      <th style="text-align:right">Samples</th>
      <th>Last Updated</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>

<script>
  const vscode = acquireVsCodeApi();

  document.addEventListener('click', (e) => {
    // Header action buttons
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      vscode.postMessage({ command: actionBtn.dataset.action });
      return;
    }
    // Per-row reset button
    const resetBtn = e.target.closest('[data-reset]');
    if (resetBtn) {
      vscode.postMessage({ command: 'resetOne', index: Number(resetBtn.dataset.reset) });
    }
  });
</script>
</body>
</html>`;
}

/** Truncate a string, adding ellipsis if needed. */
function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\u2026' : s;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
