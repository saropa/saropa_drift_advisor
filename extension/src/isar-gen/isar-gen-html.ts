/**
 * HTML template for the Isar-to-Drift Schema Generator webview.
 */

import type {
  IIsarCollection,
  IIsarEmbedded,
  IIsarGenConfig,
  IIsarMappingResult,
} from './isar-gen-types';
import { t } from '../l10n';

function esc(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSourceSummary(
  collections: IIsarCollection[],
  embeddeds: IIsarEmbedded[],
): string {
  const items = collections
    .map((c) => `<li>${esc(c.className)} (${esc(c.fileUri)}:${c.line})</li>`)
    .join('\n');
  const embItems = embeddeds.length > 0
    ? `<p>${t('panel.tools.isar.embedded', embeddeds.length)}</p><ul>`
      + embeddeds.map((e) => `<li>${esc(e.className)}</li>`).join('')
      + '</ul>'
    : '';
  return `<h3>${t('panel.tools.isar.sourceHeading', collections.length)}</h3>
<ul>${items}</ul>${embItems}`;
}

function renderOptions(config: IIsarGenConfig): string {
  const embJson = config.embeddedStrategy === 'json' ? ' checked' : '';
  const embFlat = config.embeddedStrategy === 'flatten' ? ' checked' : '';
  const enumAuto = config.enumStrategy === 'auto' ? ' checked' : '';
  const enumInt = config.enumStrategy === 'integer' ? ' checked' : '';
  const enumText = config.enumStrategy === 'text' ? ' checked' : '';
  const idxChecked = config.includeIndexes ? ' checked' : '';
  const cmnChecked = config.includeComments ? ' checked' : '';

  return `<h3>${t('panel.tools.isar.options')}</h3>
<div class="option-group">
  <label>${t('panel.tools.isar.embeddedStrategy')}</label>
  <label><input type="radio" name="embedded" value="json"${embJson}>
    ${t('panel.tools.isar.embedded.json')}</label>
  <label><input type="radio" name="embedded" value="flatten"${embFlat}>
    ${t('panel.tools.isar.embedded.flatten')}</label>
</div>
<div class="option-group">
  <label>${t('panel.tools.isar.enumStrategy')}</label>
  <label><input type="radio" name="enum" value="auto"${enumAuto}>
    ${t('panel.tools.isar.enum.auto')}</label>
  <label><input type="radio" name="enum" value="integer"${enumInt}>
    ${t('panel.tools.isar.enum.integer')}</label>
  <label><input type="radio" name="enum" value="text"${enumText}>
    ${t('panel.tools.isar.enum.text')}</label>
</div>
<div class="option-group">
  <label><input type="checkbox" name="indexes"${idxChecked}>
    ${t('panel.tools.isar.includeIndexes')}</label>
  <label><input type="checkbox" name="comments"${cmnChecked}>
    ${t('panel.tools.isar.includeComments')}</label>
</div>`;
}

function renderTableBlock(
  tbl: IIsarMappingResult['tables'][0],
  prefix?: string,
): string {
  const cols = tbl.columns
    .map((c) => `  <tr><td>${esc(c.getterName)}</td>`
      + `<td>${esc(c.columnType)}</td>`
      + `<td>${esc(c.comment ?? '')}</td></tr>`)
    .join('\n');
  // Junction tables get a "{prefix}: {name}" label; the prefix word is itself a
  // catalog string so the whole label is translatable, joined via a token key.
  const label = prefix
    ? t('panel.tools.isar.junctionLabel', prefix, esc(tbl.tableName ?? tbl.className))
    : esc(tbl.className);
  return `<h4>${label}</h4>
<table><thead><tr><th>${t('panel.tools.isar.col.column')}</th><th>${t('panel.tools.isar.col.type')}</th><th>${t('panel.tools.isar.col.notes')}</th></tr></thead>
<tbody>${cols}</tbody></table>`;
}

function renderPreview(result: IIsarMappingResult): string {
  const tables = result.tables
    .map((tbl) => renderTableBlock(tbl)).join('\n');
  const junctions = result.junctionTables
    .map((jt) => renderTableBlock(jt, t('panel.tools.isar.junctionPrefix'))).join('\n');

  const warns = result.warnings.length > 0
    ? `<div class="warnings"><h4>${t('panel.tools.isar.warnings')}</h4><ul>`
      + result.warnings.map((w) => `<li>${esc(w)}</li>`).join('')
      + '</ul></div>'
    : '';

  const skipped = result.skippedBacklinks.length > 0
    ? `<div class="muted"><p>${t('panel.tools.isar.skipped', result.skippedBacklinks.map((b) => esc(b)).join(', '))}`
      + '</p></div>'
    : '';

  return `<h3>${t('panel.tools.isar.preview')}</h3>${tables}${junctions}${warns}${skipped}`;
}

/** Build the full webview HTML. */
export function buildIsarGenHtml(
  collections: IIsarCollection[],
  embeddeds: IIsarEmbedded[],
  config: IIsarGenConfig,
  mappingResult: IIsarMappingResult,
): string {
  const body = `
<h2>${t('panel.tools.isar.title')}</h2>
${renderSourceSummary(collections, embeddeds)}
${renderOptions(config)}
${renderPreview(mappingResult)}
<div class="toolbar">
  <button class="btn" data-action="generate">${t('panel.tools.isar.btn.generate')}</button>
  <button class="btn" data-action="copy">${t('panel.tools.isar.btn.copy')}</button>
  <button class="btn" data-action="save">${t('panel.tools.isar.btn.save')}</button>
</div>`;

  return wrapHtml(body);
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
  h3 { margin-top: 20px; }
  h4 { margin: 12px 0 4px; }
  table {
    width: 100%; border-collapse: collapse;
    font-size: 13px;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  th, td {
    text-align: left; padding: 4px 8px;
    border-bottom: 1px solid var(--vscode-panel-border, #444);
  }
  th { opacity: 0.7; font-size: 11px; text-transform: uppercase; }
  .btn {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    border: none; padding: 6px 14px; border-radius: 3px;
    cursor: pointer; font-size: 13px;
  }
  .btn:hover {
    background: var(--vscode-button-hoverBackground, #1177bb);
  }
  .option-group {
    margin: 8px 0; display: flex;
    gap: 12px; align-items: center;
  }
  .option-group label { font-size: 13px; }
  .toolbar {
    margin-top: 20px; display: flex; gap: 8px;
    border-top: 1px solid var(--vscode-panel-border, #444);
    padding-top: 12px;
  }
  .warnings { color: #e0a800; }
  .muted { opacity: 0.6; font-style: italic; }
</style>
</head>
<body>
${body}
<script>
  const vscode = acquireVsCodeApi();

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    vscode.postMessage({ command: btn.dataset.action });
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.name === 'embedded') {
      vscode.postMessage({
        command: 'updateConfig',
        config: { embeddedStrategy: el.value },
      });
    } else if (el.name === 'enum') {
      vscode.postMessage({
        command: 'updateConfig',
        config: { enumStrategy: el.value },
      });
    } else if (el.name === 'indexes') {
      vscode.postMessage({
        command: 'updateConfig',
        config: { includeIndexes: el.checked },
      });
    } else if (el.name === 'comments') {
      vscode.postMessage({
        command: 'updateConfig',
        config: { includeComments: el.checked },
      });
    }
  });
</script>
</body>
</html>`;
}
