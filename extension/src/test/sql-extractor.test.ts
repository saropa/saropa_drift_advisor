import * as assert from 'assert';
import { extractSqlFromContext } from '../explain/sql-extractor';

describe('extractSqlFromContext', () => {
  describe('selected text', () => {
    it('should return selected text starting with SELECT', () => {
      const result = extractSqlFromContext(
        '', 'SELECT * FROM users', 0,
      );
      assert.strictEqual(result, 'SELECT * FROM users');
    });

    it('should return selected text starting with WITH', () => {
      const result = extractSqlFromContext(
        '', '  WITH cte AS (SELECT 1) SELECT * FROM cte  ', 0,
      );
      assert.strictEqual(
        result, 'WITH cte AS (SELECT 1) SELECT * FROM cte',
      );
    });

    it('should return null for non-SQL selected text', () => {
      const result = extractSqlFromContext(
        '', 'final x = 42;', 0,
      );
      assert.strictEqual(result, null);
    });
  });

  describe('single-line string literals', () => {
    it('should extract from single-quoted string', () => {
      const line = "  final q = 'SELECT * FROM users WHERE id = ?';";
      const result = extractSqlFromContext(line, '', 0);
      assert.strictEqual(result, 'SELECT * FROM users WHERE id = ?');
    });

    it('should extract from double-quoted string', () => {
      const line = '  final q = "SELECT name FROM posts";';
      const result = extractSqlFromContext(line, '', 0);
      assert.strictEqual(result, 'SELECT name FROM posts');
    });

    it('should return null when line has no SQL string', () => {
      const line = "  final x = 'hello world';";
      const result = extractSqlFromContext(line, '', 0);
      assert.strictEqual(result, null);
    });
  });

  describe('customSelect / customStatement', () => {
    it('should extract from customSelect call', () => {
      const line = "  db.customSelect('SELECT * FROM orders');";
      const result = extractSqlFromContext(line, '', 0);
      assert.strictEqual(result, 'SELECT * FROM orders');
    });

    it('should extract from customStatement call', () => {
      const line = '  db.customStatement("SELECT count(*) FROM items");';
      const result = extractSqlFromContext(line, '', 0);
      assert.strictEqual(result, 'SELECT count(*) FROM items');
    });
  });

  describe('triple-quoted strings', () => {
    it('should extract from single-line triple-quoted string', () => {
      const doc = "  final q = '''SELECT * FROM users''';";
      const result = extractSqlFromContext(doc, '', 0);
      assert.strictEqual(result, 'SELECT * FROM users');
    });

    it('should extract from multi-line triple-quoted string', () => {
      const lines = [
        "  final q = '''",
        '    SELECT *',
        '    FROM users',
        '    WHERE id = ?',
        "  ''';",
      ];
      const doc = lines.join('\n');
      // Cursor on the FROM line (line 2)
      const result = extractSqlFromContext(doc, '', 2);
      assert.strictEqual(
        result,
        'SELECT *\n    FROM users\n    WHERE id = ?',
      );
    });

    it('should return null for non-SQL triple-quoted string', () => {
      const doc = "  final q = '''hello world''';";
      const result = extractSqlFromContext(doc, '', 0);
      assert.strictEqual(result, null);
    });
  });

  describe('edge cases', () => {
    it('should return null for empty document', () => {
      const result = extractSqlFromContext('', '', 0);
      assert.strictEqual(result, null);
    });

    it('should return null for out-of-range cursor line', () => {
      const result = extractSqlFromContext('line 0', '', 5);
      assert.strictEqual(result, null);
    });

    it('should prefer selected text over line content', () => {
      const doc = "  final q = 'SELECT 1';";
      const result = extractSqlFromContext(doc, 'SELECT 2', 0);
      assert.strictEqual(result, 'SELECT 2');
    });
  });
});
