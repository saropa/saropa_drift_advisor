/**
 * Tests for the pure git-HEAD parsing helpers behind commit correlation
 * (plan 67 R6). The fs orchestration in resolveWorkspaceCommit is thin glue
 * over these.
 */
import * as assert from 'assert';
import { parseHeadRef, findPackedRef } from '../suite/workspace-commit';

describe('parseHeadRef', () => {
  it('reads a symbolic ref', () => {
    assert.deepStrictEqual(parseHeadRef('ref: refs/heads/main\n'), {
      ref: 'refs/heads/main',
    });
  });

  it('reads a detached HEAD sha', () => {
    const sha = 'a'.repeat(40);
    assert.deepStrictEqual(parseHeadRef(`${sha}\n`), { sha });
  });

  it('returns empty for unrecognized content', () => {
    assert.deepStrictEqual(parseHeadRef('garbage'), {});
    assert.deepStrictEqual(parseHeadRef('abc123'), {}); // too short for a sha
  });
});

describe('findPackedRef', () => {
  const packed = [
    '# pack-refs with: peeled fully-peeled sorted',
    `${'1'.repeat(40)} refs/heads/main`,
    `${'2'.repeat(40)} refs/tags/v1`,
    `^${'3'.repeat(40)}`, // peeled tag line — must be ignored
  ].join('\n');

  it('finds the sha for a ref', () => {
    assert.strictEqual(findPackedRef(packed, 'refs/heads/main'), '1'.repeat(40));
  });

  it('ignores comment and peeled (^) lines and unknown refs', () => {
    assert.strictEqual(findPackedRef(packed, 'refs/heads/missing'), undefined);
  });
});
