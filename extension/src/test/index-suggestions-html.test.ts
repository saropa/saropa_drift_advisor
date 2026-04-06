/**
 * Tests for the Index Suggestions webview HTML output.
 * Validates button rendering, XSS escaping, export action, and empty state.
 */

import * as assert from 'assert';
import { buildIndexSuggestionsHtml } from '../health/index-suggestions-html';
import type { IndexSuggestion } from '../api-types';

function sampleSuggestions(): IndexSuggestion[] {
  return [
    {
      table: 'users',
      column: 'email',
      reason: 'Used in WHERE clauses',
      sql: 'CREATE INDEX idx_users_email ON users(email)',
      priority: 'high',
    },
    {
      table: 'orders',
      column: 'user_id',
      reason: 'FK column without index',
      sql: 'CREATE INDEX idx_orders_user_id ON orders(user_id)',
      priority: 'medium',
    },
  ];
}

describe('buildIndexSuggestionsHtml', () => {
  it('should produce valid HTML with DOCTYPE', () => {
    const html = buildIndexSuggestionsHtml(sampleSuggestions());
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('</html>'));
  });

  it('should show empty state when no suggestions', () => {
    const html = buildIndexSuggestionsHtml([]);
    assert.ok(html.includes('No missing indexes detected'));
  });

  it('should render the Export Analysis button', () => {
    const html = buildIndexSuggestionsHtml(sampleSuggestions());
    assert.ok(
      html.includes('data-action="exportAnalysis"'),
      'Expected Export Analysis button with data-action attribute',
    );
    assert.ok(html.includes('Export Analysis'));
  });

  it('should render all four action buttons in the header', () => {
    const html = buildIndexSuggestionsHtml(sampleSuggestions());
    assert.ok(html.includes('data-action="copySelected"'));
    assert.ok(html.includes('data-action="copyAll"'));
    assert.ok(html.includes('data-action="exportAnalysis"'));
    assert.ok(html.includes('data-action="createAll"'));
  });

  it('should render correct number of table rows', () => {
    const suggestions = sampleSuggestions();
    const html = buildIndexSuggestionsHtml(suggestions);
    const rowCheckCount = (html.match(/class="row-check"/g) || []).length;
    assert.strictEqual(rowCheckCount, suggestions.length);
  });

  it('should render priority badges with correct class', () => {
    const html = buildIndexSuggestionsHtml(sampleSuggestions());
    assert.ok(html.includes('priority-high'));
    assert.ok(html.includes('priority-medium'));
  });

  it('should display suggestion count in summary', () => {
    const html = buildIndexSuggestionsHtml(sampleSuggestions());
    assert.ok(html.includes('2 missing index(es) detected'));
  });

  it('should HTML-escape table names to prevent XSS', () => {
    const suggestions: IndexSuggestion[] = [
      {
        table: '<script>alert(1)</script>',
        column: 'id',
        reason: 'test',
        sql: 'CREATE INDEX x ON x(id)',
        priority: 'low',
      },
    ];
    const html = buildIndexSuggestionsHtml(suggestions);
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});
