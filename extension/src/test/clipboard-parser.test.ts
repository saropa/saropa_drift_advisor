/**
 * Tests for clipboard-parser.ts
 */

import * as assert from 'assert';
import {
  autoMapColumns,
  buildImportPayload,
  ClipboardParser,
} from '../import/clipboard-parser';

describe('ClipboardParser', () => {
  const parser = new ClipboardParser();

  describe('parse()', () => {
    it('should throw on empty clipboard', () => {
      assert.throws(() => parser.parse(''), /empty/i);
      assert.throws(() => parser.parse('   '), /empty/i);
    });

    describe('TSV parsing', () => {
      it('should parse tab-separated data', () => {
        const text = 'name\temail\tage\nAlice\talice@example.com\t25\nBob\tbob@example.com\t30';
        const result = parser.parse(text);

        assert.strictEqual(result.format, 'tsv');
        assert.deepStrictEqual(result.headers, ['name', 'email', 'age']);
        assert.strictEqual(result.rows.length, 2);
        assert.deepStrictEqual(result.rows[0], ['Alice', 'alice@example.com', '25']);
        assert.deepStrictEqual(result.rows[1], ['Bob', 'bob@example.com', '30']);
      });

      it('should handle Windows line endings', () => {
        const text = 'name\temail\r\nAlice\talice@example.com\r\nBob\tbob@example.com';
        const result = parser.parse(text);

        assert.strictEqual(result.format, 'tsv');
        assert.strictEqual(result.rows.length, 2);
      });

      it('should trim whitespace from cells', () => {
        const text = 'name\temail\n  Alice  \t  alice@example.com  ';
        const result = parser.parse(text);

        assert.deepStrictEqual(result.rows[0], ['Alice', 'alice@example.com']);
      });

      it('should handle header-only data', () => {
        const text = 'name\temail\tage';
        const result = parser.parse(text);

        assert.deepStrictEqual(result.headers, ['name', 'email', 'age']);
        assert.strictEqual(result.rows.length, 0);
      });
    });

    describe('CSV parsing', () => {
      it('should parse comma-separated data', () => {
        const text = 'name,email,age\nAlice,alice@example.com,25';
        const result = parser.parse(text);

        assert.strictEqual(result.format, 'csv');
        assert.deepStrictEqual(result.headers, ['name', 'email', 'age']);
        assert.deepStrictEqual(result.rows[0], ['Alice', 'alice@example.com', '25']);
      });

      it('should handle quoted fields with commas', () => {
        const text = 'name,address,city\nAlice,"123 Main St, Apt 4",Boston';
        const result = parser.parse(text);

        assert.strictEqual(result.format, 'csv');
        assert.deepStrictEqual(result.rows[0], ['Alice', '123 Main St, Apt 4', 'Boston']);
      });

      it('should handle quoted fields with newlines', () => {
        const text = 'name,notes\nAlice,"Line 1\nLine 2"';
        const result = parser.parse(text);

        assert.deepStrictEqual(result.rows[0], ['Alice', 'Line 1\nLine 2']);
      });

      it('should handle escaped quotes', () => {
        const text = 'name,quote\nAlice,"He said ""Hello"""';
        const result = parser.parse(text);

        assert.deepStrictEqual(result.rows[0], ['Alice', 'He said "Hello"']);
      });

      it('should prefer TSV when tabs are present', () => {
        const text = 'name\temail,extra\nAlice\talice@example.com,data';
        const result = parser.parse(text);

        assert.strictEqual(result.format, 'tsv');
      });
    });

    describe('HTML parsing', () => {
      it('should parse HTML table', () => {
        const text = `
          <table>
            <tr><th>Name</th><th>Email</th></tr>
            <tr><td>Alice</td><td>alice@example.com</td></tr>
            <tr><td>Bob</td><td>bob@example.com</td></tr>
          </table>
        `;
        const result = parser.parse(text);

        assert.strictEqual(result.format, 'html');
        assert.deepStrictEqual(result.headers, ['Name', 'Email']);
        assert.strictEqual(result.rows.length, 2);
        assert.deepStrictEqual(result.rows[0], ['Alice', 'alice@example.com']);
      });

      it('should strip nested HTML tags from cells', () => {
        const text = '<table><tr><th>Name</th></tr><tr><td><b>Alice</b></td></tr></table>';
        const result = parser.parse(text);

        assert.deepStrictEqual(result.rows[0], ['Alice']);
      });

      it('should decode HTML entities', () => {
        const text = '<table><tr><th>Text</th></tr><tr><td>A &amp; B &lt; C</td></tr></table>';
        const result = parser.parse(text);

        assert.deepStrictEqual(result.rows[0], ['A & B < C']);
      });

      it('should handle tables without thead', () => {
        const text = '<tr><td>Name</td><td>Email</td></tr><tr><td>Alice</td><td>test@example.com</td></tr>';
        const result = parser.parse(text);

        assert.strictEqual(result.format, 'html');
        assert.strictEqual(result.rows.length, 1);
      });

      it('should throw on HTML with no table rows', () => {
        const text = '<table></table>';
        assert.throws(() => parser.parse(text), /No table data/i);
      });
    });
  });
});

describe('autoMapColumns', () => {
  it('should match exact column names', () => {
    const mapping = autoMapColumns(['name', 'email'], ['name', 'email', 'age']);

    assert.strictEqual(mapping[0].tableColumn, 'name');
    assert.strictEqual(mapping[1].tableColumn, 'email');
  });

  it('should match case-insensitively', () => {
    const mapping = autoMapColumns(['NAME', 'Email'], ['name', 'email']);

    assert.strictEqual(mapping[0].tableColumn, 'name');
    assert.strictEqual(mapping[1].tableColumn, 'email');
  });

  it('should match ignoring underscores and spaces', () => {
    const mapping = autoMapColumns(
      ['first name', 'email-address'],
      ['first_name', 'email_address'],
    );

    assert.strictEqual(mapping[0].tableColumn, 'first_name');
    assert.strictEqual(mapping[1].tableColumn, 'email_address');
  });

  it('should return null for unmatched columns', () => {
    const mapping = autoMapColumns(['unknown', 'name'], ['name', 'email']);

    assert.strictEqual(mapping[0].tableColumn, null);
    assert.strictEqual(mapping[1].tableColumn, 'name');
  });

  it('should preserve clipboard header and index', () => {
    const mapping = autoMapColumns(['First Name'], ['first_name']);

    assert.strictEqual(mapping[0].clipboardHeader, 'First Name');
    assert.strictEqual(mapping[0].clipboardIndex, 0);
  });
});

describe('buildImportPayload', () => {
  it('should build records from mapped columns', () => {
    const parsed = {
      format: 'csv' as const,
      headers: ['name', 'email', 'notes'],
      rows: [['Alice', 'alice@example.com', 'test']],
      rawText: '',
    };

    const mapping = [
      { clipboardIndex: 0, clipboardHeader: 'name', tableColumn: 'name' },
      { clipboardIndex: 1, clipboardHeader: 'email', tableColumn: 'email' },
      { clipboardIndex: 2, clipboardHeader: 'notes', tableColumn: null },
    ];

    const payload = buildImportPayload(parsed, mapping);

    assert.strictEqual(payload.length, 1);
    assert.deepStrictEqual(payload[0], { name: 'Alice', email: 'alice@example.com' });
  });

  it('should convert empty strings to null', () => {
    const parsed = {
      format: 'csv' as const,
      headers: ['name', 'age'],
      rows: [['Alice', '']],
      rawText: '',
    };

    const mapping = [
      { clipboardIndex: 0, clipboardHeader: 'name', tableColumn: 'name' },
      { clipboardIndex: 1, clipboardHeader: 'age', tableColumn: 'age' },
    ];

    const payload = buildImportPayload(parsed, mapping);

    assert.strictEqual(payload[0].name, 'Alice');
    assert.strictEqual(payload[0].age, null);
  });

  it('should handle missing cells gracefully', () => {
    const parsed = {
      format: 'csv' as const,
      headers: ['name', 'email'],
      rows: [['Alice']],
      rawText: '',
    };

    const mapping = [
      { clipboardIndex: 0, clipboardHeader: 'name', tableColumn: 'name' },
      { clipboardIndex: 1, clipboardHeader: 'email', tableColumn: 'email' },
    ];

    const payload = buildImportPayload(parsed, mapping);

    assert.strictEqual(payload[0].name, 'Alice');
    assert.strictEqual(payload[0].email, null);
  });
});
