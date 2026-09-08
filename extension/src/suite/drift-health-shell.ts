/**
 * HTML document shell (styles + client script) for the Drift Health panel
 * (plan 67 R4): wraps the per-table findings body built by drift-health-html.ts.
 * Theme-aware via `--vscode-*` variables (light / dark / high contrast).
 */
import { SUITE_NOTES_SCRIPT } from './suite-notes-html';

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
    padding: 16px;
    line-height: 1.4;
  }
  .dh-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .dh-header h2 { margin: 0; }
  .dh-refresh {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border: none; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 12px;
  }
  .dh-refresh:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
  .dh-intro { opacity: 0.75; font-size: 13px; margin: 6px 0 2px; }
  .dh-truncated {
    font-size: 12px; margin: 8px 0; padding: 6px 10px; border-radius: 4px;
    border: 1px solid var(--accent-warning); color: var(--accent-warning);
  }
  .dh-count { opacity: 0.6; font-size: 12px; margin: 0 0 16px; }
  .dh-empty { opacity: 0.7; font-style: italic; }
  .dh-card {
    border: 1px solid var(--vscode-panel-border, #444);
    border-radius: 6px; padding: 12px 14px; margin-bottom: 14px;
    background: var(--vscode-editor-inactiveSelectionBackground, #2a2a2a);
  }
  .dh-table { margin: 0 0 10px; font-size: 15px; }
  .dh-table-count, .dh-col-count {
    display: inline-block; min-width: 18px; text-align: center;
    font-size: 11px; font-weight: 600; opacity: 0.7; margin-inline-start: 6px;
    padding: 0 6px; border-radius: 9px;
    border: 1px solid var(--vscode-panel-border, #555);
  }
  .dh-cols { display: flex; flex-wrap: wrap; gap: 16px; }
  .dh-col { flex: 1 1 220px; min-width: 200px; }
  .dh-col-label { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.85; }
  .dh-list { list-style: none; margin: 0; padding: 0; }
  .dh-finding { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; padding: 4px 0; }
  .dh-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
  .dh-dot-error { background: var(--status-bad); }
  .dh-dot-warning { background: var(--accent-warning); }
  .dh-dot-info { background: var(--accent-info); }
  .dh-title { font-size: 13px; }
  .dh-rule { font-size: 11px; opacity: 0.6; }
  .dh-detail { flex-basis: 100%; font-size: 12px; opacity: 0.7; margin-inline-start: 14px; }
  .dh-finding.dh-is-stale { opacity: 0.55; }
  .dh-stale {
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 0 5px; border-radius: 8px;
    color: var(--vscode-editorWarning-foreground, #e0a800);
    border: 1px solid var(--vscode-editorWarning-foreground, #e0a800);
  }
  .suite-fix {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #fff);
    border: none; padding: 2px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;
  }
  .suite-fix:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  .dh-toolbar {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
    gap: 8px; margin-bottom: 14px;
  }
  .dh-filters { display: flex; flex-wrap: wrap; gap: 6px; }
  .dh-filter {
    padding: 3px 10px; font-size: 12px; border-radius: 3px; cursor: pointer;
    border: 1px solid var(--vscode-panel-border, #555);
    background: transparent; color: var(--vscode-foreground, #ccc);
  }
  .dh-filter:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
  .dh-filter.active {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border-color: var(--vscode-button-background, #0e639c);
  }
  .dh-sort { font-size: 12px; opacity: 0.85; display: inline-flex; align-items: center; gap: 6px; }
  .dh-sort-select {
    background: var(--vscode-dropdown-background, #3c3c3c);
    color: var(--vscode-dropdown-foreground, #ccc);
    border: 1px solid var(--vscode-dropdown-border, #555); border-radius: 3px; padding: 2px 6px;
  }
  /* Visible keyboard focus for accessibility (design pass). */
  .dh-refresh:focus-visible, .dh-filter:focus-visible, .dh-sort-select:focus-visible, .suite-fix:focus-visible {
    outline: 2px solid var(--vscode-focusBorder, #007fd4); outline-offset: 1px;
  }
  .dh-hidden { display: none; }
</style>
</head>
<body>
${body}
<script nonce="__CSP_NONCE__">
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    vscode.postMessage({ command: btn.dataset.action });
  });

  // Severity filter: show only findings of the chosen severity, then hide any
  // column/card that ends up with nothing visible (plan 67 R4 polish).
  function applyFilter(sev) {
    document.querySelectorAll('.dh-filter').forEach((b) => {
      const on = b.dataset.sevFilter === sev;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll('.dh-finding').forEach((li) => {
      li.classList.toggle('dh-hidden', sev !== 'all' && li.dataset.sev !== sev);
    });
    document.querySelectorAll('.dh-col').forEach((col) => {
      const any = col.querySelector('.dh-finding:not(.dh-hidden)');
      col.classList.toggle('dh-hidden', !any);
    });
    document.querySelectorAll('.dh-card').forEach((card) => {
      const any = card.querySelector('.dh-finding:not(.dh-hidden)');
      card.classList.toggle('dh-hidden', !any);
    });
  }
  document.querySelectorAll('.dh-filter').forEach((b) => {
    b.addEventListener('click', () => applyFilter(b.dataset.sevFilter));
  });

  // Sort the table cards by finding count or table name.
  const sortSel = document.querySelector('.dh-sort-select');
  if (sortSel) {
    sortSel.addEventListener('change', () => {
      const host = document.getElementById('dh-cards');
      if (!host) return;
      const cards = Array.from(host.querySelectorAll('.dh-card'));
      cards.sort((a, b) => sortSel.value === 'name'
        ? (a.dataset.table || '').localeCompare(b.dataset.table || '')
        : (Number(b.dataset.total) - Number(a.dataset.total)));
      cards.forEach((c) => host.appendChild(c));
    });
  }
${SUITE_NOTES_SCRIPT}
</script>
</body>
</html>`;
}
