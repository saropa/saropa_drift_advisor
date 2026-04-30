/**
 * Builds NL-to-SQL seed questions from refactoring suggestions (Feature 66 Phase 3).
 *
 * The user still confirms or edits the prompt in the NL-SQL input box; we only
 * pre-fill text so "AI schema review" style exploration stays human-in-the-loop.
 */

import type { IRefactoringSuggestion } from './refactoring-types';

/**
 * Returns a plain-English question suitable for `driftViewer.askNaturalLanguage`.
 */
export function buildNlSqlSeedFromSuggestion(s: IRefactoringSuggestion): string {
  const t0 = s.tables[0] ?? '';
  const col0 = s.columns[0] ?? '';
  switch (s.type) {
    case 'normalize':
      return (
        `For table "${t0}" column "${col0}": write SQL to list each distinct value with row counts, ` +
        `and suggest whether a lookup table plus foreign key would improve integrity.`
      );
    case 'split':
      return (
        `Table "${t0}" has many columns. Propose a SELECT that joins a hypothetical narrow "core" row ` +
        `with a child "detail" table (explain which columns you would move and why).`
      );
    case 'merge': {
      const t1 = s.tables[1] ?? '';
      return (
        `Tables "${t0}" and "${t1}" share column "${col0}" with overlapping values. ` +
        `Draft SQL to explore the overlap and outline how to replace the duplicate with a foreign key if appropriate.`
      );
    }
    default:
      return `Review this schema refactoring hint and propose exploratory SQL: ${s.title}. ${s.description}`;
  }
}
