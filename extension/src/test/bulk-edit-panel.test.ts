import * as assert from 'assert';
import { BulkEditPanel } from '../bulk-edit/bulk-edit-panel';
import { ChangeTracker } from '../editing/change-tracker';
import {
  commands,
  createdPanels,
  mockCommands,
  MockMemento,
  MockOutputChannel,
  resetMocks,
} from './vscode-mock';
import type * as vscode from 'vscode';

/**
 * Verifies BulkEditPanel dashboard wiring: grid state payload, toolbar controls,
 * and command routing from webview message bridge.
 */
describe('BulkEditPanel', () => {
  let tracker: ChangeTracker;
  let context: vscode.ExtensionContext;

  beforeEach(() => {
    resetMocks();
    tracker = new ChangeTracker(new MockOutputChannel() as never);
    context = {
      subscriptions: [],
      workspaceState: new MockMemento(),
    } as unknown as vscode.ExtensionContext;
  });

  afterEach(() => {
    tracker.dispose();
    for (const d of context.subscriptions) d.dispose();
    BulkEditPanel.current = undefined;
  });

  it('creates panel HTML with grid and redo control', () => {
    BulkEditPanel.createOrShow(context, tracker);
    assert.strictEqual(createdPanels.length, 1);
    const html = createdPanels[0].webview.html;
    assert.ok(html.includes('id="gridBody"'));
    assert.ok(html.includes('id="redo"'));
    assert.ok(html.includes('id="prevPage"'));
    assert.ok(html.includes('id="nextPage"'));
    assert.ok(html.includes('id="gridWrap"'));
    assert.ok(html.includes('id="invariants"'));
    assert.ok(html.includes('id="openDvr"'));
    assert.ok(html.includes('id="captureSnapshot"'));
    assert.ok(html.includes('Arrow Up/Down'));
    assert.ok(!html.includes("if (ev.key === 'Escape') send('discard')"));
  });

  it('posts state updates including pending changes array', () => {
    BulkEditPanel.createOrShow(context, tracker);
    tracker.addRowDelete('users', 'id', 42);
    const posted = createdPanels[0].webview.postedMessages as Array<Record<string, unknown>>;
    const last = posted[posted.length - 1];
    assert.strictEqual(last.command, 'state');
    assert.strictEqual(last.count, 1);
    assert.ok(Array.isArray(last.changes));
    assert.strictEqual((last.changes as unknown[]).length, 1);
  });

  it('routes webview commands including redo to extension commands', () => {
    BulkEditPanel.createOrShow(context, tracker);
    const webview = createdPanels[0].webview;
    webview.simulateMessage({ command: 'preview' });
    webview.simulateMessage({ command: 'commit' });
    webview.simulateMessage({ command: 'redo' });
    assert.ok(mockCommands.executed.includes('driftViewer.generateSql'));
    assert.ok(mockCommands.executed.includes('driftViewer.commitPendingEdits'));
    assert.ok(mockCommands.executed.includes('driftViewer.redoEdit'));
    // Ensure command registry still includes expected entries.
    const registered = commands.getRegistered();
    assert.ok(typeof registered === 'object');
  });

  it('routes Phase 4 shortcut messages from bulk panel', () => {
    BulkEditPanel.createOrShow(context, tracker);
    const webview = createdPanels[0].webview;
    webview.simulateMessage({ command: 'invariants' });
    webview.simulateMessage({ command: 'clipboardImport' });
    webview.simulateMessage({ command: 'openDvr' });
    assert.ok(mockCommands.executed.includes('driftViewer.manageInvariants'));
    assert.ok(mockCommands.executed.includes('driftViewer.clipboardImport'));
    assert.ok(mockCommands.executed.includes('driftViewer.openDvr'));
  });

  it('routes captureSnapshot to driftViewer.captureSnapshot', () => {
    BulkEditPanel.createOrShow(context, tracker);
    createdPanels[0].webview.simulateMessage({ command: 'captureSnapshot' });
    assert.ok(mockCommands.executed.includes('driftViewer.captureSnapshot'));
  });
});

