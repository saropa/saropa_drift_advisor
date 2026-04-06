/**
 * Tests for the SQL Notebook results renderer.
 * Validates that the generated JS includes column visibility, row filter
 * toggle controls, and correct state reset logic.
 */

import * as assert from 'assert';
import { getResultsJs } from '../sql-notebook/sql-notebook-results';

describe('getResultsJs', () => {
  const js = getResultsJs();

  it('should declare hiddenColumns state variable', () => {
    assert.ok(
      js.includes('var hiddenColumns = new Set()'),
      'Expected hiddenColumns state declaration',
    );
  });

  it('should declare showOnlyFilterMatches state variable', () => {
    assert.ok(
      js.includes('var showOnlyFilterMatches = true'),
      'Expected showOnlyFilterMatches state with default true',
    );
  });

  it('should include column visibility button in filter bar', () => {
    assert.ok(
      js.includes('id="col-visibility-btn"'),
      'Expected column visibility button element',
    );
    assert.ok(
      js.includes('class="col-visibility-btn"'),
      'Expected col-visibility-btn CSS class',
    );
  });

  it('should include filter toggle button in filter bar', () => {
    assert.ok(
      js.includes('id="filter-toggle"'),
      'Expected filter toggle button element',
    );
    assert.ok(
      js.includes('class="filter-toggle-btn"'),
      'Expected filter-toggle-btn CSS class',
    );
  });

  it('should include column chooser dropdown', () => {
    assert.ok(
      js.includes('id="col-chooser"'),
      'Expected col-chooser dropdown element',
    );
    assert.ok(
      js.includes('data-col-idx'),
      'Expected column checkboxes with data-col-idx',
    );
  });

  it('should include Show All button in column chooser', () => {
    assert.ok(
      js.includes('id="col-show-all"'),
      'Expected Show All button in column chooser',
    );
  });

  it('should include Close button in column chooser', () => {
    assert.ok(
      js.includes('id="col-chooser-close"'),
      'Expected Close button in column chooser',
    );
  });

  it('should reset hiddenColumns on new query result', () => {
    assert.ok(
      js.includes('hiddenColumns = new Set()'),
      'Expected hiddenColumns reset in handleQueryResult',
    );
    // Count occurrences — should appear at least twice:
    // once at declaration, once in handleQueryResult
    const matches = js.match(/hiddenColumns = new Set\(\)/g) || [];
    assert.ok(
      matches.length >= 2,
      `Expected hiddenColumns reset in handleQueryResult (found ${matches.length} occurrences)`,
    );
  });

  it('should skip filtering when showOnlyFilterMatches is false', () => {
    // The optimization: only filter rows when toggle is "Matching"
    assert.ok(
      js.includes('filterText && showOnlyFilterMatches'),
      'Expected conditional check combining filterText and showOnlyFilterMatches',
    );
  });

  it('should still include the original esc() utility function', () => {
    assert.ok(
      js.includes('function esc(s)'),
      'Expected HTML escape utility function',
    );
  });
});
