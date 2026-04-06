/**
 * Tests for the dashboard HTML chart copy button rendering.
 * Validates that chart widgets get the copy button while other types do not,
 * and that the CSP allows blob: URLs needed for SVG-to-PNG clipboard copy.
 */

import * as assert from 'assert';
import { buildDashboardHtml } from '../dashboard/dashboard-html';
import { getWidgetTypeInfoList } from '../dashboard/widget-registry';
import type { IDashboardLayout, IWidgetConfig } from '../dashboard/dashboard-types';

function defaultLayout(overrides: Partial<IDashboardLayout> = {}): IDashboardLayout {
  return {
    version: 1,
    name: 'test-dashboard',
    columns: 4,
    widgets: [],
    ...overrides,
  };
}

describe('dashboard chart copy button', () => {
  const widgetTypes = getWidgetTypeInfoList();

  it('should render copy-chart button for chart widgets', () => {
    const widgets: IWidgetConfig[] = [
      {
        id: 'chart1',
        type: 'chart',
        title: 'My Chart',
        gridX: 0,
        gridY: 0,
        gridW: 2,
        gridH: 2,
        config: {},
      },
    ];
    const html = buildDashboardHtml(
      defaultLayout({ widgets }),
      widgetTypes,
      new Map(),
    );
    assert.ok(
      html.includes('widget-copy-chart'),
      'Expected chart widget to include copy-chart button',
    );
  });

  it('should NOT render copy-chart button for non-chart widgets', () => {
    const widgets: IWidgetConfig[] = [
      {
        id: 'rc1',
        type: 'rowCount',
        title: 'Users',
        gridX: 0,
        gridY: 0,
        gridW: 1,
        gridH: 1,
        config: { table: 'users' },
      },
    ];
    const html = buildDashboardHtml(
      defaultLayout({ widgets }),
      widgetTypes,
      new Map(),
    );
    // The widget markup is between data-id="rc1" and the closing </div>
    // The inline script at the bottom will contain 'widget-copy-chart' as a selector string,
    // so we check only the widget's own HTML block (before the script tag).
    const widgetStart = html.indexOf('data-id="rc1"');
    const widgetEnd = html.indexOf('<script>', widgetStart);
    const widgetHtml = html.substring(widgetStart, widgetEnd);
    assert.ok(
      !widgetHtml.includes('widget-copy-chart'),
      'Non-chart widget markup should not contain the copy-chart button',
    );
  });

  it('should include blob: in img-src CSP for SVG-to-PNG clipboard rendering', () => {
    const html = buildDashboardHtml(defaultLayout(), widgetTypes, new Map());
    assert.ok(
      html.includes('img-src blob:'),
      'CSP must allow blob: in img-src for chart copy to work',
    );
  });
});
