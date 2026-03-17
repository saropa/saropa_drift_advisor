/**
 * Tests for dashboard webview HTML output.
 * Validates structure, escaping, and widget rendering to catch regressions
 * and ensure safe HTML (e.g. XSS prevention).
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

describe('buildDashboardHtml', () => {
  const widgetTypes = getWidgetTypeInfoList();

  it('should produce valid HTML with DOCTYPE and lang', () => {
    const html = buildDashboardHtml(defaultLayout(), widgetTypes, new Map());
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('<html lang="en">'));
    assert.ok(html.includes('</html>'));
  });

  it('should include dashboard header and action buttons', () => {
    const html = buildDashboardHtml(defaultLayout(), widgetTypes, new Map());
    assert.ok(html.includes('class="header"'));
    assert.ok(html.includes('Dashboard'));
    assert.ok(html.includes('id="addWidgetBtn"'));
    assert.ok(html.includes('id="refreshBtn"'));
  });

  it('should show empty state when no widgets', () => {
    const html = buildDashboardHtml(defaultLayout(), widgetTypes, new Map());
    assert.ok(html.includes('No widgets yet'));
    assert.ok(html.includes('Add Widget'));
  });

  it('should render grid with layout columns', () => {
    const layout = defaultLayout({ columns: 6 });
    const html = buildDashboardHtml(layout, widgetTypes, new Map());
    assert.ok(html.includes('repeat(6, 1fr)'));
  });

  it('should render widgets with correct data attributes and body', () => {
    const widgets: IWidgetConfig[] = [
      {
        id: 'w1',
        type: 'rowCount',
        title: 'User Count',
        gridX: 0,
        gridY: 0,
        gridW: 1,
        gridH: 1,
        config: { table: 'users' },
      },
    ];
    const initialHtml = new Map<string, string>([['w1', '<p>42 rows</p>']]);
    const html = buildDashboardHtml(
      defaultLayout({ widgets }),
      widgetTypes,
      initialHtml,
    );
    assert.ok(html.includes('data-id="w1"'));
    assert.ok(html.includes('data-type="rowCount"'));
    assert.ok(html.includes('widget-title">User Count</span'));
    assert.ok(html.includes('42 rows'));
    assert.ok(html.includes('grid-column: 1 / span 1'));
    assert.ok(html.includes('grid-row: 1 / span 1'));
  });

  it('should show loading placeholder when widget has no initial HTML', () => {
    const widgets: IWidgetConfig[] = [
      {
        id: 'w2',
        type: 'rowCount',
        title: 'Orders',
        gridX: 1,
        gridY: 0,
        gridW: 1,
        gridH: 1,
        config: { table: 'orders' },
      },
    ];
    const html = buildDashboardHtml(
      defaultLayout({ widgets }),
      widgetTypes,
      new Map(),
    );
    assert.ok(html.includes('id="body-w2"'));
    assert.ok(html.includes('Loading'));
  });

  it('should HTML-escape widget title to prevent XSS', () => {
    const widgets: IWidgetConfig[] = [
      {
        id: 'xss',
        type: 'customText',
        title: '<script>alert(1)</script>',
        gridX: 0,
        gridY: 0,
        gridW: 1,
        gridH: 1,
        config: {},
      },
    ];
    const html = buildDashboardHtml(
      defaultLayout({ widgets }),
      widgetTypes,
      new Map(),
    );
    // Escaped form must appear in the widget markup (title is rendered via escapeHtml).
    assert.ok(html.includes('&lt;script&gt;'));
    // Widget title span must not contain raw script (layout JSON in script tag may contain it).
    assert.ok(html.includes('widget-title">&lt;script&gt;'));
  });

  it('should HTML-escape layout name in layout modal', () => {
    const layout = defaultLayout({
      name: 'Dash" onclick="alert(1)',
    });
    const html = buildDashboardHtml(layout, widgetTypes, new Map());
    assert.ok(html.includes('value="'));
    assert.ok(!html.includes('onclick="alert'));
    assert.ok(html.includes('&quot;'));
  });

  it('should include modals for add widget, config, and layout', () => {
    const html = buildDashboardHtml(defaultLayout(), widgetTypes, new Map());
    assert.ok(html.includes('id="addWidgetModal"'));
    assert.ok(html.includes('id="configModal"'));
    assert.ok(html.includes('id="layoutModal"'));
  });

  it('should include inline script with widgetTypes and layout', () => {
    const layout = defaultLayout({ name: 'my-layout' });
    const html = buildDashboardHtml(layout, widgetTypes, new Map());
    assert.ok(html.includes('widgetTypes'));
    assert.ok(html.includes('layout'));
    assert.ok(html.includes('my-layout'));
  });
});
