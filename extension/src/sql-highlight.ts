/**
 * Modular SQL syntax highlighter.
 * Returns HTML with <span> tokens for keywords, strings, numbers, and comments.
 * Use in webviews and reports wherever SQL is displayed (schema, migration, diff, etc.).
 */

/** HTML-escape so highlighted output is safe to inject. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** SQL keywords (SQLite / common DDL/DML) for syntax highlighting. */
const KEYWORDS = new Set([
  'ADD', 'ALL', 'ALTER', 'AND', 'AS', 'ASC', 'AUTOINCREMENT', 'BETWEEN', 'BY',
  'CASE', 'CHECK', 'COLLATE', 'COLUMN', 'COMMIT', 'CONSTRAINT', 'CREATE',
  'CROSS', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'DEFAULT',
  'DEFERRABLE', 'DELETE', 'DESC', 'DISTINCT', 'DROP', 'ELSE', 'END', 'ESCAPE',
  'EXCEPT', 'EXISTS', 'FOREIGN', 'FROM', 'FULL', 'GLOB', 'GROUP', 'HAVING',
  'IF', 'IN', 'INDEX', 'INNER', 'INSERT', 'INTERSECT', 'INTO', 'IS', 'JOIN',
  'KEY', 'LEFT', 'LIKE', 'LIMIT', 'NOT', 'NULL', 'OFFSET', 'ON',
  'OR', 'ORDER', 'OUTER', 'PRIMARY', 'REFERENCES', 'RIGHT', 'ROLLBACK',
  'ROWID', 'SELECT', 'SET', 'TABLE', 'THEN', 'TO', 'TRANSACTION', 'UNION',
  'UNIQUE', 'UPDATE', 'USING', 'VALUES', 'WHEN', 'WHERE', 'WITH',
  'INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC', 'BOOLEAN', 'DATETIME',
]);

/**
 * Highlights SQL by wrapping keywords, strings, numbers, and comments in spans.
 * Input is HTML-escaped; output is safe to use in innerHTML.
 *
 * @param sql - Raw SQL string (e.g. schema DDL or migration)
 * @returns HTML string with classes: sql-kw, sql-str, sql-num, sql-cmt, sql-id
 */
export function highlightSql(sql: string): string {
  if (typeof sql !== 'string') return '';
  if (sql.length === 0) return '';
  const out: string[] = [];
  let i = 0;
  const n = sql.length;

  while (i < n) {
    // Block comment /* ... */
    if (sql.slice(i, i + 2) === '/*') {
      const end = sql.indexOf('*/', i + 2);
      const endIdx = end === -1 ? n : end + 2;
      out.push('<span class="sql-cmt">', esc(sql.slice(i, endIdx)), '</span>');
      i = endIdx;
      continue;
    }
    // Line comment -- to EOL
    if (sql.slice(i, i + 2) === '--') {
      let j = i + 2;
      while (j < n && sql[j] !== '\n') j++;
      out.push('<span class="sql-cmt">', esc(sql.slice(i, j)), '</span>');
      i = j;
      continue;
    }
    // Single-quoted string ('' is escaped)
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") j += 2;
          else { j += 1; break; }
        } else j++;
      }
      out.push('<span class="sql-str">', esc(sql.slice(i, j)), '</span>');
      i = j;
      continue;
    }
    // Double-quoted identifier (\" escape; avoid j past end of string)
    if (sql[i] === '"') {
      let j = i + 1;
      while (j < n && sql[j] !== '"') {
        if (sql[j] === '\\' && j + 1 < n) j += 2;
        else j++;
      }
      if (j < n) j++;
      out.push('<span class="sql-id">', esc(sql.slice(i, j)), '</span>');
      i = j;
      continue;
    }
    // Word (keyword or identifier)
    if (/[A-Za-z_][A-Za-z0-9_]*/.test(sql[i])) {
      const match = sql.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (match) {
        const word = match[0];
        const upper = word.toUpperCase();
        const cls = KEYWORDS.has(upper) ? 'sql-kw' : 'sql-plain';
        out.push('<span class="', cls, '">', esc(word), '</span>');
        i += word.length;
        continue;
      }
    }
    // Number (integer or decimal)
    if (/[0-9]/.test(sql[i])) {
      const match = sql.slice(i).match(/^\d+(\.\d+)?([eE][+-]?\d+)?/);
      if (match) {
        out.push('<span class="sql-num">', esc(match[0]), '</span>');
        i += match[0].length;
        continue;
      }
    }
    // Single character (punctuation, newline, etc.)
    out.push(esc(sql[i]));
    i++;
  }
  return out.join('');
}

/**
 * CSS fragment for SQL highlight spans. Include in any webview that displays
 * highlighted SQL so .sql-kw, .sql-str, .sql-num, .sql-cmt, .sql-id get styled.
 */
export const sqlHighlightCss = `
  .sql-kw { color: var(--vscode-symbolIcon-keywordForeground, #569cd6); font-weight: 600; }
  .sql-str { color: var(--vscode-editor-findMatchHighlightBackground, #ce9178); }
  .sql-num { color: var(--vscode-symbolIcon-numberForeground, #b5cea8); }
  .sql-cmt { color: var(--vscode-symbolIcon-colorForeground, #6a9955); font-style: italic; }
  .sql-id { color: var(--vscode-symbolIcon-variableForeground, #9cdcfe); }
  .sql-plain { color: var(--vscode-editor-foreground, inherit); }
`;
