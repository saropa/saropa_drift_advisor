/**
 * Comparison tool panel init functions: snapshot, compare, migration preview.
 *
 * Split from tools.ts for modularity — each tool group gets its own file.
 * These three tools share a common pattern: fetch from /api, render results,
 * and support export links.
 */
import * as S from './state.ts';
import { esc, setButtonBusy, highlightSqlSafe, syncFeatureCardExpanded } from './utils.ts';
import { renderRowDiff } from './analysis.ts';
import { vt } from './l10n.ts';

export function initSnapshot(): void {
  const toggle = document.getElementById('snapshot-toggle');
  const collapsible = document.getElementById('snapshot-collapsible');
  const takeBtn = document.getElementById('snapshot-take');
  const compareBtn = document.getElementById('snapshot-compare');
  const exportLink = document.getElementById('snapshot-export-diff');
  const clearBtn = document.getElementById('snapshot-clear');
  const statusEl = document.getElementById('snapshot-status');
  const resultPre = document.getElementById('snapshot-compare-result');
  // resultPre is a div: holds HTML table (from renderRowDiff) or plain text (JSON fallback)

  // Latest list fetched from /api/snapshots; drives the picker + list rendering.
  var snapshotItems: any[] = [];

  // The list + from/to selectors are injected here so the static HTML template
  // (html_content.dart) needs no change. Created once, reused across refreshes.
  function listHost(): any {
    var host = document.getElementById('snapshot-list');
    if (!host && statusEl && statusEl.parentNode) {
      host = document.createElement('div');
      host.id = 'snapshot-list';
      host.style.margin = '0.5rem 0';
      statusEl.parentNode.insertBefore(host, resultPre || null);
    }
    return host;
  }

  function fmtSnapshotLabel(s: any): string {
    var when = s.createdAt || s.id || '';
    return (s.label ? vt('viewer.tools.snapshot.labelPrefix', s.label) : '') + when;
  }

  // `to` selector includes "now (live DB)" (empty value) so the legacy
  // snapshot-vs-current comparison is still one click; `from` lists snapshots.
  function buildExportHref(): string {
    var from = (document.getElementById('snapshot-from') as any);
    var to = (document.getElementById('snapshot-to') as any);
    var qs = 'detail=rows&format=download';
    if (from && from.value) qs += '&from=' + encodeURIComponent(from.value);
    if (to && to.value) qs += '&to=' + encodeURIComponent(to.value);
    return '/api/snapshot/compare?' + qs;
  }

  function renderSnapshotList() {
    var host = listHost();
    if (!host) return;
    var has = snapshotItems.length > 0;
    compareBtn.disabled = !has;
    exportLink.style.display = has ? '' : 'none';
    clearBtn.style.display = has ? '' : 'none';
    if (has) exportLink.href = buildExportHref();

    if (!has) {
      host.innerHTML = '<p class="meta">' + vt('viewer.tools.snapshot.empty') + '</p>';
      return;
    }

    var html = '<div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-bottom:0.4rem;">';
    html += '<label class="meta">' + vt('viewer.tools.snapshot.from') + ' <select id="snapshot-from">';
    snapshotItems.forEach(function(s) {
      html += '<option value="' + esc(s.id) + '">' + esc(fmtSnapshotLabel(s)) + '</option>';
    });
    html += '</select></label>';
    html += '<label class="meta">' + vt('viewer.tools.snapshot.to') + ' <select id="snapshot-to"><option value="">' + vt('viewer.tools.snapshot.now') + '</option>';
    snapshotItems.forEach(function(s) {
      html += '<option value="' + esc(s.id) + '">' + esc(fmtSnapshotLabel(s)) + '</option>';
    });
    html += '</select></label>';
    html += '</div>';

    html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
    html += '<tr><th style="border:1px solid var(--border);padding:4px;text-align:left;">' + vt('viewer.tools.snapshot.col.snapshot') + '</th><th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.tools.snapshot.col.tables') + '</th><th style="border:1px solid var(--border);padding:4px;">' + vt('viewer.tools.snapshot.col.actions') + '</th></tr>';
    snapshotItems.forEach(function(s) {
      html += '<tr>';
      html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(fmtSnapshotLabel(s)) + '</td>';
      html += '<td style="border:1px solid var(--border);padding:4px;text-align:right;">' + (s.tableCount != null ? s.tableCount : '') + '</td>';
      html += '<td style="border:1px solid var(--border);padding:4px;">';
      html += '<button class="btn snapshot-rename" data-id="' + esc(s.id) + '">' + vt('viewer.tools.snapshot.rename') + '</button> ';
      html += '<button class="btn snapshot-del" data-id="' + esc(s.id) + '">' + vt('viewer.tools.snapshot.delete') + '</button>';
      html += '</td></tr>';
    });
    html += '</table>';
    host.innerHTML = html;

    // Default the From selector to the most recent snapshot for a sensible
    // "latest vs now" out of the box (matches the old single-snapshot default).
    var fromSel = document.getElementById('snapshot-from') as any;
    if (fromSel && snapshotItems.length) fromSel.value = snapshotItems[snapshotItems.length - 1].id;
    var toSel = document.getElementById('snapshot-to') as any;
    if (toSel) toSel.addEventListener('change', function() { exportLink.href = buildExportHref(); });
    if (fromSel) fromSel.addEventListener('change', function() { exportLink.href = buildExportHref(); });
  }

  function refreshSnapshotList() {
    fetch('/api/snapshots', S.authOpts())
      .then(r => r.json())
      .then(function(data) {
        snapshotItems = (data && data.snapshots) || [];
        renderSnapshotList();
      })
      .catch(function() { snapshotItems = []; renderSnapshotList(); });
  }

  if (toggle && collapsible) {
    toggle.addEventListener('click', function() {
      const isCollapsed = collapsible.classList.contains('collapsed');
      collapsible.classList.toggle('collapsed', !isCollapsed);
      syncFeatureCardExpanded(collapsible);
      if (isCollapsed) refreshSnapshotList();
    });
  }

  if (takeBtn) takeBtn.addEventListener('click', function() {
    var label = window.prompt(vt('viewer.tools.snapshot.takePrompt')) || '';
    takeBtn.disabled = true;
    statusEl.textContent = vt('viewer.tools.snapshot.capturing');
    fetch('/api/snapshot', S.authOpts({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label.trim() }),
    }))
      .then(r => r.json().then(function(d) { return { ok: r.ok, data: d }; }))
      .then(function(o) {
        if (o.ok) {
          statusEl.textContent = vt('viewer.tools.snapshot.saved', o.data.createdAt);
          refreshSnapshotList();
        } else statusEl.textContent = o.data.error || vt('viewer.tools.snapshot.failed');
      })
      .catch(function(e) { statusEl.textContent = vt('viewer.tools.snapshot.error', e.message); })
      .finally(function() { takeBtn.disabled = false; });
  });

  if (compareBtn) compareBtn.addEventListener('click', function() {
    var from = (document.getElementById('snapshot-from') as any);
    var to = (document.getElementById('snapshot-to') as any);
    var qs = 'detail=rows';
    if (from && from.value) qs += '&from=' + encodeURIComponent(from.value);
    if (to && to.value) qs += '&to=' + encodeURIComponent(to.value);
    compareBtn.disabled = true;
    resultPre.style.display = 'none';
    resultPre.innerHTML = '';
    statusEl.textContent = vt('viewer.tools.snapshot.comparing');
    statusEl.setAttribute('aria-busy', 'true');
    fetch('/api/snapshot/compare?' + qs, S.authOpts())
      .then(r => r.json().then(function(d) { return { ok: r.ok, data: d }; }))
      .then(function(o) {
        if (o.ok) {
          if (o.data.tables) {
            renderRowDiff(resultPre, o.data.tables);
          } else {
            resultPre.textContent = JSON.stringify(o.data, null, 2);
          }
          resultPre.style.display = 'block';
          statusEl.textContent = '';
        } else {
          statusEl.textContent = o.data.error || vt('viewer.tools.snapshot.compareFailed');
        }
      })
      .catch(function(e) { statusEl.textContent = vt('viewer.tools.snapshot.error', e.message); })
      .finally(function() {
        compareBtn.disabled = false;
        statusEl.removeAttribute('aria-busy');
      });
  });

  if (clearBtn) clearBtn.addEventListener('click', function() {
    if (!window.confirm(vt('viewer.tools.snapshot.clearConfirm'))) return;
    clearBtn.disabled = true;
    statusEl.textContent = vt('viewer.tools.snapshot.clearing');
    fetch('/api/snapshot', S.authOpts({ method: 'DELETE' }))
      .then(function() {
        resultPre.style.display = 'none';
        resultPre.innerHTML = '';
        statusEl.textContent = vt('viewer.tools.snapshot.cleared');
        refreshSnapshotList();
      })
      .catch(function(e) { statusEl.textContent = vt('viewer.tools.snapshot.error', e.message); })
      .finally(function() { clearBtn.disabled = false; });
  });

  // Delegated rename/delete on the dynamically-rendered list (survives re-render).
  var host = listHost();
  if (host) {
    host.addEventListener('click', function(e: any) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var id = t.getAttribute('data-id');
      if (!id) return;
      if (t.classList.contains('snapshot-del')) {
        if (!window.confirm(vt('viewer.tools.snapshot.deleteConfirm'))) return;
        fetch('/api/snapshot/' + encodeURIComponent(id), S.authOpts({ method: 'DELETE' }))
          .then(function() { refreshSnapshotList(); })
          .catch(function(err) { statusEl.textContent = vt('viewer.tools.snapshot.error', err.message); });
      } else if (t.classList.contains('snapshot-rename')) {
        var label = window.prompt(vt('viewer.tools.snapshot.renamePrompt')) || '';
        fetch('/api/snapshot/' + encodeURIComponent(id), S.authOpts({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: label.trim() }),
        }))
          .then(function() { refreshSnapshotList(); })
          .catch(function(err) { statusEl.textContent = vt('viewer.tools.snapshot.error', err.message); });
      }
    });
  }

  refreshSnapshotList();
}

export function initCompare(): void {
  const toggle = document.getElementById('compare-toggle');
  const collapsible = document.getElementById('compare-collapsible');
  const viewBtn = document.getElementById('compare-view');
  const exportLink = document.getElementById('compare-export');
  const statusEl = document.getElementById('compare-status');
  const resultPre = document.getElementById('compare-result');
  if (S.DRIFT_VIEWER_AUTH_TOKEN && exportLink) {
    exportLink.href = '/api/compare/report?format=download';
  }

  if (toggle && collapsible) {
    toggle.addEventListener('click', function() {
      const isCollapsed = collapsible.classList.contains('collapsed');
      collapsible.classList.toggle('collapsed', !isCollapsed);
      syncFeatureCardExpanded(collapsible);
    });
  }

  if (viewBtn) viewBtn.addEventListener('click', function() {
    viewBtn.disabled = true;
    resultPre.style.display = 'none';
    statusEl.textContent = vt('viewer.tools.compare.loading');
    fetch('/api/compare/report', S.authOpts())
      .then(r => r.json().then(function(d) { return { status: r.status, data: d }; }))
      .then(function(o) {
        if (o.status === 501) {
          statusEl.textContent = vt('viewer.tools.compare.notConfigured');
        } else if (o.status >= 400) {
          statusEl.textContent = o.data.error || vt('viewer.tools.compare.requestFailed');
        } else {
          resultPre.textContent = JSON.stringify(o.data, null, 2);
          resultPre.style.display = 'block';
          statusEl.textContent = '';
        }
      })
      .catch(function(e) { statusEl.textContent = vt('viewer.tools.compare.error', e.message); })
      .finally(function() { viewBtn.disabled = false; });
  });
}

export function initMigrationPreview(): void {
  var btn = document.getElementById('migration-preview');
  var statusEl = document.getElementById('compare-status');
  var resultPre = document.getElementById('compare-result');
  if (!btn) return;
  btn.addEventListener('click', function() {
    btn.disabled = true;
    setButtonBusy(btn, true, vt('viewer.tools.migration.busy'));
    resultPre.style.display = 'none';
    statusEl.textContent = '';
    fetch('/api/migration/preview', S.authOpts())
      .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
      .then(function(o) {
        if (o.status === 501) {
          statusEl.textContent = vt('viewer.tools.compare.notConfigured');

   return;
        }
        if (o.status >= 400) {
          statusEl.textContent = o.data.error || vt('viewer.tools.compare.requestFailed');

   return;
        }
        var sql = o.data.migrationSql || vt('viewer.tools.migration.noChanges');
        var html = '<p class="meta">' + vt('viewer.tools.migration.summary', o.data.changeCount);
        if (o.data.hasWarnings) html += vt('viewer.tools.migration.withWarnings');
        html += '</p>';
        html += '<pre style="font-size:11px;max-height:30vh;overflow:auto;background:var(--bg-pre);padding:0.5rem;border-radius:4px;">' + highlightSqlSafe(sql) + '</pre>';
        html += '<button type="button" id="migration-copy-sql" title="' + vt('viewer.tools.migration.copySqlTitle') + '">' + vt('viewer.tools.migration.copySql') + '</button>';
        resultPre.innerHTML = html;
        resultPre.style.display = 'block';
        statusEl.textContent = '';
        var copyBtn = document.getElementById('migration-copy-sql');
        if (copyBtn) copyBtn.addEventListener('click', function() {
          navigator.clipboard.writeText(sql);
          this.textContent = vt('viewer.tools.migration.copied');
        });
      })
      .catch(function(e) { statusEl.textContent = vt('viewer.tools.compare.error', e.message); })
      .finally(function() {
        btn.disabled = false;
        setButtonBusy(btn, false, vt('viewer.tools.migration.button'));
      });
});
}
