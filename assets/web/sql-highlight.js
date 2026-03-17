/**
 * Modular SQL syntax highlighter for the web viewer.
 * Exposes window.sqlHighlight(sql) for use in app.js wherever SQL is displayed.
 * Keep in sync with extension/src/sql-highlight.ts: same KEYWORDS set and token order
 * (block comment, line comment, single-quoted string, double-quoted id, word, number).
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var KEYWORDS = new Set([
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
   * Highlights SQL; returns HTML safe for use in innerHTML.
   * @param {string} sql - Raw SQL string
   * @returns {string} HTML with spans: sql-kw, sql-str, sql-num, sql-cmt, sql-id
   */
  function highlightSql(sql) {
    if (typeof sql !== 'string' || sql.length === 0) return '';
    var out = [];
    var i = 0;
    var n = sql.length;

    while (i < n) {
      if (sql.slice(i, i + 2) === '/*') {
        var end = sql.indexOf('*/', i + 2);
        var endIdx = end === -1 ? n : end + 2;
        out.push('<span class="sql-cmt">', esc(sql.slice(i, endIdx)), '</span>');
        i = endIdx;
        continue;
      }
      if (sql.slice(i, i + 2) === '--') {
        var j = i + 2;
        while (j < n && sql[j] !== '\n') j++;
        out.push('<span class="sql-cmt">', esc(sql.slice(i, j)), '</span>');
        i = j;
        continue;
      }
      if (sql[i] === "'") {
        j = i + 1;
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
      if (sql[i] === '"') {
        j = i + 1;
        while (j < n && sql[j] !== '"') {
          if (sql[j] === '\\' && j + 1 < n) j += 2;
          else j++;
        }
        if (j < n) j++;
        out.push('<span class="sql-id">', esc(sql.slice(i, j)), '</span>');
        i = j;
        continue;
      }
      if (/[A-Za-z_][A-Za-z0-9_]*/.test(sql[i])) {
        var match = sql.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
        if (match) {
          var word = match[0];
          var upper = word.toUpperCase();
          var cls = KEYWORDS.has(upper) ? 'sql-kw' : 'sql-plain';
          out.push('<span class="', cls, '">', esc(word), '</span>');
          i += word.length;
          continue;
        }
      }
      if (/[0-9]/.test(sql[i])) {
        match = sql.slice(i).match(/^\d+(\.\d+)?([eE][+-]?\d+)?/);
        if (match) {
          out.push('<span class="sql-num">', esc(match[0]), '</span>');
          i += match[0].length;
          continue;
        }
      }
      out.push(esc(sql[i]));
      i++;
    }
    return out.join('');
  }

  global.sqlHighlight = highlightSql;
})(typeof window !== 'undefined' ? window : this);
