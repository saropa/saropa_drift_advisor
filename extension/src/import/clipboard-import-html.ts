/**
 * HTML template for the Clipboard Import webview panel.
 * Provides UI for preview, column mapping, validation, and import options.
 */

import type { ColumnMetadata } from '../api-types';
import type {
  IClipboardImportState,
  IColumnMapping,
  IDryRunResult,
  ImportStrategy,
  IParsedClipboard,
  IValidationResult,
} from './clipboard-import-types';
import { getClipboardImportCss } from './clipboard-import-styles';
import { getClipboardImportScript } from './clipboard-import-scripts';
import { t } from '../l10n';
import { escapeHtml } from '../shared-utils';

const esc = escapeHtml;

function renderColumnOptions(
  tableColumns: ColumnMetadata[],
  selected: string | null,
): string {
  const options = [`<option value="">${t('panel.data.clip.option.skip')}</option>`];
  for (const col of tableColumns) {
    const sel = col.name === selected ? ' selected' : '';
    const pk = col.pk ? t('panel.data.clip.option.pk') : '';
    options.push(`<option value="${esc(col.name)}"${sel}>${esc(col.name)}${pk}</option>`);
  }
  return options.join('\n');
}

function renderMappingTable(
  mapping: IColumnMapping[],
  tableColumns: ColumnMetadata[],
  parsed: IParsedClipboard,
): string {
  const rows = mapping.map((m, i) => {
    const sample = parsed.rows[0]?.[m.clipboardIndex] ?? '';
    const truncated = sample.length > 30 ? sample.slice(0, 30) + '…' : sample;

    return `<tr>
      <td>${esc(m.clipboardHeader)}</td>
      <td>
        <select data-mapping-index="${i}" class="mapping-select">
          ${renderColumnOptions(tableColumns, m.tableColumn)}
        </select>
      </td>
      <td class="sample">${esc(truncated)}</td>
    </tr>`;
  }).join('\n');

  return `<table class="mapping-table">
    <thead><tr><th>${t('panel.data.clip.map.col.clipboard')}</th><th>${t('panel.data.clip.map.col.table')}</th><th>${t('panel.data.clip.map.col.sample')}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderPreviewTable(parsed: IParsedClipboard, mapping: IColumnMapping[]): string {
  const activeMappings = mapping.filter((m) => m.tableColumn !== null);

  if (activeMappings.length === 0) {
    return `<div class="empty">${t('panel.data.clip.preview.empty')}</div>`;
  }

  const header = activeMappings.map((m) => `<th>${esc(m.tableColumn!)}</th>`).join('');
  const previewRows = parsed.rows.slice(0, 5);

  const bodyRows = previewRows.map((row) => {
    const cells = activeMappings.map((m) => {
      const val = row[m.clipboardIndex] ?? '';
      const truncated = val.length > 25 ? val.slice(0, 25) + '…' : val;
      return `<td>${esc(truncated)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');

  let html = `<table class="preview-table">
    <thead><tr>${header}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>`;

  if (parsed.rows.length > 5) {
    html += `<div class="truncated">${t('panel.data.clip.preview.truncated', parsed.rows.length)}</div>`;
  }

  return html;
}

function renderValidationResults(results: IValidationResult[]): string {
  if (results.length === 0) {
    return '';
  }

  const errorRows = results.filter((r) => r.errors.length > 0);
  const warningRows = results.filter((r) => r.errors.length === 0 && r.warnings.length > 0);

  let html = '<div class="validation-results">';

  if (errorRows.length > 0) {
    html += `<div class="validation-errors">
      <div class="validation-header">${t('panel.data.clip.valid.errorsHeader', errorRows.length)}</div>
      <ul>`;

    for (const row of errorRows.slice(0, 5)) {
      for (const err of row.errors) {
        html += `<li>${t('panel.data.clip.valid.errorRow', row.row + 1, esc(err.message))}</li>`;
      }
    }

    if (errorRows.length > 5) {
      html += `<li>${t('panel.data.clip.valid.errorsMore', errorRows.length - 5)}</li>`;
    }

    html += '</ul></div>';
  }

  if (warningRows.length > 0) {
    html += `<div class="validation-warnings">
      <div class="validation-header">${t('panel.data.clip.valid.warningsHeader', warningRows.length)}</div>
      <ul>`;

    for (const row of warningRows.slice(0, 3)) {
      for (const warn of row.warnings) {
        html += `<li>${t('panel.data.clip.valid.warningRow', row.row + 1, esc(warn.message))}</li>`;
      }
    }

    if (warningRows.length > 3) {
      html += `<li>${t('panel.data.clip.valid.warningsMore', warningRows.length - 3)}</li>`;
    }

    html += '</ul></div>';
  }

  html += '</div>';
  return html;
}

function renderDryRunResults(results: IDryRunResult): string {
  let html = '<div class="dry-run-results">';
  html += `<div class="dry-run-header">${t('panel.data.clip.dry.header')}</div>`;
  html += '<div class="dry-run-summary">';

  if (results.wouldInsert > 0) {
    html += `<div class="stat insert">${t('panel.data.clip.dry.insert', results.wouldInsert)}</div>`;
  }
  if (results.wouldUpdate > 0) {
    html += `<div class="stat update">${t('panel.data.clip.dry.update', results.wouldUpdate)}</div>`;
  }
  if (results.wouldSkip > 0) {
    html += `<div class="stat skip">${t('panel.data.clip.dry.skip', results.wouldSkip)}</div>`;
  }

  html += '</div>';

  if (results.conflicts.length > 0) {
    html += '<div class="conflicts-preview">';
    html += `<div class="conflicts-header">${t('panel.data.clip.dry.updatesHeader')}</div>`;
    html += `<table class="conflicts-table"><thead><tr><th>${t('panel.data.clip.dry.col.row')}</th><th>${t('panel.data.clip.dry.col.column')}</th><th>${t('panel.data.clip.dry.col.current')}</th><th>${t('panel.data.clip.dry.col.new')}</th></tr></thead><tbody>`;

    for (const conflict of results.conflicts.slice(0, 10)) {
      for (const diff of conflict.diff.slice(0, 3)) {
        html += `<tr>
          <td>${conflict.row + 1}</td>
          <td>${esc(diff.column)}</td>
          <td>${esc(String(diff.from))}</td>
          <td>${esc(String(diff.to))}</td>
        </tr>`;
      }
    }

    html += '</tbody></table>';

    if (results.conflicts.length > 10) {
      html += `<div class="truncated">${t('panel.data.clip.dry.updatesMore', results.conflicts.length - 10)}</div>`;
    }

    html += '</div>';
  }

  html += '</div>';
  return html;
}

export function buildClipboardImportHtml(
  state: IClipboardImportState,
  loading?: boolean,
  error?: string,
  success?: { imported: number; skipped: number },
): string {
  const { table, tableColumns, parsed, mapping, options, validationResults, dryRunResults } = state;
  const activeMappings = mapping.filter((m) => m.tableColumn !== null).length;
  const validRows = parsed.rows.length - (validationResults?.filter((r) => r.errors.length > 0).length ?? 0);
  const pkColumn = tableColumns.find((c) => c.pk)?.name ?? 'id';

  let resultsHtml = '';
  if (loading) {
    resultsHtml = `<div class="loading">${t('panel.data.clip.status.processing')}</div>`;
  } else if (error) {
    resultsHtml = `<div class="error">${esc(error)}</div>`;
  } else if (success) {
    resultsHtml = `<div class="success">${t('panel.data.clip.status.imported', success.imported)}`;
    if (success.skipped > 0) {
      resultsHtml += ` ${t('panel.data.clip.status.skipped', success.skipped)}`;
    }
    resultsHtml += '</div>';
  } else if (validationResults && validationResults.length > 0) {
    resultsHtml = renderValidationResults(validationResults);
  } else if (dryRunResults) {
    resultsHtml = renderDryRunResults(dryRunResults);
  }

  const body = `
<h2>${t('panel.data.clip.header.pasteInto', esc(table))}
  <span class="badge">${t('panel.data.clip.header.rowsDetected', parsed.rows.length)}</span>
  <span class="badge format">${parsed.format.toUpperCase()}</span>
</h2>

<div class="options-panel">
  <div class="options-header">${t('panel.data.clip.strategy.title')}</div>
  <div class="options-row">
    <label><input type="radio" name="strategy" value="insert" ${options.strategy === 'insert' ? 'checked' : ''} /> ${t('panel.data.clip.strategy.insert')}</label>
    <label><input type="radio" name="strategy" value="insert_skip_conflicts" ${options.strategy === 'insert_skip_conflicts' ? 'checked' : ''} /> ${t('panel.data.clip.strategy.skipConflicts')}</label>
    <label><input type="radio" name="strategy" value="upsert" ${options.strategy === 'upsert' ? 'checked' : ''} /> ${t('panel.data.clip.strategy.upsert')}</label>
    <label><input type="radio" name="strategy" value="dry_run" ${options.strategy === 'dry_run' ? 'checked' : ''} /> ${t('panel.data.clip.strategy.dryRun')}</label>
  </div>
  <div class="options-row">
    <label>${t('panel.data.clip.matchBy.label')}</label>
    <select id="matchBy">
      <option value="pk" ${options.matchBy === 'pk' ? 'selected' : ''}>${t('panel.data.clip.matchBy.pkOption', esc(pkColumn))}</option>
    </select>
    <label class="checkbox-label">
      <input type="checkbox" id="continueOnError" ${options.continueOnError ? 'checked' : ''} />
      ${t('panel.data.clip.continueOnError')}
    </label>
  </div>
</div>

<div class="section">
  <div class="section-header">${t('panel.data.clip.section.mapping')}</div>
  ${renderMappingTable(mapping, tableColumns, parsed)}
  <div class="mapping-summary">${t('panel.data.clip.mapping.summary', activeMappings, mapping.length)}</div>
</div>

<div class="section">
  <div class="section-header">${t('panel.data.clip.section.preview')}</div>
  ${renderPreviewTable(parsed, mapping)}
</div>

<div id="results">${resultsHtml}</div>

<div class="actions">
  <button class="btn" data-action="cancel">${t('panel.data.clip.btn.cancel')}</button>
  <button class="btn" data-action="validate">${t('panel.data.clip.btn.validate')}</button>
  <button class="btn primary" data-action="import" ${activeMappings === 0 ? 'disabled' : ''}>
    ${options.strategy === 'dry_run' ? t('panel.data.clip.btn.runDryRun') : t('panel.data.clip.btn.import', validRows)}
  </button>
</div>`;

  return wrapHtml(body, table);
}

function wrapHtml(body: string, table: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
${getClipboardImportCss()}
</style>
</head>
<body>
${body}
<script nonce="__CSP_NONCE__">${getClipboardImportScript()}
</script>
</body>
</html>`;
}
