import * as assert from 'assert';
import {
  classifySql,
  maskCommentsAndLiterals,
  SqlClassification,
} from '../sql/sql-classifier';

// Convenience assertion: the four fields that drive the sidebar UI. Written as
// one helper so every case reads as a single line and the executable/severity
// invariants are checked everywhere rather than only where remembered.
function expectClass(
  sql: string,
  kind: SqlClassification['kind'],
  severity: SqlClassification['severity'],
  verb: string,
): SqlClassification {
  const actual = classifySql(sql);
  assert.strictEqual(actual.kind, kind, `kind for: ${sql}`);
  assert.strictEqual(actual.severity, severity, `severity for: ${sql}`);
  assert.strictEqual(actual.verb, verb, `verb for: ${sql}`);
  // executable is derived from kind and must never drift from it.
  assert.strictEqual(
    actual.executable,
    kind === 'readOnly' || kind === 'mutation',
    `executable for: ${sql}`,
  );
  return actual;
}

describe('classifySql', () => {
  // --- Empty input ---------------------------------------------------------

  it('classifies empty and whitespace-only input as empty', () => {
    for (const sql of ['', '   ', '\n\t  \r\n']) {
      const c = expectClass(sql, 'empty', 'error', '');
      assert.strictEqual(c.reason, 'sqlConsole.reason.empty');
    }
  });

  it('classifies comment-only input as empty, not forbidden', () => {
    // Comments mask to spaces, so there is genuinely no statement to run. The
    // UI must stay quiet rather than accusing the user of something forbidden.
    expectClass('-- just a note', 'empty', 'error', '');
    expectClass('/* block only */', 'empty', 'error', '');
    expectClass('-- one\n/* two */\n', 'empty', 'error', '');
  });

  it('classifies a bare semicolon as empty', () => {
    expectClass(';', 'empty', 'error', '');
    expectClass('  ;  ', 'empty', 'error', '');
  });

  // --- Read-only -----------------------------------------------------------

  it('classifies a simple SELECT as read-only with an empty reason', () => {
    const c = expectClass('SELECT * FROM users', 'readOnly', 'info', 'SELECT');
    // The plan contract: reason is '' for readOnly and only for readOnly.
    assert.strictEqual(c.reason, '');
  });

  it('accepts a multi-line SELECT (newline right after the verb)', () => {
    // Regression guard for the server-side bug where startsWith('SELECT ')
    // demanded one literal space and rejected every pretty-printed query.
    expectClass('SELECT\n  id,\n  name\nFROM users', 'readOnly', 'info', 'SELECT');
    expectClass('SELECT\tid FROM users', 'readOnly', 'info', 'SELECT');
    expectClass('SELECT\r\n  1', 'readOnly', 'info', 'SELECT');
  });

  it('accepts WITH ... SELECT as read-only', () => {
    expectClass(
      'WITH recent AS (SELECT id FROM logs ORDER BY ts DESC LIMIT 10)\n' +
        'SELECT * FROM recent',
      'readOnly',
      'info',
      'WITH',
    );
  });

  it('is case insensitive on the leading verb', () => {
    expectClass('select 1', 'readOnly', 'info', 'SELECT');
    expectClass('SeLeCt 1', 'readOnly', 'info', 'SELECT');
    expectClass('with x as (select 1) select * from x', 'readOnly', 'info', 'WITH');
    expectClass('delete from t where id = 1', 'mutation', 'warning', 'DELETE');
    expectClass('drop table t', 'forbidden', 'error', 'DROP');
  });

  it('tolerates leading whitespace and comments before the verb', () => {
    expectClass('   \n  SELECT 1', 'readOnly', 'info', 'SELECT');
    expectClass('-- a leading note\nSELECT 1', 'readOnly', 'info', 'SELECT');
    expectClass('/* header */ SELECT 1', 'readOnly', 'info', 'SELECT');
    expectClass('/* a */ -- b\n  UPDATE t SET x = 1', 'mutation', 'warning', 'UPDATE');
  });

  it('allows a trailing semicolon and trailing comment on a SELECT', () => {
    expectClass('SELECT 1;', 'readOnly', 'info', 'SELECT');
    expectClass('SELECT 1; -- done', 'readOnly', 'info', 'SELECT');
    expectClass('SELECT 1;\n/* done */', 'readOnly', 'info', 'SELECT');
  });

  it('does not trip on identifiers that merely contain a forbidden word', () => {
    // Whole-word matching only: analyze_results is one word, not ANALYZE.
    expectClass('SELECT * FROM analyze_results', 'readOnly', 'info', 'SELECT');
    expectClass('SELECT dropped FROM t', 'readOnly', 'info', 'SELECT');
  });

  it('does not trip on forbidden words inside string literals', () => {
    // Literals mask to `?` before the keyword scan, so this is a plain SELECT.
    expectClass("SELECT 'DROP TABLE users' AS note", 'readOnly', 'info', 'SELECT');
    expectClass('SELECT "drop" FROM t', 'readOnly', 'info', 'SELECT');
    expectClass('SELECT [delete] FROM t', 'readOnly', 'info', 'SELECT');
    expectClass('SELECT `pragma` FROM t', 'readOnly', 'info', 'SELECT');
  });

  it('rejects a SELECT with a stacked forbidden keyword', () => {
    // Leading verb is fine but the statement still writes; the server rejects
    // it, so enabling Execute here would guarantee a failed round trip.
    const c = expectClass(
      'WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x',
      'forbidden',
      'error',
      'WITH',
    );
    assert.strictEqual(c.reason, 'sqlConsole.reason.forbiddenKeyword');
    expectClass('SELECT * FROM pragma_table_info', 'readOnly', 'info', 'SELECT');
  });

  // --- Multi-statement / masking traps -------------------------------------

  it('rejects a second statement after the first semicolon', () => {
    const c = expectClass('SELECT 1; DROP TABLE t', 'forbidden', 'error', 'SELECT');
    assert.strictEqual(c.reason, 'sqlConsole.reason.multiStatement');
  });

  it('catches the audit trap: a -- inside a string literal', () => {
    // The canonical regression. A chain of independent regex passes strips the
    // comment first, desynchronizes quote pairing, and reports this as a safe
    // read-only query. The single-pass state machine must call it forbidden.
    const c = expectClass(
      "SELECT 'a -- b' ; DROP TABLE t --",
      'forbidden',
      'error',
      'SELECT',
    );
    assert.strictEqual(c.reason, 'sqlConsole.reason.multiStatement');
  });

  it('catches a /* inside a string literal hiding a second statement', () => {
    expectClass("SELECT '/*' ; DROP TABLE t", 'forbidden', 'error', 'SELECT');
  });

  it("catches an apostrophe inside a comment desyncing quotes", () => {
    expectClass(
      "SELECT 1 -- it's fine\n; DROP TABLE t",
      'forbidden',
      'error',
      'SELECT',
    );
  });

  it('does not treat a semicolon inside a literal or comment as a separator', () => {
    // The mirror image: masking must not create false multi-statement reports.
    expectClass("SELECT ';' AS semi", 'readOnly', 'info', 'SELECT');
    expectClass('SELECT 1 -- ; DROP TABLE t', 'readOnly', 'info', 'SELECT');
    expectClass('SELECT 1 /* ; DROP TABLE t */', 'readOnly', 'info', 'SELECT');
    expectClass('SELECT [a;b] FROM t', 'readOnly', 'info', 'SELECT');
  });

  it('handles doubled quotes as escapes, not terminators', () => {
    // 'it''s' is ONE literal. Mis-pairing it would expose the trailing text.
    expectClass("SELECT 'it''s ; ok' AS v", 'readOnly', 'info', 'SELECT');
    expectClass("SELECT 'it''s' ; DROP TABLE t", 'forbidden', 'error', 'SELECT');
  });

  // --- Mutations -----------------------------------------------------------

  it('classifies the four mutation verbs as warnings', () => {
    const cases: Array<[string, string]> = [
      ['INSERT INTO t (a) VALUES (1)', 'INSERT'],
      ['INSERT OR REPLACE INTO t (a) VALUES (1)', 'INSERT'],
      ['REPLACE INTO t (a) VALUES (1)', 'REPLACE'],
      ['UPDATE t SET a = 1 WHERE id = 2', 'UPDATE'],
      ['UPDATE OR IGNORE t SET a = 1', 'UPDATE'],
      ['DELETE FROM t WHERE id = 2', 'DELETE'],
    ];
    for (const [sql, verb] of cases) {
      const c = expectClass(sql, 'mutation', 'warning', verb);
      assert.strictEqual(c.reason, 'sqlConsole.reason.mutation');
    }
  });

  it('classifies an unqualified DELETE (no WHERE) as a mutation warning', () => {
    // Deliberately still just a warning, not an error: the whole-table delete
    // is legal and the confirm-destructive prompt in package C is what guards
    // it. The classifier does not editorialize about how much data is at risk.
    const c = expectClass('DELETE FROM users', 'mutation', 'warning', 'DELETE');
    assert.strictEqual(c.reason, 'sqlConsole.reason.mutation');
    assert.strictEqual(c.executable, true);
  });

  it('accepts a mutation whose table name is quoted', () => {
    // Masking turns "my table" into `?`; the UPDATE pattern deliberately has no
    // trailing \b so it still matches.
    expectClass('UPDATE "my table" SET a = 1', 'mutation', 'warning', 'UPDATE');
    expectClass('DELETE FROM [my table]', 'mutation', 'warning', 'DELETE');
  });

  it('rejects a mutation with a stacked DDL keyword', () => {
    const c = expectClass(
      'UPDATE t SET a = 1 WHERE b IN (SELECT x FROM pragma_x) AND PRAGMA',
      'forbidden',
      'error',
      'UPDATE',
    );
    assert.strictEqual(c.reason, 'sqlConsole.reason.forbiddenKeyword');
  });

  it('rejects a malformed mutation with a distinct reason', () => {
    // INSERT without INTO / DELETE without FROM: the useful hint is "fix the
    // syntax", not "not allowed", so these get their own key.
    const insert = expectClass('INSERT t VALUES (1)', 'forbidden', 'error', 'INSERT');
    assert.strictEqual(insert.reason, 'sqlConsole.reason.malformedMutation');
    const del = expectClass('DELETE t', 'forbidden', 'error', 'DELETE');
    assert.strictEqual(del.reason, 'sqlConsole.reason.malformedMutation');
  });

  // --- Forbidden statements ------------------------------------------------

  it('classifies DDL as forbidden', () => {
    for (const sql of [
      'CREATE TABLE t (a INTEGER)',
      'CREATE INDEX idx ON t (a)',
      'ALTER TABLE t ADD COLUMN b TEXT',
      'DROP TABLE t',
      'TRUNCATE TABLE t',
    ]) {
      const c = classifySql(sql);
      assert.strictEqual(c.kind, 'forbidden', sql);
      assert.strictEqual(c.severity, 'error', sql);
      assert.strictEqual(c.executable, false, sql);
      assert.strictEqual(c.reason, 'sqlConsole.reason.forbiddenStatement', sql);
    }
  });

  it('classifies utility statements as forbidden', () => {
    for (const sql of [
      'PRAGMA table_info(t)',
      'ATTACH DATABASE \'other.db\' AS o',
      'DETACH DATABASE o',
      'VACUUM',
      'ANALYZE',
      'REINDEX',
    ]) {
      const c = classifySql(sql);
      assert.strictEqual(c.kind, 'forbidden', sql);
      assert.strictEqual(c.severity, 'error', sql);
      assert.strictEqual(c.executable, false, sql);
    }
  });

  it('classifies unrecognized input as forbidden with a best-effort verb', () => {
    expectClass('EXPLAIN SELECT 1', 'forbidden', 'error', 'EXPLAIN');
    expectClass('BEGIN', 'forbidden', 'error', 'BEGIN');
    expectClass('not sql at all', 'forbidden', 'error', 'NOT');
    // No identifier-shaped leading token at all: verb is reported as ''.
    expectClass('(SELECT 1)', 'forbidden', 'error', '');
  });

  it('never emits raw English in reason (l10n keys only)', () => {
    // Every non-empty reason must be a dotted key under the sqlConsole
    // namespace, so package C can resolve it via t() with no fallback English
    // baked into the classifier.
    for (const sql of [
      '',
      'SELECT 1',
      'SELECT 1; DROP TABLE t',
      'UPDATE t SET a = 1',
      'DROP TABLE t',
      'INSERT t VALUES (1)',
      'WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x',
    ]) {
      const { reason } = classifySql(sql);
      if (reason !== '') {
        assert.ok(
          /^sqlConsole\.reason\.[a-zA-Z]+$/.test(reason),
          `reason is not an l10n key for "${sql}": ${reason}`,
        );
      }
    }
  });
});

describe('maskCommentsAndLiterals', () => {
  it('replaces comments with a single space', () => {
    assert.strictEqual(maskCommentsAndLiterals('a -- b\nc'), 'a  \nc');
    assert.strictEqual(maskCommentsAndLiterals('a /* b */ c'), 'a   c');
  });

  it('replaces each quoted run with a single ?', () => {
    assert.strictEqual(maskCommentsAndLiterals("SELECT 'x' , \"y\""), 'SELECT ? , ?');
    assert.strictEqual(maskCommentsAndLiterals('SELECT `y`, [z]'), 'SELECT ?, ?');
  });

  it('keeps a comment marker inside a literal inside the literal', () => {
    // The whole literal becomes one `?`; the `--` never starts a comment.
    assert.strictEqual(maskCommentsAndLiterals("SELECT 'a -- b' ; X"), 'SELECT ? ; X');
  });

  it('treats an unterminated run as extending to end of input', () => {
    // Better to over-mask than to leave a dangling quote that resyncs the
    // scanner onto the wrong characters.
    assert.strictEqual(maskCommentsAndLiterals("SELECT 'abc"), 'SELECT ?');
    assert.strictEqual(maskCommentsAndLiterals('SELECT /* abc'), 'SELECT  ');
  });
});
