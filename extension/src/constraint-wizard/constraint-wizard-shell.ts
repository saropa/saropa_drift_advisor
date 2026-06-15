/**
 * Document shell for the Constraint Wizard webview.
 *
 * Holds the static HTML envelope: the `<style>` block (all wizard CSS) and the
 * client `<script nonce="__CSP_NONCE__">` that posts user actions back to the extension host. Split
 * out of constraint-wizard-html.ts so the body-rendering helpers there stay
 * under the per-file line limit and aren't buried beneath ~140 lines of CSS.
 * Pure string assembly — no l10n or other imports, so it never needs the host
 * `t()` translator (the body it wraps is already localized by the caller).
 */
export function wrapConstraintWizardHtml(body: string): string {
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
    padding: 16px;
    line-height: 1.4;
  }
  h2 { margin-top: 0; }
  h3 { margin-top: 20px; display: flex; align-items: center; gap: 8px; }
  .btn {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border: none;
    padding: 4px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  }
  .btn:hover {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn-sm { padding: 2px 8px; font-size: 11px; }
  .btn-danger {
    background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
  }
  .add-menu { margin-bottom: 12px; display: flex; gap: 6px; }
  .hidden { display: none !important; }
  .existing {
    padding: 4px 0;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 13px;
  }
  .muted { opacity: 0.6; font-style: italic; }
  .card {
    border: 1px solid var(--vscode-panel-border, #444);
    border-radius: 6px;
    padding: 12px;
    margin: 8px 0;
  }
  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .card-index { font-weight: bold; }
  .card-kind {
    font-weight: 600;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .card-header .btn { margin-left: auto; }
  .card-actions { margin-top: 8px; }
  label {
    display: block;
    font-size: 12px;
    margin-bottom: 4px;
    opacity: 0.8;
  }
  .input {
    width: 100%;
    box-sizing: border-box;
    padding: 4px 8px;
    font-size: 13px;
    font-family: var(--vscode-editor-font-family, monospace);
    background: var(--vscode-input-background, #333);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
  }
  select.input { min-height: 28px; }  select[multiple].input { min-height: 60px; }
  .status { margin-top: 8px; font-size: 13px; }
  .status-ok { color: var(--status-good); }  .status-warn { color: var(--accent-warning); }
  .violation {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    padding: 2px 0 2px 16px;
    opacity: 0.85;
  }
  .toolbar {
    margin-top: 20px;
    display: flex;
    gap: 8px;
    border-top: 1px solid var(--vscode-panel-border, #444);
    padding-top: 12px;
  }
</style>
</head>
<body>
${body}
<script nonce="__CSP_NONCE__">
  const vscode = acquireVsCodeApi();

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const action = btn.dataset.action;

    if (action === 'showAddMenu') {
      const menu = document.getElementById('add-menu');
      if (menu) menu.classList.toggle('hidden');
      return;
    }

    const msg = { command: action };
    if (btn.dataset.id) msg.id = btn.dataset.id;
    if (btn.dataset.kind) msg.kind = btn.dataset.kind;
    vscode.postMessage(msg);
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.input) return;
    const index = Number(el.dataset.index);
    const msg = { command: 'updateConstraint', index: index };

    if (el.dataset.input === 'columns') {
      msg.columns = Array.from(el.selectedOptions).map(o => o.value);
    } else if (el.dataset.input === 'expression') {
      msg.expression = el.value;
    } else if (el.dataset.input === 'column') {
      msg.column = el.value;
    }
    vscode.postMessage(msg);
  });
</script>
</body>
</html>`;
}
