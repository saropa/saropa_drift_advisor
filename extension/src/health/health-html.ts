import type {
  IHealthMetric, IHealthScore, IMetricAction, IRecommendation,
} from './health-types';
import type { IRefactoringAdvisorSession } from '../refactoring/refactoring-advisor-state';
import { getHealthCss } from './health-css';
import { t } from '../l10n';

/** Build HTML for the health score dashboard webview panel. */
export function buildHealthHtml(
  score: IHealthScore,
  historyCount: number = 0,
  advisor?: IRefactoringAdvisorSession,
): string {
  if (score.metrics.length === 0) {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
  background: var(--vscode-editor-background); }
.empty { padding: 32px; text-align: center; opacity: 0.6; }</style>
</head><body><div class="empty">${t('panel.health.empty')}</div></body></html>`;
  }

  const gradeClass = gradeColorClass(score.grade);
  const cards = score.metrics.map((m) => buildMetricCard(m)).join('\n');
  const recs = buildRecommendations(score.recommendations);
  const advisorHtml = advisor ? buildRefactoringAdvisorSection(advisor) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${getHealthCss()}</style>
</head>
<body>
<div class="header">
  <h1>${t('panel.health.title')}</h1>
  <div class="btn-group">
    <button class="btn" data-action="refresh">${t('panel.health.btn.refresh')}</button>
    <button class="btn" data-action="copyReport">${t('panel.health.btn.copyReport')}</button>
    <button class="btn" data-action="saveSnapshot">${t('panel.health.btn.saveSnapshot')}</button>
    <button class="btn" data-action="compareHistory">${historyCount > 0 ? t('panel.health.btn.compareCount', historyCount) : t('panel.health.btn.compare')}</button>
  </div>
</div>

<div class="overall">
  <div class="overall-grade ${gradeClass}">${esc(score.grade)}</div>
  <div class="overall-score">${t('panel.health.overall.score', score.overall)}</div>
</div>

<div class="cards">
  ${cards}
</div>

${recs}

${advisorHtml}

<script>
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (e) => {
    // Handle header button actions (refresh, copyReport)
    const btn = e.target.closest('[data-action]');
    if (btn) {
      vscode.postMessage({ command: btn.dataset.action });
      return;
    }
    // Handle action buttons on cards and recommendations
    const actionBtn = e.target.closest('[data-action-command]');
    if (actionBtn) {
      e.stopPropagation();
      const cmd = actionBtn.dataset.actionCommand;
      let args;
      try {
        args = actionBtn.dataset.args ? JSON.parse(actionBtn.dataset.args) : undefined;
      } catch { args = undefined; }
      vscode.postMessage({ command: 'executeAction', actionCommand: cmd, args });
      return;
    }
    // Handle card click to open linked panel
    const card = e.target.closest('[data-command]');
    if (card) {
      vscode.postMessage({ command: 'openCommand', id: card.dataset.command });
    }
  });
</script>
</body>
</html>`;
}

function buildRefactoringAdvisorSection(a: IRefactoringAdvisorSession): string {
  const titles = a.topTitles.map((t) => `<li>${esc(t)}</li>`).join('');
  const when = esc(a.updatedAt);
  // Counts are wrapped in <strong> at the call site and passed as {0}/{1} tokens so
  // the bold survives while the sentence stays one translator-reorderable unit.
  const summary = t('panel.health.advisor.summary', `<strong>${a.suggestionCount}</strong>`, `<strong>${a.tableCount}</strong>`);
  const dismissed = a.dismissedCount > 0 ? ` ${t('panel.health.advisor.dismissed', `<strong>${a.dismissedCount}</strong>`)}` : '';
  return `<div class="advisor">
  <h2>${t('panel.health.advisor.title')}</h2>
  <div>${summary}${dismissed}</div>
  ${a.topTitles.length ? `<ul>${titles}</ul>` : ''}
  <div class="advisor-meta">${t('panel.health.advisor.updated', when)}</div>
  <div style="margin-top:10px;">
    <button class="btn" type="button" data-action-command="driftViewer.suggestSchemaRefactorings">${t('panel.health.advisor.open')}</button>
  </div>
</div>`;
}

function buildMetricCard(m: IHealthMetric): string {
  const gc = gradeColorClass(m.grade);
  const cmdAttr = m.linkedCommand ? ` data-command="${esc(m.linkedCommand)}"` : '';
  const actionsHtml = buildActions(m.actions);
  return `<div class="card"${cmdAttr}>
    <div class="card-header">${esc(m.name)}</div>
    <span class="card-score">${m.score}/100</span>
    <span class="card-grade ${gc}">${esc(m.grade)}</span>
    <div class="card-summary">${esc(m.summary)}</div>
    ${actionsHtml}
  </div>`;
}

function buildActions(actions?: IMetricAction[]): string {
  if (!actions || actions.length === 0) return '';
  const buttons = actions.map((a, i) => {
    const cls = i === 0 && a.label.toLowerCase().includes('fix') ? 'action-btn primary' : 'action-btn';
    const icon = a.icon ? `${a.icon} ` : '';
    const argsAttr = a.args ? ` data-args='${esc(JSON.stringify(a.args))}'` : '';
    return `<button class="${cls}" data-action-command="${esc(a.command)}"${argsAttr}>${icon}${esc(a.label)}</button>`;
  }).join('\n    ');
  return `<div class="card-actions">\n    ${buttons}\n  </div>`;
}

function buildRecommendations(recs: IRecommendation[]): string {
  if (recs.length === 0) {
    return `<div class="recs"><h2>${t('panel.health.recs.title')}</h2>
      <div style="opacity:0.6;font-size:12px">${t('panel.health.recs.none')}</div></div>`;
  }
  const items = recs.map((r) => {
    const icon = r.severity === 'error' ? '\u2716' : r.severity === 'warning' ? '\u26A0' : '\u2139';
    const actionBtn = buildRecAction(r.action);
    return `<div class="rec rec-${esc(r.severity)}">
      <span class="rec-icon">${icon}</span>
      <span>${esc(r.message)}</span>
      ${actionBtn}
      <span class="rec-metric">${esc(r.metric)}</span>
    </div>`;
  }).join('\n');
  return `<div class="recs"><h2>${t('panel.health.recs.title')}</h2>${items}</div>`;
}

function buildRecAction(action?: IMetricAction): string {
  if (!action) return '';
  const argsAttr = action.args ? ` data-args='${esc(JSON.stringify(action.args))}'` : '';
  return `<button class="rec-action" data-action-command="${esc(action.command)}"${argsAttr}>${t('panel.health.rec.fix')}</button>`;
}

function gradeColorClass(grade: string): string {
  const letter = grade.charAt(0).toUpperCase();
  if (letter === 'A') return 'grade-a';
  if (letter === 'B') return 'grade-b';
  if (letter === 'C') return 'grade-c';
  if (letter === 'D') return 'grade-d';
  return 'grade-f';
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
