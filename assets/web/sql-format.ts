/**
 * Thin wrapper over the `sql-formatter` package, pinned to the SQLite dialect.
 *
 * Centralizes pretty-printing so every SQL surface — the Run SQL editor, the
 * Schema dump, and the NL→SQL preview — formats identically through one code
 * path. Kept separate from `sql-highlight.ts` (which colorizes already-laid-out
 * SQL); this module decides line breaks and indentation.
 */
import { format } from 'sql-formatter';

// Uppercase keywords match the hand-written templates ("SELECT … FROM …") and
// the NL-generated SQL, so formatting an existing query doesn't visually churn
// the keyword case. SQLite dialect so SQLite-only syntax (e.g. `date(…,
// 'unixepoch')`, RECURSIVE CTEs) isn't mis-tokenized.
const FORMAT_OPTIONS = {
  language: 'sqlite' as const,
  keywordCase: 'upper' as const,
  tabWidth: 2,
};

/**
 * Formats SQL for display. Returns the input UNCHANGED when it is empty or the
 * formatter throws — malformed or partial SQL (mid-typing, an unsupported
 * statement) must never blank the editor or surface a parser error to the user.
 */
export function formatSqlSafe(sql: string | null | undefined): string {
  if (sql == null) return '';
  const text = String(sql);
  if (!text.trim()) return text;
  try {
    return format(text, FORMAT_OPTIONS);
  } catch {
    // Formatter couldn't parse it — show the user's original text as-is.
    return text;
  }
}
