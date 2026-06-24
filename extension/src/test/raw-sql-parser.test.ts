import * as assert from 'assert';
import {
  extractRawSqlColumnRefs,
  type IRawSqlColumnRef,
} from '../diagnostics/checkers/raw-sql-parser';

/** Column names (lowercased) extracted for a given table from a source string. */
function columnsFor(source: string, table: string): string[] {
  return extractRawSqlColumnRefs(source)
    .filter((r) => r.table === table)
    .map((r) => r.column);
}

describe('extractRawSqlColumnRefs', () => {
  it('extracts the bad column from the motivating incident', () => {
    const source = `
await db.customSelect(
  'SELECT contact_saropa_uuid AS uuid, LENGTH(image) AS sz FROM contact_avatars',
).get();`;
    const refs = extractRawSqlColumnRefs(source);
    const cols = refs.map((r) => r.column).sort();
    // contact_saropa_uuid (bad) and image (function arg, real). Aliases uuid/sz
    // and the function name LENGTH are excluded.
    assert.deepStrictEqual(cols, ['contact_saropa_uuid', 'image']);
    assert.ok(refs.every((r) => r.table === 'contact_avatars'));
  });

  it('reports a precise span for the offending column', () => {
    const source =
      "db.customSelect('SELECT bad_col FROM users');";
    const refs = extractRawSqlColumnRefs(source);
    assert.strictEqual(refs.length, 1);
    const ref = refs[0] as IRawSqlColumnRef;
    assert.strictEqual(ref.column, 'bad_col');
    assert.strictEqual(ref.length, 'bad_col'.length);
    assert.strictEqual(
      source.slice(ref.offset, ref.offset + ref.length),
      'bad_col',
    );
  });

  it('excludes aliases declared with AS', () => {
    assert.deepStrictEqual(
      columnsFor("customSelect('SELECT id AS x FROM t')", 't'),
      ['id'],
    );
  });

  it('excludes function names but keeps their column arguments', () => {
    assert.deepStrictEqual(
      columnsFor("customSelect('SELECT COUNT(votes) FROM polls')", 'polls'),
      ['votes'],
    );
  });

  it('excludes SELECT *', () => {
    assert.deepStrictEqual(
      columnsFor("customSelect('SELECT * FROM t')", 't'),
      [],
    );
  });

  it('validates WHERE / ORDER BY columns', () => {
    const cols = columnsFor(
      "customSelect('SELECT a FROM t WHERE b = 1 ORDER BY c')",
      't',
    );
    assert.deepStrictEqual(cols.sort(), ['a', 'b', 'c']);
  });

  it('skips multi-table queries with a JOIN', () => {
    const refs = extractRawSqlColumnRefs(
      "customSelect('SELECT a.x FROM a JOIN b ON a.id = b.id')",
    );
    assert.deepStrictEqual(refs, []);
  });

  it('skips comma-separated multi-table FROM', () => {
    const refs = extractRawSqlColumnRefs(
      "customSelect('SELECT x FROM a, b')",
    );
    assert.deepStrictEqual(refs, []);
  });

  it('resolves a column qualified by the table alias', () => {
    assert.deepStrictEqual(
      columnsFor("customSelect('SELECT u.name FROM users u')", 'users'),
      ['name'],
    );
  });

  it('resolves a column qualified by the table name', () => {
    assert.deepStrictEqual(
      columnsFor("customSelect('SELECT users.name FROM users')", 'users'),
      ['name'],
    );
  });

  it('skips a column qualified by an unknown alias', () => {
    // `x` is neither the table nor its declared alias -> cannot attribute.
    assert.deepStrictEqual(
      columnsFor("customSelect('SELECT x.name FROM users u')", 'users'),
      [],
    );
  });

  it('does not parse identifiers inside string literals', () => {
    // Triple-quoted Dart wrapper so the inner single-quoted SQL literal
    // `'from_value'` does not terminate the captured string.
    const source = "customSelect('''SELECT name FROM t WHERE x = 'from_value' ''')";
    assert.deepStrictEqual(columnsFor(source, 't'), ['name', 'x']);
  });

  it('ignores bind parameters and numeric literals', () => {
    assert.deepStrictEqual(
      columnsFor("customSelect('SELECT a FROM t WHERE b = ? AND c = 5')", 't'),
      ['a', 'b', 'c'],
    );
  });

  it('handles customStatement the same as customSelect', () => {
    assert.deepStrictEqual(
      columnsFor("customStatement('SELECT col FROM t')", 't'),
      ['col'],
    );
  });

  it('skips a query with no FROM clause', () => {
    assert.deepStrictEqual(
      extractRawSqlColumnRefs("customStatement('PRAGMA foreign_keys = ON')"),
      [],
    );
  });

  it('handles triple-quoted multi-line SQL', () => {
    const source = [
      "db.customSelect('''",
      'SELECT first_name, bad_col',
      'FROM people',
      "''')",
    ].join('\n');
    assert.deepStrictEqual(
      columnsFor(source, 'people').sort(),
      ['bad_col', 'first_name'],
    );
  });
});
