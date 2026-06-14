/**
 * Tests for the commit-history persistence glue (plan 67 R6 / §6).
 *
 * The vscode mock exposes no workspace folder, so both entry points take their
 * best-effort skip path — the contract that matters: neither throws, and a
 * missing workspace yields an empty history / a false record rather than an
 * error in a generation-tick handler. The pure read/write logic is covered by
 * commit-history.test.ts.
 */
import * as assert from 'assert';
import { emptyCommitHistory } from '../suite/commit-history';
import { readCommitHistory, recordCommitSnapshot } from '../suite/commit-history-store';

describe('commit-history-store (no workspace)', () => {
  it('readCommitHistory returns an empty history', async () => {
    assert.deepStrictEqual(await readCommitHistory(), emptyCommitHistory());
  });

  it('recordCommitSnapshot returns false rather than throwing', async () => {
    assert.strictEqual(await recordCommitSnapshot('2026-06-14T09:00:00.000Z'), false);
  });
});
