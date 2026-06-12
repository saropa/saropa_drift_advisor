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
import { wrapHtml } from './seeder-html-shell';
import { t } from '../l10n';

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
<h2>${t('panel.data.seeder.title')}</h2>
${warning}
<div class="global-controls">
  <label>${t('panel.data.seeder.rowsPerTable')}
    <input id="globalRowCount" type="number" min="1" max="10000"
      value="${configs[0]?.rowCount ?? 100}" />
  </label>
</div>
${tables}
<div class="actions">
  <div class="output-mode">
    <label>${t('panel.data.seeder.output.label')}</label>
    <label><input type="radio" name="outputMode" value="sql" checked /> ${t('panel.data.seeder.output.sql')}</label>
    <label><input type="radio" name="outputMode" value="json" /> ${t('panel.data.seeder.output.json')}</label>
    <label><input type="radio" name="outputMode" value="execute" /> ${t('panel.data.seeder.output.execute')}</label>
  </div>
  <div class="buttons">
    <button class="btn" data-action="preview">${t('panel.data.seeder.btn.preview')}</button>
    <button class="btn primary" data-action="generate">${t('panel.data.seeder.btn.generate')}</button>
    <button class="btn" data-action="exportDataset">${t('panel.data.seeder.btn.exportDataset')}</button>
  </div>
</div>
${preview ? renderPreview(preview) : ''}`;

  return wrapHtml(body);
}

function renderWarning(tables: string[]): string {
  // Table names are wrapped in <strong> at the call site and joined, then passed
  // as {0} so the bold survives and the sentence stays one reorderable unit.
  const names = tables.map((tbl) => `<strong>${esc(tbl)}</strong>`).join(', ');
  return `<div class="warning">${t('panel.data.seeder.warning', names)}</div>`;
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
      <span class="badge">${t('panel.data.seeder.cols', config.columns.length)}</span>
      <input class="row-count" type="number" min="1" max="10000"
        value="${config.rowCount}" data-table="${esc(config.table)}"
        title="${t('panel.data.seeder.rowsFor', esc(config.table))}" />
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
    <h3>${t('panel.data.seeder.preview.title')}</h3>
    ${results.map(renderMiniTable).join('\n')}
  </div>`;
}

function renderMiniTable(result: ITableSeedResult): string {
  if (result.rows.length === 0) {
    return `<div class="mini-empty">${t('panel.data.seeder.preview.noRows', esc(result.table))}</div>`;
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
