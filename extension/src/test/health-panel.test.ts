/**
 * Tests for HealthPanel (create/show, reuse, copyReport).
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { HealthPanel } from '../health/health-panel';
import { resetMocks, createdPanels, clipboardMock } from './vscode-mock';
import { makeClient } from './fixtures/health-test-fixtures';

describe('HealthPanel', () => {
  beforeEach(() => {
    resetMocks();
    (HealthPanel as any)._currentPanel = undefined;
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should create a webview panel with health HTML', () => {
    const score = {
      overall: 87,
      grade: 'B+',
      metrics: [
        {
          name: 'Index Coverage',
          key: 'indexCoverage' as const,
          score: 100,
          grade: 'A+',
          weight: 0.25,
          summary: '0/0 FK columns indexed',
          details: [],
        },
      ],
      recommendations: [],
    };
    const client = makeClient();
    HealthPanel.createOrShow(score, client);

    assert.strictEqual(createdPanels.length, 1);
    const html = createdPanels[0].webview.html;
    assert.ok(html.includes('Database Health Score'));
    assert.ok(html.includes('B+'));
    assert.ok(html.includes('87/100'));
  });

  it('should reuse existing panel on second call', () => {
    const score = { overall: 90, grade: 'A-', metrics: [], recommendations: [] };
    const client = makeClient();
    HealthPanel.createOrShow(score, client);
    HealthPanel.createOrShow(score, client);

    assert.strictEqual(createdPanels.length, 1);
  });

  it('should copy report on copyReport message', () => {
    const score = { overall: 85, grade: 'B', metrics: [], recommendations: [] };
    const client = makeClient();
    HealthPanel.createOrShow(score, client);

    clipboardMock.reset();
    createdPanels[0].webview.simulateMessage({ command: 'copyReport' });
    assert.ok(clipboardMock.text.includes('"overall": 85'));
  });
});
