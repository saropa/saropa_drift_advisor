/**
 * Performance monitoring tab — query timings, charts, export.
 */
import * as S from './state.ts';
import { esc, setButtonBusy, syncFeatureCardExpanded } from './utils.ts';
import { getPref, PREF_SLOW_QUERY_THRESHOLD, DEFAULTS } from './settings.ts';
import { renderBarChart, renderLineChart, applyChartUI, getChartSize, exportChartPng, exportChartSvg, exportChartCopy } from './charts.ts';
import { populateHistorySelect, getSavedAnalyses, getSavedAnalysisById, saveAnalysis, downloadJSON, showAnalysisCompare } from './analysis.ts';
import { showCopyToast } from './table-view.ts';
import { vt } from './l10n.ts';

export function initPerformance(): void {
  const toggle = document.getElementById('perf-toggle');
  const collapsible = document.getElementById('perf-collapsible');
  const refreshBtn = document.getElementById('perf-refresh');
  const clearBtn = document.getElementById('perf-clear');
  const container = document.getElementById('perf-results');
  const saveBtn = document.getElementById('perf-save');
  const exportBtn = document.getElementById('perf-export');
  const historySel = document.getElementById('perf-history');
  const compareBtn = document.getElementById('perf-compare');
  const slowThresholdInput = document.getElementById('perf-slow-threshold');
  let perfLoaded = false;
  var lastPerfData = null;

  /** Read the slow-query threshold from the input, falling back to the
   *  user's stored preference (default 100 ms). */
  function getSlowThreshold() {
    var fallback = getPref(PREF_SLOW_QUERY_THRESHOLD, DEFAULTS[PREF_SLOW_QUERY_THRESHOLD]);
    if (!slowThresholdInput) return fallback;
    var v = parseInt(slowThresholdInput.value, 10);
    return (v > 0) ? v : fallback;
  }

  function fetchPerformance() {
    if (!refreshBtn || !container) return;
    refreshBtn.disabled = true;
    setButtonBusy(refreshBtn, true, vt('viewer.session.perf.loading'));
    container.style.display = 'none';
    var threshold = getSlowThreshold();
    fetch('/api/analytics/performance?slowThresholdMs=' + threshold, S.authOpts())
      .then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || vt('viewer.session.perf.requestFailed')); });
        return r.json();
      })
      .then(function(data) {
        perfLoaded = true;
        lastPerfData = data;
        if (data.totalQueries === 0) {
          container.innerHTML = '<p class="meta">' + vt('viewer.session.perf.empty') + '</p>';
        } else {
          container.innerHTML = renderPerformance(data);
        }
        container.style.display = 'block';
        populateHistorySelect(historySel, 'perf');
      })
      .catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">' + vt('viewer.session.perf.error', esc(e.message)) + '</p>';
        container.style.display = 'block';
      })
      .finally(function() {
        // Restore Update button state so user can run again
        if (refreshBtn) {
          refreshBtn.disabled = false;
          setButtonBusy(refreshBtn, false, vt('viewer.session.perf.update'));
        }
      });
  }

  function renderPerformance(data) {
    if (!data) return '<p class="meta">' + vt('viewer.session.perf.noData') + '</p>';
    var html = '<div style="display:flex;gap:1rem;flex-wrap:wrap;margin:0.3rem 0;">';
    html += '<div class="meta">' + vt('viewer.session.perf.summary.total', esc(String(data.totalQueries || 0))) + '</div>';
    html += '<div class="meta">' + vt('viewer.session.perf.summary.totalTime', esc(String(data.totalDurationMs || 0))) + '</div>';
    html += '<div class="meta">' + vt('viewer.session.perf.summary.avg', esc(String(data.avgDurationMs || 0))) + '</div>';
    html += '</div>';

    if (data.slowQueries && data.slowQueries.length > 0) {
      var thresh = data.slowThresholdMs || 100;
      html += '<p class="meta" style="color:#e57373;font-weight:bold;">' + vt('viewer.session.perf.slow.heading', esc(String(thresh))) + '</p>';
      html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
      html += '<tr><th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.session.perf.col.duration') + '</th>';
      html += '<th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.session.perf.col.rows') + '</th>';
      html += '<th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.session.perf.col.time') + '</th>';
      html += '<th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.session.perf.col.sql') + '</th></tr>';
      data.slowQueries.forEach(function(q) {
        var sql = q.sql || '';
        html += '<tr>';
        // Prefix with [!!] icon so slow status is conveyed without color alone
        // [!!] icon is a status symbol (kept literal); the 'ms' unit is a UI label.
        html += '<td style="border:1px solid var(--border);padding:4px;color:#e57373;font-weight:bold;">[!!] ' + esc(String(q.durationMs)) + ' ' + vt('viewer.session.perf.col.ms') + '</td>';
        html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(String(q.rowCount)) + '</td>';
        html += '<td style="border:1px solid var(--border);padding:4px;font-size:11px;">' + esc(q.at) + '</td>';
        html += '<td style="border:1px solid var(--border);padding:4px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(sql) + '">' + esc(sql.length > 80 ? sql.slice(0, 80) + '\u2026' : sql) + '</td>';
        html += '</tr>';
      });
      html += '</table>';
    }

    if (data.queryPatterns && data.queryPatterns.length > 0) {
      html += '<p class="meta" style="margin-top:0.5rem;">' + vt('viewer.session.perf.patterns.heading') + '</p>';
      html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
      html += '<tr><th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.session.perf.col.totalMs') + '</th>';
      html += '<th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.session.perf.col.count') + '</th>';
      html += '<th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.session.perf.col.avgMs') + '</th>';
      html += '<th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.session.perf.col.maxMs') + '</th>';
      html += '<th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.session.perf.col.pattern') + '</th></tr>';
      data.queryPatterns.forEach(function(p) {
        var pattern = p.pattern || '';
        html += '<tr>';
        html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(String(p.totalMs)) + '</td>';
        html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(String(p.count)) + '</td>';
        html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(String(p.avgMs)) + '</td>';
        html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(String(p.maxMs)) + '</td>';
        html += '<td style="border:1px solid var(--border);padding:4px;" title="' + esc(pattern) + '">' + esc(pattern.length > 60 ? pattern.slice(0, 60) + '\u2026' : pattern) + '</td>';
        html += '</tr>';
      });
      html += '</table>';
    }

    if (data.recentQueries && data.recentQueries.length > 0) {
      html += '<p class="meta" style="margin-top:0.5rem;">' + vt('viewer.session.perf.recent.heading') + '</p>';
      html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
      html += '<tr><th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.session.perf.col.ms') + '</th>';
      html += '<th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.session.perf.col.rows') + '</th>';
      html += '<th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.session.perf.col.sql') + '</th></tr>';
      var recentThresh = data.slowThresholdMs || 100;
      var warnThresh = Math.round(recentThresh / 2);
      data.recentQueries.forEach(function(q) {
        var sql = q.sql || '';
        // Use icon + color so speed is distinguishable without color alone
        // (WCAG 2.1 1.4.1 — Use of Color)
        var color = q.durationMs > recentThresh ? '#e57373' : (q.durationMs > warnThresh ? '#ffb74d' : 'var(--fg)');
        var speedIcon = q.durationMs > recentThresh ? '[!!] ' : (q.durationMs > warnThresh ? '[!] ' : '');
        // Bold slow/warning durations to match the slow queries table style
        var speedWeight = speedIcon ? 'font-weight:bold;' : '';
        html += '<tr>';
        html += '<td style="border:1px solid var(--border);padding:4px;color:' + color + ';' + speedWeight + '">' + esc(speedIcon) + esc(String(q.durationMs)) + '</td>';
        html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(String(q.rowCount)) + '</td>';
        html += '<td style="border:1px solid var(--border);padding:4px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(sql) + '">' + esc(sql.length > 80 ? sql.slice(0, 80) + '\u2026' : sql) + '</td>';
        html += '</tr>';
      });
      html += '</table>';
    }

    return html;
  }

  if (historySel) {
    populateHistorySelect(historySel, 'perf');
    historySel.addEventListener('change', function() {
      var id = this.value;
      if (!id) return;
      var saved = getSavedAnalysisById('perf', id);
      if (saved && saved.data) {
        lastPerfData = saved.data;
        container.innerHTML = (saved.data.totalQueries === 0)
          ? '<p class="meta">' + vt('viewer.session.perf.emptySaved') + '</p>'
          : renderPerformance(saved.data);
        container.style.display = 'block';
      }
    });
  }

  if (saveBtn) saveBtn.addEventListener('click', function() {
    if (!lastPerfData) return;
    var id = saveAnalysis('perf', lastPerfData);
    showCopyToast(id != null ? vt('viewer.session.perf.saved') : vt('viewer.session.perf.saveFailed'));
    populateHistorySelect(historySel, 'perf');
  });

  if (exportBtn) exportBtn.addEventListener('click', function() {
    if (!lastPerfData) return;
    downloadJSON(lastPerfData, 'performance-' + (new Date().toISOString().slice(0, 10)) + '.json');
  });

  if (compareBtn) compareBtn.addEventListener('click', function() {
    showAnalysisCompare('perf', vt('viewer.session.perf.compareLabel'), getSavedAnalyses('perf'), lastPerfData, function(d) {
      return d && d.totalQueries !== 0 ? renderPerformance(d) : '<p class="meta">' + vt('viewer.session.perf.noQueriesInRun') + '</p>';
    }, function(a, b) {
      var qa = (a && a.totalQueries) != null ? a.totalQueries : 0;
      var qb = (b && b.totalQueries) != null ? b.totalQueries : 0;
      return vt('viewer.session.perf.compareSummary', qa, qb);
    });
  });

  if (toggle && collapsible) {
    toggle.addEventListener('click', function() {
      const isCollapsed = collapsible.classList.contains('collapsed');
      collapsible.classList.toggle('collapsed', !isCollapsed);
      syncFeatureCardExpanded(collapsible);
      if (isCollapsed && !perfLoaded) fetchPerformance();
    });
  }

  if (refreshBtn) refreshBtn.addEventListener('click', fetchPerformance);

  if (clearBtn) clearBtn.addEventListener('click', function() {
    clearBtn.disabled = true;
    clearBtn.textContent = vt('viewer.session.perf.clearing');
    fetch('/api/analytics/performance', S.authOpts({ method: 'DELETE' }))
      .then(function(r) {
        if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || vt('viewer.session.perf.clearFailed')); });
        lastPerfData = null;
        container.innerHTML = '<p class="meta">' + vt('viewer.session.perf.cleared') + '</p>';
        container.style.display = 'block';
        perfLoaded = false;
      })
      .catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">' + vt('viewer.session.perf.error', esc(e.message)) + '</p>';
        container.style.display = 'block';
      })
      .finally(function() {
        clearBtn.disabled = false;
        clearBtn.textContent = vt('viewer.session.perf.clear');
      });
  });
}
