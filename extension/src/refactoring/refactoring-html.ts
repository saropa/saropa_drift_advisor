/**
 * HTML shell for the schema refactoring webview panel (Feature 66).
 *
 * Uses inline script only (no external bundles) to match other advisor panels.
 */
import { t, getWebviewL10nMap } from '../l10n';

export function getRefactoringHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { margin: 0; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); font-size: 13px; }
  .wrap { padding: 12px 14px; max-width: 960px; }
  h1 { font-size: 15px; margin: 0 0 8px; font-weight: 600; }
  .muted { opacity: 0.8; font-size: 12px; margin-bottom: 12px; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
  button { font: inherit; font-size: 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 10px; border-radius: 2px; cursor: pointer; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .card { border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 10px; margin-bottom: 10px; }
  .card h2 { font-size: 13px; margin: 0 0 6px; }
  .badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
  .badge { font-size: 11px; padding: 2px 6px; border-radius: 3px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .evidence { font-size: 12px; margin: 6px 0; padding-left: 16px; }
  .plan { margin-top: 14px; border-top: 1px solid var(--vscode-widget-border); padding-top: 12px; }
  .step { margin-bottom: 10px; }
  .step h3 { font-size: 12px; margin: 0 0 4px; }
  pre { background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-widget-border); padding: 8px; overflow: auto; font-family: var(--vscode-editor-font-family); font-size: 11px; white-space: pre-wrap; }
  .warn { color: var(--vscode-errorForeground); font-size: 12px; margin: 8px 0; }
  .error { color: var(--vscode-errorForeground); margin: 8px 0; }
  label { font-size: 12px; display: flex; align-items: center; gap: 6px; }
  .hint-banner {
    display: none;
    border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background);
    padding: 10px;
    margin-bottom: 12px;
    border-radius: 4px;
    font-size: 12px;
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>${t('panel.quality.refactor.title')}</h1>
  <div class="muted">${t('panel.quality.refactor.subtitle')}</div>
  <div id="hintBanner" class="hint-banner"></div>
  <div class="toolbar">
    <button id="btnAnalyze">${t('panel.quality.refactor.btn.analyze')}</button>
    <label><input type="checkbox" id="riskOnly" /> ${t('panel.quality.refactor.riskOnly')}</label>
    <button class="secondary" id="btnMigration">${t('panel.quality.refactor.btn.migration')}</button>
    <button class="secondary" id="btnGenMigration">${t('panel.quality.refactor.btn.genMigration')}</button>
    <button class="secondary" id="btnSchemaDiff">${t('panel.quality.refactor.btn.schemaDiff')}</button>
    <button class="secondary" id="btnDiagram">${t('panel.quality.refactor.btn.diagram')}</button>
  </div>
  <div id="status" class="muted"></div>
  <div id="error" class="error" style="display:none;"></div>
  <div id="list"></div>
  <div id="plan" class="plan" style="display:none;"></div>
</div>
<script nonce="__CSP_NONCE__">
(function () {
  const vscode = acquireVsCodeApi();

  // __VT bridge (plan 75 §3.3): the host resolves this panel's keys to the active
  // display language and injects them here, because client-side render functions
  // have no host t(). vt() does the same {0}/{1} substitution as the host runtime,
  // fail-soft to the key. Only this panel's keys are shipped (prefix-filtered).
  const __VT = ${JSON.stringify(getWebviewL10nMap(['panel.quality.refactor.']))};
  function vt(key) {
    const args = arguments;
    return (__VT[key] || key).replace(/\\{(\\d+)\\}/g, (m, d) => {
      const i = Number(d) + 1;
      return i < args.length ? args[i] : m;
    });
  }

  const listEl = document.getElementById('list');
  const planEl = document.getElementById('plan');
  const statusEl = document.getElementById('status');
  const errorEl = document.getElementById('error');
  const riskOnlyEl = document.getElementById('riskOnly');
  let suggestions = [];
  let filtered = [];
  let lastPlan = null;

  function setError(msg) {
    if (!msg) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
      return;
    }
    errorEl.style.display = 'block';
    errorEl.textContent = msg;
  }

  function applyFilter() {
    const ro = riskOnlyEl.checked;
    filtered = suggestions.filter(function (s) {
      if (ro && s.estimatedMigrationRisk !== 'high') return false;
      return true;
    });
  }

  function renderList() {
    applyFilter();
    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="muted">' + vt('panel.quality.refactor.client.filter.empty') + '</div>';
      return;
    }
    listEl.innerHTML = filtered.map(function (s) {
      const sid = escapeHtml(s.id);
      const tv = (s.topValues || []).map(function (t) {
        return '<li>' + escapeHtml(t.value) + ' (' + t.count + ')</li>';
      }).join('');
      return (
        '<div class="card" data-sid="' + sid + '">' +
          '<h2>' + escapeHtml(s.title) + '</h2>' +
          '<div class="badges">' +
            '<span class="badge">' + escapeHtml(s.type) + '</span>' +
            '<span class="badge">' + vt('panel.quality.refactor.client.badge.confidence', s.confidence.toFixed(2)) + '</span>' +
            '<span class="badge">' + vt('panel.quality.refactor.client.badge.risk', escapeHtml(s.estimatedMigrationRisk)) + '</span>' +
            '<span class="badge">' + vt('panel.quality.refactor.client.badge.severity', escapeHtml(s.severity)) + '</span>' +
          '</div>' +
          '<div>' + escapeHtml(s.description) + '</div>' +
          '<ul class="evidence">' + s.evidence.map(function (e) { return '<li>' + escapeHtml(e) + '</li>'; }).join('') + '</ul>' +
          (tv ? '<div class="muted">' + vt('panel.quality.refactor.client.topValues') + '</div><ul class="evidence">' + tv + '</ul>' : '') +
          '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">' +
            '<button data-act="plan" data-id="' + sid + '">' + vt('panel.quality.refactor.client.btn.viewPlan') + '</button>' +
            '<button class="secondary" data-act="migAppend" data-id="' + sid + '">' + vt('panel.quality.refactor.client.btn.migAppend') + '</button>' +
            '<button class="secondary" data-act="erFocus" data-id="' + sid + '">' + vt('panel.quality.refactor.client.btn.erFocus') + '</button>' +
            '<button class="secondary" data-act="nlPrefill" data-id="' + sid + '">' + vt('panel.quality.refactor.client.btn.nlPrefill') + '</button>' +
            '<button class="secondary" data-act="dismiss" data-id="' + sid + '">' + vt('panel.quality.refactor.client.btn.dismiss') + '</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    listEl.querySelectorAll('button[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        if (!id) return;
        if (act === 'plan') {
          vscode.postMessage({ command: 'viewPlan', suggestionId: id });
        } else if (act === 'dismiss') {
          planEl.style.display = 'none';
          vscode.postMessage({ command: 'dismiss', suggestionId: id });
        } else if (act === 'migAppend') {
          vscode.postMessage({ command: 'openMigrationPreviewWithPlan', suggestionId: id });
        } else if (act === 'erFocus') {
          vscode.postMessage({ command: 'openErDiagramFocused', suggestionId: id });
        } else if (act === 'nlPrefill') {
          vscode.postMessage({ command: 'openNlSqlPrefilled', suggestionId: id });
        }
      });
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderPlan(payload) {
    lastPlan = payload;
    const p = payload.plan;
    const s = payload.suggestion;
    planEl.style.display = 'block';
    const warns = (p.preflightWarnings || []).map(function (w) {
      return '<div class="warn">' + escapeHtml(w) + '</div>';
    }).join('');
    const steps = (p.steps || []).map(function (st, i) {
      const tag = st.destructive ? ' <span class="badge">' + vt('panel.quality.refactor.client.step.destructive') + '</span>' : '';
      const rev = st.reversible
        ? vt('panel.quality.refactor.client.step.reversible')
        : vt('panel.quality.refactor.client.step.notReversible');
      return (
        '<div class="step">' +
          '<h3>' + vt('panel.quality.refactor.client.step.heading', (i + 1), escapeHtml(st.title)) + ' <span class="badge">' + rev + '</span>' + tag + '</h3>' +
          '<div class="muted">' + escapeHtml(st.description) + '</div>' +
          '<pre>' + escapeHtml(st.sql) + '</pre>' +
        '</div>'
      );
    }).join('');
    planEl.innerHTML =
      '<h2>' + vt('panel.quality.refactor.client.plan.heading', escapeHtml(s.title)) + '</h2>' + warns + steps +
      '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;">' +
        '<button id="copySql">' + vt('panel.quality.refactor.client.btn.copySql') + '</button>' +
        '<button class="secondary" id="copyDart">' + vt('panel.quality.refactor.client.btn.copyDart') + '</button>' +
        '<button class="secondary" id="copyDrift">' + vt('panel.quality.refactor.client.btn.copyDrift') + '</button>' +
      '</div>' +
      '<pre id="dartPreview" style="margin-top:10px;max-height:180px;">' + escapeHtml(p.dartCode || '') + '</pre>';

    document.getElementById('copySql').addEventListener('click', function () {
      vscode.postMessage({ command: 'copySql', suggestionId: s.id });
    });
    document.getElementById('copyDart').addEventListener('click', function () {
      vscode.postMessage({ command: 'copyDart', suggestionId: s.id });
    });
    document.getElementById('copyDrift').addEventListener('click', function () {
      vscode.postMessage({ command: 'copyDriftTable', suggestionId: s.id });
    });
  }

  window.addEventListener('message', function (event) {
    const msg = event.data || {};
    if (msg.command === 'analyzing') {
      statusEl.textContent = vt('panel.quality.refactor.client.status.analyzing');
      setError('');
      return;
    }
    if (msg.command === 'suggestions') {
      statusEl.textContent = vt('panel.quality.refactor.client.status.analyzed', (msg.tableCount || 0), (msg.suggestions || []).length);
      suggestions = msg.suggestions || [];
      setError('');
      var hb = document.getElementById('hintBanner');
      if (hb && !msg.preserveDismissed) {
        hb.style.display = 'none';
        hb.innerHTML = '';
      }
      renderList();
      return;
    }
    if (msg.command === 'externalHint') {
      var el = document.getElementById('hintBanner');
      if (!el) return;
      el.style.display = 'block';
      // {1} carries the optional ".column" suffix (escaped), or '' when absent, so
      // the table line stays one reorderable sentence instead of concatenated parts.
      var colSuffix = msg.column ? '.' + escapeHtml(String(msg.column)) : '';
      var tbl = msg.table
        ? '<div class="muted">' + vt('panel.quality.refactor.client.hint.table', escapeHtml(String(msg.table)), colSuffix) + '</div>'
        : '';
      el.innerHTML =
        '<div><strong>' + escapeHtml(String(msg.title || vt('panel.quality.refactor.client.hint.titleFallback'))) + '</strong>' + tbl +
        '<p style="margin:6px 0;">' + escapeHtml(String(msg.description || '')) + '</p>' +
        '<button type="button" id="hintDismiss">' + vt('panel.quality.refactor.client.hint.dismiss') + '</button> ' +
        '<button type="button" id="hintRunAnalyze">' + vt('panel.quality.refactor.client.hint.runAnalyze') + '</button></div>';
      document.getElementById('hintDismiss').addEventListener('click', function () {
        el.style.display = 'none';
        el.innerHTML = '';
      });
      document.getElementById('hintRunAnalyze').addEventListener('click', function () {
        el.style.display = 'none';
        el.innerHTML = '';
        planEl.style.display = 'none';
        vscode.postMessage({ command: 'analyze' });
      });
      return;
    }
    if (msg.command === 'plan') {
      renderPlan({ plan: msg.plan, suggestion: msg.suggestion });
      return;
    }
    if (msg.command === 'error') {
      statusEl.textContent = '';
      setError(msg.message || vt('panel.quality.refactor.client.error.unknown'));
      return;
    }
    if (msg.command === 'empty') {
      statusEl.textContent = msg.reason || vt('panel.quality.refactor.client.empty.fallback');
      suggestions = [];
      renderList();
      return;
    }
  });

  document.getElementById('btnAnalyze').addEventListener('click', function () {
    planEl.style.display = 'none';
    vscode.postMessage({ command: 'analyze' });
  });
  riskOnlyEl.addEventListener('change', function () { renderList(); });
  document.getElementById('btnMigration').addEventListener('click', function () {
    vscode.postMessage({ command: 'openMigrationPreview' });
  });
  document.getElementById('btnDiagram').addEventListener('click', function () {
    vscode.postMessage({ command: 'openSchemaDiagram' });
  });
  document.getElementById('btnGenMigration').addEventListener('click', function () {
    vscode.postMessage({ command: 'openGenerateMigration' });
  });
  document.getElementById('btnSchemaDiff').addEventListener('click', function () {
    vscode.postMessage({ command: 'openSchemaDiff' });
  });

  vscode.postMessage({ command: 'analyze' });
})();
</script>
</body>
</html>`;
}
