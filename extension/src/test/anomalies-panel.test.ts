/**
 * Tests for AnomaliesPanel (create/show, reuse, refresh, generateFixes).
 * Verifies the webview panel replaced the old showQuickPick-based display.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { AnomaliesPanel } from '../health/anomalies-panel';
import { resetMocks, createdPanels } from './vscode-mock';
import { makeClient, makeHistoryStore } from './fixtures/health-test-fixtures';
import type { Anomaly } from '../api-types';

function makeAnomalies(): Anomaly[] {
  return [
    { message: 'Orphaned rows in orders.user_id', severity: 'error' },
    { message: 'Duplicate rows in products', severity: 'warning' },
    { message: 'Empty string in users.email', severity: 'info' },
  ];
}

describe('AnomaliesPanel', () => {
  beforeEach(() => {
    resetMocks();
    (AnomaliesPanel as any)._currentPanel = undefined;
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should create a webview panel with anomaly list', () => {
    const client = makeClient();
    AnomaliesPanel.createOrShow(makeAnomalies(), client, makeHistoryStore());

    assert.strictEqual(createdPanels.length, 1);
    const html = createdPanels[0].webview.html;
    assert.ok(html.includes('Anomalies'), 'should have title');
    assert.ok(html.includes('Orphaned rows'), 'should show error message');
    assert.ok(html.includes('Duplicate rows'), 'should show warning message');
    assert.ok(html.includes('sev-error'), 'should have error severity class');
    assert.ok(html.includes('sev-warning'), 'should have warning severity class');
  });

  it('should show empty state when no anomalies', () => {
    const client = makeClient();
    AnomaliesPanel.createOrShow([], client, makeHistoryStore());

    const html = createdPanels[0].webview.html;
    assert.ok(html.includes('No anomalies found'));
  });

  it('should reuse existing panel on second call', () => {
    const client = makeClient();
    AnomaliesPanel.createOrShow(makeAnomalies(), client, makeHistoryStore());
    AnomaliesPanel.createOrShow(makeAnomalies(), client, makeHistoryStore());

    assert.strictEqual(createdPanels.length, 1, 'singleton should reuse panel');
  });

  it('should show severity filter buttons with counts', () => {
    const client = makeClient();
    AnomaliesPanel.createOrShow(makeAnomalies(), client, makeHistoryStore());

    const html = createdPanels[0].webview.html;
    // Verify filter buttons include counts
    assert.ok(html.includes('(3)'), 'should show total count');
    assert.ok(html.includes('Errors'), 'should have error filter');
    assert.ok(html.includes('Warnings'), 'should have warning filter');
    assert.ok(html.includes('Info'), 'should have info filter');
  });

  it('should refresh anomalies via message', async () => {
    const client = makeClient();
    const refreshed: Anomaly[] = [
      { message: 'New anomaly', severity: 'error' },
    ];
    sinon.stub(client, 'anomalies').resolves(refreshed);

    AnomaliesPanel.createOrShow(makeAnomalies(), client, makeHistoryStore());
    createdPanels[0].webview.simulateMessage({ command: 'refresh' });

    // Wait for async refresh to complete
    await new Promise((r) => setTimeout(r, 20));
    const html = createdPanels[0].webview.html;
    assert.ok(html.includes('New anomaly'), 'should render refreshed data');
  });
});
