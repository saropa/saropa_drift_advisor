/**
 * Tests for the primary format-export functions: formatJson, formatCsv,
 * formatSqlInsert, formatDart, formatMarkdown, and the formatExport
 * dispatcher.
 *
 * Literal-level helpers (sqlLiteral, dartLiteral, formatKey, fileExtension)
 * and edge-case suites (PII masking, unicode) live in the sibling file
 * `format-export-literals.test.ts`.
 */

import * as assert from 'assert';
import {
  formatExport,
  formatJson,
  formatCsv,
  formatSqlInsert,
  formatDart,
  formatMarkdown,
} from '../export/format-export';
import { opts } from './format-export-test-helpers';

// ---------------------------------------------------------------------------
// formatJson
// ---------------------------------------------------------------------------

describe('formatJson', () => {
  it('should produce valid JSON with all rows', () => {
    const result = formatJson(opts());
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].id, 1);
    assert.strictEqual(parsed[1].name, 'Bob');
  });

  it('should handle empty table', () => {
    const result = formatJson(opts({ rows: [] }));
    assert.strictEqual(result, '[]');
  });

  it('should handle null values', () => {
    const result = formatJson(opts({ rows: [{ id: 1, name: null }] }));
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed[0].name, null);
  });
});

// ---------------------------------------------------------------------------
// formatCsv
// ---------------------------------------------------------------------------

describe('formatCsv', () => {
  it('should produce header and data rows', () => {
    const result = formatCsv(opts());
    const lines = result.split('\n');
    assert.strictEqual(lines[0], 'id,name');
    assert.strictEqual(lines[1], '1,Alice');
    assert.strictEqual(lines[2], '2,Bob');
  });

  it('should escape commas in values', () => {
    const result = formatCsv(opts({
      rows: [{ id: 1, name: 'Al,ice' }],
    }));
    assert.ok(result.includes('"Al,ice"'));
  });

  it('should escape quotes in values', () => {
    const result = formatCsv(opts({
      rows: [{ id: 1, name: 'say "hi"' }],
    }));
    assert.ok(result.includes('"say ""hi"""'));
  });

  it('should handle newlines in values', () => {
    const result = formatCsv(opts({
      rows: [{ id: 1, name: 'line1\nline2' }],
    }));
    assert.ok(result.includes('"line1\nline2"'));
  });

  it('should handle empty table', () => {
    const result = formatCsv(opts({ rows: [] }));
    assert.strictEqual(result, 'id,name');
  });
});

// ---------------------------------------------------------------------------
// formatSqlInsert
// ---------------------------------------------------------------------------

describe('formatSqlInsert', () => {
  it('should produce INSERT statements', () => {
    const result = formatSqlInsert(opts());
    const lines = result.split('\n');
    assert.strictEqual(lines.length, 2);
    assert.strictEqual(
      lines[0],
      'INSERT INTO "users" ("id", "name") VALUES (1, \'Alice\');',
    );
  });

  it('should render NULL for null values', () => {
    const result = formatSqlInsert(opts({
      rows: [{ id: 1, name: null }],
    }));
    assert.ok(result.includes('NULL'));
  });

  it('should escape single quotes', () => {
    const result = formatSqlInsert(opts({
      rows: [{ id: 1, name: "O'Brien" }],
    }));
    assert.ok(result.includes("'O''Brien'"));
  });

  it('should leave numbers unquoted', () => {
    const result = formatSqlInsert(opts({
      rows: [{ id: 42, name: 'x' }],
    }));
    assert.ok(result.includes('VALUES (42,'));
  });

  it('should handle empty table', () => {
    const result = formatSqlInsert(opts({ rows: [] }));
    assert.strictEqual(result, '');
  });
});

// ---------------------------------------------------------------------------
// formatDart
// ---------------------------------------------------------------------------

describe('formatDart', () => {
  it('should produce Dart Map literal', () => {
    const result = formatDart(opts());
    assert.ok(result.startsWith('const users = <Map<String, Object?>>'));
    assert.ok(result.includes("'id': 1"));
    assert.ok(result.includes("'name': 'Alice'"));
  });

  it('should render null literal', () => {
    const result = formatDart(opts({
      rows: [{ id: 1, name: null }],
    }));
    assert.ok(result.includes("'name': null"));
  });

  it('should escape single quotes in strings', () => {
    const result = formatDart(opts({
      rows: [{ id: 1, name: "it's" }],
    }));
    assert.ok(result.includes("'name': 'it\\'s'"));
  });

  it('should escape backslashes', () => {
    const result = formatDart(opts({
      rows: [{ id: 1, name: 'a\\b' }],
    }));
    assert.ok(result.includes("'name': 'a\\\\b'"));
  });

  it('should handle empty table', () => {
    const result = formatDart(opts({ rows: [] }));
    assert.strictEqual(
      result,
      'const users = <Map<String, Object?>>[];',
    );
  });

  it('should handle single row', () => {
    const result = formatDart(opts({
      rows: [{ id: 1, name: 'Alice' }],
    }));
    assert.ok(result.includes("  {'id': 1, 'name': 'Alice'},"));
  });

  it('should escape column names with special chars', () => {
    const result = formatDart(opts({
      columns: ['id', "it's"],
      rows: [{ 'id': 1, "it's": 'val' }],
    }));
    assert.ok(result.includes("'it\\'s':"));
  });
});

// ---------------------------------------------------------------------------
// formatMarkdown
// ---------------------------------------------------------------------------

describe('formatMarkdown', () => {
  it('should produce header, separator, and rows', () => {
    const result = formatMarkdown(opts());
    const lines = result.split('\n');
    assert.strictEqual(lines[0], '| id | name |');
    assert.strictEqual(lines[1], '|---|---|');
    assert.strictEqual(lines[2], '| 1 | Alice |');
    assert.strictEqual(lines[3], '| 2 | Bob |');
  });

  it('should escape pipe characters in values', () => {
    const result = formatMarkdown(opts({
      rows: [{ id: 1, name: 'a|b' }],
    }));
    assert.ok(result.includes('a\\|b'));
  });

  it('should replace newlines with spaces', () => {
    const result = formatMarkdown(opts({
      rows: [{ id: 1, name: 'line1\nline2' }],
    }));
    assert.ok(result.includes('line1 line2'));
    assert.ok(!result.split('|---')[1].includes('\n|'));
  });

  it('should handle null values', () => {
    const result = formatMarkdown(opts({
      rows: [{ id: 1, name: null }],
    }));
    assert.ok(result.includes('| 1 |  |'));
  });

  it('should handle empty table', () => {
    const result = formatMarkdown(opts({ rows: [] }));
    const lines = result.split('\n');
    assert.strictEqual(lines.length, 2);
  });
});

// ---------------------------------------------------------------------------
// formatExport dispatch — ensures the top-level dispatcher routes correctly
// ---------------------------------------------------------------------------

describe('formatExport dispatch', () => {
  it('should dispatch to correct formatter', () => {
    const o = opts({ format: 'markdown' });
    const result = formatExport(o);
    assert.ok(result.startsWith('| id'));
  });
});
