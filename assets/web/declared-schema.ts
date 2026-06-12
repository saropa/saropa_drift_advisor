/**
 * "Code schema" tool (Feature 71): fetches GET /api/schema/declared and renders
 * the host-declared (code-side) Drift schema — tables, columns, types, primary
 * keys, and nullability. The endpoint reports `available: false` when the host
 * app did not supply a declared-schema callback; in that case this shows a short
 * explanation rather than an error, matching the orphan-check opt-in posture.
 */
import * as S from './state.ts';
import { vt } from './l10n.ts';
import { esc, setButtonBusy } from './utils.ts';
import { loadSchemaMeta } from './schema-meta.ts';
import {
  computeSchemaDivergence,
  type DivergenceFinding,
} from './schema-divergence.ts';

/**
 * Symbolic l10n key for each divergence kind's tag label. Resolved through vt()
 * at render time (not stored as resolved text) so a late-installed locale overlay
 * still applies — matches the masthead.ts call-time-resolution pattern.
 */
const DIVERGENCE_LABEL_KEYS: Record<DivergenceFinding['kind'], string> = {
  'missing-table': 'viewer.schema.divergence.label.missingTable',
  'extra-table': 'viewer.schema.divergence.label.extraTable',
  'missing-column': 'viewer.schema.divergence.label.missingColumn',
  'extra-column': 'viewer.schema.divergence.label.extraColumn',
  'type-mismatch': 'viewer.schema.divergence.label.typeMismatch',
  'nullable-mismatch': 'viewer.schema.divergence.label.nullableMismatch',
  'pk-mismatch': 'viewer.schema.divergence.label.pkMismatch',
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
    return '<p class="meta">' + esc(vt('viewer.schema.declared.runtimeUnavailable')) + '</p>';
  }
  if (findings.length === 0) {
    return '<p class="meta" style="color:#66bb6a;">' + esc(vt('viewer.schema.declared.match')) + '</p>';
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
    esc(vt('viewer.schema.declared.divergenceCount', findings.length)) +
    '</p>';
  byTable.forEach(function (list, table) {
    html +=
      '<div style="margin:0.3rem 0;"><strong>' + esc(table) + '</strong><ul style="margin:0.2rem 0 0.4rem 1rem;padding:0;">';
    list.forEach(function (f) {
      const where = f.column ? esc(table) + '.' + esc(f.column) : esc(table);
      html +=
        '<li><span class="meta">[' +
        esc(vt(DIVERGENCE_LABEL_KEYS[f.kind])) +
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
      // Value carries intentional <code> markup around code identifiers, so it is
      // inserted as-is (not esc'd); the identifiers stay literal inside the value.
      return '<p class="meta">' + vt('viewer.schema.declared.noCodeSchema') + '</p>';
    }
    var tables = (data && data.tables) || [];
    if (tables.length === 0) {
      return '<p class="meta">' + esc(vt('viewer.schema.declared.empty')) + '</p>';
    }
    var html = '<p class="meta">' + esc(vt('viewer.schema.declared.tableCount', tables.length)) + '</p>';
    tables.forEach(function(t: any) {
      var cols = t.columns || [];
      html += '<details style="margin:0.3rem 0;"><summary style="cursor:pointer;font-weight:600;">' + esc(t.name) + ' <span class="meta">' + esc(vt('viewer.schema.declared.columnCount', cols.length)) + '</span></summary>';
      html += '<table style="border-collapse:collapse;width:100%;font-size:12px;margin:0.3rem 0;">';
      html += '<tr><th style="border:1px solid var(--border);padding:4px;text-align:left;">' + esc(vt('viewer.schema.declared.col.column')) + '</th><th style="border:1px solid var(--border);padding:4px;">' + esc(vt('viewer.schema.declared.col.type')) + '</th><th style="border:1px solid var(--border);padding:4px;">' + esc(vt('viewer.schema.declared.col.null')) + '</th><th style="border:1px solid var(--border);padding:4px;">' + esc(vt('viewer.schema.declared.col.pk')) + '</th></tr>';
      cols.forEach(function(c: any) {
        html += '<tr>';
        html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(c.name) + '</td>';
        html += '<td style="border:1px solid var(--border);padding:4px;">' + esc(c.sqlType) + '</td>';
        html += '<td style="border:1px solid var(--border);padding:4px;text-align:center;">' + esc(vt(c.nullable ? 'viewer.schema.declared.null.yes' : 'viewer.schema.declared.null.no')) + '</td>';
        html += '<td style="border:1px solid var(--border);padding:4px;text-align:center;">' + (c.isPk ? esc(vt('viewer.schema.declared.pk.flag')) : '') + '</td>';
        html += '</tr>';
      });
      html += '</table>';
      if (t.indexes && t.indexes.length) {
        html += '<p class="meta">' + esc(vt('viewer.schema.declared.indexes', t.indexes.join(', '))) + '</p>';
      }
      html += '</details>';
    });
    return html;
  }

  function load() {
    if (btn) { (btn as any).disabled = true; setButtonBusy(btn, true, vt('viewer.schema.declared.loading')); }
    container.style.display = 'none';
    fetch('/api/schema/declared', S.authOpts())
      .then(function(r) {
        if (!r.ok) return r.json().then(function(d: any) { throw new Error(d.error || vt('viewer.schema.declared.requestFailed')); });
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
              '<section style="margin-bottom:0.6rem;"><h4 style="margin:0 0 0.2rem;">' + esc(vt('viewer.schema.declared.codeVsDatabase')) + '</h4>' +
              renderDivergence(findings, runtimeAvailable) +
              '</section>' +
              renderDeclared(data);
          })
          .catch(function() {
            container.innerHTML =
              '<section style="margin-bottom:0.6rem;"><h4 style="margin:0 0 0.2rem;">' + esc(vt('viewer.schema.declared.codeVsDatabase')) + '</h4>' +
              renderDivergence([], false) +
              '</section>' +
              renderDeclared(data);
          });
      })
      .then(function() {
        container.style.display = 'block';
      })
      .catch(function(e) {
        container.innerHTML = '<p class="meta" style="color:#e57373;">' + esc(vt('viewer.schema.declared.error', e.message)) + '</p>';
        container.style.display = 'block';
      })
      .finally(function() {
        if (btn) { (btn as any).disabled = false; setButtonBusy(btn, false, vt('viewer.schema.declared.load')); }
      });
  }

  if (btn) btn.addEventListener('click', load);
}
