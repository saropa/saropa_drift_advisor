import * as assert from 'assert';
import { extractTableFromSql } from '../diagnostics/utils/sql-utils';

// Audit M12: classify by the leading verb so INSERT/UPDATE/DELETE return their
// write target, not a table named in a later FROM clause.
describe('extractTableFromSql (M12)', () => {
  it('returns the INSERT target, not the SELECT source', () => {
    assert.strictEqual(
      extractTableFromSql('INSERT INTO logs SELECT * FROM users'),
      'logs',
    );
  });

  it('returns the UPDATE target', () => {
    assert.strictEqual(
      extractTableFromSql('UPDATE orders SET total = 0 WHERE id = 1'),
      'orders',
    );
  });

  it('returns the DELETE FROM target', () => {
    assert.strictEqual(
      extractTableFromSql('DELETE FROM sessions WHERE expired = 1'),
      'sessions',
    );
  });

  it('returns the FROM table for a plain SELECT', () => {
    assert.strictEqual(
      extractTableFromSql('SELECT * FROM products WHERE price > 0'),
      'products',
    );
  });

  it('handles quoted identifiers', () => {
    assert.strictEqual(
      extractTableFromSql('INSERT INTO "audit" SELECT * FROM "events"'),
      'audit',
    );
  });

  it('returns null when no table is present', () => {
    assert.strictEqual(extractTableFromSql('PRAGMA user_version'), null);
  });
});
