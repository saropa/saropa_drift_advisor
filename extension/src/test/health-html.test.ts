/**
 * Tests for health panel webview HTML output.
 * Validates empty state, grade display, metric cards, and XSS escaping.
 */

import * as assert from 'assert';
import { buildHealthHtml } from '../health/health-html';
import type { IHealthScore, IHealthMetric, IRecommendation } from '../health/health-types';

function sampleScore(overrides: Partial<IHealthScore> = {}): IHealthScore {
  return {
    overall: 85,
    grade: 'B+',
    metrics: [
      {
        name: 'Index Coverage',
        key: 'indexCoverage',
        score: 100,
        grade: 'A+',
        weight: 0.25,
        summary: '11/12 FK columns indexed',
        details: ['users.email has index'],
        linkedCommand: 'driftViewer.analyzeQueryCost',
      },
    ],
    recommendations: [],
    ...overrides,
  };
}

describe('buildHealthHtml', () => {
  it('should produce valid HTML with DOCTYPE', () => {
    const html = buildHealthHtml(sampleScore());
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('</html>'));
  });

  it('should show empty state when no metrics', () => {
    const html = buildHealthHtml(sampleScore({ metrics: [] }));
    assert.ok(html.includes('No metrics available'));
    assert.ok(html.includes('empty'));
  });

  it('should include overall grade and score', () => {
    const html = buildHealthHtml(sampleScore());
    assert.ok(html.includes('B+'));
    assert.ok(html.includes('85'));
  });

  it('should render metric cards with summary', () => {
    const html = buildHealthHtml(sampleScore());
    assert.ok(html.includes('Index Coverage'));
    assert.ok(html.includes('11/12 FK columns indexed'));
  });

  it('should apply grade CSS class for overall grade', () => {
    const html = buildHealthHtml(sampleScore({ grade: 'A-' }));
    assert.ok(html.includes('grade-a'));
  });

  it('should include recommendations section when present', () => {
    const recs: IRecommendation[] = [
      {
        severity: 'warning',
        message: 'Add index on orders.user_id',
        metric: 'indexCoverage',
      },
    ];
    const html = buildHealthHtml(sampleScore({ recommendations: recs }));
    assert.ok(html.includes('Add index on orders.user_id'));
  });

  it('should escape metric name to prevent XSS', () => {
    const metrics: IHealthMetric[] = [
      {
        name: '<script>alert(1)</script>',
        key: 'indexCoverage',
        score: 50,
        grade: 'C',
        weight: 1,
        summary: 'OK',
        details: [],
      },
    ];
    const html = buildHealthHtml(sampleScore({ metrics }));
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});
