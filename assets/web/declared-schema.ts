/**
 * "Code schema" tool (Feature 71): fetches GET /api/schema/declared and renders
 * the host-declared (code-side) Drift schema — tables, columns, types, primary
 * keys, and nullability. The endpoint reports `available: false` when the host
 * app did not supply a declared-schema callback; in that case this shows a short
 * explanation rather than an error, matching the orphan-check opt-in posture.
 */
import * as S from './state.ts';
import { esc, setButtonBusy } from './utils.ts';

export function initDeclaredSchema(): void {
  const btn = document.getElementById('declared-load');
  const container = document.getElementById('declared-results');
  if (!container) return;

  function renderDeclared(data: any): string {
    if (!data || data.available === false) {
      return '<p class="meta">No code-declared schema available. Start the viewer with a Drift database (the <code>startDriftViewer</code> extension supplies this automatically) or pass a <code>declaredSchema</code> callback to <code>DriftDebugServer.start</code>.</p>';
    }
    var tables = (data && data.tables) || [];
    if (tables.length === 0) {
      return '<p class="meta">The code-declared schema is empty.</p>';
    }
    var html = '<p class="meta">' + tables.length + ' declared table(s):</p>';
    tables.forEach(function(t: any) {
      var cols = t.columns || [];
      html += '<details style="margin:0.3rem 0;"><summary style="cursor:pointer;font-weight:600;">' + esc(t.name) + ' <span class="meta">(' + cols.length + ' columns)</span></summary>';
      html += '<table style="border-collapse:collapse;width:100%;font-size:12px;margin:0.3rem 0;">';
      html += '<tr><th style="border:1px solid var(--border);padding:4px;text-align:left;">Column</th><th style="border:1px solid var(--border);padding:4px;">Type</th><th style="border:1px solid var(--border);padding:4px;">Null</th><th style="border:1px solid var(--border);padding:4px;">PK</th></tr>';
      cols.forEach(function(c: any) {
        html += '<tr>';
        html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(c.name) + '</td>';
        html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(c.sqlType) + '</td>';
        html += '<td style="border:1px solid var(--border);padding:4px;text-align:center;">' + (c.nullable ? 'yes' : 'no') + '</td>';
        html += '<td style="border:1px solid var(--border);padding:4px;text-align:center;">' + (c.isPk ? 'PK' : '') + '</td>';
        html += '</tr>';
      });
      html += '</table>';
      if (t.indexes && t.indexes.length) {
        html += '<p class="meta">Indexes: ' + t.indexes.map(esc).join(', ') + '</p>';
      }
      html += '</details>';
    });
    return html;
  }

  function load() {
    if (btn) { (btn as any).disabled = true; setButtonBusy(btn, true, 'Loading…'); }
    container.style.display = 'none';
    fetch('/api/schema/declared', S.authOpts())
      .then(function(r) {
        if (!r.ok) return r.json().then(function(d: any) { throw new Error(d.error || 'Request failed'); });
        return r.json();
      })
      .then(function(data) {
        container.innerHTML = renderDeclared(data);
        container.style.display = 'block';
      })
      .catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">Error: ' + esc(e.message) + '</p>';
        container.style.display = 'block';
      })
      .finally(function() {
        if (btn) { (btn as any).disabled = false; setButtonBusy(btn, false, 'Load code schema'); }
      });
  }

  if (btn) btn.addEventListener('click', load);
}
