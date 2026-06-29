import * as assert from 'assert';
import { blobSafeSelectList } from '../sql/blob-safe-select';
import type { ColumnMetadata } from '../api-types';

function col(name: string, type: string, pk = false): ColumnMetadata {
  return { name, type, pk };
}

describe('blobSafeSelectList', () => {
  it('passes non-BLOB columns through verbatim, quoted', () => {
    assert.strictEqual(
      blobSafeSelectList([col('id', 'INTEGER', true), col('name', 'TEXT')]),
      '"id", "name"',
    );
  });

  it('projects a BLOB column as length() aliased back to its name', () => {
    // The OOM fix: SELECT length("image") returns one integer instead of the
    // raw blob payload, so the same-isolate host never materializes the bytes.
    assert.strictEqual(
      blobSafeSelectList([col('id', 'INTEGER', true), col('image', 'BLOB')]),
      '"id", length("image") AS "image"',
    );
  });

  it('matches BLOB affinity case-insensitively and as a substring', () => {
    // SQLite gives BLOB affinity to any declared type containing "BLOB".
    assert.strictEqual(
      blobSafeSelectList([col('a', 'blob'), col('b', 'MEDIUMBLOB')]),
      'length("a") AS "a", length("b") AS "b"',
    );
  });

  it('escapes embedded double quotes in BLOB and plain columns alike', () => {
    assert.strictEqual(
      blobSafeSelectList([col('we"ird', 'TEXT'), col('b"lob', 'BLOB')]),
      '"we""ird", length("b""lob") AS "b""lob"',
    );
  });

  it('falls back to * when no column metadata is available', () => {
    // Preserves prior behavior for the no-info case (table vanished, etc.).
    assert.strictEqual(blobSafeSelectList([]), '*');
  });
});
