/**
 * Tests for the commit timeline view model + HTML (plan 67 R6 / §6).
 */
import * as assert from 'assert';
import type { CommitHistory, CommitSnapshot } from '../suite/commit-history';
import { buildCommitTimeline } from '../suite/commit-timeline';
import { buildCommitTimelineHtml } from '../suite/commit-timeline-html';

const snap = (over: Partial<CommitSnapshot>): CommitSnapshot => ({
  commitSha: 'abc1234567',
  generatedAt: '2026-06-14T09:00:00.000Z',
  total: 0,
  errors: 0,
  warnings: 0,
  advisor: 0,
  lints: 0,
  logCapture: 0,
  ...over,
});

const history = (snaps: CommitSnapshot[]): CommitHistory => ({ version: 1, snapshots: snaps });

describe('buildCommitTimeline', () => {
  it('returns an empty model for empty history', () => {
    const m = buildCommitTimeline(history([]));
    assert.deepStrictEqual(m.rows, []);
    assert.strictEqual(m.maxTotal, 0);
    assert.strictEqual(m.commitCount, 0);
  });

  it('orders rows newest capture first', () => {
    const m = buildCommitTimeline(history([
      snap({ commitSha: 'old', total: 1 }),
      snap({ commitSha: 'mid', total: 2 }),
      snap({ commitSha: 'new', total: 3 }),
    ]));
    assert.deepStrictEqual(m.rows.map((r) => r.commitSha), ['new', 'mid', 'old']);
  });

  it('computes delta versus the previous (older) capture; first has null', () => {
    const m = buildCommitTimeline(history([
      snap({ commitSha: 'c1', total: 5 }),
      snap({ commitSha: 'c2', total: 8 }), // +3
      snap({ commitSha: 'c3', total: 2 }), // -6
    ]));
    // Rows are newest-first: c3, c2, c1.
    assert.strictEqual(m.rows[0].deltaTotal, -6);
    assert.strictEqual(m.rows[1].deltaTotal, 3);
    assert.strictEqual(m.rows[2].deltaTotal, null); // oldest, no prior
  });

  it('marks the row matching the current commit', () => {
    const m = buildCommitTimeline(
      history([snap({ commitSha: 'aaa' }), snap({ commitSha: 'bbb' })]),
      'aaa',
    );
    assert.strictEqual(m.rows.find((r) => r.commitSha === 'aaa')!.isCurrent, true);
    assert.strictEqual(m.rows.find((r) => r.commitSha === 'bbb')!.isCurrent, false);
  });

  it('exposes the max total for bar scaling and a short sha', () => {
    const m = buildCommitTimeline(history([
      snap({ commitSha: 'abcdef1234', total: 4 }),
      snap({ commitSha: 'zzz', total: 11 }),
    ]));
    assert.strictEqual(m.maxTotal, 11);
    assert.strictEqual(m.rows[1].shortSha, 'abcdef1');
  });
});

describe('buildCommitTimelineHtml', () => {
  it('shows the empty state when there is no history', () => {
    const html = buildCommitTimelineHtml(buildCommitTimeline(history([])));
    assert.ok(html.includes('No commit history'));
  });

  it('renders a row with sha, counts and escapes text', () => {
    const html = buildCommitTimelineHtml(buildCommitTimeline(history([
      snap({ commitSha: '<b>9f2c1aa</b>', total: 3, errors: 1, warnings: 2, advisor: 3 }),
    ])));
    assert.ok(html.includes('&lt;b&gt;9f2c1a')); // short sha, escaped
    assert.ok(!html.includes('<b>9f2c1aa</b>'));
    assert.ok(html.includes('first recorded')); // only snapshot → no prior delta
  });

  it('shows the current badge and a regression delta', () => {
    const model = buildCommitTimeline(
      history([
        snap({ commitSha: 'old', total: 1 }),
        snap({ commitSha: 'cur', total: 4 }),
      ]),
      'cur',
    );
    const html = buildCommitTimelineHtml(model);
    assert.ok(html.includes('class="ct-current"'));
    assert.ok(html.includes('+3 vs previous')); // 4 - 1
  });
});
