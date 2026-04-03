/**
 * Build HTML for the Compare Rows form webview panel.
 * Collects table A, PK A, scope (same/different), table B, PK B in one view
 * instead of 4-5 sequential top-bar prompts.
 */
export function buildCompareFormHtml(
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
    max-width: 520px;
  }
  h1 { font-size: 18px; margin: 0 0 20px 0; }
  .row-section {
    border: 1px solid var(--vscode-widget-border);
    border-radius: 4px;
    padding: 12px;
    margin-bottom: 12px;
  }
  .row-section h2 {
    font-size: 13px;
    margin: 0 0 10px 0;
    opacity: 0.8;
  }
  .field { margin-bottom: 12px; }
  .field:last-child { margin-bottom: 0; }
  .field-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  select, input[type="text"] {
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
  select:focus, input:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }
  .scope-row {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  .scope-option {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .scope-option input[type="radio"] { display: none; }
  .scope-label {
    padding: 4px 12px;
    border: 1px solid var(--vscode-widget-border);
    border-radius: 3px;
    font-size: 12px;
    transition: border-color 0.15s, background 0.15s;
  }
  .scope-option input[type="radio"]:checked + .scope-label {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  .scope-label:hover { background: var(--vscode-list-hoverBackground); }
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
  .error-text {
    color: #ef4444;
    font-size: 11px;
    margin-top: 4px;
    display: none;
  }
</style>
</head>
<body>
<h1>Compare Rows</h1>

<div class="row-section">
  <h2>Row A</h2>
  <div class="field">
    <div class="field-label">Table</div>
    <select id="tableA">${options}</select>
  </div>
  <div class="field">
    <div class="field-label">Primary Key Value</div>
    <input type="text" id="pkA" placeholder="Enter primary key value" />
    <div class="error-text" id="pkA-error">Primary key is required</div>
  </div>
</div>

<div class="field-label" style="margin-bottom:8px">Compare with</div>
<div class="scope-row">
  <label class="scope-option">
    <input type="radio" name="scope" value="same" checked />
    <span class="scope-label">Same table</span>
  </label>
  <label class="scope-option">
    <input type="radio" name="scope" value="different" />
    <span class="scope-label">Different table</span>
  </label>
</div>

<div class="row-section">
  <h2>Row B</h2>
  <div class="field" id="tableBField" style="display:none">
    <div class="field-label">Table</div>
    <select id="tableB">${options}</select>
  </div>
  <div class="field">
    <div class="field-label">Primary Key Value</div>
    <input type="text" id="pkB" placeholder="Enter primary key value" />
    <div class="error-text" id="pkB-error">Primary key is required</div>
  </div>
</div>

<div class="btn-row">
  <button class="btn btn-primary" id="submit">Compare</button>
  <button class="btn btn-secondary" id="cancel">Cancel</button>
</div>

<script>
  const vscode = acquireVsCodeApi();

  // Toggle table B selector visibility based on scope
  document.querySelectorAll('input[name="scope"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const isDifferent = document.querySelector('input[name="scope"]:checked').value === 'different';
      document.getElementById('tableBField').style.display = isDifferent ? 'block' : 'none';
    });
  });

  document.getElementById('submit').addEventListener('click', () => {
    const tableA = document.getElementById('tableA').value;
    const pkA = document.getElementById('pkA').value.trim();
    const scope = document.querySelector('input[name="scope"]:checked').value;
    const tableB = scope === 'different'
      ? document.getElementById('tableB').value
      : tableA;
    const pkB = document.getElementById('pkB').value.trim();

    // Validate
    let valid = true;
    if (!pkA) {
      document.getElementById('pkA-error').style.display = 'block';
      valid = false;
    } else {
      document.getElementById('pkA-error').style.display = 'none';
    }
    if (!pkB) {
      document.getElementById('pkB-error').style.display = 'block';
      valid = false;
    } else {
      document.getElementById('pkB-error').style.display = 'none';
    }
    if (!valid) return;

    vscode.postMessage({ command: 'compare', tableA, pkA, tableB, pkB });
  });

  document.getElementById('cancel').addEventListener('click', () => {
    vscode.postMessage({ command: 'cancel' });
  });

  // Allow Ctrl+Enter to submit from any input
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
