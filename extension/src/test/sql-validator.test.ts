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

  // --- Literal-masking tests: keywords and semicolons inside string literals
  // are data, not structure, and must not trigger false positives. ---

  it('accepts keyword inside single-quoted literal', () => {
    // 'DELETE' is a data value in the WHERE clause, not a mutation verb.
    assert.doesNotThrow(() =>
      validateGeneratedSql("SELECT * FROM audit_log WHERE action = 'DELETE'"),
    );
  });

  it('accepts semicolon inside single-quoted LIKE pattern', () => {
    // The semicolon in '%a;b%' is inside a literal, not a statement separator.
    assert.doesNotThrow(() =>
      validateGeneratedSql("SELECT id, note FROM notes WHERE note LIKE '%a;b%'"),
    );
  });

  it('accepts keyword inside double-quoted identifier', () => {
    // "update" is a quoted column name, not the UPDATE keyword.
    assert.doesNotThrow(() =>
      validateGeneratedSql('SELECT "update" FROM counters'),
    );
  });

  it('accepts multiple keywords inside IN list literals', () => {
    // Both 'insert' and 'update' are data values in an IN clause.
    assert.doesNotThrow(() =>
      validateGeneratedSql(
        "SELECT COUNT(*) FROM events WHERE kind IN ('insert','update')",
      ),
    );
  });

  it('rejects real stacked statements despite literal content', () => {
    // The semicolon between SELECT 1 and DROP TABLE t is outside any literal,
    // so this is a genuine stacked-statement violation.
    assert.throws(
      () => validateGeneratedSql('SELECT 1; DROP TABLE t'),
      /single SQL statement/i,
    );
  });

  it('rejects semicolon outside literal even when literal is present', () => {
    // The literal 'a' is harmless, but the semicolon after it is structural —
    // it separates two statements. The masker blanks only what is inside quotes.
    assert.throws(
      () =>
        validateGeneratedSql(
          "SELECT * FROM t WHERE x = 'a' ; DROP TABLE t",
        ),
      /single SQL statement/i,
    );
  });

  it('accepts SQL-standard doubled quotes with embedded keyword and semicolon', () => {
    // SQLite escapes single quotes by doubling: 'it''s a DELETE; DROP TABLE t'.
    // The entire doubled-quote sequence is one literal — neither DELETE nor the
    // semicolon is structural. The tokenizer handles this correctly (lines 76-79
    // of raw-sql-tokenizer.ts consume the doubled quote), but this integration
    // test proves the masking pipeline works end-to-end.
    assert.doesNotThrow(() =>
      validateGeneratedSql(
        "SELECT * FROM t WHERE note = 'it''s a DELETE; DROP TABLE t'",
      ),
    );
  });
});
