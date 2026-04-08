/**
 * Analysis persistence and comparison module.
 * Handles saving/loading analysis results to localStorage, JSON export,
 * history dropdown population, before/after comparison modal, and
 * snapshot diff rendering.
 */
import { esc } from './utils.ts';
import * as S from './state.ts';

    export function analysisStorageKey(type) {
      return S.ANALYSIS_STORAGE_PREFIX + type;
    }

    export function getSavedAnalyses(type) {
      try {
        var raw = localStorage.getItem(analysisStorageKey(type));
        if (!raw) return [];
        var list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
      } catch (e) {
        return [];
      }
    }

    export function saveAnalysis(type, data) {
      if (!data) return null;
      var list = getSavedAnalyses(type);
      var id = 'id_' + Date.now();
      var label = new Date().toLocaleString();
      list.unshift({ id: id, savedAt: label, data: data });
      if (list.length > S.ANALYSIS_MAX_SAVED) list.length = S.ANALYSIS_MAX_SAVED;
      try {
        localStorage.setItem(analysisStorageKey(type), JSON.stringify(list));
        return id;
      } catch (e) {
        return null;
      }
    }

    export function getSavedAnalysisById(type, id) {
      var list = getSavedAnalyses(type);
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
      }
      return null;
    }

    export function downloadJSON(data, filename) {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || 'analysis.json';
      a.click();
      URL.revokeObjectURL(a.href);
    }

    export function populateHistorySelect(selectEl, type) {
      if (!selectEl) return;
      var list = getSavedAnalyses(type);
      var value = selectEl.value;
      selectEl.innerHTML = '<option value="">— Past runs —</option>';
      list.forEach(function (item) {
        var opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.savedAt;
        selectEl.appendChild(opt);
      });
      if (value) selectEl.value = value;
    }

    /** Before/after comparison modal for analysis results. */
    export function showAnalysisCompare(type, title, savedList, currentData, renderFn, summaryFn) {
      var overlay = document.getElementById('analysis-compare-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'analysis-compare-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Compare analysis results');
        document.body.appendChild(overlay);
      }
      var beforeId = '';
      var afterId = '';
      var beforeData = null;
      var afterData = null;
      function getData(optionValue) {
        if (optionValue === '_current') return currentData;
        if (!optionValue) return null;
        for (var i = 0; i < savedList.length; i++) {
          if (savedList[i].id === optionValue) return savedList[i].data;
        }
        return null;
      }
      function updateSummary() {
        beforeData = getData(beforeId);
        afterData = getData(afterId);
        summaryEl.textContent = summaryFn ? summaryFn(beforeData, afterData) : 'Select Before and After to compare.';
        if (beforeData && afterData && renderFn) {
          leftPanel.innerHTML = renderFn(beforeData);
          rightPanel.innerHTML = renderFn(afterData);
        } else {
          leftPanel.innerHTML = beforeData ? renderFn(beforeData) : '<p class="meta">Select Before.</p>';
          rightPanel.innerHTML = afterData ? renderFn(afterData) : '<p class="meta">Select After.</p>';
        }
      }
      var panel = document.createElement('div');
      panel.style.cssText = 'background:var(--bg, #fff);color:var(--fg, #111);padding:1rem;border-radius:8px;max-width:95vw;max-height:90vh;overflow:auto;box-shadow:0 4px 20px rgba(0,0,0,0.3);';
      panel.innerHTML = '<h3 style="margin:0 0 0.75rem;">Compare: ' + esc(title) + '</h3>';
      var toolbar = document.createElement('div');
      toolbar.className = 'toolbar';
      toolbar.style.marginBottom = '0.5rem';
      var beforeLabel = document.createElement('label');
      beforeLabel.textContent = 'Before:';
      var beforeSel = document.createElement('select');
      beforeSel.id = 'compare-before';
      beforeSel.innerHTML = '<option value="">— select —</option><option value="_current">Current result</option>';
      (savedList || []).forEach(function (item) {
        var opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.savedAt;
        beforeSel.appendChild(opt);
      });
      var afterLabel = document.createElement('label');
      afterLabel.textContent = 'After:';
      var afterSel = document.createElement('select');
      afterSel.id = 'compare-after';
      afterSel.innerHTML = '<option value="">— select —</option><option value="_current">Current result</option>';
      (savedList || []).forEach(function (item) {
        var opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.savedAt;
        afterSel.appendChild(opt);
      });
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = 'Close';
      closeBtn.title = 'Close compare panel';
      toolbar.appendChild(beforeLabel);
      toolbar.appendChild(beforeSel);
      toolbar.appendChild(afterLabel);
      toolbar.appendChild(afterSel);
      toolbar.appendChild(closeBtn);
      panel.appendChild(toolbar);
      var summaryEl = document.createElement('p');
      summaryEl.className = 'meta';
      summaryEl.style.marginBottom = '0.5rem';
      summaryEl.textContent = 'Select Before and After to compare.';
      panel.appendChild(summaryEl);
      var columns = document.createElement('div');
      columns.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:1rem;';
      var leftPanel = document.createElement('div');
      leftPanel.style.cssText = 'border:1px solid var(--border);padding:0.5rem;border-radius:4px;max-height:50vh;overflow:auto;';
      leftPanel.innerHTML = '<p class="meta">Select Before.</p>';
      var rightPanel = document.createElement('div');
      rightPanel.style.cssText = 'border:1px solid var(--border);padding:0.5rem;border-radius:4px;max-height:50vh;overflow:auto;';
      rightPanel.innerHTML = '<p class="meta">Select After.</p>';
      columns.appendChild(leftPanel);
      columns.appendChild(rightPanel);
      panel.appendChild(columns);
      overlay.innerHTML = '';
      overlay.appendChild(panel);
      beforeSel.addEventListener('change', function() { beforeId = this.value; updateSummary(); });
      afterSel.addEventListener('change', function() { afterId = this.value; updateSummary(); });
      function closeOverlay() {
        overlay.style.display = 'none';
        document.removeEventListener('keydown', escapeHandler);
      }
      function escapeHandler(e) { if (e.key === 'Escape') closeOverlay(); }
      closeBtn.addEventListener('click', closeOverlay);
      overlay.addEventListener('click', function(e) { if (e.target === overlay) closeOverlay(); });
      document.addEventListener('keydown', escapeHandler);
      overlay.style.display = 'flex';
    }

    export function renderDiffRows(rows, type) {
      if (rows.length === 0) return '';
      var keys = Object.keys(rows[0]);
      var bgColor = type === 'added' ? 'rgba(124,179,66,0.15)' : 'rgba(229,115,115,0.15)';
      var html = '<table style="border-collapse:collapse;width:100%;font-size:11px;margin-bottom:0.3rem;">';
      html += '<tr>' + keys.map(function(k) {
        return '<th style="border:1px solid var(--border);padding:2px 4px;">' + esc(k) + '</th>';
      }).join('') + '</tr>';
      rows.forEach(function(r) {
        html += '<tr style="background:' + bgColor + ';">' + keys.map(function(k) {
          return '<td style="border:1px solid var(--border);padding:2px 4px;">' + esc(String(r[k] != null ? r[k] : '')) + '</td>';
        }).join('') + '</tr>';
      });
      html += '</table>';
      return html;
    }
    /**
     * Renders snapshot compare result: summary table (Table | Then | Now | Status)
     * plus per-table detail for added/removed/changed rows when present.
     */
    export function renderRowDiff(container, tables) {
      var html = '';
      // Summary table: one row per table for quick scanning (styles in .snapshot-summary-table)
      html += '<table class="snapshot-summary-table"><thead><tr><th>Table</th><th>Then</th><th>Now</th><th>Status</th></tr></thead><tbody>';
      tables.forEach(function(t) {
        var status = '';
        if (!t.hasPk) {
          status = 'No primary key \u2014 counts only';
        } else if ((t.addedRows && t.addedRows.length > 0) || (t.removedRows && t.removedRows.length > 0) || (t.changedRows && t.changedRows.length > 0)) {
          var parts = [];
          if (t.addedRows && t.addedRows.length > 0) parts.push('+' + t.addedRows.length + ' added');
          if (t.removedRows && t.removedRows.length > 0) parts.push('-' + t.removedRows.length + ' removed');
          if (t.changedRows && t.changedRows.length > 0) parts.push('~' + t.changedRows.length + ' changed');
          status = parts.join(', ');
        } else {
          status = 'No changes detected';
        }
        html += '<tr><td>' + esc(t.table) + '</td><td>' + t.countThen + '</td><td>' + t.countNow + '</td><td>' + esc(status) + '</td></tr>';
      });
      html += '</tbody></table>';
      // Per-table detail for added/removed/changed rows
      tables.forEach(function(t) {
        if (!t.hasPk) return;
        var hasDetail = (t.addedRows && t.addedRows.length > 0) || (t.removedRows && t.removedRows.length > 0) || (t.changedRows && t.changedRows.length > 0);
        if (!hasDetail) return;
        html += '<h4 style="margin:0.5rem 0 0.25rem;">' + esc(t.table) + '</h4>';
        if (t.addedRows && t.addedRows.length > 0) {
          html += '<p class="meta" style="color:#7cb342;">+ ' + t.addedRows.length + ' added:</p>';
          html += renderDiffRows(t.addedRows, 'added');
        }
        if (t.removedRows && t.removedRows.length > 0) {
          html += '<p class="meta" style="color:#e57373;">- ' + t.removedRows.length + ' removed:</p>';
          html += renderDiffRows(t.removedRows, 'removed');
        }
        if (t.changedRows && t.changedRows.length > 0) {
          html += '<p class="meta" style="color:#ffb74d;">~ ' + t.changedRows.length + ' changed:</p>';
          t.changedRows.forEach(function(cr) {
            var keys = Object.keys(cr.now);
            var changed = new Set(cr.changedColumns || []);
            html += '<table style="border-collapse:collapse;width:100%;font-size:11px;margin-bottom:0.4rem;">';
            html += '<tr>' + keys.map(function(k) {
              return '<th style="border:1px solid var(--border);padding:2px 4px;' + (changed.has(k) ? 'background:rgba(255,183,77,0.2);' : '') + '">' + esc(k) + '</th>';
            }).join('') + '</tr>';
            html += '<tr>' + keys.map(function(k) {
              var isChanged = changed.has(k);
              return '<td style="border:1px solid var(--border);padding:2px 4px;' + (isChanged ? 'background:rgba(229,115,115,0.2);text-decoration:line-through;' : '') + '">' + esc(String(cr.then[k] != null ? cr.then[k] : '')) + '</td>';
            }).join('') + '</tr>';
            html += '<tr>' + keys.map(function(k) {
              var isChanged = changed.has(k);
              return '<td style="border:1px solid var(--border);padding:2px 4px;' + (isChanged ? 'background:rgba(124,179,66,0.2);font-weight:bold;' : '') + '">' + esc(String(cr.now[k] != null ? cr.now[k] : '')) + '</td>';
            }).join('') + '</tr>';
            html += '</table>';
          });
        }
      });
      container.innerHTML = html;
    }
