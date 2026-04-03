/**
 * Tests for IndexSuggestionsPanel (create/show, reuse, copy, createAll).
 * Verifies the webview panel replaced the old showQuickPick-based display.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { IndexSuggestionsPanel } from '../health/index-suggestions-panel';
import { resetMocks, createdPanels, clipboardMock, messageMock } from './vscode-mock';
import { makeClient } from './fixtures/health-test-fixtures';
import type { IndexSuggestion } from '../api-types';

function makeSuggestions(): IndexSuggestion[] {
  return [
    {
      table: 'orders',
      column: 'user_id',
      reason: 'FK column without index',
      sql: 'CREATE INDEX idx_orders_user_id ON orders(user_id)',
      priority: 'high',
    },
    {
      table: 'products',
      column: 'category_id',
      reason: 'Frequent WHERE clause',
      sql: 'CREATE INDEX idx_products_category_id ON products(category_id)',
      priority: 'medium',
    },
  ];
}

describe('IndexSuggestionsPanel', () => {
  beforeEach(() => {
    resetMocks();
    (IndexSuggestionsPanel as any)._currentPanel = undefined;
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should create a webview panel with suggestions table', () => {
    const client = makeClient();
    IndexSuggestionsPanel.createOrShow(makeSuggestions(), client);

    assert.strictEqual(createdPanels.length, 1);
    const html = createdPanels[0].webview.html;
    // Verify the panel renders suggestion data
    assert.ok(html.includes('Index Suggestions'), 'should have title');
    assert.ok(html.includes('orders'), 'should show table name');
    assert.ok(html.includes('user_id'), 'should show column name');
    assert.ok(html.includes('priority-high'), 'should show priority badge');
    assert.ok(html.includes('CREATE INDEX'), 'should show SQL');
  });

  it('should show empty state when no suggestions', () => {
    const client = makeClient();
    IndexSuggestionsPanel.createOrShow([], client);

    assert.strictEqual(createdPanels.length, 1);
    const html = createdPanels[0].webview.html;
    assert.ok(html.includes('No missing indexes detected'));
  });

  it('should reuse existing panel on second call', () => {
    const client = makeClient();
    IndexSuggestionsPanel.createOrShow(makeSuggestions(), client);
    IndexSuggestionsPanel.createOrShow(makeSuggestions(), client);

    assert.strictEqual(createdPanels.length, 1, 'singleton should reuse panel');
  });

  it('should copy single SQL on copySingle message', () => {
    const client = makeClient();
    const suggestions = makeSuggestions();
    IndexSuggestionsPanel.createOrShow(suggestions, client);

    clipboardMock.reset();
    createdPanels[0].webview.simulateMessage({ command: 'copySingle', index: 0 });
    // Allow async clipboard write to complete
    return new Promise<void>((resolve) => setTimeout(() => {
      assert.strictEqual(clipboardMock.text, suggestions[0].sql);
      resolve();
    }, 10));
  });

  it('should copy all SQL on copyAll message', () => {
    const client = makeClient();
    const suggestions = makeSuggestions();
    IndexSuggestionsPanel.createOrShow(suggestions, client);

    clipboardMock.reset();
    createdPanels[0].webview.simulateMessage({ command: 'copyAll' });
    return new Promise<void>((resolve) => setTimeout(() => {
      assert.ok(clipboardMock.text.includes(suggestions[0].sql));
      assert.ok(clipboardMock.text.includes(suggestions[1].sql));
      resolve();
    }, 10));
  });

  it('should copy selected SQL on copySelected message', () => {
    const client = makeClient();
    const suggestions = makeSuggestions();
    IndexSuggestionsPanel.createOrShow(suggestions, client);

    clipboardMock.reset();
    // Only select index 1
    createdPanels[0].webview.simulateMessage({ command: 'copySelected', indexes: [1] });
    return new Promise<void>((resolve) => setTimeout(() => {
      assert.strictEqual(clipboardMock.text, suggestions[1].sql);
      resolve();
    }, 10));
  });
});
