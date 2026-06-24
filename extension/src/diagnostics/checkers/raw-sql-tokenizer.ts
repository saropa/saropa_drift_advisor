/**
 * Lexer half of the raw-SQL column parser. Extracted from raw-sql-parser to keep
 * files under the line cap; the parser consumes [IToken]s from [tokenize] after
 * masking literals/comments with [blankLiteralsAndComments].
 *
 * Pure (no VS Code dependency) so it is fully unit-testable. Offsets are
 * preserved through masking so the parser can map a token back to its absolute
 * span in the original document.
 */

/** A lexical token plus the punctuation kinds that frame column positions. */
export interface IToken {
  text: string;
  offset: number;
  kind: 'word' | 'lparen' | 'rparen' | 'comma' | 'star' | 'op';
}

/**
 * Replace SQL string literals (`'...'`) and comments (`-- ...`, block) with
 * spaces of equal length so their contents are not parsed as identifiers while
 * every other token keeps its original offset. Double-quoted identifiers are
 * also blanked (quoted identifiers are rare and not worth the parsing risk).
 */
export function blankLiteralsAndComments(sql: string): string {
  const out = sql.split('');
  let i = 0;
  while (i < out.length) {
    const c = sql[i];
    // Line comment: -- to end of line.
    if (c === '-' && sql[i + 1] === '-') {
      while (i < out.length && sql[i] !== '\n') out[i++] = ' ';
      continue;
    }
    // Block comment: /* ... */
    if (c === '/' && sql[i + 1] === '*') {
      out[i++] = ' ';
      out[i++] = ' ';
      while (i < out.length && !(sql[i] === '*' && sql[i + 1] === '/')) {
        out[i] = sql[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < out.length) {
        out[i++] = ' ';
        out[i++] = ' ';
      }
      continue;
    }
    // String literal or quoted identifier: blank through the closing quote.
    if (c === "'" || c === '"') {
      const quote = c;
      out[i++] = ' ';
      while (i < out.length) {
        // SQL escapes a quote by doubling it ('' inside '...').
        if (sql[i] === quote && sql[i + 1] === quote) {
          out[i++] = ' ';
          out[i++] = ' ';
          continue;
        }
        const closing = sql[i] === quote;
        out[i] = sql[i] === '\n' ? '\n' : ' ';
        i++;
        if (closing) break;
      }
      continue;
    }
    i++;
  }
  return out.join('');
}

const TOKEN_RE =
  /([A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)*)|(\()|(\))|(,)|(\*)|(::|\|\||<=|>=|!=|<>|[=<>+\-/%])/g;

/** Tokenize cleaned SQL into words and the punctuation that frames columns. */
export function tokenize(sql: string): IToken[] {
  const tokens: IToken[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(sql)) !== null) {
    if (m[1] !== undefined) tokens.push({ text: m[1], offset: m.index, kind: 'word' });
    else if (m[2] !== undefined) tokens.push({ text: '(', offset: m.index, kind: 'lparen' });
    else if (m[3] !== undefined) tokens.push({ text: ')', offset: m.index, kind: 'rparen' });
    else if (m[4] !== undefined) tokens.push({ text: ',', offset: m.index, kind: 'comma' });
    else if (m[5] !== undefined) tokens.push({ text: '*', offset: m.index, kind: 'star' });
    else tokens.push({ text: m[0], offset: m.index, kind: 'op' });
  }
  return tokens;
}
