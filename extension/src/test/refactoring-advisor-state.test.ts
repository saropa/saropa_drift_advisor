/**
 * Unit tests for refactoring-advisor session building (Feature 66 Phase 3 +
 * Feature 70). Focus: the remaining-by-severity histogram that drives the
 * health-score penalty must exclude dismissed suggestions.
 */
import * as assert from 'node:assert';
import { describe, it } from 'mocha';
import { buildAdvisorSession } from '../refactoring/refactoring-advisor-state';
import type { RefactoringSeverity } from '../refactoring/refactoring-types';

function suggestion(id: string, severity: RefactoringSeverity) {
  return { id, title: `title-${id}`, severity };
}

describe('buildAdvisorSession', () => {
  it('counts remaining suggestions by severity, excluding dismissed ids', () => {
    const suggestions = [
      suggestion('a', 'high'),
      suggestion('b', 'high'),
      suggestion('c', 'medium'),
      suggestion('d', 'low'),
    ];
    const dismissed = new Set(['b']); // one high dismissed
    const session = buildAdvisorSession(7, suggestions, dismissed);

    assert.strictEqual(session.suggestionCount, 4);
    assert.strictEqual(session.dismissedCount, 1);
    assert.deepStrictEqual(session.remainingBySeverity, { high: 1, medium: 1, low: 1 });
    assert.strictEqual(session.tableCount, 7);
  });

  it('drops every severity to zero when all suggestions are dismissed', () => {
    const suggestions = [suggestion('a', 'high'), suggestion('b', 'medium')];
    const dismissed = new Set(['a', 'b']);
    const session = buildAdvisorSession(3, suggestions, dismissed);

    assert.strictEqual(session.dismissedCount, 2);
    assert.deepStrictEqual(session.remainingBySeverity, { high: 0, medium: 0, low: 0 });
  });

  it('keeps all suggestions when nothing is dismissed and caps topTitles at five', () => {
    const suggestions = Array.from({ length: 6 }, (_, i) => suggestion(`s${i}`, 'high'));
    const session = buildAdvisorSession(1, suggestions, new Set());

    assert.strictEqual(session.dismissedCount, 0);
    assert.deepStrictEqual(session.remainingBySeverity, { high: 6, medium: 0, low: 0 });
    assert.strictEqual(session.topTitles.length, 5);
  });
});
