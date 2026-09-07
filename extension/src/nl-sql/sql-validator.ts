/**
 * SQL safety validation for NL-to-SQL output.
 *
 * This gate enforces read-only semantics before generated SQL is inserted
 * into SQL Notebook, preventing accidental mutation/DDL execution.
 */

// Reuse the existing tokenizer's masking function so we don't duplicate
// literal-stripping logic. It replaces string literals, quoted identifiers,
// and comments with equal-length spaces while preserving offsets.
import { blankLiteralsAndComments } from '../diagnostics/checkers/raw-sql-tokenizer';

export function validateGeneratedSql(sql: string): void {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  if (!trimmed) {
    throw new Error('Generated SQL is empty.');
  }

  // Mask literals, quoted identifiers, and comments before structural checks.
  // A semicolon or keyword inside a string literal (e.g. WHERE action = 'DELETE')
  // is data, not a statement boundary or mutation verb. Running the checks on
  // masked text prevents false positives on these innocuous occurrences while
  // still catching real structural violations outside literals.
  const masked = blankLiteralsAndComments(trimmed);

  // Guard against stacked statements. A remaining semicolon in the masked text
  // is a real statement separator — semicolons inside literals have been blanked.
  if (masked.includes(';')) {
    throw new Error('Only a single SQL statement is allowed.');
  }

  // Anchor test stays on the original trimmed text: a valid SQL statement
  // cannot begin with a string literal, so masking would not affect this check.
  if (!/^(SELECT|WITH)\b/i.test(trimmed)) {
    throw new Error('Only SELECT queries are allowed.');
  }

  const bannedTokens =
    /\b(INSERT|UPDATE|DELETE|REPLACE|UPSERT|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|ANALYZE|GRANT|REVOKE)\b/i;
  // Check masked text so keywords inside literals ('DELETE', "update") are
  // invisible to the regex — only structural tokens remain.
  if (bannedTokens.test(masked)) {
    throw new Error('Only read-only SELECT queries are allowed.');
  }

  // Defensive size cap to avoid malformed LLM outputs flooding the editor.
  if (trimmed.length > 20_000) {
    throw new Error('Generated SQL exceeds max allowed length.');
  }
}
