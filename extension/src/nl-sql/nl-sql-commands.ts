/**
 * NL-to-SQL VS Code commands: API key gate, schema-backed generation, history,
 * and post-generation destinations (notebook, VQB, dashboard, cost).
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { LogCaptureBridge } from '../debug/log-capture-bridge';
import type { QueryIntelligence } from '../engines/query-intelligence';
import type { SchemaIntelligence } from '../engines/schema-intelligence';
import type { FilterStore } from '../filters/filter-store';
import { QueryHistoryStore } from '../sql-notebook/query-history-store';
import { NlSqlHistory } from './nl-sql-history';
import { pickNlSqlQuestion } from './nl-sql-question-picker';
import { SchemaContextBuilder } from './schema-context-builder';
import { dispatchNlSqlDestination, pickNlSqlDestination } from './nl-sql-destination';
import { ensureNlSqlApiKey, generateSqlWithFeedback } from './nl-sql-generation';

/** Optional args when invoked from SQL Notebook toolbar (`executeCommand`). */
export interface IAskNaturalLanguageArgs {
  /** Set when the user clicked **Ask in English…** inside the SQL Notebook webview. */
  openFrom?: 'sql-notebook';
  /**
   * Pre-filled NL question (Feature 66 refactoring panel). The user still
   * confirms or edits in the input box before SQL generation runs.
   */
  initialQuestion?: string;
}

/** Dependencies wired from activation (intelligence + saved filters). */
export interface INlSqlCommandDeps {
  filterStore: FilterStore;
  schemaIntelligence?: SchemaIntelligence;
  queryIntelligence?: QueryIntelligence;
  /** When Log Capture is active, NL generations can emit optional debug lines. */
  logBridge?: LogCaptureBridge;
}

/**
 * Registers NL-to-SQL commands for generating SQL from plain-English prompts
 * and re-opening previously generated queries from history.
 */
export function registerNlSqlCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  deps: INlSqlCommandDeps,
): void {
  const history = new NlSqlHistory(context.workspaceState);
  const sqlHistory = new QueryHistoryStore(context.globalState);
  const schemaBuilder = new SchemaContextBuilder(
    client,
    deps.schemaIntelligence,
  );
  const { filterStore, queryIntelligence: queryIntel, logBridge } = deps;

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.askNaturalLanguage',
      async (_args?: IAskNaturalLanguageArgs) => {
        if (!(await ensureNlSqlApiKey(context))) {
          return;
        }

        const seed = _args?.initialQuestion?.trim();
        let question: string | undefined;
        if (seed) {
          question = await vscode.window.showInputBox({
            prompt: 'Review or edit the NL question, then press Enter to generate SQL',
            value: seed,
            ignoreFocusOut: true,
          });
        } else {
          const usePicker =
            vscode.workspace
              .getConfiguration('driftViewer.nlSql')
              .get<boolean>('seedSuggestions', true) !== false;

          question = usePicker
            ? await pickNlSqlQuestion(history, filterStore, sqlHistory)
            : await vscode.window.showInputBox({
                prompt: 'Describe what you want to query...',
                placeHolder: 'e.g., users who signed up this week with no orders',
                ignoreFocusOut: true,
              });
        }
        if (!question?.trim()) {
          return;
        }

        const trimmed = question.trim();
        let sqlResult: string | undefined;
        while (sqlResult === undefined) {
          const outcome = await generateSqlWithFeedback(
            context,
            schemaBuilder,
            history,
            trimmed,
          );
          if (outcome.kind === 'success') {
            sqlResult = outcome.sql;
            break;
          }
          if (outcome.kind === 'abort') {
            return;
          }
        }

        try {
          logBridge?.writeNlQueryEvent(trimmed, sqlResult);
        } catch {
          // Log capture must never block NL-to-SQL.
        }

        const dest = await pickNlSqlDestination();
        if (!dest) {
          return;
        }
        if (queryIntel) {
          try {
            // No execution timing yet for NL-generated SQL; still feeds table/WHERE patterns.
            queryIntel.recordQuery(sqlResult, 0, 0);
          } catch {
            // QueryIntelligence is best-effort; never block the user flow.
          }
        }
        await dispatchNlSqlDestination(dest, sqlResult, trimmed, context, client, deps.queryIntelligence);
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.nlSqlHistory',
      async () => {
        const pick = await vscode.window.showQuickPick(
          history.entries.map((entry) => ({
            label: entry.question,
            detail: entry.sql,
            entry,
          })),
          {
            placeHolder: 'Select a previous NL-to-SQL query',
            matchOnDetail: true,
          },
        );
        if (!pick) {
          return;
        }
        try {
          logBridge?.writeNlQueryEvent(pick.entry.question, pick.entry.sql);
        } catch {
          /* ignore log capture errors */
        }
        const dest = await pickNlSqlDestination();
        if (!dest) {
          return;
        }
        await dispatchNlSqlDestination(
          dest,
          pick.entry.sql,
          pick.entry.question,
          context,
          client,
          deps.queryIntelligence,
        );
      },
    ),
  );
}
