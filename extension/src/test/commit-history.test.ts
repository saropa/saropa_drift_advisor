/**
 * Tests for the per-commit findings history model (plan 67 R6 / §6).
 */
import * as assert from 'assert';
import {
  type CommitHistory,
  type CommitSnapshot,
  MAX_COMMIT_SNAPSHOTS,
  emptyCommitHistory,
  parseCommitHistory,
  snapshotFromSummary,
  upsertCommitSnapshot,
} from '../suite/commit-history';

const snap = (over: Partial<CommitSnapshot>): CommitSnapshot => ({
  commitSha: 'abc1234',
  generatedAt: '2026-06-14T09:00:00.000Z',
  total: 0,
  errors: 0,
  warnings: 0,
  advisor: 0,
  lints: 0,
  logCapture: 0,
  ...over,
});

describe('parseCommitHistory', () => {
  it('returns an empty history for invalid JSON', () => {
    assert.deepStrictEqual(parseCommitHistory('not json'), emptyCommitHistory());
  });

  it('returns an empty history when snapshots is missing or not an array', () => {
    assert.deepStrictEqual(parseCommitHistory('{}'), emptyCommitHistory());
    assert.deepStrictEqual(parseCommitHistory('{"snapshots":5}'), emptyCommitHistory());
  });

  it('drops entries with no commit sha and keeps valid ones', () => {
    const text = JSON.stringify({
      version: 1,
      snapshots: [
        { commitSha: '', total: 3 },
        { total: 1 },
        snap({ commitSha: 'good', total: 2 }),
      ],
    });
    const h = parseCommitHistory(text);
    assert.strictEqual(h.snapshots.length, 1);
    assert.strictEqual(h.snapshots[0].commitSha, 'good');
  });

  it('coerces missing or non-finite numeric fields to 0', () => {
    const text = JSON.stringify({
      version: 1,
      snapshots: [{ commitSha: 'c1', total: 4 }],
    });
    const h = parseCommitHistory(text);
    assert.strictEqual(h.snapshots[0].errors, 0);
    assert.strictEqual(h.snapshots[0].advisor, 0);
    assert.strictEqual(h.snapshots[0].generatedAt, '');
  });
});

describe('upsertCommitSnapshot', () => {
  it('appends a new commit', () => {
    const h = upsertCommitSnapshot(emptyCommitHistory(), snap({ commitSha: 'c1', total: 2 }));
    assert.strictEqual(h.snapshots.length, 1);
    assert.strictEqual(h.snapshots[0].commitSha, 'c1');
  });

  it('replaces an existing commit with the freshest counts and moves it last', () => {
    let h: CommitHistory = emptyCommitHistory();
    h = upsertCommitSnapshot(h, snap({ commitSha: 'c1', total: 2 }));
    h = upsertCommitSnapshot(h, snap({ commitSha: 'c2', total: 5 }));
    h = upsertCommitSnapshot(h, snap({ commitSha: 'c1', total: 9 })); // re-scan of c1
    assert.strictEqual(h.snapshots.length, 2);
    // c1 deduped (no duplicate) and now carries the fresh count, at the end.
    assert.deepStrictEqual(h.snapshots.map((s) => s.commitSha), ['c2', 'c1']);
    assert.strictEqual(h.snapshots[1].total, 9);
  });

  it('caps the list to the newest MAX_COMMIT_SNAPSHOTS', () => {
    let h: CommitHistory = emptyCommitHistory();
    for (let i = 0; i < MAX_COMMIT_SNAPSHOTS + 10; i++) {
      h = upsertCommitSnapshot(h, snap({ commitSha: `c${i}`, total: i }));
    }
    assert.strictEqual(h.snapshots.length, MAX_COMMIT_SNAPSHOTS);
    // Oldest fell off; newest retained.
    assert.strictEqual(h.snapshots[0].commitSha, 'c10');
    assert.strictEqual(
      h.snapshots[h.snapshots.length - 1].commitSha,
      `c${MAX_COMMIT_SNAPSHOTS + 9}`,
    );
  });
});

describe('snapshotFromSummary', () => {
  it('maps a finding summary onto a snapshot', () => {
    const s = snapshotFromSummary('sha9', '2026-06-14T10:00:00.000Z', {
      total: 6,
      tables: 3,
      advisor: 2,
      lints: 3,
      logCapture: 1,
      errors: 1,
      warnings: 2,
    });
    assert.strictEqual(s.commitSha, 'sha9');
    assert.strictEqual(s.total, 6);
    assert.strictEqual(s.advisor, 2);
    assert.strictEqual(s.warnings, 2);
    // `tables` is not part of the persisted snapshot.
    assert.ok(!('tables' in s));
  });
});
