/**
 * Type-specific renderers and diff summarizers for the compare panel.
 * Each analysis type provides a renderXxx() function that turns its data
 * into an HTML fragment, and a summarizeXxxDiff() that produces a short
 * text diff summary.
 */

import type { IndexSuggestion, Anomaly, ISizeAnalytics } from '../api-types';
import type { IHealthScore } from '../health/health-types';

// ---- Index Suggestions ----

/** Render index suggestions as an HTML table fragment. */
export function renderIndexSuggestions(suggestions: IndexSuggestion[]): string {
  if (suggestions.length === 0) {
    return '<div style="opacity:0.6">No missing indexes detected.</div>';
  }
  const rows = suggestions.map((s) => {
    const cls = `priority-${esc(s.priority)}`;
    return `<tr>
      <td>${esc(s.table)}</td>
      <td>${esc(s.column)}</td>
      <td><span class="${cls}">${esc(s.priority)}</span></td>
      <td>${esc(s.reason)}</td>
    </tr>`;
  }).join('');
  return `<div style="margin-bottom:4px;font-weight:600">${suggestions.length} suggestion(s)</div>
<style>.priority-high{color:#ef4444}.priority-medium{color:#eab308}.priority-low{color:#3b82f6}</style>
<table><thead><tr><th>Table</th><th>Column</th><th>Priority</th><th>Reason</th></tr></thead>
<tbody>${rows}</tbody></table>`;
}

/** Summarize the diff between two index suggestion snapshots. */
export function summarizeIndexDiff(
  before: IndexSuggestion[],
  after: IndexSuggestion[],
): string {
  // Build sets of "table.column" keys for comparison
  const keyOf = (s: IndexSuggestion) => `${s.table}.${s.column}`;
  const beforeKeys = new Set(before.map(keyOf));
  const afterKeys = new Set(after.map(keyOf));

  const resolved = [...beforeKeys].filter((k) => !afterKeys.has(k));
  const added = [...afterKeys].filter((k) => !beforeKeys.has(k));

  const parts: string[] = [];
  parts.push(`Before: ${before.length} suggestion(s), After: ${after.length} suggestion(s).`);
  if (resolved.length > 0) {
    parts.push(`Resolved: ${resolved.join(', ')}.`);
  }
  if (added.length > 0) {
    parts.push(`New: ${added.join(', ')}.`);
  }
  if (resolved.length === 0 && added.length === 0) {
    parts.push('No changes in suggested indexes.');
  }
  return parts.join(' ');
}

// ---- Size Analytics ----

/** Render size analytics as an HTML summary fragment. */
export function renderSizeAnalytics(data: ISizeAnalytics): string {
  const rows = data.tables.map((t) =>
    `<tr><td>${esc(t.table)}</td><td style="text-align:right">${t.rowCount.toLocaleString()}</td>` +
    `<td style="text-align:right">${t.columnCount}</td><td style="text-align:right">${t.indexCount}</td></tr>`,
  ).join('');
  return `<div style="margin-bottom:8px">
  <strong>${formatBytes(data.totalSizeBytes)}</strong> total
  (${formatBytes(data.usedSizeBytes)} used, ${formatBytes(data.freeSpaceBytes)} free)
  &mdash; ${data.tableCount} table(s), ${data.pageCount.toLocaleString()} page(s)
</div>
<table><thead><tr><th>Table</th><th>Rows</th><th>Cols</th><th>Indexes</th></tr></thead>
<tbody>${rows}</tbody></table>`;
}

/** Summarize the diff between two size analytics snapshots. */
export function summarizeSizeDiff(
  before: ISizeAnalytics,
  after: ISizeAnalytics,
): string {
  const sizeDelta = after.totalSizeBytes - before.totalSizeBytes;
  const rowDelta = after.tables.reduce((s, t) => s + t.rowCount, 0)
    - before.tables.reduce((s, t) => s + t.rowCount, 0);
  const tableDelta = after.tableCount - before.tableCount;

  const parts: string[] = [];
  parts.push(`Size: ${formatBytes(before.totalSizeBytes)} → ${formatBytes(after.totalSizeBytes)} (${sizeDelta >= 0 ? '+' : ''}${formatBytes(sizeDelta)}).`);
  if (tableDelta !== 0) {
    parts.push(`Tables: ${before.tableCount} → ${after.tableCount} (${tableDelta >= 0 ? '+' : ''}${tableDelta}).`);
  }
  parts.push(`Rows: ${rowDelta >= 0 ? '+' : ''}${rowDelta.toLocaleString()} net.`);
  return parts.join(' ');
}

// ---- Anomalies ----

/** Render anomalies as an HTML table fragment. */
export function renderAnomalies(anomalies: Anomaly[]): string {
  if (anomalies.length === 0) {
    return '<div style="opacity:0.6">No anomalies found.</div>';
  }
  const rows = anomalies.map((a) => {
    const cls = `sev-${esc(a.severity)}`;
    return `<tr><td class="${cls}">${severityIcon(a.severity)}</td>` +
      `<td><span class="${cls}">${esc(a.severity)}</span></td>` +
      `<td>${esc(a.message)}</td></tr>`;
  }).join('');
  return `<div style="margin-bottom:4px;font-weight:600">${anomalies.length} anomaly(ies)</div>
<style>.sev-error{color:#ef4444}.sev-warning{color:#eab308}.sev-info{color:#3b82f6}</style>
<table><thead><tr><th></th><th>Severity</th><th>Message</th></tr></thead>
<tbody>${rows}</tbody></table>`;
}

/** Summarize the diff between two anomaly snapshots. */
export function summarizeAnomalyDiff(
  before: Anomaly[],
  after: Anomaly[],
): string {
  const beforeMsgs = new Set(before.map((a) => a.message));
  const afterMsgs = new Set(after.map((a) => a.message));

  const resolved = [...beforeMsgs].filter((m) => !afterMsgs.has(m));
  const added = [...afterMsgs].filter((m) => !beforeMsgs.has(m));

  const byCounts = (list: Anomaly[]) => {
    const e = list.filter((a) => a.severity === 'error').length;
    const w = list.filter((a) => a.severity === 'warning').length;
    const i = list.filter((a) => a.severity === 'info').length;
    return `${e}E/${w}W/${i}I`;
  };

  const parts: string[] = [];
  parts.push(`Before: ${before.length} (${byCounts(before)}), After: ${after.length} (${byCounts(after)}).`);
  if (resolved.length > 0) parts.push(`${resolved.length} resolved.`);
  if (added.length > 0) parts.push(`${added.length} new.`);
  if (resolved.length === 0 && added.length === 0) parts.push('No changes.');
  return parts.join(' ');
}

// ---- Health Score ----

/** Render a health score as an HTML fragment. */
export function renderHealthScore(score: IHealthScore): string {
  const metricRows = score.metrics.map((m) =>
    `<tr><td>${esc(m.name)}</td><td style="text-align:right;font-weight:bold">${m.score}/100</td>` +
    `<td>${esc(m.grade)}</td><td style="opacity:0.7">${esc(m.summary)}</td></tr>`,
  ).join('');
  return `<div style="text-align:center;margin-bottom:12px">
  <div style="font-size:36px;font-weight:bold">${esc(score.grade)}</div>
  <div style="opacity:0.7">Score: ${score.overall}/100</div>
</div>
<table><thead><tr><th>Metric</th><th>Score</th><th>Grade</th><th>Summary</th></tr></thead>
<tbody>${metricRows}</tbody></table>`;
}

/** Summarize the diff between two health score snapshots. */
export function summarizeHealthDiff(
  before: IHealthScore,
  after: IHealthScore,
): string {
  const delta = after.overall - before.overall;
  const parts: string[] = [];
  parts.push(`Overall: ${before.overall}/100 (${before.grade}) → ${after.overall}/100 (${after.grade}) [${delta >= 0 ? '+' : ''}${delta}].`);

  // Per-metric changes > 5 points
  const changes: string[] = [];
  for (const am of after.metrics) {
    const bm = before.metrics.find((m) => m.key === am.key);
    if (bm) {
      const d = am.score - bm.score;
      if (Math.abs(d) >= 5) {
        changes.push(`${am.name}: ${d >= 0 ? '+' : ''}${d}`);
      }
    }
  }
  if (changes.length > 0) {
    parts.push(`Notable changes: ${changes.join(', ')}.`);
  }
  return parts.join(' ');
}

// ---- Shared helpers ----

function formatBytes(bytes: number): string {
  if (bytes < 0) return `-${formatBytes(-bytes)}`;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function severityIcon(severity: string): string {
  switch (severity) {
    case 'error': return '\u2716';
    case 'warning': return '\u26A0';
    default: return '\u2139';
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
