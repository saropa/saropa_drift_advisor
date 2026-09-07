import * as assert from 'assert';
import {
  formatSingleCell,
  isSingleCell,
  rowsToCsv,
} from '../sql-console/sql-console-output';

/**
 * Splits generated CSV into lines for assertions. rowsToCsv ends every document
 * with the terminator, so the final empty element is dropped here rather than
 * being repeated in each expectation.
 */
function lines(csv: string): string[] {
  const parts = csv.split('\n');
  assert.strictEqual(parts[parts.length - 1], '', 'CSV must end with a terminator');
  return parts.slice(0, -1);
}

describe('rowsToCsv', () => {
  it('always emits a header row, even with zero rows', () => {
    // An empty result still has to tell the reader what was queried, otherwise
    // the opened document is blank and indistinguishable from a failure.
    assert.deepStrictEqual(lines(rowsToCsv(['id', 'name'], [])), ['id,name']);
  });

  it('writes plain values unquoted', () => {
    assert.deepStrictEqual(lines(rowsToCsv(['a', 'b'], [[1, 'x']])), ['a,b', '1,x']);
  });

  it('quotes a field containing the separator', () => {
    assert.deepStrictEqual(lines(rowsToCsv(['a'], [['x,y']])), ['a', '"x,y"']);
  });

  it('quotes a field containing a quote and doubles the embedded quote', () => {
    assert.deepStrictEqual(lines(rowsToCsv(['a'], [['say "hi"']])), [
      'a',
      '"say ""hi"""',
    ]);
  });

  it('quotes a field containing LF', () => {
    // The embedded newline stays raw inside the quotes; a CSV reader rejoins it.
    assert.strictEqual(rowsToCsv(['a'], [['x\ny']]), 'a\n"x\ny"\n');
  });

  it('quotes a field containing CR and CRLF', () => {
    assert.strictEqual(rowsToCsv(['a'], [['x\r']]), 'a\n"x\r"\n');
    assert.strictEqual(rowsToCsv(['a'], [['x\r\ny']]), 'a\n"x\r\ny"\n');
  });

  it('quotes column names by the same rules as data', () => {
    // A SQLite identifier can legally contain a comma or a quote.
    assert.deepStrictEqual(lines(rowsToCsv(['we,ird', 'qu"ote'], [])), [
      '"we,ird","qu""ote"',
    ]);
  });

  it('keeps NULL and the empty string distinguishable', () => {
    // The core of Decision 4: NULL is an empty UNQUOTED field, the empty string
    // is an explicitly quoted "". Without this a reader could not tell "no
    // value" from "a value that happens to be empty".
    assert.deepStrictEqual(
      lines(rowsToCsv(['n', 'e', 'u'], [[null, '', undefined]])),
      ['n,e,u', ',"",'],
    );
  });

  it('renders numbers and booleans in their normal string form', () => {
    assert.deepStrictEqual(
      lines(rowsToCsv(['i', 'f', 't', 'b'], [[42, 1.5, true, false]])),
      ['i,f,t,b', '42,1.5,true,false'],
    );
  });

  it('renders a byte-array blob as its byte length, never as bytes', () => {
    // Raw blob bytes in a cell are both unreadable and an OOM risk (the same
    // failure family as the SELECT * blob crash guarded by blob-safe-select.ts).
    assert.deepStrictEqual(lines(rowsToCsv(['img'], [[[1, 2, 3, 255]]])), [
      'img',
      '<4 bytes>',
    ]);
  });

  it('renders a Uint8Array blob as its byte length', () => {
    assert.deepStrictEqual(
      lines(rowsToCsv(['img'], [[new Uint8Array([1, 2, 3])]])),
      ['img', '<3 bytes>'],
    );
  });

  it('derives a byte length from a base64-carrying blob wrapper', () => {
    // Length is computed from the encoded text, never by decoding it — decoding
    // would materialize exactly the payload the placeholder exists to avoid.
    assert.deepStrictEqual(lines(rowsToCsv(['img'], [[{ base64: 'AAAA' }]])), [
      'img',
      '<3 bytes>',
    ]);
  });

  it('falls back to <blob> when no byte length is derivable', () => {
    assert.deepStrictEqual(lines(rowsToCsv(['x'], [[{ shape: 'unknown' }]])), [
      'x',
      '<blob>',
    ]);
    // A mixed array is not the host's byte-array encoding, so its length must
    // not be reported as a byte count.
    assert.deepStrictEqual(lines(rowsToCsv(['x'], [[[1, 'a']]])), ['x', '<blob>']);
  });

  it('never sniffs a plain string as base64', () => {
    // A TEXT column can hold base64-looking text; treating it as a blob would
    // silently drop real data from the export.
    assert.deepStrictEqual(lines(rowsToCsv(['t'], [['AAAA']])), ['t', 'AAAA']);
  });

  it('passes unicode through intact', () => {
    assert.deepStrictEqual(
      lines(rowsToCsv(['n'], [['Ünïcödé — 日本語 🎉']])),
      ['n', 'Ünïcödé — 日本語 🎉'],
    );
  });

  it('serializes multiple rows in order', () => {
    assert.deepStrictEqual(
      lines(rowsToCsv(['a', 'b'], [[1, 'x'], [2, 'y']])),
      ['a,b', '1,x', '2,y'],
    );
  });
});

describe('isSingleCell', () => {
  it('is true only for exactly one column and one row', () => {
    assert.strictEqual(isSingleCell(['c'], [[1]]), true);
  });

  it('is false for a 1-row multi-column result', () => {
    // Decision 5: the inline slot has no room for column labels, so a wide
    // single row goes to the CSV document where the header carries them.
    assert.strictEqual(isSingleCell(['a', 'b'], [[1, 2]]), false);
  });

  it('is false for a multi-row single-column result', () => {
    assert.strictEqual(isSingleCell(['c'], [[1], [2]]), false);
  });

  it('is false for a zero-row result', () => {
    assert.strictEqual(isSingleCell(['c'], []), false);
  });
});

describe('formatSingleCell', () => {
  it('spells NULL out as the literal word', () => {
    // Inline display is read by a human; rendering NULL as absence would look
    // like a rendering bug rather than a result.
    assert.strictEqual(formatSingleCell(null), 'NULL');
    assert.strictEqual(formatSingleCell(undefined), 'NULL');
  });

  it('renders the empty string as empty, with no CSV quoting', () => {
    assert.strictEqual(formatSingleCell(''), '');
  });

  it('renders scalars in their normal string form', () => {
    assert.strictEqual(formatSingleCell(42), '42');
    assert.strictEqual(formatSingleCell(true), 'true');
    assert.strictEqual(formatSingleCell('x,y'), 'x,y');
  });

  it('renders blobs as a placeholder, sized when derivable', () => {
    assert.strictEqual(formatSingleCell(new Uint8Array([1, 2])), '<2 bytes>');
    assert.strictEqual(formatSingleCell([1, 2, 3]), '<3 bytes>');
    assert.strictEqual(formatSingleCell({ shape: 'unknown' }), '<blob>');
  });

  it('passes unicode through intact', () => {
    assert.strictEqual(formatSingleCell('日本語 🎉'), '日本語 🎉');
  });
});
