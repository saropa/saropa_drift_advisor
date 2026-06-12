/**
 * "Code schema" tool (Feature 71): fetches GET /api/schema/declared and renders
 * the host-declared (code-side) Drift schema — tables, columns, types, primary
 * keys, and nullability. The endpoint reports `available: false` when the host
 * app did not supply a declared-schema callback; in that case this shows a short
 * explanation rather than an error, matching the orphan-check opt-in posture.
 */
import * as S from './state.ts';
import { esc, setButtonBusy } from './utils.ts';
import { loadSchemaMeta } from './schema-meta.ts';
import {
  computeSchemaDivergence,
  type DivergenceFinding,
} from './schema-divergence.ts';

/** Human label for each divergence kind, shown as the finding's tag. */
const DIVERGENCE_LABELS: Record<DivergenceFinding['kind'], string> = {
  'missing-table': 'Missing table',
  'extra-table': 'Extra table',
  'missing-column': 'Missing column',
  'extra-column': 'Extra column',
  'type-mismatch': 'Type',
  'nullable-mismatch': 'Nullability',
  'pk-mismatch': 'Primary key',
};

/**
 * Renders the code-vs-runtime divergence summary. An empty `findings` list (and
 * a runtime schema that was actually available) reads as "schemas match"; a
 * runtime schema with no tables means metadata could not be read (commonly
 * because change detection is off), so divergence is not asserted either way.
 */
function renderDivergence(
  findings: DivergenceFinding[],
  runtimeAvailable: boolean,
): string {
  if (!runtimeAvailable) {
    return '<p class="meta">Live database schema is unavailable (change detection may be off), so code-vs-database divergence was not computed.</p>';
  }
  if (findings.length === 0) {
    return '<p class="meta" style="color:#66bb6a;">✓ Code and database schemas match — no divergence found.</p>';
  }
  // Group by table so a drifted table reads as one block, not scattered rows.
  const byTable = new Map<string, DivergenceFinding[]>();
  for (const f of findings) {
    const list = byTable.get(f.table) || [];
    list.push(f);
    byTable.set(f.table, list);
  }
  let html =
    '<p class="meta" style="color:#e57373;">' +
    findings.length +
    ' divergence(s) between code and the live database:</p>';
  byTable.forEach(function (list, table) {
    html +=
      '<div style="margin:0.3rem 0;"><strong>' + esc(table) + '</strong><ul style="margin:0.2rem 0 0.4rem 1rem;padding:0;">';
    list.forEach(function (f) {
      const where = f.column ? esc(table) + '.' + esc(f.column) : esc(table);
      html +=
        '<li><span class="meta">[' +
        esc(DIVERGENCE_LABELS[f.kind]) +
        ']</span> ' +
        where +
        ' — ' +
        esc(f.detail) +
        '</li>';
    });
    html += '</ul></div>';
  });
  return html;
}

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
        // When a code schema is available, also pull the live runtime schema and
        // diff the two. The metadata load is best-effort: a failure (or change
        // detection being off) must not block rendering the declared list, so it
        // degrades to a "divergence not computed" note rather than an error.
        if (!data || data.available === false) {
          container.innerHTML = renderDeclared(data);
          return;
        }
        return loadSchemaMeta()
          .then(function(meta: any) {
            const runtimeTables = (meta && meta.tables) || [];
            const runtimeAvailable = runtimeTables.length > 0;
            const findings = computeSchemaDivergence(data.tables, runtimeTables);
            container.innerHTML =
              '<section style="margin-bottom:0.6rem;"><h4 style="margin:0 0 0.2rem;">Code vs database</h4>' +
              renderDivergence(findings, runtimeAvailable) +
              '</section>' +
              renderDeclared(data);
          })
          .catch(function() {
            container.innerHTML =
              '<section style="margin-bottom:0.6rem;"><h4 style="margin:0 0 0.2rem;">Code vs database</h4>' +
              renderDivergence([], false) +
              '</section>' +
              renderDeclared(data);
          });
      })
      .then(function() {
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
