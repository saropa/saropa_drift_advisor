import type { ColumnMetadata, ForeignKey } from '../api-types';
import type {
  IConstraintDraft,
  IConstraintTestResult,
} from './constraint-types';
import { t } from '../l10n';
import { wrapConstraintWizardHtml } from './constraint-wizard-shell';
import { escapeHtml } from '../shared-utils';

const esc = escapeHtml;

function renderExisting(
  columns: ColumnMetadata[],
  fks: ForeignKey[],
): string {
  const items: string[] = [];
  const pkCols = columns.filter((c) => c.pk).map((c) => c.name);
  if (pkCols.length > 0) {
    items.push(
      `<div class="existing">${t('panel.query.constraint.existing.pk', esc(pkCols.join(', ')))}</div>`,
    );
  }
  for (const fk of fks) {
    items.push(
      `<div class="existing">${t(
        'panel.query.constraint.existing.fk',
        esc(fk.fromColumn),
        `${esc(fk.toTable)}.${esc(fk.toColumn)}`,
      )}</div>`,
    );
  }
  if (items.length === 0) {
    items.push(`<div class="muted">${t('panel.query.constraint.existing.none')}</div>`);
  }
  return `<h3>${t('panel.query.constraint.existing.title')}</h3>\n${items.join('\n')}`;
}

function renderDraft(
  draft: IConstraintDraft,
  index: number,
  columns: ColumnMetadata[],
  result?: IConstraintTestResult,
): string {
  // 'not_null' carries a space the enum value lacks, so it gets its own catalog label;
  // other kinds (UNIQUE, CHECK) are the enum value upper-cased — SQL keywords, left as data.
  const kindLabel = draft.kind === 'not_null'
    ? t('panel.query.constraint.kind.notNull') : draft.kind.toUpperCase();
  const inputHtml = renderDraftInput(draft, index, columns);
  const statusHtml = renderStatus(result);
  return `<div class="card">
  <div class="card-header">
    <span class="card-index">${index + 1}.</span>
    <span class="card-kind">${kindLabel}</span>
    <button class="btn btn-danger btn-sm"
      data-action="removeConstraint"
      data-id="${esc(draft.id)}">${t('panel.query.constraint.card.remove')}</button>
  </div>
  ${inputHtml}
  ${statusHtml}
  <div class="card-actions">
    <button class="btn" data-action="testConstraint"
      data-id="${esc(draft.id)}">${t('panel.query.constraint.card.test')}</button>
  </div>
</div>`;
}

function renderDraftInput(
  draft: IConstraintDraft,
  index: number,
  columns: ColumnMetadata[],
): string {
  switch (draft.kind) {
    case 'unique': {
      const options = columns.map((c) => {
        const sel = (draft.columns ?? []).includes(c.name)
          ? ' selected' : '';
        return `<option value="${esc(c.name)}"${sel}>`
          + `${esc(c.name)}</option>`;
      }).join('');
      return `<label>${t('panel.query.constraint.input.columns')}</label>
<select class="input" multiple data-input="columns"
  data-index="${index}">${options}</select>`;
    }
    case 'check':
      return `<label>${t('panel.query.constraint.input.expression')}</label>
<input class="input" type="text" data-input="expression"
  data-index="${index}"
  value="${esc(draft.expression ?? '')}"
  placeholder="${t('panel.query.constraint.input.expressionPlaceholder')}" />`;
    case 'not_null': {
      const options = columns.map((c) => {
        const sel = draft.column === c.name ? ' selected' : '';
        return `<option value="${esc(c.name)}"${sel}>`
          + `${esc(c.name)}</option>`;
      }).join('');
      return `<label>${t('panel.query.constraint.input.column')}</label>
<select class="input" data-input="column"
  data-index="${index}">${options}</select>`;
    }
  }
}

function renderStatus(
  result?: IConstraintTestResult,
): string {
  if (!result) return `<div class="status muted">${t('panel.query.constraint.status.notTested')}</div>`;
  if (result.valid) {
    return `<div class="status status-ok">${t('panel.query.constraint.status.ok')}</div>`;
  }
  const rows = result.violations.map((v) => {
    const vals = Object.entries(v.values)
      .map(([k, val]) => `${esc(k)}=${esc(val)}`)
      .join(', ');
    return `<div class="violation">${t('panel.query.constraint.violation.row', esc(v.rowPk), vals)}</div>`;
  }).join('\n');
  return `<div class="status status-warn">`
    + `${t('panel.query.constraint.status.violations', result.violationCount)}</div>\n${rows}`;
}

/** Build the full HTML for the Constraint Wizard webview. */
export function buildConstraintWizardHtml(
  table: string,
  columns: ColumnMetadata[],
  fks: ForeignKey[],
  drafts: IConstraintDraft[],
  results: Map<string, IConstraintTestResult>,
): string {
  const existingHtml = renderExisting(columns, fks);
  const draftsHtml = drafts.length > 0
    ? drafts.map((d, i) => renderDraft(
      d, i, columns, results.get(d.id),
    )).join('\n')
    : `<div class="muted">${t('panel.query.constraint.drafts.none')}</div>`;

  const body = `
<h2>${t('panel.query.constraint.title', esc(table))}</h2>
${existingHtml}
<h3>${t('panel.query.constraint.design.title')}
  <button class="btn btn-sm" data-action="showAddMenu">${t('panel.query.constraint.design.add')}</button>
</h3>
<div id="add-menu" class="add-menu hidden">
  <button class="btn btn-sm" data-action="addConstraint"
    data-kind="unique">${t('panel.query.constraint.kind.unique')}</button>
  <button class="btn btn-sm" data-action="addConstraint"
    data-kind="check">${t('panel.query.constraint.kind.check')}</button>
  <button class="btn btn-sm" data-action="addConstraint"
    data-kind="not_null">${t('panel.query.constraint.kind.notNull')}</button>
</div>
<div class="drafts">${draftsHtml}</div>
<div class="toolbar">
  <button class="btn" data-action="testAll"
    ${drafts.length === 0 ? 'disabled' : ''}>${t('panel.query.constraint.btn.testAll')}</button>
  <button class="btn" data-action="generateDart"
    ${drafts.length === 0 ? 'disabled' : ''}>${t('panel.query.constraint.btn.generateDart')}</button>
  <button class="btn" data-action="generateSql"
    ${drafts.length === 0 ? 'disabled' : ''}>${t('panel.query.constraint.btn.generateSql')}</button>
</div>`;

  return wrapConstraintWizardHtml(body);
}
