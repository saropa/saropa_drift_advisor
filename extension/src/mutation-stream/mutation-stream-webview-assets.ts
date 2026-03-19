/**
 * Inline CSS and JS assets for the Mutation Stream webview.
 */

/** Shared loading-state stylesheet. */
export const MUTATION_STREAM_LOADING_STYLES = `
    body {
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-editor-foreground, #ccc);
      background: var(--vscode-editor-background, #1e1e1e);
      padding: 12px;
      margin: 0;
      line-height: 1.4;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 140px;
      text-align: center;
    }
    .wrap { width: 100%; max-width: 420px; }
    .title { font-weight: 800; margin-bottom: 8px; opacity: 0.95; }
    .msg { opacity: 0.8; font-size: 12px; margin-bottom: 14px; }
    .spinner {
      margin: 0 auto 10px auto;
      width: 26px;
      height: 26px;
      border-radius: 999px;
      border: 3px solid rgba(255,255,255,0.12);
      border-top-color: rgba(30,144,255,0.85);
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
`;

/** Main panel stylesheet. */
export const MUTATION_STREAM_STYLES = `
    body {
      font-family: var(--vscode-font-family, sans-serif);
      color: var(--vscode-editor-foreground, #ccc);
      background: var(--vscode-editor-background, #1e1e1e);
      padding: 12px;
      margin: 0;
      line-height: 1.4;
    }
    .header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom: 10px; }
    .title { font-size: 14px; font-weight: 700; opacity: 0.95; }
    .subtitle { font-size: 12px; opacity: 0.7; margin-top: 2px; }
    .toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin: 8px 0 12px; padding: 10px; border: 1px solid var(--vscode-panel-border, #333); border-radius: 6px; }
    label { font-size: 12px; opacity: 0.85; }
    select, input {
      background: var(--vscode-input-background, #2d2d2d);
      color: var(--vscode-input-foreground, #ccc);
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
    }
    .btn {
      background: var(--vscode-button-background, #1e90ff);
      color: var(--vscode-button-foreground, #fff);
      border: none;
      border-radius: 4px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      white-space:nowrap;
    }
    .btn:hover { background: var(--vscode-button-hoverBackground, #3a9cff); }
    .cards { display:flex; flex-direction:column; gap: 10px; }
    .card {
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 8px;
      padding: 10px;
      background: rgba(255,255,255,0.02);
    }
    .card.insert { border-color: rgba(40,167,69,0.35); }
    .card.update { border-color: rgba(255,193,7,0.35); }
    .card.delete { border-color: rgba(220,53,69,0.35); }
    .card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
    .card-title { display:flex; align-items:center; gap: 10px; flex-wrap:wrap; }
    .badge {
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.3px;
      background: rgba(255,255,255,0.06);
    }
    .badge.insert { background: rgba(40,167,69,0.18); color: #7CFFB0; }
    .badge.update { background: rgba(255,193,7,0.14); color: #FFE68A; }
    .badge.delete { background: rgba(220,53,69,0.14); color: #FF9BA2; }
    .tbl { font-weight: 800; }
    .ts { font-size: 12px; opacity: 0.75; }
    .card-actions { display:flex; gap: 10px; align-items:flex-start; flex-wrap:wrap; justify-content:flex-end; }
    details.sql { font-size: 12px; opacity: 0.9; }
    pre { margin: 0; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
    .preview { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(128,128,128,0.18); }
    .empty { opacity: 0.65; font-style: italic; margin: 20px 0; }
`;

/** Main panel script factory with runtime paused-state interpolation. */
export function mutationStreamScript(paused: boolean): string {
  return `
    const vscode = acquireVsCodeApi();
    const tableSelect = document.getElementById('tableSelect');
    const opSelect = document.getElementById('opSelect');
    const modeSelect = document.getElementById('modeSelect');
    const searchInput = document.getElementById('searchInput');
    const columnSelect = document.getElementById('columnSelect');
    const valueInput = document.getElementById('valueInput');
    const pauseBtn = document.getElementById('pauseBtn');
    const exportBtn = document.getElementById('exportBtn');
    const cards = document.getElementById('cards');

    // Guard against partial template drift; avoids runtime errors in webview.
    if (!tableSelect || !opSelect || !modeSelect || !searchInput || !columnSelect || !valueInput || !pauseBtn || !exportBtn || !cards) {
      vscode.postMessage({ command: 'ready' });
      return;
    }

    function debounceFactory(ms) {
      let t = undefined;
      return (fn) => {
        if (t) clearTimeout(t);
        t = setTimeout(fn, ms);
      };
    }

    function postFilters() {
      const next = {
        command: 'filters',
        filters: {
          table: tableSelect.value,
          type: opSelect.value,
          mode: modeSelect.value,
          search: searchInput?.value || '',
          column: columnSelect?.value || '',
          columnValue: valueInput?.value || ''
        }
      };
      vscode.postMessage(next);
    }

    tableSelect.addEventListener('change', postFilters);
    opSelect.addEventListener('change', postFilters);
    const debouncedFreeText = debounceFactory(150);
    searchInput.addEventListener('input', () => debouncedFreeText(postFilters));
    modeSelect.addEventListener('change', postFilters);
    columnSelect.addEventListener('change', postFilters);

    const debouncedColumnValue = debounceFactory(150);
    valueInput.addEventListener('input', () => debouncedColumnValue(postFilters));

    let isPaused = ${paused ? 'true' : 'false'};
    function updatePauseLabel() {
      pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    }
    updatePauseLabel();
    pauseBtn.addEventListener('click', () => {
      isPaused = !isPaused;
      updatePauseLabel();
      vscode.postMessage({ command: 'togglePause', paused: isPaused });
    });

    exportBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'exportJson' });
    });

    cards.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-action="viewRow"]');
      if (!btn) return;
      const eventId = Number(btn.dataset.eventId);
      vscode.postMessage({ command: 'viewRow', eventId });
    });

    vscode.postMessage({ command: 'ready' });
  `;
}
