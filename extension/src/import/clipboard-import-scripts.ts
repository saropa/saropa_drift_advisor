/**
 * Clipboard Import webview client script.
 * Extracted from clipboard-import-html for modularization (plan: under 300 lines per file).
 */

export function getClipboardImportScript(): string {
  return `
  const vscode = acquireVsCodeApi();
  
  document.querySelectorAll('input[name="strategy"]').forEach(radio => {
    radio.addEventListener('change', () => {
      vscode.postMessage({ command: 'updateStrategy', strategy: radio.value });
    });
  });
  
  document.getElementById('matchBy')?.addEventListener('change', (e) => {
    vscode.postMessage({ command: 'updateMatchBy', matchBy: e.target.value });
  });
  
  document.getElementById('continueOnError')?.addEventListener('change', (e) => {
    vscode.postMessage({ command: 'updateContinueOnError', continueOnError: e.target.checked });
  });
  
  document.querySelectorAll('.mapping-select').forEach(select => {
    select.addEventListener('change', () => {
      const index = parseInt(select.dataset.mappingIndex, 10);
      const tableColumn = select.value || null;
      vscode.postMessage({ command: 'updateMapping', index, tableColumn });
    });
  });
  
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    
    const action = btn.dataset.action;
    if (action === 'cancel') {
      vscode.postMessage({ command: 'cancel' });
    } else if (action === 'validate') {
      vscode.postMessage({ command: 'validate' });
    } else if (action === 'import') {
      vscode.postMessage({ command: 'import' });
    }
  });
`;
}
