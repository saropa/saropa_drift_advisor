/**
 * Combines NL-SQL history, saved table filters, and SQL Notebook execution
 * history into a single QuickPick so users can start from a prior question,
 * a saved filter, or a past query before the LLM runs.
 */

import * as vscode from 'vscode';
import type { FilterStore } from '../filters/filter-store';
import type { NlSqlHistory } from './nl-sql-history';
import type { QueryHistoryStore } from '../sql-notebook/query-history-store';

/** Internal marker for the synthetic "type new" row. */
const NEW_QUESTION_ID = '__nl_sql_new__';

interface ISuggestionPick extends vscode.QuickPickItem {
  /** When set (and not NEW_QUESTION_ID), text sent to the LLM. */
  suggestionId?: string;
  promptText?: string;
}

/**
 * Shows a QuickPick of suggestion sources, then optionally an input box for a
 * brand-new question.
 *
 * @returns Trimmed English question for the LLM, or undefined if cancelled.
 */
export async function pickNlSqlQuestion(
  history: NlSqlHistory,
  filterStore: FilterStore,
  sqlHistory: QueryHistoryStore,
): Promise<string | undefined> {
  const suggestions: ISuggestionPick[] = [
    {
      label: '$(edit) Type a new question…',
      description: 'Describe your query in your own words',
      suggestionId: NEW_QUESTION_ID,
    },
  ];

  for (const e of history.entries.slice(0, 15)) {
    suggestions.push({
      label: e.question,
      detail: e.sql.length > 90 ? `${e.sql.slice(0, 90)}…` : e.sql,
      promptText: e.question,
    });
  }

  for (const f of filterStore.filters.slice(0, 12)) {
    const where = f.where?.trim() ?? '';
    if (!where) {
      continue;
    }
    const wherePreview = where.length > 80 ? `${where.slice(0, 80)}…` : where;
    suggestions.push({
      label: `$(filter) ${f.name}`,
      detail: `"${f.table}" — ${wherePreview}`,
      promptText:
        `Write a single SQLite SELECT for table "${f.table}" that applies this saved filter ` +
        `(WHERE fragment without the WHERE keyword): ${where}. Use double-quoted identifiers where needed.`,
    });
  }

  for (const e of sqlHistory.getAll().filter((x) => !x.error).slice(0, 10)) {
    const preview = e.sql.replace(/\s+/g, ' ').trim();
    if (preview.length < 8) {
      continue;
    }
    const labelPreview = preview.length > 64 ? `${preview.slice(0, 64)}…` : preview;
    suggestions.push({
      label: `$(history) ${labelPreview}`,
      detail: 'From SQL Notebook history — ask to explain, change, or extend this query in English',
      promptText:
        `In one or two sentences, describe what this SQL does or how I should change it: ${preview}`,
    });
  }

  const picked = await vscode.window.showQuickPick(suggestions, {
    title: 'NL-to-SQL — starting point',
    placeHolder: 'Pick a past question, saved filter, or type a new question',
    matchOnDetail: true,
    ignoreFocusOut: true,
  });
  if (!picked) {
    return undefined;
  }
  if (picked.suggestionId === NEW_QUESTION_ID) {
    const typed = await vscode.window.showInputBox({
      prompt: 'Describe what you want to query…',
      placeHolder: 'e.g., users who signed up this week with no orders',
      ignoreFocusOut: true,
    });
    return typed?.trim() || undefined;
  }
  const text = picked.promptText?.trim();
  return text || undefined;
}
