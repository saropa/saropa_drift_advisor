/**
 * Natural language → SQL conversion.
 * Pure function: takes a question and schema metadata, returns SQL or an error.
 */

interface SchemaColumn {
  name: string;
  type: string;
}

interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
}

interface SchemaMeta {
  tables: SchemaTable[];
}

interface NlResult {
  sql: string | null;
  table?: string;
  error?: string;
}

/**
 * Builds a SQLite WHERE predicate for a temporal phrase ("today", "yesterday",
 * "this week/month/year", "last N days") in the question, scoped to the date
 * column the verb implies. Returns '' when no temporal phrase is present or the
 * table has no usable date column — the caller appends the result after FROM
 * and before any ORDER BY / LIMIT.
 *
 * Without this, a question like "how many contacts changed today" silently
 * dropped both "changed" and "today", producing a bare `SELECT COUNT(*)` over
 * the whole table — the headline NL-to-SQL bug this guards against.
 */
function temporalWhere(q: string, target: SchemaTable): string {
  // Candidate date columns: anything whose name reads like a timestamp.
  const dateCols = target.columns.filter(function (c) {
    return /date|time|_at\b|created|updated|modified|changed|added|edited|timestamp/i.test(c.name);
  });
  if (dateCols.length === 0) return '';

  // Pick the column by the verb so "changed"/"updated"/"modified" targets the
  // modified-date column and "created"/"added"/"new" targets the creation-date
  // column; a bare temporal mention with no verb falls back to the first one.
  let col: SchemaColumn | undefined;
  if (/chang|modif|updat|edit/i.test(q)) {
    col = dateCols.find(function (c) { return /updat|modif|chang|edit/i.test(c.name); });
  } else if (/creat|added|\bnew\b|register|insert/i.test(q)) {
    col = dateCols.find(function (c) { return /creat|add|insert|register/i.test(c.name); });
  }
  if (!col) col = dateCols[0];

  // Express the stored value as a local calendar date. Drift stores DateTime as
  // INTEGER unix-epoch seconds by default; TEXT columns hold ISO-8601 strings.
  // The 'localtime' modifier makes "today" mean the user's local day, not UTC.
  const isEpoch = /int/i.test(col.type);
  const dateExpr = isEpoch
    ? 'date("' + col.name + "\", 'unixepoch', 'localtime')"
    : 'date("' + col.name + '")';

  // Range comparisons (week/month/year/last N) over a half-open lower bound;
  // single-day comparisons use equality against the rendered local date.
  const lastN = q.match(/last (\d+) days?/i);
  if (/\btoday\b/i.test(q)) return ' WHERE ' + dateExpr + " = date('now', 'localtime')";
  if (/\byesterday\b/i.test(q)) return ' WHERE ' + dateExpr + " = date('now', '-1 day', 'localtime')";
  if (lastN) return ' WHERE ' + dateExpr + " >= date('now', '-" + parseInt(lastN[1]) + " days', 'localtime')";
  if (/this week/i.test(q)) return ' WHERE ' + dateExpr + " >= date('now', 'weekday 1', '-7 days', 'localtime')";
  if (/this month/i.test(q)) return ' WHERE ' + dateExpr + " >= date('now', 'start of month', 'localtime')";
  if (/this year/i.test(q)) return ' WHERE ' + dateExpr + " >= date('now', 'start of year', 'localtime')";
  return '';
}

/** Converts a natural language question to a SQL query using schema metadata. */
export function nlToSql(question: string, meta: SchemaMeta): NlResult {
  const q = question.toLowerCase().trim();
  const tables = meta.tables || [];
  let target: SchemaTable | null = null;
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    const name = t.name.toLowerCase();
    const singular = name.endsWith('s') ? name.slice(0, -1) : name;
    if (q.includes(name) || q.includes(singular)) { target = t; break; }
  }

  if (!target && tables.length === 1) target = tables[0];
  if (!target) return { sql: null, error: 'Could not identify a table from your question.' };
  const mentioned = target.columns.filter(function (c) {
    return q.includes(c.name.toLowerCase().replace(/_/g, ' ')) || q.includes(c.name.toLowerCase());
  });
  const selectCols = mentioned.length > 0
    ? mentioned.map(function (c) { return '"' + c.name + '"'; }).join(', ')
    : '*';
  let sql = '';
  const tn = '"' + target.name + '"';
  if (/how many|count|total number/i.test(q)) {
    sql = 'SELECT COUNT(*) FROM ' + tn;
  } else if (/average|avg|mean/i.test(q)) {
    const numCol = (mentioned.find(function (c) { return /int|real|num|float/i.test(c.type); })) ||
      target.columns.find(function (c) { return /int|real|num|float/i.test(c.type); });
    sql = numCol ? 'SELECT AVG("' + numCol.name + '") FROM ' + tn : 'SELECT * FROM ' + tn + ' LIMIT 50';
  } else if (/sum|total\b/i.test(q) && !/total number/i.test(q)) {
    const numCol = (mentioned.find(function (c) { return /int|real|num|float/i.test(c.type); })) ||
      target.columns.find(function (c) { return /int|real|num|float/i.test(c.type); });
    sql = numCol ? 'SELECT SUM("' + numCol.name + '") FROM ' + tn : 'SELECT * FROM ' + tn + ' LIMIT 50';
  } else if (/max|maximum|highest|largest|biggest/i.test(q)) {
    const numCol = (mentioned.find(function (c) { return /int|real|num|float/i.test(c.type); })) ||
      target.columns.find(function (c) { return /int|real|num|float/i.test(c.type); });
    sql = numCol ? 'SELECT MAX("' + numCol.name + '") FROM ' + tn : 'SELECT * FROM ' + tn + ' ORDER BY 1 DESC LIMIT 1';
  } else if (/min|minimum|lowest|smallest/i.test(q)) {
    const numCol = (mentioned.find(function (c) { return /int|real|num|float/i.test(c.type); })) ||
      target.columns.find(function (c) { return /int|real|num|float/i.test(c.type); });
    sql = numCol ? 'SELECT MIN("' + numCol.name + '") FROM ' + tn : 'SELECT * FROM ' + tn + ' ORDER BY 1 ASC LIMIT 1';
  } else if (/distinct|unique/i.test(q)) {
    const col = mentioned[0] || target.columns[1] || target.columns[0];
    sql = 'SELECT DISTINCT "' + col.name + '" FROM ' + tn;
  } else if (/latest|newest|most recent|last (\d+)/i.test(q)) {
    const dateCol = target.columns.find(function (c) { return /date|time|created|updated/i.test(c.name); });
    const match = q.match(/last (\d+)/i);
    const lim = match ? parseInt(match[1]) : 10;
    sql = 'SELECT ' + selectCols + ' FROM ' + tn + (dateCol ? ' ORDER BY "' + dateCol.name + '" DESC' : '') + ' LIMIT ' + lim;
  } else if (/oldest|earliest|first (\d+)/i.test(q)) {
    const dateCol = target.columns.find(function (c) { return /date|time|created|updated/i.test(c.name); });
    const match2 = q.match(/first (\d+)/i);
    const lim = match2 ? parseInt(match2[1]) : 10;
    sql = 'SELECT ' + selectCols + ' FROM ' + tn + (dateCol ? ' ORDER BY "' + dateCol.name + '" ASC' : '') + ' LIMIT ' + lim;
  } else if (/group by|per\s+\w+|by\s+\w+/i.test(q)) {
    const groupCol = mentioned[0] || target.columns[1] || target.columns[0];
    sql = 'SELECT "' + groupCol.name + '", COUNT(*) AS count FROM ' + tn + ' GROUP BY "' + groupCol.name + '" ORDER BY count DESC';
  } else {
    sql = 'SELECT ' + selectCols + ' FROM ' + tn + ' LIMIT 50';
  }
  return { sql: sql, table: target.name };
}
