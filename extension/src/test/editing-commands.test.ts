// Unit tests for editing command guard logic used by bulk-edit entrypoints.

import * as assert from 'assert';
import {
  extractFailedSql,
  formatApplyFailureMessage,
  getSinglePkEditGuardReason,
  shouldCopyFailedSql,
  shouldOpenPreviewSql,
} from '../editing/editing-commands';
import type { TableItem } from '../tree/tree-items';

/**
 * Builds a minimal TableItem-like object for unit tests that only exercise
 * single-PK guard logic (no vscode TreeItem behavior required).
 */
function makeItem(pkFlags: boolean[]): TableItem {
  return {
    table: {
      name: 'users',
      rowCount: 0,
      columns: pkFlags.map((pk, i) => ({
        name: i === 0 ? 'id' : `col_${i}`,
        type: 'TEXT',
        pk,
        notnull: false,
      })),
    },
  } as unknown as TableItem;
}

describe('getSinglePkEditGuardReason', () => {
  it('returns reason when table has no primary key', () => {
    const reason = getSinglePkEditGuardReason(makeItem([false, false]));
    assert.ok(reason);
    assert.ok(reason?.includes('no primary key column'));
  });

  it('returns reason when table has composite primary key', () => {
    const reason = getSinglePkEditGuardReason(makeItem([true, true]));
    assert.ok(reason);
    assert.ok(reason?.includes('composite primary key'));
  });

  it('returns undefined when table has exactly one primary key', () => {
    const reason = getSinglePkEditGuardReason(makeItem([true, false]));
    assert.strictEqual(reason, undefined);
  });
});

describe('formatApplyFailureMessage', () => {
  it('formats structured batch failure details with statement number and SQL', () => {
    const msg = formatApplyFailureMessage(
      'Apply edits failed: 500 — Statement #1 failed during batch apply: Exception: fk fail '
        + '(failed statement index: 1)\n'
        + 'Failed SQL: DELETE FROM "items" WHERE "id" = 2',
    );
    assert.ok(msg.includes('statement #2'));
    assert.ok(msg.includes('DELETE FROM "items"'));
    assert.ok(msg.includes('Pending edits were preserved'));
  });

  it('falls back to generic message when statement metadata is absent', () => {
    const msg = formatApplyFailureMessage('Apply edits failed: 500 — timeout');
    assert.strictEqual(msg, 'Apply failed: Apply edits failed: 500 — timeout');
  });
});

describe('shouldOpenPreviewSql', () => {
  it('returns true only for Preview SQL action', () => {
    assert.strictEqual(shouldOpenPreviewSql('Preview SQL'), true);
    assert.strictEqual(shouldOpenPreviewSql(undefined), false);
    assert.strictEqual(shouldOpenPreviewSql('Dismiss'), false);
  });
});

describe('extractFailedSql', () => {
  it('extracts failed SQL from structured error detail', () => {
    const sql = extractFailedSql(
      'Apply edits failed: 500 (failed statement index: 1)\n'
        + 'Failed SQL: DELETE FROM "items" WHERE "id" = 2',
    );
    assert.strictEqual(sql, 'DELETE FROM "items" WHERE "id" = 2');
  });

  it('returns undefined when failed SQL is absent', () => {
    assert.strictEqual(extractFailedSql('Apply edits failed: timeout'), undefined);
  });
});

describe('shouldCopyFailedSql', () => {
  it('returns true only for Copy Failed SQL action', () => {
    assert.strictEqual(shouldCopyFailedSql('Copy Failed SQL'), true);
    assert.strictEqual(shouldCopyFailedSql('Preview SQL'), false);
    assert.strictEqual(shouldCopyFailedSql(undefined), false);
  });
});
