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

function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderColumnOptions(
  tableColumns: ColumnMetadata[],
  selected: string | null,
): string {
  const options = ['<option value="">(skip)</option>'];
  for (const col of tableColumns) {
    const sel = col.name === selected ? ' selected' : '';
    const pk = col.pk ? ' (PK)' : '';
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
    <thead><tr><th>Clipboard Column</th><th>→ Table Column</th><th>Sample</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderPreviewTable(parsed: IParsedClipboard, mapping: IColumnMapping[]): string {
  const activeMappings = mapping.filter((m) => m.tableColumn !== null);

  if (activeMappings.length === 0) {
    return '<div class="empty">No columns mapped. Select target columns above.</div>';
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
    html += `<div class="truncated">Showing 5 of ${parsed.rows.length} rows</div>`;
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
      <div class="validation-header">✗ ${errorRows.length} rows with errors:</div>
      <ul>`;

    for (const row of errorRows.slice(0, 5)) {
      for (const err of row.errors) {
        html += `<li>Row ${row.row + 1}: ${esc(err.message)}</li>`;
      }
    }

    if (errorRows.length > 5) {
      html += `<li>...and ${errorRows.length - 5} more rows with errors</li>`;
    }

    html += '</ul></div>';
  }

  if (warningRows.length > 0) {
    html += `<div class="validation-warnings">
      <div class="validation-header">⚠ ${warningRows.length} rows with warnings:</div>
      <ul>`;

    for (const row of warningRows.slice(0, 3)) {
      for (const warn of row.warnings) {
        html += `<li>Row ${row.row + 1}: ${esc(warn.message)}</li>`;
      }
    }

    if (warningRows.length > 3) {
      html += `<li>...and ${warningRows.length - 3} more rows with warnings</li>`;
    }

    html += '</ul></div>';
  }

  html += '</div>';
  return html;
}

function renderDryRunResults(results: IDryRunResult): string {
  let html = '<div class="dry-run-results">';
  html += '<div class="dry-run-header">Dry Run Preview:</div>';
  html += '<div class="dry-run-summary">';

  if (results.wouldInsert > 0) {
    html += `<div class="stat insert">INSERT ${results.wouldInsert} new rows</div>`;
  }
  if (results.wouldUpdate > 0) {
    html += `<div class="stat update">UPDATE ${results.wouldUpdate} existing rows</div>`;
  }
  if (results.wouldSkip > 0) {
    html += `<div class="stat skip">SKIP ${results.wouldSkip} rows</div>`;
  }

  html += '</div>';

  if (results.conflicts.length > 0) {
    html += '<div class="conflicts-preview">';
    html += '<div class="conflicts-header">Updates Preview:</div>';
    html += '<table class="conflicts-table"><thead><tr><th>Row</th><th>Column</th><th>Current</th><th>New</th></tr></thead><tbody>';

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
      html += `<div class="truncated">...and ${results.conflicts.length - 10} more updates</div>`;
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
    resultsHtml = '<div class="loading">Processing…</div>';
  } else if (error) {
    resultsHtml = `<div class="error">${esc(error)}</div>`;
  } else if (success) {
    resultsHtml = `<div class="success">✓ Imported ${success.imported} rows`;
    if (success.skipped > 0) {
      resultsHtml += ` (${success.skipped} skipped)`;
    }
    resultsHtml += '</div>';
  } else if (validationResults && validationResults.length > 0) {
    resultsHtml = renderValidationResults(validationResults);
  } else if (dryRunResults) {
    resultsHtml = renderDryRunResults(dryRunResults);
  }

  const body = `
<h2>Paste into: ${esc(table)}
  <span class="badge">${parsed.rows.length} rows detected</span>
  <span class="badge format">${parsed.format.toUpperCase()}</span>
</h2>

<div class="options-panel">
  <div class="options-header">Import Strategy</div>
  <div class="options-row">
    <label><input type="radio" name="strategy" value="insert" ${options.strategy === 'insert' ? 'checked' : ''} /> Insert only</label>
    <label><input type="radio" name="strategy" value="insert_skip_conflicts" ${options.strategy === 'insert_skip_conflicts' ? 'checked' : ''} /> Skip conflicts</label>
    <label><input type="radio" name="strategy" value="upsert" ${options.strategy === 'upsert' ? 'checked' : ''} /> Upsert</label>
    <label><input type="radio" name="strategy" value="dry_run" ${options.strategy === 'dry_run' ? 'checked' : ''} /> Dry run</label>
  </div>
  <div class="options-row">
    <label>Match by:</label>
    <select id="matchBy">
      <option value="pk" ${options.matchBy === 'pk' ? 'selected' : ''}>${esc(pkColumn)} (Primary Key)</option>
    </select>
    <label class="checkbox-label">
      <input type="checkbox" id="continueOnError" ${options.continueOnError ? 'checked' : ''} />
      Continue on error
    </label>
  </div>
</div>

<div class="section">
  <div class="section-header">Column Mapping</div>
  ${renderMappingTable(mapping, tableColumns, parsed)}
  <div class="mapping-summary">${activeMappings} of ${mapping.length} columns mapped</div>
</div>

<div class="section">
  <div class="section-header">Preview</div>
  ${renderPreviewTable(parsed, mapping)}
</div>

<div id="results">${resultsHtml}</div>

<div class="actions">
  <button class="btn" data-action="cancel">Cancel</button>
  <button class="btn" data-action="validate">Validate</button>
  <button class="btn primary" data-action="import" ${activeMappings === 0 ? 'disabled' : ''}>
    ${options.strategy === 'dry_run' ? 'Run Dry Run' : `Import ${validRows} rows`}
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
  body {
    font-family: var(--vscode-font-family, sans-serif);
    color: var(--vscode-editor-foreground, #ccc);
    background: var(--vscode-editor-background, #1e1e1e);
    padding: 16px;
    line-height: 1.4;
  }
  h2 { margin-top: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 10px;
    font-size: 11px; font-weight: 600;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
  }
  .badge.format { background: var(--vscode-statusBarItem-prominentBackground, #007acc); }
  
  .options-panel {
    background: var(--vscode-editor-inactiveSelectionBackground, #333);
    border-radius: 4px; padding: 12px; margin-bottom: 16px;
  }
  .options-header { font-weight: 600; margin-bottom: 8px; }
  .options-row {
    display: flex; gap: 16px; align-items: center; margin-bottom: 8px;
    font-size: 13px; flex-wrap: wrap;
  }
  .options-row label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .checkbox-label { margin-left: auto; }
  
  select, input[type="checkbox"] {
    background: var(--vscode-input-background, #333);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
  }
  select { padding: 4px 8px; }
  
  .section { margin-bottom: 16px; }
  .section-header { font-weight: 600; margin-bottom: 8px; font-size: 13px; }
  
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    text-align: left; padding: 6px 8px;
    background: var(--vscode-editor-inactiveSelectionBackground, #333);
    border-bottom: 1px solid var(--vscode-panel-border, #444);
  }
  td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, #333);
    vertical-align: middle;
  }
  td.sample {
    color: var(--vscode-descriptionForeground, #888);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  
  .mapping-select {
    width: 100%; padding: 4px;
    background: var(--vscode-input-background, #333);
    color: var(--vscode-input-foreground, #ccc);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
  }
  .mapping-summary { font-size: 12px; color: var(--vscode-descriptionForeground, #888); margin-top: 8px; }
  
  .preview-table td { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .truncated { font-size: 12px; color: var(--vscode-descriptionForeground, #888); margin-top: 8px; }
  .empty { padding: 20px; text-align: center; color: var(--vscode-descriptionForeground, #888); }
  
  .validation-results { margin: 16px 0; }
  .validation-errors { background: var(--vscode-inputValidation-errorBackground, #5a1d1d); border-radius: 4px; padding: 12px; margin-bottom: 8px; }
  .validation-warnings { background: var(--vscode-inputValidation-warningBackground, #5a4d1d); border-radius: 4px; padding: 12px; }
  .validation-header { font-weight: 600; margin-bottom: 8px; }
  .validation-results ul { margin: 0; padding-left: 20px; }
  .validation-results li { margin: 4px 0; font-size: 13px; }
  
  .dry-run-results { margin: 16px 0; background: var(--vscode-editor-inactiveSelectionBackground, #333); border-radius: 4px; padding: 12px; }
  .dry-run-header { font-weight: 600; margin-bottom: 8px; }
  .dry-run-summary { display: flex; gap: 16px; margin-bottom: 12px; }
  .stat { padding: 4px 12px; border-radius: 4px; font-size: 13px; font-weight: 500; }
  .stat.insert { background: var(--vscode-testing-iconPassed, #3c8); color: #000; }
  .stat.update { background: var(--vscode-editorWarning-foreground, #cca700); color: #000; }
  .stat.skip { background: var(--vscode-descriptionForeground, #888); color: #fff; }
  
  .conflicts-preview { margin-top: 12px; }
  .conflicts-header { font-size: 13px; margin-bottom: 8px; }
  .conflicts-table { font-size: 12px; }
  .conflicts-table td { font-family: var(--vscode-editor-font-family, monospace); }
  
  .loading { padding: 20px; text-align: center; font-style: italic; color: var(--vscode-descriptionForeground, #888); }
  .error { background: var(--vscode-inputValidation-errorBackground, #5a1d1d); padding: 12px; border-radius: 4px; margin: 16px 0; }
  .success { background: var(--vscode-testing-iconPassed, #3c8); color: #000; padding: 12px; border-radius: 4px; margin: 16px 0; font-weight: 500; }
  
  .actions {
    display: flex; gap: 8px; margin-top: 16px; padding-top: 16px;
    border-top: 1px solid var(--vscode-panel-border, #444);
  }
  .btn {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #ccc);
    border: none; padding: 8px 16px; border-radius: 3px;
    cursor: pointer; font-size: 13px;
  }
  .btn:hover { background: var(--vscode-button-secondaryHoverBackground, #505357); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.primary {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    margin-left: auto;
  }
  .btn.primary:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
</style>
</head>
<body>
${body}
<script>
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
</script>
</body>
</html>`;
}
