/**
 * Build HTML for the Import Dataset form webview panel.
 * Collects dataset source and import mode in one view instead of
 * two sequential showQuickPick prompts.
 */
export function buildImportFormHtml(
  datasets: Array<{ name: string; path: string }>,
): string {
  // Build radio buttons for named datasets + browse option
  const datasetRadios = datasets.map((d, i) => {
    const checked = i === 0 ? ' checked' : '';
    return `<label class="ds-option">
      <input type="radio" name="dataset" value="${esc(d.path)}"${checked} />
      <div class="ds-card">
        <div class="ds-name">${esc(d.name)}</div>
        <div class="ds-path">${esc(d.path)}</div>
      </div>
    </label>`;
  }).join('\n');

  // If no named datasets, default-check the browse option
  const browseChecked = datasets.length === 0 ? ' checked' : '';

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
  .ds-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ds-option {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ds-option input[type="radio"] { display: none; }
  .ds-card {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--vscode-widget-border);
    border-radius: 3px;
    transition: border-color 0.15s, background 0.15s;
  }
  .ds-option input[type="radio"]:checked + .ds-card {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  .ds-card:hover { background: var(--vscode-list-hoverBackground); }
  .ds-name { font-size: 13px; font-weight: 600; }
  .ds-path { font-size: 11px; opacity: 0.7; margin-top: 2px; font-family: var(--vscode-editor-font-family); }
  .mode-grid {
    display: flex;
    gap: 8px;
  }
  .mode-option {
    cursor: pointer;
    flex: 1;
  }
  .mode-option input[type="radio"] { display: none; }
  .mode-card {
    padding: 8px 12px;
    border: 1px solid var(--vscode-widget-border);
    border-radius: 3px;
    text-align: center;
    transition: border-color 0.15s, background 0.15s;
  }
  .mode-option input[type="radio"]:checked + .mode-card {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  .mode-card:hover { background: var(--vscode-list-hoverBackground); }
  .mode-name { font-size: 13px; font-weight: 600; }
  .mode-desc { font-size: 11px; opacity: 0.7; margin-top: 2px; }
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
<h1>Import Dataset</h1>

<div class="field">
  <div class="field-label">Dataset Source</div>
  <div class="ds-grid">
    ${datasetRadios}
    <label class="ds-option">
      <input type="radio" name="dataset" value="__browse__"${browseChecked} />
      <div class="ds-card">
        <div class="ds-name">Browse for file\u2026</div>
        <div class="ds-path">Select a .json dataset from disk</div>
      </div>
    </label>
  </div>
</div>

<div class="field">
  <div class="field-label">Import Mode</div>
  <div class="mode-grid">
    <label class="mode-option">
      <input type="radio" name="mode" value="append" checked />
      <div class="mode-card">
        <div class="mode-name">Append</div>
        <div class="mode-desc">Add rows to existing data</div>
      </div>
    </label>
    <label class="mode-option">
      <input type="radio" name="mode" value="replace" />
      <div class="mode-card">
        <div class="mode-name">Replace</div>
        <div class="mode-desc">Clear target tables first</div>
      </div>
    </label>
    <label class="mode-option">
      <input type="radio" name="mode" value="sql" />
      <div class="mode-card">
        <div class="mode-name">SQL Only</div>
        <div class="mode-desc">Generate SQL without executing</div>
      </div>
    </label>
  </div>
</div>

<div class="btn-row">
  <button class="btn btn-primary" id="submit">Import</button>
  <button class="btn btn-secondary" id="cancel">Cancel</button>
</div>

<script>
  const vscode = acquireVsCodeApi();

  document.getElementById('submit').addEventListener('click', () => {
    const dataset = document.querySelector('input[name="dataset"]:checked')?.value;
    const mode = document.querySelector('input[name="mode"]:checked')?.value;
    if (!dataset || !mode) return;
    vscode.postMessage({ command: 'import', datasetPath: dataset, mode });
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
