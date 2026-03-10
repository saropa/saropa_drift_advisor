import * as assert from 'assert';
import {
  MockMemento,
  createdPanels,
  resetMocks,
  clipboardMock,
} from './vscode-mock';
import { AnnotationStore } from '../annotations/annotation-store';
import { AnnotationPanel } from '../annotations/annotation-panel';

describe('AnnotationPanel', () => {
  let store: AnnotationStore;

  beforeEach(() => {
    resetMocks();
    // Reset singleton between tests
    (AnnotationPanel as any)._currentPanel = undefined;
    store = new AnnotationStore(new MockMemento());
  });

  it('should create a webview panel', () => {
    AnnotationPanel.createOrShow(store);
    assert.strictEqual(createdPanels.length, 1);
    assert.ok(AnnotationPanel.currentPanel);
  });

  it('should reuse existing panel on second call', () => {
    AnnotationPanel.createOrShow(store);
    AnnotationPanel.createOrShow(store);
    assert.strictEqual(createdPanels.length, 1);
  });

  it('should render HTML with annotations', () => {
    store.add({ kind: 'table', table: 'users' }, 'test note', 'star');
    AnnotationPanel.createOrShow(store);
    const html = createdPanels[0].webview.html;
    assert.ok(html.includes('test note'));
    assert.ok(html.includes('users'));
  });

  it('should render empty state when no annotations', () => {
    AnnotationPanel.createOrShow(store);
    const html = createdPanels[0].webview.html;
    assert.ok(html.includes('No annotations yet'));
  });

  it('should handle remove message', () => {
    const id = store.add(
      { kind: 'table', table: 'users' },
      'to remove',
      'pin',
    );
    AnnotationPanel.createOrShow(store);
    createdPanels[0].webview.simulateMessage({
      command: 'remove', id,
    });
    assert.strictEqual(store.annotations.length, 0);
  });

  it('should handle edit message', () => {
    const id = store.add(
      { kind: 'table', table: 'users' },
      'original',
      'note',
    );
    AnnotationPanel.createOrShow(store);
    createdPanels[0].webview.simulateMessage({
      command: 'edit', id, note: 'updated',
    });
    assert.strictEqual(store.annotations[0].note, 'updated');
  });

  it('should handle copyJson message', () => {
    store.add(
      { kind: 'table', table: 'users' },
      'exported',
      'star',
    );
    AnnotationPanel.createOrShow(store);
    createdPanels[0].webview.simulateMessage({ command: 'copyJson' });
    const clipped = clipboardMock.text;
    assert.ok(clipped.includes('"exported"'));
    assert.ok(clipped.includes('"version": 1'));
  });

  it('should clean up on dispose', () => {
    AnnotationPanel.createOrShow(store);
    assert.ok(AnnotationPanel.currentPanel);
    createdPanels[0].simulateClose();
    assert.strictEqual(AnnotationPanel.currentPanel, undefined);
  });
});
