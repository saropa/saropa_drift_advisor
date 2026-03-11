/**
 * HTML document shell with CSS and client-side JS for the seeder panel.
 * Extracted from seeder-html.ts for the 300-line limit.
 */

export function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-editor-foreground, #ccc);
    background: var(--vscode-editor-background, #1e1e1e);
    padding: 16px; line-height: 1.4;
  }
  h2 { margin-top: 0; }
  h3 { margin: 16px 0 8px; }
  .warning {
    padding: 8px 12px; margin-bottom: 12px; border-radius: 4px;
    background: #5a3e00; color: #ffd080;
    border: 1px solid #e0a800;
  }
  .global-controls {
    margin-bottom: 12px; display: flex; gap: 12px; align-items: center;
  }
  .global-controls input {
    width: 80px; padding: 4px 6px;
    background: var(--vscode-input-background, #333);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
  }
  .table-group {
    margin-bottom: 8px;
    border: 1px solid var(--vscode-panel-border, #444);
    border-radius: 4px;
  }
  .table-header {
    padding: 8px 12px; cursor: pointer;
    font-weight: 600; font-size: 14px;
    background: var(--vscode-editor-inactiveSelectionBackground, #333);
    display: flex; align-items: center; gap: 8px;
  }
  .badge {
    display: inline-block; padding: 1px 7px; border-radius: 10px;
    font-size: 11px; font-weight: 600;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
  }
  .row-count {
    width: 70px; margin-left: auto; padding: 2px 4px;
    background: var(--vscode-input-background, #333);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px; font-size: 12px;
  }
  .column-list { padding: 4px 0; }
  .column-row {
    padding: 4px 12px; display: flex; align-items: center; gap: 8px;
    font-size: 13px;
    border-bottom: 1px solid var(--vscode-panel-border, #333);
  }
  .column-row:last-child { border-bottom: none; }
  .col-name {
    font-family: var(--vscode-editor-font-family, monospace);
    min-width: 120px;
  }
  .col-type { opacity: 0.5; min-width: 60px; font-size: 12px; }
  .pk-badge {
    padding: 1px 5px; border-radius: 3px; font-size: 10px;
    background: #0e639c; color: #fff; font-weight: 600;
  }
  .fk-badge {
    padding: 1px 5px; border-radius: 3px; font-size: 10px;
    background: #28a745; color: #fff;
  }
  .gen-select {
    margin-left: auto; padding: 2px 4px; font-size: 12px;
    background: var(--vscode-input-background, #333);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
  }
  .actions {
    margin-top: 16px; display: flex; flex-wrap: wrap;
    justify-content: space-between; align-items: center; gap: 12px;
  }
  .output-mode {
    display: flex; gap: 10px; align-items: center; font-size: 13px;
  }
  .buttons { display: flex; gap: 8px; }
  .btn {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #ccc);
    border: none; padding: 6px 14px; border-radius: 3px;
    cursor: pointer; font-size: 13px;
  }
  .btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, #505357);
  }
  .btn.primary {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
  }
  .btn.primary:hover {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }
  .preview-section { margin-top: 16px; }
  .mini-table {
    width: 100%; border-collapse: collapse; margin-bottom: 12px;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .mini-table caption {
    text-align: left; font-weight: 600; padding: 4px 0; font-size: 13px;
  }
  .mini-table th, .mini-table td {
    padding: 3px 8px; text-align: left;
    border: 1px solid var(--vscode-panel-border, #444);
    max-width: 200px; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mini-table th {
    background: var(--vscode-editor-inactiveSelectionBackground, #333);
  }
  .mini-empty { font-style: italic; opacity: 0.5; padding: 8px; }
</style>
</head>
<body>
${body}
<script>
  const vscode = acquireVsCodeApi();

  function getOutputMode() {
    const el = document.querySelector('input[name="outputMode"]:checked');
    return el ? el.value : 'sql';
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    vscode.postMessage({
      command: btn.dataset.action,
      outputMode: getOutputMode(),
    });
  });

  document.addEventListener('change', (e) => {
    const sel = e.target.closest('.gen-select');
    if (sel) {
      vscode.postMessage({
        command: 'overrideGenerator',
        table: sel.dataset.table,
        column: sel.dataset.column,
        generator: sel.value,
      });
      return;
    }
    const rc = e.target.closest('.row-count');
    if (rc) {
      vscode.postMessage({
        command: 'setRowCount',
        table: rc.dataset.table,
        rowCount: parseInt(rc.value, 10) || 100,
      });
      return;
    }
    const grc = e.target.closest('#globalRowCount');
    if (grc) {
      const count = parseInt(grc.value, 10) || 100;
      document.querySelectorAll('.row-count').forEach((el) => {
        el.value = count;
        vscode.postMessage({
          command: 'setRowCount',
          table: el.dataset.table,
          rowCount: count,
        });
      });
    }
  });
</script>
</body>
</html>`;
}
