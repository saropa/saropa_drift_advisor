/**
 * Build HTML for the Snapshot Changelog form webview panel.
 * Collects "from" and "to" snapshots in one view instead of
 * two sequential showQuickPick prompts.
 */
export function buildChangelogFormHtml(
  snapshots: Array<{ id: string; label: string; description: string }>,
): string {
  // Default: first = oldest (from), last = newest (to)
  const fromOptions = snapshots.map((s, i) => {
    const sel = i === 0 ? ' selected' : '';
    return `<option value="${esc(s.id)}"${sel}>${esc(s.label)} — ${esc(s.description)}</option>`;
  }).join('\n');

  const toOptions = snapshots.map((s, i) => {
    const sel = i === snapshots.length - 1 ? ' selected' : '';
    return `<option value="${esc(s.id)}"${sel}>${esc(s.label)} — ${esc(s.description)}</option>`;
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
  select {
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
  select:focus {
    outline: none;
    border-color: var(--vscode-focusBorder);
  }
  .hint {
    font-size: 11px;
    opacity: 0.6;
    margin-top: 4px;
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
<h1>Snapshot Changelog</h1>

<div class="field">
  <div class="field-label">From (older snapshot)</div>
  <select id="from">${fromOptions}</select>
  <div class="hint">The baseline snapshot to compare from</div>
</div>

<div class="field">
  <div class="field-label">To (newer snapshot)</div>
  <select id="to">${toOptions}</select>
  <div class="hint">The target snapshot to compare against</div>
</div>

<div class="error-text" id="sameError">Please select two different snapshots</div>

<div class="btn-row">
  <button class="btn btn-primary" id="submit">Generate Changelog</button>
  <button class="btn btn-secondary" id="cancel">Cancel</button>
</div>

<script>
  const vscode = acquireVsCodeApi();

  document.getElementById('submit').addEventListener('click', () => {
    const fromId = document.getElementById('from').value;
    const toId = document.getElementById('to').value;

    if (fromId === toId) {
      document.getElementById('sameError').style.display = 'block';
      return;
    }
    document.getElementById('sameError').style.display = 'none';

    vscode.postMessage({ command: 'generate', fromId, toId });
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
