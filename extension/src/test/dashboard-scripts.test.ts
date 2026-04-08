/**
 * Tests for the dashboard scripts module.
 * Validates that the composed JS output includes functions from the
 * extracted chart-clipboard helper module.
 */

import * as assert from 'assert';
import { getDashboardJs } from '../dashboard/dashboard-scripts';

describe('getDashboardJs', () => {
  const script = getDashboardJs('[]', '{"widgets":[]}');

  it('should include the chart clipboard function from the extracted module', () => {
    assert.ok(
      script.includes('function copyChartToClipboard(widgetEl)'),
      'Expected copyChartToClipboard function in composed output',
    );
  });

  it('should include copy feedback helpers from the extracted module', () => {
    assert.ok(
      script.includes('function showCopyFeedback(widgetEl)'),
      'Expected showCopyFeedback function in composed output',
    );
    assert.ok(
      script.includes('function showCopyError(widgetEl)'),
      'Expected showCopyError function in composed output',
    );
  });

  it('should include core dashboard functions alongside extracted helpers', () => {
    // Verify the main script body is still present
    assert.ok(script.includes('function escapeHtml(s)'), 'Expected escapeHtml');
    assert.ok(script.includes('function renderConfigForm('), 'Expected renderConfigForm');
    assert.ok(script.includes('function showConfigModal('), 'Expected showConfigModal');
  });

  it('should include widget action event handling that invokes copyChartToClipboard', () => {
    assert.ok(
      script.includes('copyChartToClipboard(widget)'),
      'Expected click handler to call copyChartToClipboard',
    );
  });
});
