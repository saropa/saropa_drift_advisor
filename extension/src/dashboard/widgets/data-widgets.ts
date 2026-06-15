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
      const result = data as { columns?: string[]; rows?: unknown[] };
      const rows = (result.rows ?? []) as Array<Record<string, unknown> | unknown[]>;
      // The server returns each row as an object keyed by column name, and the
      // HTTP transport omits the `columns` key entirely (the declared
      // {columns, unknown[][]} shape is inaccurate). Derive the column list
      // from the first row's keys when absent, then project each object row
      // into the positional value array renderMiniTable expects. Without this
      // the preview rendered with no headers and blank cells.
      const columns =
        result.columns && result.columns.length > 0
          ? result.columns
          : rows.length > 0 && !Array.isArray(rows[0])
            ? Object.keys(rows[0] as Record<string, unknown>)
            : [];
      const valueRows = rows.map((row) =>
        Array.isArray(row) ? row : columns.map((c) => (row as Record<string, unknown>)[c]),
      );
      return renderMiniTable(columns, valueRows);
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
      // The server returns each row as an object keyed by column name
      // ({cnt: N}), NOT a positional array — the declared unknown[][] type is
      // inaccurate. Indexing [0] on the object yielded undefined -> NaN. Read
      // the first value by column name, falling back to positional access in
      // case a transport ever does return an array. Empty result -> 0.
      const firstRow = result.rows[0] as Record<string, unknown> | unknown[] | undefined;
      if (firstRow === undefined) return 0;
      return Array.isArray(firstRow) ? firstRow[0] : Object.values(firstRow)[0];
    },
    renderHtml: (data, config) => {
      // Guard against a non-numeric/undefined value so the widget shows 0
      // rather than the NaN that a bare Number(undefined) produced.
      const count = Number(data);
      const display = Number.isFinite(count) ? count.toLocaleString() : '0';
      return `<div class="widget-counter">
        <span class="counter-value">${display}</span>
        <span class="counter-label">${esc(String(config.table))} rows</span>
      </div>`;
    },
  },
];
