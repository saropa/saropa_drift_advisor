/**
 * Analytics tool panel init functions: index suggestions, size analytics,
 * anomaly detection.
 *
 * Split from tools.ts for modularity — each tool group gets its own file.
 * These three tools share a common pattern: fetch from /api, render results,
 * and support save/export/compare via analysis.ts helpers.
 */
import * as S from './state.ts';
import { esc, setButtonBusy, syncFeatureCardExpanded } from './utils.ts';
import { populateHistorySelect, getSavedAnalyses, getSavedAnalysisById, saveAnalysis, downloadJSON, showAnalysisCompare } from './analysis.ts';
import { showCopyToast } from './table-view.ts';
import { openTableTab } from './tabs.ts';
import { vt } from './l10n.ts';

export function initIndexSuggestions(): void {
  const toggle = document.getElementById('index-toggle');
  const collapsible = document.getElementById('index-collapsible');
  const btn = document.getElementById('index-analyze');
  const container = document.getElementById('index-results');
  const saveBtn = document.getElementById('index-save');
  const exportBtn = document.getElementById('index-export');
  const historySel = document.getElementById('index-history');
  const compareBtn = document.getElementById('index-compare');
  var lastIndexData = null;

  // When `interactive` is true (the live Analyze result, not the read-only
  // compare/history views), each row gets a checkbox and a bulk action bar so
  // the user can preview and apply several CREATE INDEX statements at once.
  // Checkboxes are keyed by row index (data-idx) and the SQL is read back from
  // lastIndexData — never embedded in an attribute, since esc() does not escape
  // double quotes and index SQL is full of them.
  function renderIndexData(data, interactive?: any) {
    if (!data) return '<p class="meta">' + vt('viewer.tools.index.empty') + '</p>';
    var suggestions = data.suggestions || [];
    if (suggestions.length === 0) {
      return '<p class="meta" style="color:#7cb342;">' + vt('viewer.tools.index.none') + '</p>';
    }
    var priorityColors = { high: '#e57373', medium: '#ffb74d', low: '#7cb342' };
    var priorityIcons = { high: '!!', medium: '!', low: '\u2713' };
    var html = '<p class="meta">' + vt('viewer.tools.index.summary', suggestions.length, data.tablesAnalyzed || 0) + '</p>';
    html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
    html += '<tr>';
    if (interactive) html += '<th style="border:1px solid var(--border);padding:4px;"><input type="checkbox" id="index-select-all" title="' + vt('viewer.tools.index.selectAll') + '"></th>';
    html += '<th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.tools.index.col.priority') + '</th><th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.tools.index.col.tableColumn') + '</th><th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.tools.index.col.reason') + '</th><th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.tools.index.col.sql') + '</th></tr>';
    suggestions.forEach(function(s, i) {
      var color = priorityColors[s.priority] || 'var(--fg)';
      var icon = priorityIcons[s.priority] || '';
      html += '<tr>';
      if (interactive) html += '<td style="border:1px solid var(--border);padding:4px;text-align:center;"><input type="checkbox" class="idx-cb" data-idx="' + i + '"></td>';
      html += '<td style="border:1px solid var(--border);padding:4px;color:' + color + ';font-weight:bold;">[' + esc(icon) + '] ' + esc(s.priority).toUpperCase() + '</td>';
      html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(s.table) + '.' + esc(s.column) + '</td>';
      html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(s.reason) + '</td>';
      html += '<td style="border:1px solid var(--border);padding:4px;"><code style="font-size:11px;cursor:pointer;" title="' + vt('viewer.tools.index.copyHint') + '" onclick="navigator.clipboard.writeText(this.textContent)">' + esc(s.sql) + '</code></td>';
      html += '</tr>';
    });
    html += '</table>';
    if (interactive) {
      html += '<div class="index-bulk-bar" style="margin-top:0.5rem;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">';
      html += '<span id="index-sel-count" class="meta">' + vt('viewer.tools.index.selected', 0) + '</span>';
      html += '<button id="index-preview-sel" class="btn" disabled>' + vt('viewer.tools.index.previewSql') + '</button>';
      if (S.driftWriteEnabled) {
        html += '<button id="index-apply-sel" class="btn" disabled>' + vt('viewer.tools.index.applySelected') + '</button>';
      } else {
        html += '<span class="meta" title="' + vt('viewer.tools.index.applyDisabledHint') + '">' + vt('viewer.tools.index.applyDisabled') + '</span>';
      }
      html += '</div>';
      html += '<div id="index-preview-out" style="display:none;margin-top:0.5rem;"></div>';
      html += '<div id="index-apply-out" style="display:none;margin-top:0.5rem;"></div>';
    }
    return html;
  }

  function showIndexResult(html: any, isError?: any) {
    container.innerHTML = html;
    container.style.display = 'block';
  }

  /** SQL strings for the currently-checked suggestion rows (looked up by data-idx). */
  function getSelectedIndexSqls(): string[] {
    var out: string[] = [];
    if (!container || !lastIndexData) return out;
    var boxes = container.querySelectorAll('input.idx-cb');
    Array.prototype.forEach.call(boxes, function(cb: any) {
      if (!cb.checked) return;
      var idx = parseInt(cb.getAttribute('data-idx'), 10);
      var s = (lastIndexData.suggestions || [])[idx];
      if (s && s.sql) out.push(s.sql);
    });
    return out;
  }

  /** Reflects the current selection count into the bar and enables/disables actions. */
  function refreshIndexSelection(): void {
    if (!container) return;
    var count = getSelectedIndexSqls().length;
    var countEl = document.getElementById('index-sel-count');
    if (countEl) countEl.textContent = vt('viewer.tools.index.selected', count);
    var previewBtn = document.getElementById('index-preview-sel') as any;
    if (previewBtn) previewBtn.disabled = count === 0;
    var applyBtn = document.getElementById('index-apply-sel') as any;
    if (applyBtn) applyBtn.disabled = count === 0;
  }

  function renderPreviewOutput(data: any): string {
    var valid = (data && data.valid) || [];
    var rejected = (data && data.rejected) || [];
    var html = '<p class="meta">' + vt('viewer.tools.index.preview.summary', valid.length, rejected.length) + '</p>';
    if (valid.length) {
      html += '<pre style="white-space:pre-wrap;font-size:11px;background:rgba(0,0,0,0.12);padding:0.4rem;border-radius:4px;">' + valid.map(esc).join('\n') + '</pre>';
    }
    // SQL + reason are pre-escaped/wrapped at the call site; the value carries the {0}/{1} tokens only.
    rejected.forEach(function(r: any) {
      html += '<div style="color:#e57373;font-size:11px;margin:0.2rem 0;">' + vt('viewer.tools.index.preview.rejected', '<code>' + esc(r.sql) + '</code>', esc(r.reason)) + '</div>';
    });
    return html;
  }

  function renderApplyOutput(data: any): string {
    var results = (data && data.results) || [];
    var html = '<p class="meta">' + vt('viewer.tools.index.apply.summary', data.applied || 0, results.length) + '</p>';
    results.forEach(function(r: any) {
      var ok = r.ok === true;
      var color = ok ? '#7cb342' : '#e57373';
      var mark = ok ? vt('viewer.tools.index.apply.ok') : vt('viewer.tools.index.apply.fail');
      html += '<div style="color:' + color + ';font-size:11px;margin:0.2rem 0;">[' + mark + '] <code>' + esc(r.sql) + '</code>';
      if (!ok && r.error) html += vt('viewer.tools.index.apply.errorSuffix', esc(r.error));
      html += '</div>';
    });
    return html;
  }

  if (toggle && collapsible) {
    toggle.addEventListener('click', function() {
      const isCollapsed = collapsible.classList.contains('collapsed');
      collapsible.classList.toggle('collapsed', !isCollapsed);
      syncFeatureCardExpanded(collapsible);
    });
  }

  if (historySel) {
    populateHistorySelect(historySel, 'index');
    historySel.addEventListener('change', function() {
      var id = this.value;
      if (!id) return;
      var saved = getSavedAnalysisById('index', id);
      if (saved && saved.data) {
        lastIndexData = saved.data;
        showIndexResult(renderIndexData(saved.data));
      }
    });
  }

  // Delegated handlers on the results container: the bulk bar and checkboxes are
  // re-rendered on every Analyze (innerHTML), so binding here (once) survives
  // re-renders rather than re-attaching per row.
  if (container) {
    container.addEventListener('change', function(e: any) {
      var t = e.target;
      if (!t) return;
      if (t.id === 'index-select-all') {
        var boxes = container.querySelectorAll('input.idx-cb');
        Array.prototype.forEach.call(boxes, function(cb: any) { cb.checked = t.checked; });
        refreshIndexSelection();
      } else if (t.classList && t.classList.contains('idx-cb')) {
        refreshIndexSelection();
      }
    });

    container.addEventListener('click', function(e: any) {
      var t = e.target;
      if (!t) return;
      if (t.id === 'index-preview-sel') {
        var sqls = getSelectedIndexSqls();
        if (sqls.length === 0) return;
        var out = document.getElementById('index-preview-out');
        setButtonBusy(t, true, vt('viewer.tools.index.busy.preview'));
        t.disabled = true;
        fetch('/api/indexes/preview', S.authOpts({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ indexSqls: sqls }),
        }))
          .then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || vt('viewer.tools.index.requestFailed')); });
            return r.json();
          })
          .then(function(data) {
            if (out) { out.innerHTML = renderPreviewOutput(data); out.style.display = 'block'; }
          })
          .catch(function(err) {
            if (out) { out.innerHTML = '<p class="meta" style="color:#e57373;">' + vt('viewer.tools.index.error', esc(err.message)) + '</p>'; out.style.display = 'block'; }
          })
          .finally(function() { setButtonBusy(t, false, vt('viewer.tools.index.previewSql')); refreshIndexSelection(); });
      } else if (t.id === 'index-apply-sel') {
        var applySqls = getSelectedIndexSqls();
        if (applySqls.length === 0) return;
        if (!window.confirm(vt('viewer.tools.index.apply.confirm', applySqls.length))) return;
        var applyOut = document.getElementById('index-apply-out');
        setButtonBusy(t, true, vt('viewer.tools.index.busy.apply'));
        t.disabled = true;
        fetch('/api/indexes/apply', S.authOpts({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ indexSqls: applySqls }),
        }))
          .then(function(r) {
            if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || vt('viewer.tools.index.requestFailed')); });
            return r.json();
          })
          .then(function(data) {
            if (applyOut) { applyOut.innerHTML = renderApplyOutput(data); applyOut.style.display = 'block'; }
            showCopyToast(vt('viewer.tools.index.apply.toast', data.applied || 0));
          })
          .catch(function(err) {
            if (applyOut) { applyOut.innerHTML = '<p class="meta" style="color:#e57373;">' + vt('viewer.tools.index.error', esc(err.message)) + '</p>'; applyOut.style.display = 'block'; }
          })
          .finally(function() { setButtonBusy(t, false, vt('viewer.tools.index.applySelected')); refreshIndexSelection(); });
      }
    });
  }

  if (btn) btn.addEventListener('click', function() {
    btn.disabled = true;
    setButtonBusy(btn, true, vt('viewer.tools.index.busy.analyze'));
    container.style.display = 'none';
    fetch('/api/index-suggestions', S.authOpts())
      .then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || vt('viewer.tools.index.requestFailed')); });
        return r.json();
      })
      .then(function(data) {
        lastIndexData = data;
        // Live result is interactive (checkboxes + bulk preview/apply bar);
        // the read-only compare/history views call renderIndexData without it.
        showIndexResult(renderIndexData(data, true));
        refreshIndexSelection();
        populateHistorySelect(historySel, 'index');
      })
      .catch(function(e) {
        showIndexResult('<p class="meta" style="color:#e57373;">' + vt('viewer.tools.index.error', esc(e.message)) + '</p>');
      })
      .finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, vt('viewer.tools.index.analyze'));
      });
  });

  if (saveBtn) saveBtn.addEventListener('click', function() {
    if (!lastIndexData) return;
    var id = saveAnalysis('index', lastIndexData);
    showCopyToast(id != null ? vt('viewer.tools.analysis.saved') : vt('viewer.tools.analysis.saveFailed'));
    populateHistorySelect(historySel, 'index');
  });

  if (exportBtn) exportBtn.addEventListener('click', function() {
    if (!lastIndexData) return;
    downloadJSON(lastIndexData, 'index-suggestions-' + (new Date().toISOString().slice(0, 10)) + '.json');
  });

  if (compareBtn) compareBtn.addEventListener('click', function() {
    showAnalysisCompare('index', vt('viewer.tools.index.compareTitle'), getSavedAnalyses('index'), lastIndexData, renderIndexData, function(a, b) {
      var sa = (a && a.suggestions) ? a.suggestions.length : 0;
      var sb = (b && b.suggestions) ? b.suggestions.length : 0;
      return vt('viewer.tools.index.compareSummary', sa, sb);
    });
  });
}

export function initSizeAnalytics(): void {
  const toggle = document.getElementById('size-toggle');
  const collapsible = document.getElementById('size-collapsible');
  const btn = document.getElementById('size-analyze');
  const container = document.getElementById('size-results');
  const saveBtn = document.getElementById('size-save');
  const exportBtn = document.getElementById('size-export');
  const historySel = document.getElementById('size-history');
  const compareBtn = document.getElementById('size-compare');

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  /**
   * Native `title` tooltips for Size analytics (matches PRAGMA semantics in analytics_handler).
   * Shown on hover for read-only labels, values, headers, and cells.
   */
  var SIZE_TT = {
    totalCard: vt('viewer.tools.size.tt.totalCard'),
    usedCard: vt('viewer.tools.size.tt.usedCard'),
    freeCard: vt('viewer.tools.size.tt.freeCard'),
    journalCard: vt('viewer.tools.size.tt.journalCard'),
    pagesTotal: vt('viewer.tools.size.tt.pagesTotal'),
    pagesFormula: vt('viewer.tools.size.tt.pagesFormula'),
    thTable: vt('viewer.tools.size.tt.thTable'),
    thRows: vt('viewer.tools.size.tt.thRows'),
    thColumns: vt('viewer.tools.size.tt.thColumns'),
    thIndexes: vt('viewer.tools.size.tt.thIndexes'),
    tdTableLink: vt('viewer.tools.size.tt.tdTableLink'),
    tdRows: vt('viewer.tools.size.tt.tdRows'),
    tdColumns: vt('viewer.tools.size.tt.tdColumns'),
    tdIndexes: vt('viewer.tools.size.tt.tdIndexes')
  };

  function renderSizeData(data) {
    if (!data) return '<p class="meta">' + vt('viewer.tools.size.empty') + '</p>';
    var html = '<div style="margin:0.5rem 0;">';
    html += '<div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:0.5rem;">';
    html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc(SIZE_TT.totalCard) + '">';
    html += '<div class="meta">' + vt('viewer.tools.size.card.total') + '</div>';
    html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.totalSizeBytes) + '</div></div>';
    html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc(SIZE_TT.usedCard) + '">';
    html += '<div class="meta">' + vt('viewer.tools.size.card.used') + '</div>';
    html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.usedSizeBytes) + '</div></div>';
    html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc(SIZE_TT.freeCard) + '">';
    html += '<div class="meta">' + vt('viewer.tools.size.card.free') + '</div>';
    html += '<div style="font-size:1.2rem;font-weight:bold;">' + formatBytes(data.freeSpaceBytes) + '</div></div>';
    html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc(SIZE_TT.journalCard) + '">';
    html += '<div class="meta">' + vt('viewer.tools.size.card.journal') + '</div>';
    html += '<div style="font-size:1.2rem;font-weight:bold;">' + esc(data.journalMode || '') + '</div></div>';
    html += '<div style="padding:0.5rem;border:1px solid var(--border);border-radius:4px;" title="' + esc(SIZE_TT.pagesTotal) + '">';
    html += '<div class="meta">' + vt('viewer.tools.size.card.pages') + '</div>';
    var pc = data.pageCount || 0;
    var ps = data.pageSize || 0;
    var pageBytes = pc * ps;
    html += '<div style="font-size:1.2rem;font-weight:bold;line-height:1.2;" title="' + esc(SIZE_TT.pagesTotal) + '">' + pageBytes.toLocaleString() + '</div>';
    html += '<div class="meta size-pages-formula" title="' + esc(SIZE_TT.pagesFormula) + '">(' + pc.toLocaleString() + ' × ' + ps.toLocaleString() + ')</div></div>';
    html += '</div>';
    html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
    html += '<tr><th style="border:1px solid var(--border);padding:4px;" title="' + esc(SIZE_TT.thTable) + '">' + vt('viewer.tools.size.col.table') + '</th>';
    html += '<th style="border:1px solid var(--border);padding:4px;min-width:8rem;" title="' + esc(SIZE_TT.thRows) + '">' + vt('viewer.tools.size.col.rows') + '</th>';
    html += '<th style="border:1px solid var(--border);padding:4px;text-align:right;" title="' + esc(SIZE_TT.thColumns) + '">' + vt('viewer.tools.size.col.columns') + '</th>';
    html += '<th style="border:1px solid var(--border);padding:4px;" title="' + esc(SIZE_TT.thIndexes) + '">' + vt('viewer.tools.size.col.indexes') + '</th></tr>';
    var tables = data.tables || [];
    var maxRows = Math.max.apply(null, tables.map(function(t) { return t.rowCount; }).concat([1]));
    tables.forEach(function(t) {
      var barWidth = Math.max(1, (t.rowCount / maxRows) * 100);
      html += '<tr>';
      html += '<td style="border:1px solid var(--border);padding:4px;"><a href="#" class="table-link size-table-link" data-table="' + esc(t.table) + '" title="' + esc(SIZE_TT.tdTableLink) + '">' + esc(t.table) + '</a></td>';
      html += '<td style="border:1px solid var(--border);padding:4px;white-space:nowrap;" title="' + esc(SIZE_TT.tdRows) + '">';
      html += '<div style="background:var(--link);height:12px;width:' + barWidth + '%;opacity:0.3;display:inline-block;vertical-align:middle;margin-right:4px;"></div>';
      html += t.rowCount.toLocaleString() + '</td>';
      html += '<td style="border:1px solid var(--border);padding:4px;text-align:right;font-variant-numeric:tabular-nums;" title="' + esc(SIZE_TT.tdColumns) + '">' + t.columnCount + '</td>';
      html += '<td style="border:1px solid var(--border);padding:4px;" title="' + esc(SIZE_TT.tdIndexes) + '">' + t.indexCount;
      if (t.indexes && t.indexes.length > 0) html += ' <span class="size-index-names">(' + t.indexes.map(esc).join(', ') + ')</span>';
      html += '</td></tr>';
    });
    html += '</table></div>';
    return html;
  }

  // Table names link to openTableTab (same as sidebar); delegated because rows are innerHTML.
  if (container) {
    container.addEventListener('click', function(e) {
      var a = e.target.closest('a.size-table-link');
      if (!a || !container.contains(a)) return;
      e.preventDefault();
      var name = a.getAttribute('data-table');
      if (name) openTableTab(name);
    });
  }

  if (toggle && collapsible) {
    toggle.addEventListener('click', function() {
      const isCollapsed = collapsible.classList.contains('collapsed');
      collapsible.classList.toggle('collapsed', !isCollapsed);
      syncFeatureCardExpanded(collapsible);
    });
  }

  if (historySel) {
    populateHistorySelect(historySel, 'size');
    historySel.addEventListener('change', function() {
      var id = this.value;
      if (!id) return;
      var saved = getSavedAnalysisById('size', id);
      if (saved && saved.data) {
        S.setLastSizeAnalyticsData(saved.data);
        container.innerHTML = renderSizeData(saved.data);
        container.style.display = 'block';
      }
    });
  }

  if (btn) btn.addEventListener('click', function() {
    btn.disabled = true;
    setButtonBusy(btn, true, vt('viewer.tools.size.busy.analyze'));
    container.style.display = 'none';
    fetch('/api/analytics/size', S.authOpts())
      .then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || vt('viewer.tools.size.requestFailed')); });
        return r.json();
      })
      .then(function(data) {
        S.setLastSizeAnalyticsData(data);
        container.innerHTML = renderSizeData(data);
        container.style.display = 'block';
        populateHistorySelect(historySel, 'size');
      })
      .catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">' + vt('viewer.tools.size.error', esc(e.message)) + '</p>';
        container.style.display = 'block';
      })
      .finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, vt('viewer.tools.size.analyze'));
      });
  });

  if (saveBtn) saveBtn.addEventListener('click', function() {
    if (!S.lastSizeAnalyticsData) return;
    var id = saveAnalysis('size', S.lastSizeAnalyticsData);
    showCopyToast(id != null ? vt('viewer.tools.analysis.saved') : vt('viewer.tools.analysis.saveFailed'));
    populateHistorySelect(historySel, 'size');
  });

  if (exportBtn) exportBtn.addEventListener('click', function() {
    if (!S.lastSizeAnalyticsData) return;
    downloadJSON(S.lastSizeAnalyticsData, 'size-analytics-' + (new Date().toISOString().slice(0, 10)) + '.json');
  });

  if (compareBtn) compareBtn.addEventListener('click', function() {
    showAnalysisCompare('size', vt('viewer.tools.size.compareTitle'), getSavedAnalyses('size'), S.lastSizeAnalyticsData, renderSizeData, function(a, b) {
      var ta = (a && a.totalSizeBytes) != null ? formatBytes(a.totalSizeBytes) : '—';
      var tb = (b && b.totalSizeBytes) != null ? formatBytes(b.totalSizeBytes) : '—';
      return vt('viewer.tools.size.compareSummary', ta, tb);
    });
  });
}

export function initAnomalyDetection(): void {
  const toggle = document.getElementById('anomaly-toggle');
  const collapsible = document.getElementById('anomaly-collapsible');
  const btn = document.getElementById('anomaly-analyze');
  const container = document.getElementById('anomaly-results');
  const saveBtn = document.getElementById('anomaly-save');
  const exportBtn = document.getElementById('anomaly-export');
  const historySel = document.getElementById('anomaly-history');
  const compareBtn = document.getElementById('anomaly-compare');
  var lastAnomalyData = null;

  /**
   * Computes a health score (0-100) and letter grade (A-F) from anomaly results.
   * Errors deduct 15pts each, warnings 5pts, info 1pt.  Score floors at 0.
   */
  function computeHealthScore(anomalies) {
    var score = 100;
    (anomalies || []).forEach(function(a) {
      if (a.severity === 'error') score -= 15;
      else if (a.severity === 'warning') score -= 5;
      else score -= 1;
    });
    if (score < 0) score = 0;
    var grade;
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';
    else grade = 'F';
    var color;
    if (score >= 80) color = '#81c784';
    else if (score >= 60) color = '#ffb74d';
    else color = '#e57373';
    return { score: score, grade: grade, color: color };
  }

  function renderAnomalyData(data) {
    if (!data) return '<p class="meta">' + vt('viewer.tools.anomaly.empty') + '</p>';
    var anomalies = data.anomalies || [];
    var health = computeHealthScore(anomalies);
    // Health score pill: always shown after a scan (even when clean)
    var html = '<div class="health-score-pill" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.4rem 0.8rem;margin:0.4rem 0;border-radius:6px;background:rgba(0,0,0,0.15);font-size:14px;">';
    html += '<span style="font-size:1.6em;font-weight:700;color:' + health.color + ';">' + health.grade + '</span>';
    html += '<span style="color:' + health.color + ';font-weight:600;">' + health.score + '/100</span>';
    html += '<span class="meta" style="margin-left:0.3rem;">' + vt('viewer.tools.anomaly.across', data.tablesScanned || 0) + '</span>';
    html += '</div>';
    if (anomalies.length === 0) {
      html += '<p class="meta" style="color:#7cb342;">' + vt('viewer.tools.anomaly.clean') + '</p>';
      return html;
    }
    // Breakdown: count by severity
    var errCount = 0, warnCount = 0, infoCount = 0;
    anomalies.forEach(function(a) {
      if (a.severity === 'error') errCount++;
      else if (a.severity === 'warning') warnCount++;
      else infoCount++;
    });
    // Singular/plural split per severity; markup wraps the localized count at the call site.
    var breakdown = [];
    if (errCount) breakdown.push('<span style="color:#e57373;">' + vt(errCount === 1 ? 'viewer.tools.anomaly.errors.one' : 'viewer.tools.anomaly.errors.many', errCount) + '</span>');
    if (warnCount) breakdown.push('<span style="color:#ffb74d;">' + vt(warnCount === 1 ? 'viewer.tools.anomaly.warnings.one' : 'viewer.tools.anomaly.warnings.many', warnCount) + '</span>');
    if (infoCount) breakdown.push('<span style="color:#7cb342;">' + vt('viewer.tools.anomaly.info', infoCount) + '</span>');
    // {1} is the pre-wrapped severity breakdown markup; {0} the total finding count.
    html += '<p class="meta">' + vt('viewer.tools.anomaly.findings', anomalies.length, breakdown.join(', ')) + '</p>';
    var icons = { error: '!!', warning: '!', info: 'i' };
    var colors = { error: '#e57373', warning: '#ffb74d', info: '#7cb342' };
    anomalies.forEach(function(a) {
      var color = colors[a.severity] || 'var(--fg)';
      var icon = icons[a.severity] || '';
      html += '<div style="padding:0.3rem 0.5rem;margin:0.2rem 0;border-left:3px solid ' + color + ';background:rgba(0,0,0,0.1);">';
      html += '<span style="color:' + color + ';font-weight:bold;">[' + icon + '] ' + esc(a.severity).toUpperCase() + '</span> ';
      html += esc(a.message);
      if (a.count) html += ' <span class="meta">(' + a.count + ')</span>';
      html += '</div>';
    });
    return html;
  }

  if (toggle && collapsible) {
    toggle.addEventListener('click', function() {
      const isCollapsed = collapsible.classList.contains('collapsed');
      collapsible.classList.toggle('collapsed', !isCollapsed);
      syncFeatureCardExpanded(collapsible);
    });
  }

  if (historySel) {
    populateHistorySelect(historySel, 'anomaly');
    historySel.addEventListener('change', function() {
      var id = this.value;
      if (!id) return;
      var saved = getSavedAnalysisById('anomaly', id);
      if (saved && saved.data) {
        lastAnomalyData = saved.data;
        container.innerHTML = renderAnomalyData(saved.data);
        container.style.display = 'block';
      }
    });
  }

  if (btn) btn.addEventListener('click', function() {
    btn.disabled = true;
    setButtonBusy(btn, true, vt('viewer.tools.anomaly.busy.scan'));
    container.style.display = 'none';
    fetch('/api/analytics/anomalies', S.authOpts())
      .then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || vt('viewer.tools.anomaly.requestFailed')); });
        return r.json();
      })
      .then(function(data) {
        lastAnomalyData = data;
        container.innerHTML = renderAnomalyData(data);
        container.style.display = 'block';
        populateHistorySelect(historySel, 'anomaly');
      })
      .catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">' + vt('viewer.tools.anomaly.error', esc(e.message)) + '</p>';
        container.style.display = 'block';
      })
      .finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, vt('viewer.tools.anomaly.scan'));
      });
  });

  if (saveBtn) saveBtn.addEventListener('click', function() {
    if (!lastAnomalyData) return;
    var id = saveAnalysis('anomaly', lastAnomalyData);
    showCopyToast(id != null ? vt('viewer.tools.analysis.saved') : vt('viewer.tools.analysis.saveFailed'));
    populateHistorySelect(historySel, 'anomaly');
  });

  if (exportBtn) exportBtn.addEventListener('click', function() {
    if (!lastAnomalyData) return;
    downloadJSON(lastAnomalyData, 'anomaly-scan-' + (new Date().toISOString().slice(0, 10)) + '.json');
  });

  if (compareBtn) compareBtn.addEventListener('click', function() {
    showAnalysisCompare('anomaly', vt('viewer.tools.anomaly.compareTitle'), getSavedAnalyses('anomaly'), lastAnomalyData, renderAnomalyData, function(a, b) {
      var na = (a && a.anomalies) ? a.anomalies.length : 0;
      var nb = (b && b.anomalies) ? b.anomalies.length : 0;
      return vt('viewer.tools.anomaly.compareSummary', na, nb);
    });
  });
}
