/**
 * Build HTML for the Add Data Breakpoint form webview panel.
 * Collects table, breakpoint type, and optional condition in one view
 * instead of 2-3 sequential top-bar prompts.
 */
export function buildBreakpointFormHtml(
  tableNames: string[],
  preselectedTable?: string,
): string {
  const options = tableNames.map((t) => {
    const sel = t === preselectedTable ? ' selected' : '';
    return `<option value="${esc(t)}"${sel}>${esc(t)}</option>`;
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
  select, input[type="text"], textarea {
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
  textarea {
    font-family: var(--vscode-editor-font-family);
    min-height: 60px;
    resize: vertical;
  }
  select:focus, input:focus, textarea:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }
  .type-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .type-option {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .type-option input[type="radio"] { display: none; }
  .type-card {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--vscode-widget-border);
    border-radius: 3px;
    transition: border-color 0.15s, background 0.15s;
  }
  .type-option input[type="radio"]:checked + .type-card {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  .type-card:hover { background: var(--vscode-list-hoverBackground); }
  .type-name { font-size: 13px; font-weight: 600; }
  .type-desc { font-size: 11px; opacity: 0.7; margin-top: 2px; }
  .condition-field { display: none; }
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
<h1>Add Data Breakpoint</h1>

<div class="field">
  <div class="field-label">Table</div>
  <select id="table">${options}</select>
</div>

<div class="field">
  <div class="field-label">Breakpoint Type</div>
  <div class="type-grid">
    <label class="type-option">
      <input type="radio" name="type" value="conditionMet" />
      <div class="type-card">
        <div class="type-name">Condition Met</div>
        <div class="type-desc">SQL returns non-zero count</div>
      </div>
    </label>
    <label class="type-option">
      <input type="radio" name="type" value="rowInserted" checked />
      <div class="type-card">
        <div class="type-name">Row Inserted</div>
        <div class="type-desc">Row count increases</div>
      </div>
    </label>
    <label class="type-option">
      <input type="radio" name="type" value="rowDeleted" />
      <div class="type-card">
        <div class="type-name">Row Deleted</div>
        <div class="type-desc">Row count decreases</div>
      </div>
    </label>
    <label class="type-option">
      <input type="radio" name="type" value="rowChanged" />
      <div class="type-card">
        <div class="type-name">Row Changed</div>
        <div class="type-desc">Any data changes</div>
      </div>
    </label>
  </div>
</div>

<div class="field condition-field" id="conditionField">
  <div class="field-label">SQL Condition</div>
  <textarea id="condition" placeholder='SELECT COUNT(*) FROM "users" WHERE balance < 0'></textarea>
</div>

<div class="btn-row">
  <button class="btn btn-primary" id="submit">Add Breakpoint</button>
  <button class="btn btn-secondary" id="cancel">Cancel</button>
</div>

<script>
  const vscode = acquireVsCodeApi();

  // Show/hide condition field based on selected type
  document.querySelectorAll('input[name="type"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const isCondition = document.querySelector('input[name="type"]:checked').value === 'conditionMet';
      document.getElementById('conditionField').style.display = isCondition ? 'block' : 'none';
    });
  });

  document.getElementById('submit').addEventListener('click', () => {
    const table = document.getElementById('table').value;
    const type = document.querySelector('input[name="type"]:checked').value;
    let condition;
    if (type === 'conditionMet') {
      condition = document.getElementById('condition').value.trim();
      if (!condition) {
        document.getElementById('condition').style.borderColor = '#ef4444';
        return;
      }
    }
    vscode.postMessage({ command: 'submit', table, type, condition });
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
