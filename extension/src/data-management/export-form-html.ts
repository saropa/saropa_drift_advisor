/**
 * Build HTML for the Export Dataset form webview panel.
 * Collects table selection (multi-select) and dataset name in one view
 * instead of two sequential showQuickPick + showInputBox prompts.
 */
import { t } from '../l10n';

export function buildExportFormHtml(
  tables: Array<{ name: string; rowCount: number }>,
): string {
  const checkboxes = tables.map((tbl) =>
    `<label class="table-option">
      <input type="checkbox" value="${esc(tbl.name)}" checked />
      <span class="table-name">${esc(tbl.name)}</span>
      <span class="table-rows">${t('panel.data.export.table.rows', tbl.rowCount)}</span>
    </label>`,
  ).join('\n');

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
    padding: 24px;
    max-width: 500px;
  }
  h1 { font-size: 18px; margin: 0 0 20px 0; }
  .field { margin-bottom: 16px; }
  .field-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  input[type="text"] {
    width: 100%;
    padding: 6px 8px;
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
    border-radius: 3px;
    box-sizing: border-box;
  }
  input[type="text"]:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }
  .table-list {
    border: 1px solid var(--vscode-widget-border);
    border-radius: 4px;
    max-height: 300px;
    overflow-y: auto;
    padding: 4px 0;
  }
  .table-toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
  }
  .toolbar-btn {
    font-size: 11px;
    color: var(--vscode-textLink-foreground);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }
  .toolbar-btn:hover { opacity: 0.8; }
  .table-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 12px;
  }
  .table-option:hover { background: var(--vscode-list-hoverBackground); }
  .table-name { flex: 1; }
  .table-rows {
    font-size: 11px;
    opacity: 0.6;
    font-family: var(--vscode-editor-font-family);
  }
  .error-text {
    color: #ef4444;
    font-size: 11px;
    margin-top: 4px;
    display: none;
  }
  .btn-row {
    display: flex;
    gap: 8px;
    margin-top: 20px;
  }
  .btn {
    padding: 6px 16px;
    border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
    border-radius: 3px;
    cursor: pointer;
    font-size: 13px;
  }
  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .btn-primary:hover { opacity: 0.9; }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  }
  .btn-secondary:hover {
    background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
  }
</style>
</head>
<body>
<h1>${t('panel.data.export.title')}</h1>

<div class="field">
  <div class="field-label">${t('panel.data.export.field.name')}</div>
  <input type="text" id="name" placeholder="${t('panel.data.export.name.placeholder')}" />
  <div class="error-text" id="name-error">${t('panel.data.export.name.error')}</div>
</div>

<div class="field">
  <div class="field-label">${t('panel.data.export.field.tables')}</div>
  <div class="table-toolbar">
    <button class="toolbar-btn" id="selectAll">${t('panel.data.export.selectAll')}</button>
    <button class="toolbar-btn" id="selectNone">${t('panel.data.export.selectNone')}</button>
  </div>
  <div class="table-list">
    ${checkboxes}
  </div>
  <div class="error-text" id="tables-error">${t('panel.data.export.tables.error')}</div>
</div>

<div class="btn-row">
  <button class="btn btn-primary" id="submit">${t('panel.data.export.btn.export')}</button>
  <button class="btn btn-secondary" id="cancel">${t('panel.data.export.btn.cancel')}</button>
</div>

<script nonce="__CSP_NONCE__">
  const vscode = acquireVsCodeApi();

  // Select all / none
  document.getElementById('selectAll').addEventListener('click', () => {
    document.querySelectorAll('.table-list input[type="checkbox"]').forEach((cb) => { cb.checked = true; });
  });
  document.getElementById('selectNone').addEventListener('click', () => {
    document.querySelectorAll('.table-list input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
  });

  document.getElementById('submit').addEventListener('click', () => {
    const name = document.getElementById('name').value.trim();
    const selected = [];
    document.querySelectorAll('.table-list input[type="checkbox"]:checked').forEach((cb) => {
      selected.push(cb.value);
    });

    // Validate
    let valid = true;
    if (!name) {
      document.getElementById('name-error').style.display = 'block';
      valid = false;
    } else {
      document.getElementById('name-error').style.display = 'none';
    }
    if (selected.length === 0) {
      document.getElementById('tables-error').style.display = 'block';
      valid = false;
    } else {
      document.getElementById('tables-error').style.display = 'none';
    }
    if (!valid) return;

    vscode.postMessage({ command: 'export', name, tables: selected });
  });

  document.getElementById('cancel').addEventListener('click', () => {
    vscode.postMessage({ command: 'cancel' });
  });

  // Ctrl+Enter to submit
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      document.getElementById('submit').click();
    }
  });
</script>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
