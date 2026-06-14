import type { Anomaly } from '../api-types';
import type { IReportData, IReportSchema } from './report-types';
import { highlightSql } from '../sql-highlight';
import { getReportCss } from './report-css';
import { getReportJs } from './report-scripts';
import { t } from '../l10n';
import { escapeHtml } from '../shared-utils';

/** Build a complete self-contained HTML report from collected data. */
export function buildReportHtml(data: IReportData): string {
  // Local param renamed to `tbl` so it does not shadow the imported `t()` l10n helper.
  const sidebarHtml = data.tables.map((tbl) =>
    `<button class="table-btn" data-table="${esc(tbl.name)}" onclick="showTable('${esc(escJs(tbl.name))}')">`
    + `${esc(tbl.name)} <span class="badge">${tbl.totalRowCount}</span>`
    + `${tbl.truncated ? ` <span class="truncated">${t('panel.report.table.truncated')}</span>` : ''}`
    + `</button>`,
  ).join('\n      ');

  const hasTabs = !!(data.schema || data.anomalies);
  const tabsHtml = hasTabs ? buildNavTabs(data) : '';
  const schemaHtml = data.schema ? buildSchemaSection(data.schema) : '';
  const anomalyHtml = data.anomalies ? buildAnomalySection(data.anomalies) : '';

  const tableDataJson = safeJsonForScript(data.tables.map((t) => ({
    name: t.name,
    columns: t.columns,
    rows: t.rows,
    totalRowCount: t.totalRowCount,
    truncated: t.truncated,
  })));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t('panel.report.title')}</title>
<style>${getReportCss()}</style>
</head>
<body>
<div id="app">
  <header>
    <h1>${t('panel.report.title')}</h1>
    <div class="header-actions">
      <span class="generated">${t('panel.report.generatedFrom', esc(data.generatedAt), esc(data.serverUrl))}</span>
      <button class="theme-btn" onclick="toggleTheme()">${t('panel.report.toggleTheme')}</button>
    </div>
  </header>

  <div class="layout">
    <nav class="sidebar">
      ${sidebarHtml}
    </nav>
    <main>
      ${tabsHtml}
      <div id="section-data"><div id="table-view"></div></div>
      ${schemaHtml}
      ${anomalyHtml}
    </main>
  </div>

  <footer>${t('panel.report.footer', esc(data.generatedAt))}</footer>
</div>

<script>
var DATA = ${tableDataJson};
${getReportJs()}
</script>
</body>
</html>`;
}

function buildNavTabs(data: IReportData): string {
  let html = '<div class="nav-tabs">';
  html += `<button class="nav-tab active" data-section="data" onclick="showSection('data')">${t('panel.report.tab.data')}</button>`;
  if (data.schema) {
    html += `<button class="nav-tab" data-section="schema" onclick="showSection('schema')">${t('panel.report.tab.schema')}</button>`;
  }
  if (data.anomalies) {
    html += `<button class="nav-tab" data-section="anomalies" onclick="showSection('anomalies')">${t('panel.report.tab.anomalies')}</button>`;
  }
  html += '</div>';
  return html;
}

/**
 * Renders the schema tab content: one block per table with highlighted SQL.
 * Defensive: null/empty schema array; missing/empty table name → "(unnamed)";
 * non-string or empty sql → safe empty; if highlightSql returns empty for non-empty sql, fall back to escaped plain text.
 */
function buildSchemaSection(schemas: IReportSchema[]): string {
  if (!schemas || schemas.length === 0) {
    return `<div id="section-schema" style="display:none"><p class="empty">${t('panel.report.schema.empty')}</p></div>`;
  }
  const items = schemas.map((s) => {
    const tableName = typeof s.table === 'string' && s.table.length > 0 ? s.table : t('panel.report.schema.unnamed');
    const rawSql = typeof s.sql === 'string' ? s.sql : '';
    const codeHtml = highlightSql(rawSql);
    const safeCode = codeHtml.length > 0 ? codeHtml : esc(rawSql);
    return `<div class="schema-item"><h3>${esc(tableName)}</h3><pre><code>${safeCode}</code></pre></div>`;
  }).join('\n');
  return `<div id="section-schema" style="display:none">${items}</div>`;
}

function buildAnomalySection(anomalies: Anomaly[]): string {
  if (!anomalies || anomalies.length === 0) {
    return `<div id="section-anomalies" style="display:none"><p class="empty">${t('panel.report.anomalies.empty')}</p></div>`;
  }
  const items = anomalies.map((a) => {
    const icon = a.severity === 'error' ? '\u2716' : a.severity === 'warning' ? '\u26A0' : '\u2139';
    return `<div class="anomaly anomaly-${esc(a.severity)}"><span class="anomaly-icon">${icon}</span>${esc(a.message)}</div>`;
  }).join('\n');
  return `<div id="section-anomalies" style="display:none">${items}</div>`;
}

/** Escape HTML special characters. */
const esc = escapeHtml;

/** Escape a string for embedding in a JavaScript string literal within onclick. */
function escJs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Safely serialize a value as JSON for embedding inside a &lt;script&gt; tag. */
function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}
