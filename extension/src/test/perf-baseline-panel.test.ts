/**
 * Tests for PerfBaselinePanel (create/show, reuse, resetOne, resetAll).
 * Verifies the webview panel replaced the old showQuickPick-based display.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { PerfBaselinePanel } from '../debug/perf-baseline-panel';
import { PerfBaselineStore } from '../debug/perf-baseline-store';
import { resetMocks, createdPanels, dialogMock } from './vscode-mock';
import { MockMemento } from './vscode-mock-classes';

function makeStore(): PerfBaselineStore {
  const memento = new MockMemento();
  const store = new PerfBaselineStore(memento);
  // Seed with sample baselines
  store.record('select * from users', 12);
  store.record('select * from users', 14);
  store.record('insert into orders values (?)', 85);
  return store;
}

describe('PerfBaselinePanel', () => {
  beforeEach(() => {
    resetMocks();
    (PerfBaselinePanel as any)._currentPanel = undefined;
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should create a webview panel with baselines table', () => {
    const store = makeStore();
    PerfBaselinePanel.createOrShow(store);

    assert.strictEqual(createdPanels.length, 1);
    const html = createdPanels[0].webview.html;
    assert.ok(html.includes('Performance Baselines'), 'should have title');
    assert.ok(html.includes('select * from users'), 'should show SQL pattern');
    assert.ok(html.includes('insert into orders'), 'should show second SQL');
    assert.ok(html.includes('2 baseline(s)'), 'should show count');
  });

  it('should show empty state when store is empty', () => {
    const memento = new MockMemento();
    const store = new PerfBaselineStore(memento);
    PerfBaselinePanel.createOrShow(store);

    const html = createdPanels[0].webview.html;
    assert.ok(html.includes('No performance baselines stored'));
  });

  it('should reuse existing panel on second call', () => {
    const store = makeStore();
    PerfBaselinePanel.createOrShow(store);
    PerfBaselinePanel.createOrShow(store);

    assert.strictEqual(createdPanels.length, 1, 'singleton should reuse panel');
  });

  it('should reset one baseline via message', () => {
    const store = makeStore();
    PerfBaselinePanel.createOrShow(store);

    // The panel sorts by avg duration desc, so index 0 = slowest (insert into orders)
    createdPanels[0].webview.simulateMessage({ command: 'resetOne', index: 0 });

    // The insert baseline should be gone; the select baseline should remain
    assert.strictEqual(store.size, 1, 'should have removed one baseline');
    assert.ok(store.get('select * from users'), 'select baseline should remain');
  });

  it('should reset all baselines via message with confirmation', async () => {
    const store = makeStore();
    PerfBaselinePanel.createOrShow(store);

    // Simulate user confirming the modal warning
    dialogMock.warningMessageResult = 'Reset All';
    createdPanels[0].webview.simulateMessage({ command: 'resetAll' });

    // Wait for async confirmation dialog
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(store.size, 0, 'all baselines should be cleared');
  });
});
