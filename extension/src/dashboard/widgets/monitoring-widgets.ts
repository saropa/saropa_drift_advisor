/**
 * Monitoring widgets: health score, invariant status, DVR status, watch diff.
 */

import type { DriftApiClient } from '../../api-client';
import type { IHealthScore } from '../../health/health-types';
import type { IWidgetDefinition } from '../dashboard-types';
import { escapeHtml, gradeColorClass } from '../dashboard-types';

const esc = escapeHtml;

export const MONITORING_WIDGETS: IWidgetDefinition[] = [
  {
    type: 'healthScore',
    label: 'Health Score',
    icon: '\u2764',
    description: 'Show overall database health score',
    defaultSize: { w: 2, h: 1 },
    configSchema: [],
    fetchData: async (client, _config, healthScorer) => {
      if (!healthScorer) {
        return { overall: 0, grade: '?', metrics: [], recommendations: [] };
      }
      return healthScorer.compute(client);
    },
    renderHtml: (data, _config) => {
      const score = data as IHealthScore;
      const gradeClass = gradeColorClass(score.grade);
      return `<div class="widget-health">
        <div class="health-grade ${gradeClass}">${esc(score.grade)}</div>
        <div class="health-score">${score.overall}/100</div>
        <div class="health-metrics">
          ${score.metrics.slice(0, 3).map((m) =>
            `<span class="health-metric">${esc(m.name)}: ${m.grade}</span>`
          ).join('')}
        </div>
      </div>`;
    },
  },

  {
    type: 'invariantStatus',
    label: 'Invariant Status',
    icon: '\u{1F6E1}',
    description: 'Show data invariant check results',
    defaultSize: { w: 2, h: 1 },
    configSchema: [],
    fetchData: async (client) => {
      const anomalies = await client.anomalies();
      const errors = anomalies.filter((a) => a.severity === 'error');
      const warnings = anomalies.filter((a) => a.severity === 'warning');
      return { total: anomalies.length, errors: errors.length, warnings: warnings.length, items: anomalies.slice(0, 5) };
    },
    renderHtml: (data, _config) => {
      const result = data as { total: number; errors: number; warnings: number; items: Array<{ message: string; severity: string }> };
      const passing = result.total === 0;
      return `<div class="widget-invariants">
        <div class="invariant-summary ${passing ? 'passing' : 'failing'}">
          ${passing ? '\u2705' : '\u274C'} ${result.errors} errors, ${result.warnings} warnings
        </div>
        <div class="invariant-list">
          ${result.items.map((item) =>
            `<div class="invariant-item ${item.severity}">${item.severity === 'error' ? '\u274C' : '\u26A0'} ${esc(item.message)}</div>`
          ).join('')}
        </div>
      </div>`;
    },
  },

  {
    type: 'dvrStatus',
    label: 'DVR Status',
    icon: '\u23FA',
    description: 'Show query recording status',
    defaultSize: { w: 1, h: 1 },
    configSchema: [],
    fetchData: async (client) => {
      const perf = await client.performance();
      return { totalQueries: perf.totalQueries, avgMs: perf.avgDurationMs, slowCount: perf.slowQueries.length };
    },
    renderHtml: (data, _config) => {
      const result = data as { totalQueries: number; avgMs: number; slowCount: number };
      return `<div class="widget-dvr">
        <div class="dvr-stat"><span class="dvr-value">${result.totalQueries}</span><span class="dvr-label">queries</span></div>
        <div class="dvr-stat"><span class="dvr-value">${result.avgMs.toFixed(1)}ms</span><span class="dvr-label">avg</span></div>
        <div class="dvr-stat"><span class="dvr-value">${result.slowCount}</span><span class="dvr-label">slow</span></div>
      </div>`;
    },
  },

  {
    type: 'watchDiff',
    label: 'Watch Diff',
    icon: '\u{1F440}',
    description: 'Show watched table change summary',
    defaultSize: { w: 2, h: 1 },
    configSchema: [
      { key: 'table', label: 'Table', type: 'tableSelect', required: true },
    ],
    fetchData: async (client, config) => {
      const result = await client.sql(`SELECT COUNT(*) AS cnt FROM "${config.table}"`);
      const count = (result.rows[0] as unknown[])[0];
      return { table: config.table, rowCount: Number(count) };
    },
    renderHtml: (data, _config) => {
      const result = data as { table: string; rowCount: number };
      return `<div class="widget-watch">
        <div class="watch-table">${esc(String(result.table))}</div>
        <div class="watch-count">${result.rowCount.toLocaleString()} rows</div>
        <div class="watch-hint">Watching for changes...</div>
      </div>`;
    },
  },
];
