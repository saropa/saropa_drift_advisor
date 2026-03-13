/**
 * Data-focused widgets: table stats, table preview, row count.
 */

import type { DriftApiClient, TableMetadata } from '../../api-client';
import type { IWidgetDefinition } from '../dashboard-types';
import { escapeHtml } from '../dashboard-types';
import { renderMiniTable } from './widget-renderers';

const esc = escapeHtml;

export const DATA_WIDGETS: IWidgetDefinition[] = [
  {
    type: 'tableStats',
    label: 'Table Stats',
    icon: '\u{1F4CA}',
    description: 'Show row count and column info for a table',
    defaultSize: { w: 1, h: 1 },
    configSchema: [
      { key: 'table', label: 'Table', type: 'tableSelect', required: true },
    ],
    fetchData: async (client, config) => {
      const meta = await client.schemaMetadata();
      return meta.find((t) => t.name === config.table);
    },
    renderHtml: (data, config) => {
      if (!data) {
        return `<p class="empty-data">Table "${esc(String(config.table))}" not found</p>`;
      }
      const table = data as TableMetadata;
      return `<div class="widget-table-stats">
        <div class="stat-row"><span class="stat-label">Rows</span><span class="stat-value">${table.rowCount.toLocaleString()}</span></div>
        <div class="stat-row"><span class="stat-label">Columns</span><span class="stat-value">${table.columns.length}</span></div>
      </div>`;
    },
  },

  {
    type: 'tablePreview',
    label: 'Table Preview',
    icon: '\u{1F5C2}',
    description: 'Show recent rows from a table',
    defaultSize: { w: 2, h: 2 },
    configSchema: [
      { key: 'table', label: 'Table', type: 'tableSelect', required: true },
      { key: 'limit', label: 'Max Rows', type: 'number', default: 5 },
    ],
    fetchData: async (client, config) => {
      const limit = Number(config.limit) || 5;
      return client.sql(`SELECT * FROM "${config.table}" LIMIT ${limit}`);
    },
    renderHtml: (data, _config) => {
      const result = data as { columns: string[]; rows: unknown[][] };
      return renderMiniTable(result.columns, result.rows);
    },
  },

  {
    type: 'rowCount',
    label: 'Row Count',
    icon: '\u{1F522}',
    description: 'Display the row count for a table',
    defaultSize: { w: 1, h: 1 },
    configSchema: [
      { key: 'table', label: 'Table', type: 'tableSelect', required: true },
    ],
    fetchData: async (client, config) => {
      const result = await client.sql(`SELECT COUNT(*) AS cnt FROM "${config.table}"`);
      return (result.rows[0] as unknown[])[0];
    },
    renderHtml: (data, config) => {
      return `<div class="widget-counter">
        <span class="counter-value">${Number(data).toLocaleString()}</span>
        <span class="counter-label">${esc(String(config.table))} rows</span>
      </div>`;
    },
  },
];
