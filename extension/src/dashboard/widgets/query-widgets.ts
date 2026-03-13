/**
 * Query-based widgets: query result, chart.
 */

import type { DriftApiClient } from '../../api-client';
import type { IWidgetDefinition } from '../dashboard-types';
import type { ChartType } from '../dashboard-types';
import { renderMiniTable, renderSvgChart } from './widget-renderers';

export const QUERY_WIDGETS: IWidgetDefinition[] = [
  {
    type: 'queryResult',
    label: 'Query Result',
    icon: '\u{1F50D}',
    description: 'Run a custom SQL query and display results',
    defaultSize: { w: 2, h: 2 },
    configSchema: [
      { key: 'sql', label: 'SQL Query', type: 'text', required: true },
      { key: 'limit', label: 'Max Rows', type: 'number', default: 10 },
    ],
    fetchData: async (client, config) => {
      const limit = Number(config.limit) || 10;
      const sql = String(config.sql || '');
      const sqlWithLimit = sql.toLowerCase().includes(' limit ')
        ? sql
        : `${sql} LIMIT ${limit}`;
      return client.sql(sqlWithLimit);
    },
    renderHtml: (data, _config) => {
      const result = data as { columns: string[]; rows: unknown[][] };
      return renderMiniTable(result.columns, result.rows);
    },
  },

  {
    type: 'chart',
    label: 'Chart',
    icon: '\u{1F4C8}',
    description: 'Visualize query results as a chart',
    defaultSize: { w: 2, h: 2 },
    configSchema: [
      { key: 'sql', label: 'SQL (col1=label, col2=value)', type: 'text', required: true },
      { key: 'chartType', label: 'Chart Type', type: 'select', options: ['bar', 'pie', 'line'], default: 'bar' },
    ],
    fetchData: async (client, config) => client.sql(String(config.sql || 'SELECT 1')),
    renderHtml: (data, config) => {
      const chartType = (config.chartType as ChartType) || 'bar';
      return renderSvgChart(data as { columns: string[]; rows: unknown[][] }, chartType);
    },
  },
];
