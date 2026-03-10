/**
 * HTML template for the Test Data Seeder webview panel.
 * Uses VS Code theme CSS variables for light/dark support.
 */

import type {
  GeneratorType,
  IColumnSeederConfig,
  ITableSeederConfig,
  ITableSeedResult,
} from './seeder-types';
import { GENERATOR_TYPES } from './seeder-types';

function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build the complete HTML for the seeder configuration panel. */
export function buildSeederHtml(
  configs: ITableSeederConfig[],
  preview?: ITableSeedResult[],
  circularWarning?: string[],
): string {
  const warning = circularWarning?.length
    ? renderWarning(circularWarning) : '';
  const tables = configs.map((c, i) => {
    const prev = preview?.find((p) => p.table === c.table);
    return renderTable(c, i, prev);
  }).join('\n');
  const body = `
<h2>Test Data Seeder</h2>
${warning}
<div class="global-controls">
  <label>Rows per table:
    <input id="globalRowCount" type="number" min="1" max="10000"
      value="${configs[0]?.rowCount ?? 100}" />
  </label>
</div>
${tables}
<div class="actions">
  <div class="output-mode">
    <label>Output:</label>
    <label><input type="radio" name="outputMode" value="sql" checked /> SQL</label>
    <label><input type="radio" name="outputMode" value="json" /> JSON</label>
    <label><input type="radio" name="outputMode" value="execute" /> Execute</label>
  </div>
  <div class="buttons">
    <button class="btn" data-action="preview">Preview (5 rows)</button>
    <button class="btn primary" data-action="generate">Generate</button>
    <button class="btn" data-action="exportDataset">Export as Dataset</button>
  </div>
</div>
${preview ? renderPreview(preview) : ''}`;

  return wrapHtml(body);
}

function renderWarning(tables: string[]): string {
  return `<div class="warning">Circular FK dependencies detected in:
    ${tables.map((t) => `<strong>${esc(t)}</strong>`).join(', ')}.
    FK columns in these tables will use NULL.</div>`;
}

function renderTable(
  config: ITableSeederConfig,
  index: number,
  preview?: ITableSeedResult,
): string {
  const cols = config.columns
    .map((c) => renderColumn(c, config.table))
    .join('\n');
  return `
  <details class="table-group" ${index === 0 ? 'open' : ''}>
    <summary class="table-header">
      ${esc(config.table)}
      <span class="badge">${config.columns.length} cols</span>
      <input class="row-count" type="number" min="1" max="10000"
        value="${config.rowCount}" data-table="${esc(config.table)}"
        title="Rows for ${esc(config.table)}" />
    </summary>
    <div class="column-list">${cols}</div>
    ${preview ? renderMiniTable(preview) : ''}
  </details>`;
}

function renderColumn(
  col: IColumnSeederConfig,
  table: string,
): string {
  const fkBadge = col.generator === 'fk_reference'
    ? `<span class="fk-badge">FK\u2192${esc(col.params.toTable as string)}</span>`
    : '';
  const pkBadge = col.isPk ? '<span class="pk-badge">PK</span>' : '';
  return `
    <div class="column-row">
      <span class="col-name">${esc(col.column)}</span>
      ${pkBadge}${fkBadge}
      <span class="col-type">${esc(col.sqlType)}</span>
      <select class="gen-select"
        data-table="${esc(table)}" data-column="${esc(col.column)}">
        ${renderOptions(col.generator)}
      </select>
    </div>`;
}

function renderOptions(current: GeneratorType): string {
  return GENERATOR_TYPES.map((g) =>
    `<option value="${g}" ${g === current ? 'selected' : ''}>${g}</option>`,
  ).join('');
}

function renderPreview(results: ITableSeedResult[]): string {
  if (results.length === 0) return '';
  return `<div class="preview-section">
    <h3>Preview</h3>
    ${results.map(renderMiniTable).join('\n')}
  </div>`;
}

function renderMiniTable(result: ITableSeedResult): string {
  if (result.rows.length === 0) {
    return `<div class="mini-empty">${esc(result.table)}: no rows</div>`;
  }
  const cols = Object.keys(result.rows[0]);
  const header = cols.map((c) => `<th>${esc(c)}</th>`).join('');
  const rows = result.rows.map((row) => {
    const cells = cols.map((c) => {
      const v = row[c];
      const display = v === null ? 'NULL' : String(v);
      return `<td>${esc(truncate(display, 30))}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');

  return `<table class="mini-table">
    <caption>${esc(result.table)}</caption>
    <thead><tr>${header}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\u2026' : s;
}

function wrapHtml(body: string): string {
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
