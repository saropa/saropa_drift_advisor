import type { ISqlSnippet } from './snippet-types';
import { t } from '../l10n';

/** Render a single snippet card with run form, edit, and delete actions. */
export function renderSnippetCard(
  s: ISqlSnippet,
  tableOptions: string,
): string {
  const varInputs = s.variables.map((v) => {
    const label = `<label>${esc(v.name)}</label>`;
    if (v.type === 'table') {
      return `<div class="var-row">${label}
        <select data-var="${esc(v.name)}" data-change="updatePreview" data-a0="${esc(s.id)}">
          <option value="">${esc(t('panel.notes.snippet.table.placeholder'))}</option>
          ${tableOptions}
        </select></div>`;
    }
    const inputType = v.type === 'number' ? 'number' : 'text';
    const def = v.default ? ` value="${esc(v.default)}"` : '';
    return `<div class="var-row">${label}
      <input type="${inputType}" data-var="${esc(v.name)}"${def}
             data-input="updatePreview" data-a0="${esc(s.id)}"
             placeholder="${esc(v.description || v.name)}" /></div>`;
  }).join('');

  const runForm = s.variables.length > 0
    ? `<div id="run-${esc(s.id)}" class="var-form" style="display:none"
           data-sql="${escAttr(s.sql)}">
        ${varInputs}
        <div class="preview">${esc(s.sql)}</div>
        <div class="form-actions">
          <button data-click="runSnippet" data-a0="${esc(s.id)}">${t('panel.notes.snippet.btn.run')}</button>
          <button class="secondary"
                  data-click="showRunForm" data-a0="${esc(s.id)}">${t('panel.notes.snippet.btn.cancel')}</button>
        </div>
        <div id="result-${esc(s.id)}"></div>
      </div>`
    : '';

  const desc = s.description
    ? `<div class="snippet-desc">${esc(s.description)}</div>`
    : '';
  const meta = s.useCount > 0
    ? `<div class="snippet-meta">${t('panel.notes.snippet.used', s.useCount)}</div>`
    : '';

  // data-a1 carries whether this snippet has variables; runOrShow() (defined in
  // the library script) opens the run form when it does, else runs immediately.
  // Inline onclick is replaced because the C2b nonce CSP blocks inline handlers.
  const hasVars = s.variables.length > 0 ? '1' : '0';

  return `<div class="snippet">
    <div class="snippet-name">${esc(s.name)}</div>
    ${desc}
    <div class="snippet-sql">${esc(s.sql)}</div>
    <div class="snippet-actions">
      <button data-click="runOrShow" data-a0="${esc(s.id)}" data-a1="${hasVars}">${t('panel.notes.snippet.btn.run')}</button>
      <button class="secondary" data-click="editSnippet" data-a0="${esc(s.id)}">${t('panel.notes.snippet.btn.edit')}</button>
      <button class="secondary danger" data-click="deleteSnippet" data-a0="${esc(s.id)}" data-a1="${esc(s.name)}">${t('panel.notes.snippet.btn.delete')}</button>
    </div>
    ${runForm}
    ${meta}
  </div>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s: string): string {
  return esc(s).replace(/'/g, '&#39;');
}
