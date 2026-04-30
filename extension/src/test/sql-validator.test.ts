import * as assert from 'node:assert';
import { validateGeneratedSql } from '../nl-sql/sql-validator';

describe('validateGeneratedSql', () => {
  it('accepts single SELECT statements', () => {
    assert.doesNotThrow(() => validateGeneratedSql('SELECT * FROM "users";'));
  });

  it('accepts CTE statements', () => {
    assert.doesNotThrow(() =>
      validateGeneratedSql('WITH x AS (SELECT 1) SELECT * FROM x;'),
    );
  });

  it('rejects stacked statements', () => {
    assert.throws(
      () => validateGeneratedSql('SELECT 1; SELECT 2;'),
      /single SQL statement/i,
    );
  });

  it('rejects mutation statements', () => {
    assert.throws(
      () => validateGeneratedSql('DELETE FROM users'),
      /Only SELECT queries/i,
    );
  });
});
