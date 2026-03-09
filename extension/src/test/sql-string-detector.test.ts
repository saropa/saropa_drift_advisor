import * as assert from 'assert';
import {
  classifyIdentifier,
  containsSqlKeywords,
  extractEnclosingString,
  getWordAt,
  isInsideSqlString,
  isInsideString,
} from '../definition/sql-string-detector';

describe('sql-string-detector', () => {
  describe('isInsideString()', () => {
    it('should return true when inside single-quoted string', () => {
      //                 0123456789
      const line = "x = 'hello world';";
      assert.strictEqual(isInsideString(line, 6), true); // on 'e'
      assert.strictEqual(isInsideString(line, 10), true); // on 'w'
    });

    it('should return true when inside double-quoted string', () => {
      const line = 'x = "hello world";';
      assert.strictEqual(isInsideString(line, 6), true);
    });

    it('should return false when outside strings', () => {
      const line = "x = 'hello';";
      assert.strictEqual(isInsideString(line, 0), false); // on 'x'
      assert.strictEqual(isInsideString(line, 3), false); // on space before quote
    });

    it('should handle escaped quotes', () => {
      const line = "x = 'he\\'llo';";
      assert.strictEqual(isInsideString(line, 6), true); // inside string
      assert.strictEqual(isInsideString(line, 10), true); // after escaped quote, still inside
    });

    it('should handle nested quote types', () => {
      const line = `x = "it's here";`;
      assert.strictEqual(isInsideString(line, 5), true); // inside double-quoted string
      assert.strictEqual(isInsideString(line, 7), true); // after single quote inside double
    });

    it('should return false after closing quote', () => {
      const line = "x = 'hello' + y;";
      assert.strictEqual(isInsideString(line, 12), false); // on space after closing quote
    });
  });

  describe('extractEnclosingString()', () => {
    it('should extract content of single-quoted string', () => {
      const line = "x = 'SELECT * FROM users';";
      assert.strictEqual(
        extractEnclosingString(line, 10),
        'SELECT * FROM users',
      );
    });

    it('should extract content of double-quoted string', () => {
      const line = 'x = "SELECT * FROM users";';
      assert.strictEqual(
        extractEnclosingString(line, 10),
        'SELECT * FROM users',
      );
    });

    it('should return null when not inside a string', () => {
      const line = 'x = y + z;';
      assert.strictEqual(extractEnclosingString(line, 5), null);
    });

    it('should handle multiple strings on one line', () => {
      const line = "a = 'first' + 'SELECT id FROM users';";
      // cursor on 'u' in 'users'
      assert.strictEqual(
        extractEnclosingString(line, 30),
        'SELECT id FROM users',
      );
    });

    it('should handle escaped characters', () => {
      const line = "x = 'he\\'s SELECT';";
      assert.strictEqual(extractEnclosingString(line, 12), "he\\'s SELECT");
    });
  });

  describe('containsSqlKeywords()', () => {
    it('should detect SELECT', () => {
      assert.strictEqual(containsSqlKeywords('SELECT * FROM users'), true);
    });

    it('should detect INSERT', () => {
      assert.strictEqual(
        containsSqlKeywords('INSERT INTO users VALUES (1)'),
        true,
      );
    });

    it('should be case-insensitive', () => {
      assert.strictEqual(containsSqlKeywords('select * from users'), true);
    });

    it('should return false for non-SQL text', () => {
      assert.strictEqual(containsSqlKeywords('hello world'), false);
    });

    it('should not match partial words', () => {
      assert.strictEqual(containsSqlKeywords('selectivity'), false);
    });
  });

  describe('isInsideSqlString()', () => {
    it('should return true when inside a SQL string', () => {
      const line = "  'SELECT name, email FROM users WHERE id = ?',";
      assert.strictEqual(isInsideSqlString(line, 35), true); // on 'u' of 'users'
    });

    it('should return false when inside a non-SQL string', () => {
      const line = "  'hello world',";
      assert.strictEqual(isInsideSqlString(line, 6), false);
    });

    it('should return false when not inside a string', () => {
      const line = '  var users = getUsers();';
      assert.strictEqual(isInsideSqlString(line, 6), false);
    });

    it('should handle double-quoted SQL strings', () => {
      const line = '  "SELECT * FROM orders",';
      assert.strictEqual(isInsideSqlString(line, 18), true); // on 'o' of 'orders'
    });
  });

  describe('getWordAt()', () => {
    it('should extract a word at the cursor position', () => {
      const line = 'SELECT name FROM users WHERE id = ?';
      const result = getWordAt(line, 17); // on 'u' of 'users'
      assert.deepStrictEqual(result, { word: 'users', start: 17, end: 22 });
    });

    it('should extract a word when cursor is in the middle', () => {
      const line = 'SELECT name FROM users WHERE id = ?';
      const result = getWordAt(line, 19); // on 'e' of 'users'
      assert.deepStrictEqual(result, { word: 'users', start: 17, end: 22 });
    });

    it('should return null when cursor is on a non-word character', () => {
      const line = 'SELECT name FROM users WHERE id = ?';
      assert.strictEqual(getWordAt(line, 16), null); // on space
    });

    it('should return null for out-of-bounds position', () => {
      const line = 'hello';
      assert.strictEqual(getWordAt(line, -1), null);
      assert.strictEqual(getWordAt(line, 10), null);
    });

    it('should handle single character words', () => {
      const line = 'a = b';
      const result = getWordAt(line, 0);
      assert.deepStrictEqual(result, { word: 'a', start: 0, end: 1 });
    });

    it('should handle word at end of line', () => {
      const line = 'FROM users';
      const result = getWordAt(line, 5);
      assert.deepStrictEqual(result, { word: 'users', start: 5, end: 10 });
    });
  });

  describe('classifyIdentifier()', () => {
    const knownTables = ['users', 'orders'];
    const knownColumns = new Map([
      ['users', ['id', 'name', 'email']],
      ['orders', ['id', 'user_id', 'total']],
    ]);

    it('should classify known table names', () => {
      const result = classifyIdentifier(
        'users',
        'SELECT * FROM users',
        knownTables,
        knownColumns,
      );
      assert.deepStrictEqual(result, { type: 'table' });
    });

    it('should be case-insensitive for table names', () => {
      const result = classifyIdentifier(
        'Users',
        'SELECT * FROM Users',
        knownTables,
        knownColumns,
      );
      assert.deepStrictEqual(result, { type: 'table' });
    });

    it('should classify column names with table context', () => {
      const result = classifyIdentifier(
        'email',
        'SELECT email FROM users',
        knownTables,
        knownColumns,
      );
      assert.deepStrictEqual(result, { type: 'column', tableName: 'users' });
    });

    it('should fall back to first matching table when no context', () => {
      const result = classifyIdentifier(
        'id',
        'SELECT id',
        knownTables,
        knownColumns,
      );
      // 'id' exists in both tables; should return the first match
      assert.ok(result);
      assert.strictEqual(result!.type, 'column');
      assert.ok(result!.tableName === 'users' || result!.tableName === 'orders');
    });

    it('should prefer table from SQL context for ambiguous columns', () => {
      const result = classifyIdentifier(
        'id',
        'SELECT id FROM orders',
        knownTables,
        knownColumns,
      );
      assert.deepStrictEqual(result, { type: 'column', tableName: 'orders' });
    });

    it('should return null for unknown identifiers', () => {
      const result = classifyIdentifier(
        'foobar',
        'SELECT foobar FROM users',
        knownTables,
        knownColumns,
      );
      assert.strictEqual(result, null);
    });

    it('should return null for SQL keywords', () => {
      const result = classifyIdentifier(
        'SELECT',
        'SELECT * FROM users',
        knownTables,
        knownColumns,
      );
      assert.strictEqual(result, null);
    });
  });
});
