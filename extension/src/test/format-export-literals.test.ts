/**
 * Tests for format-export literal helpers and edge-case formatting:
 * sqlLiteral, dartLiteral, formatKey, fileExtension, PII masking in CSV,
 * and unicode preservation across all formats.
 *
 * The primary formatter tests (formatJson, formatCsv, formatSqlInsert,
 * formatDart, formatMarkdown, formatExport dispatch) live in the sibling
 * file `format-export.test.ts`.
 */

import * as assert from 'assert';
import {
  formatExport,
  formatCsv,
  formatKey,
  fileExtension,
  sqlLiteral,
  dartLiteral,
} from '../export/format-export';
import { opts } from './format-export-test-helpers';

// ---------------------------------------------------------------------------
// sqlLiteral — converts JS values to SQL literal syntax
// ---------------------------------------------------------------------------

describe('sqlLiteral', () => {
  it('should return NULL for null', () => {
    assert.strictEqual(sqlLiteral(null), 'NULL');
  });
  it('should return NULL for undefined', () => {
    assert.strictEqual(sqlLiteral(undefined), 'NULL');
  });
  it('should return number as-is', () => {
    assert.strictEqual(sqlLiteral(42), '42');
  });
  it('should quote strings', () => {
    assert.strictEqual(sqlLiteral('hello'), "'hello'");
  });
  it('should escape single quotes', () => {
    assert.strictEqual(sqlLiteral("it's"), "'it''s'");
  });
});

// ---------------------------------------------------------------------------
// dartLiteral — converts JS values to Dart literal syntax
// ---------------------------------------------------------------------------

describe('dartLiteral', () => {
  it('should return null for null', () => {
    assert.strictEqual(dartLiteral(null), 'null');
  });
  it('should return number as-is', () => {
    assert.strictEqual(dartLiteral(3.14), '3.14');
  });
  it('should return boolean as-is', () => {
    assert.strictEqual(dartLiteral(true), 'true');
  });
  it('should quote and escape strings', () => {
    assert.strictEqual(dartLiteral("it's"), "'it\\'s'");
  });
  it('should escape backslashes', () => {
    assert.strictEqual(dartLiteral('a\\b'), "'a\\\\b'");
  });
});

// ---------------------------------------------------------------------------
// formatKey — maps user-facing format labels to internal format keys
// ---------------------------------------------------------------------------

describe('formatKey', () => {
  it('should map known labels', () => {
    assert.strictEqual(formatKey('JSON'), 'json');
    assert.strictEqual(formatKey('CSV'), 'csv');
    assert.strictEqual(formatKey('SQL INSERT'), 'sql');
    assert.strictEqual(formatKey('Dart'), 'dart');
    assert.strictEqual(formatKey('Markdown'), 'markdown');
  });
  it('should default to json for unknown', () => {
    assert.strictEqual(formatKey('???'), 'json');
  });
});

// ---------------------------------------------------------------------------
// fileExtension — returns the file extension string for each format key
// ---------------------------------------------------------------------------

describe('fileExtension', () => {
  it('should return correct extensions', () => {
    assert.strictEqual(fileExtension('json'), 'json');
    assert.strictEqual(fileExtension('csv'), 'csv');
    assert.strictEqual(fileExtension('sql'), 'sql');
    assert.strictEqual(fileExtension('dart'), 'dart');
    assert.strictEqual(fileExtension('markdown'), 'md');
  });
});

// ---------------------------------------------------------------------------
// formatCsv with PII masking — verifies email/password redaction behaviour
// ---------------------------------------------------------------------------

describe('formatCsv with PII masking', () => {
  it('should mask PII columns when maskPii is true', () => {
    const result = formatCsv({
      table: 'users',
      columns: ['id', 'email', 'name'],
      rows: [
        { id: 1, email: 'alice@example.com', name: 'Alice' },
        { id: 2, email: 'bob@example.com', name: 'Bob' },
      ],
      format: 'csv',
      maskPii: true,
    });
    const lines = result.split('\n');
    // Header is unmasked
    assert.strictEqual(lines[0], 'id,email,name');
    // Email column is masked; "name" is now PII (word-boundary match)
    // so it shows first initial + ***.
    assert.ok(lines[1].includes('a***@example.com'), 'email should be masked');
    assert.ok(lines[1].includes('A***'), 'name should be masked to first initial');
    assert.ok(lines[2].includes('b***@example.com'), 'second email masked');
    assert.ok(lines[2].includes('B***'), 'second name should be masked');
  });

  it('should not mask when maskPii is false', () => {
    const result = formatCsv({
      table: 'users',
      columns: ['id', 'email'],
      rows: [{ id: 1, email: 'alice@example.com' }],
      format: 'csv',
      maskPii: false,
    });
    assert.ok(result.includes('alice@example.com'), 'email should not be masked');
  });

  it('should not mask when maskPii is undefined', () => {
    const result = formatCsv(opts({
      columns: ['id', 'email'],
      rows: [{ id: 1, email: 'alice@example.com' }],
    }));
    assert.ok(result.includes('alice@example.com'), 'email should not be masked');
  });

  it('should mask password columns as ****', () => {
    const result = formatCsv({
      table: 'users',
      columns: ['id', 'password'],
      rows: [{ id: 1, password: 'secret123' }],
      format: 'csv',
      maskPii: true,
    });
    assert.ok(result.includes('****'), 'password should be fully masked');
    assert.ok(!result.includes('secret123'), 'raw password should not appear');
  });
});

// ---------------------------------------------------------------------------
// unicode support — ensures all formatters preserve multi-byte characters
// ---------------------------------------------------------------------------

describe('unicode support', () => {
  it('should preserve unicode in all formats', () => {
    const o = opts({ rows: [{ id: 1, name: '\u{1F600} caf\u00E9' }] });
    for (const fmt of ['json', 'csv', 'sql', 'dart', 'markdown'] as const) {
      const result = formatExport({ ...o, format: fmt });
      assert.ok(
        result.includes('caf\u00E9'),
        `${fmt} should preserve unicode`,
      );
    }
  });
});
