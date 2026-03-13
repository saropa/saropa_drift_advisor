/**
 * Utility widgets: custom text / notes.
 */

import type { IWidgetDefinition } from '../dashboard-types';
import { escapeHtml } from '../dashboard-types';

const esc = escapeHtml;

export const UTILITY_WIDGETS: IWidgetDefinition[] = [
  {
    type: 'customText',
    label: 'Custom Text',
    icon: '\u{1F4DD}',
    description: 'Add notes or static text',
    defaultSize: { w: 1, h: 1 },
    configSchema: [
      { key: 'text', label: 'Text Content', type: 'text', default: 'Notes...' },
    ],
    fetchData: async (_client, config) => config.text || '',
    renderHtml: (data, _config) => {
      return `<div class="widget-text">${esc(String(data))}</div>`;
    },
  },
];
