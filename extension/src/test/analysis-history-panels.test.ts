/**
 * Tests for save/compare history integration in analysis panels.
 * Verifies that saveSnapshot messages persist to the store, and that
 * compareHistory opens the compare panel. Also verifies HTML includes
 * the new history buttons.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { IndexSuggestionsPanel } from '../health/index-suggestions-panel';
import { AnomaliesPanel } from '../health/anomalies-panel';
import { HealthPanel } from '../health/health-panel';
import { SizePanel } from '../analytics/size-panel';
import { resetMocks, createdPanels, MockMemento } from './vscode-mock';
import { makeClient, makeHistoryStore } from './fixtures/health-test-fixtures';
import type { IndexSuggestion, Anomaly, ISizeAnalytics } from '../api-types';
import type { IHealthScore } from '../health/health-types';

function makeSuggestions(): IndexSuggestion[] {
  return [
    { table: 'orders', column: 'user_id', reason: 'FK', sql: 'CREATE INDEX ...', priority: 'high' as const },
  ];
}

function makeAnomalies(): Anomaly[] {
  return [
    { message: 'Orphaned rows in orders.user_id', severity: 'error' },
  ];
}

function makeSizeData(): ISizeAnalytics {
  return {
    pageSize: 4096, pageCount: 10, totalSizeBytes: 40960,
    freeSpaceBytes: 0, usedSizeBytes: 40960, journalMode: 'wal',
    tableCount: 1, tables: [{ table: 'users', rowCount: 10, columnCount: 2, indexCount: 0, indexes: [] }],
  };
}

function makeScore(): IHealthScore {
  return {
    overall: 85, grade: 'B',
    metrics: [{ name: 'Index Coverage', key: 'indexCoverage' as const, score: 90, grade: 'A-', weight: 0.25, summary: '', details: [] }],
    recommendations: [],
  };
}

describe('Analysis history: IndexSuggestionsPanel', () => {
  beforeEach(() => { resetMocks(); (IndexSuggestionsPanel as any)._currentPanel = undefined; });
  afterEach(() => sinon.restore());

  it('should render Save Snapshot and Compare buttons in HTML', () => {
    const store = makeHistoryStore<IndexSuggestion[]>();
    IndexSuggestionsPanel.createOrShow(makeSuggestions(), makeClient(), store);
    const html = createdPanels[0].webview.html;
    assert.ok(html.includes('saveSnapshot'), 'should have save button');
    assert.ok(html.includes('compareHistory'), 'should have compare button');
  });

  it('should save snapshot to store on saveSnapshot message', () => {
    const store = makeHistoryStore<IndexSuggestion[]>();
    IndexSuggestionsPanel.createOrShow(makeSuggestions(), makeClient(), store);
    assert.strictEqual(store.size, 0, 'store should start empty');

    createdPanels[0].webview.simulateMessage({ command: 'saveSnapshot' });
    // Allow async handler to complete
    return new Promise<void>((resolve) => setTimeout(() => {
      assert.strictEqual(store.size, 1, 'store should have one snapshot after save');
      assert.deepStrictEqual(store.getAll()[0].data, makeSuggestions());
      resolve();
    }, 20));
  });

  it('should show history count in Compare button after saving', () => {
    const store = makeHistoryStore<IndexSuggestion[]>();
    IndexSuggestionsPanel.createOrShow(makeSuggestions(), makeClient(), store);

    createdPanels[0].webview.simulateMessage({ command: 'saveSnapshot' });
    return new Promise<void>((resolve) => setTimeout(() => {
      const html = createdPanels[0].webview.html;
      assert.ok(html.includes('Compare (1)'), 'should show count badge after save');
      resolve();
    }, 20));
  });

  it('should open compare panel on compareHistory message', () => {
    const store = makeHistoryStore<IndexSuggestion[]>();
    store.save(makeSuggestions());
    IndexSuggestionsPanel.createOrShow(makeSuggestions(), makeClient(), store);

    const panelCountBefore = createdPanels.length;
    createdPanels[0].webview.simulateMessage({ command: 'compareHistory' });
    return new Promise<void>((resolve) => setTimeout(() => {
      // Compare panel creates a new webview panel
      assert.ok(
        createdPanels.length > panelCountBefore,
        'should create a compare panel',
      );
      resolve();
    }, 20));
  });
});

describe('Analysis history: AnomaliesPanel', () => {
  beforeEach(() => { resetMocks(); (AnomaliesPanel as any)._currentPanel = undefined; });
  afterEach(() => sinon.restore());

  it('should render history buttons in HTML', () => {
    const store = makeHistoryStore<Anomaly[]>();
    AnomaliesPanel.createOrShow(makeAnomalies(), makeClient(), store);
    const html = createdPanels[0].webview.html;
    assert.ok(html.includes('saveSnapshot'), 'should have save button');
    assert.ok(html.includes('compareHistory'), 'should have compare button');
  });

  it('should save snapshot to store on saveSnapshot message', () => {
    const store = makeHistoryStore<Anomaly[]>();
    AnomaliesPanel.createOrShow(makeAnomalies(), makeClient(), store);

    createdPanels[0].webview.simulateMessage({ command: 'saveSnapshot' });
    return new Promise<void>((resolve) => setTimeout(() => {
      assert.strictEqual(store.size, 1);
      resolve();
    }, 20));
  });
});

describe('Analysis history: HealthPanel', () => {
  beforeEach(() => { resetMocks(); (HealthPanel as any)._currentPanel = undefined; });
  afterEach(() => sinon.restore());

  it('should render history buttons in HTML', () => {
    const store = makeHistoryStore<IHealthScore>();
    HealthPanel.createOrShow(makeScore(), makeClient(), store, new MockMemento());
    const html = createdPanels[0].webview.html;
    assert.ok(html.includes('saveSnapshot'), 'should have save button');
    assert.ok(html.includes('compareHistory'), 'should have compare button');
  });

  it('should save snapshot to store on saveSnapshot message', () => {
    const store = makeHistoryStore<IHealthScore>();
    HealthPanel.createOrShow(makeScore(), makeClient(), store, new MockMemento());

    createdPanels[0].webview.simulateMessage({ command: 'saveSnapshot' });
    return new Promise<void>((resolve) => setTimeout(() => {
      assert.strictEqual(store.size, 1);
      assert.strictEqual(store.getAll()[0].data.overall, 85);
      resolve();
    }, 20));
  });
});

describe('Analysis history: SizePanel', () => {
  beforeEach(() => { resetMocks(); (SizePanel as any)._currentPanel = undefined; });
  afterEach(() => sinon.restore());

  it('should render history buttons in HTML', () => {
    const store = makeHistoryStore<ISizeAnalytics>();
    SizePanel.createOrShow(makeSizeData(), store);
    const html = createdPanels[0].webview.html;
    assert.ok(html.includes('saveSnapshot'), 'should have save button');
    assert.ok(html.includes('compareHistory'), 'should have compare button');
  });

  it('should save snapshot to store on saveSnapshot message', () => {
    const store = makeHistoryStore<ISizeAnalytics>();
    SizePanel.createOrShow(makeSizeData(), store);

    createdPanels[0].webview.simulateMessage({ command: 'saveSnapshot' });
    return new Promise<void>((resolve) => setTimeout(() => {
      assert.strictEqual(store.size, 1);
      assert.strictEqual(store.getAll()[0].data.totalSizeBytes, 40960);
      resolve();
    }, 20));
  });
});
