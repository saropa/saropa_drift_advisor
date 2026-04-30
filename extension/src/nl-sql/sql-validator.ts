/**
 * SQL safety validation for NL-to-SQL output.
 *
 * This gate enforces read-only semantics before generated SQL is inserted
 * into SQL Notebook, preventing accidental mutation/DDL execution.
 */
export function validateGeneratedSql(sql: string): void {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  if (!trimmed) {
    throw new Error('Generated SQL is empty.');
  }

  // Guard against stacked statements. A remaining semicolon implies
  // multiple statements because trailing semicolons were stripped above.
  if (trimmed.includes(';')) {
    throw new Error('Only a single SQL statement is allowed.');
  }

  if (!/^(SELECT|WITH)\b/i.test(trimmed)) {
    throw new Error('Only SELECT queries are allowed.');
  }

  const bannedTokens =
    /\b(INSERT|UPDATE|DELETE|REPLACE|UPSERT|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|ANALYZE|GRANT|REVOKE)\b/i;
  if (bannedTokens.test(trimmed)) {
    throw new Error('Only read-only SELECT queries are allowed.');
  }

  // Defensive size cap to avoid malformed LLM outputs flooding the editor.
  if (trimmed.length > 20_000) {
    throw new Error('Generated SQL exceeds max allowed length.');
  }
}
