/**
 * Pure SQL-shape extraction for [QueryIntelligence]: normalization (collapse
 * whitespace and literals so structurally identical queries share one pattern
 * key) and a best-effort regex parse pulling out table / WHERE / JOIN / ORDER BY
 * columns. No state — split out of query-intelligence.ts so the heuristics are
 * testable in isolation and the store class stays focused on accumulation.
 */

/** Collapse whitespace and literals so repeated queries map to one pattern key. */
export function normalizeQuery(sql: string): string {
  return sql
    .replace(/\s+/g, ' ')
    .replace(/\d+/g, '?')
    .replace(/'[^']*'/g, '?')
    .trim()
    .toLowerCase();
}

/** Best-effort regex parse of the tables and columns referenced by a query. */
export function parseQuery(sql: string): {
  tables: string[];
  whereColumns: string[];
  joinColumns: string[];
  orderByColumns: string[];
} {
  const tables: string[] = [];
  const whereColumns: string[] = [];
  const joinColumns: string[] = [];
  const orderByColumns: string[] = [];

  const fromMatch = sql.match(/FROM\s+"?(\w+)"?/gi);
  if (fromMatch) {
    for (const m of fromMatch) {
      const table = m.replace(/FROM\s+"?/i, '').replace(/"$/, '');
      tables.push(table);
    }
  }

  const joinMatch = sql.match(/JOIN\s+"?(\w+)"?/gi);
  if (joinMatch) {
    for (const m of joinMatch) {
      const table = m.replace(/JOIN\s+"?/i, '').replace(/"$/, '');
      tables.push(table);
    }
  }

  const whereMatch = sql.match(/WHERE\s+(.+?)(?:ORDER|GROUP|LIMIT|$)/i);
  if (whereMatch) {
    const whereCols = whereMatch[1].match(/"?(\w+)"?\s*[=<>!]/g);
    if (whereCols) {
      for (const c of whereCols) {
        const col = c.replace(/["'\s=<>!]/g, '');
        if (col && !['AND', 'OR', 'NOT', 'NULL'].includes(col.toUpperCase())) {
          whereColumns.push(col);
        }
      }
    }
  }

  const joinOnMatch = sql.match(/ON\s+.+?(?:WHERE|ORDER|GROUP|LIMIT|JOIN|$)/gi);
  if (joinOnMatch) {
    for (const m of joinOnMatch) {
      const cols = m.match(/"?(\w+)"?\s*=/g);
      if (cols) {
        for (const c of cols) {
          const col = c.replace(/["'\s=]/g, '');
          if (col) joinColumns.push(col);
        }
      }
    }
  }

  const orderMatch = sql.match(/ORDER\s+BY\s+(.+?)(?:LIMIT|$)/i);
  if (orderMatch) {
    const orderCols = orderMatch[1].match(/"?(\w+)"?/g);
    if (orderCols) {
      for (const c of orderCols) {
        const col = c.replace(/"/g, '');
        if (!['ASC', 'DESC'].includes(col.toUpperCase())) {
          orderByColumns.push(col);
        }
      }
    }
  }

  return { tables, whereColumns, joinColumns, orderByColumns };
}
