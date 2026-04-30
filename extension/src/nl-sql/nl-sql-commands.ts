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
import { QueryBuilderPanel } from '../query-builder/query-builder-panel';
import { QueryHistoryStore } from '../sql-notebook/query-history-store';
import { SqlNotebookPanel } from '../sql-notebook/sql-notebook-panel';
import { LlmClient } from './llm-client';
import { NlSqlHistory } from './nl-sql-history';
import { pickNlSqlQuestion } from './nl-sql-question-picker';
import { NlSqlProvider } from './nl-sql-provider';
import { SchemaContextBuilder } from './schema-context-builder';

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

type NlSqlDestination = 'notebook' | 'vqb' | 'snippet' | 'dashboard' | 'cost';

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

async function pickNlSqlDestination(): Promise<NlSqlDestination | undefined> {
  const items: Array<vscode.QuickPickItem & { dest: NlSqlDestination }> = [
    {
      label: '$(notebook) Open in SQL Notebook',
      description: 'Insert into a new query tab',
      dest: 'notebook',
    },
    {
      label: '$(symbol-structure) Edit in Visual Query Builder',
      description: 'Import into the visual query builder (supported SELECT only)',
      dest: 'vqb',
    },
    {
      label: '$(bookmark) Save as SQL snippet',
      description: 'Store in the snippet library (name suggested from your question)',
      dest: 'snippet',
    },
    {
      label: '$(dashboard) Add query widget to dashboard',
      description: 'Append a SQL query-result widget to the current dashboard layout',
      dest: 'dashboard',
    },
    {
      label: '$(pulse) Analyze query cost',
      description: 'Run cost / EXPLAIN analysis with this SQL',
      dest: 'cost',
    },
  ];
  const chosen = await vscode.window.showQuickPick(items, {
    placeHolder: 'Where should the SQL go?',
    ignoreFocusOut: true,
  });
  return chosen?.dest;
}

/** Builds a short snippet name from the NL question (safe for storage). */
function suggestedSnippetName(question: string): string {
  const cleaned = question.replace(/["\n\r]/g, ' ').trim().slice(0, 55);
  return cleaned.length > 0 ? `NL: ${cleaned}` : 'NL-to-SQL';
}

/**
 * Routes validated SQL to the surface the user picked.
 *
 * Dashboard path appends a `queryResult` widget via `driftViewer.addQueryWidgetToDashboard`.
 */
async function dispatchNlSqlDestination(
  dest: NlSqlDestination,
  sql: string,
  questionSummary: string,
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  queryIntelligence?: QueryIntelligence,
): Promise<void> {
  switch (dest) {
    case 'notebook':
      SqlNotebookPanel.showAndInsertQuery(context, client, {
        sql,
        source: 'nl-to-sql',
        title: `Question: ${questionSummary}`,
      });
      break;
    case 'vqb':
      QueryBuilderPanel.createOrShow(context, client, undefined, {
        importSql: sql,
        queryIntelligence,
      });
      break;
    case 'snippet':
      await vscode.commands.executeCommand(
        'driftViewer.saveAsSnippet',
        sql,
        suggestedSnippetName(questionSummary),
      );
      break;
    case 'dashboard':
      await vscode.commands.executeCommand(
        'driftViewer.addQueryWidgetToDashboard',
        sql,
        `NL: ${questionSummary.slice(0, 100)}`,
      );
      break;
    case 'cost':
      await vscode.commands.executeCommand('driftViewer.analyzeQueryCost', sql);
      break;
  }
}

/** Returns false if the user cancels API key setup. */
async function ensureNlSqlApiKey(
  context: vscode.ExtensionContext,
): Promise<boolean> {
  const existing = await context.secrets.get('driftViewer.nlSql.apiKey');
  if (existing) {
    return true;
  }
  const setChoice = await vscode.window.showWarningMessage(
    'No API key configured for NL-to-SQL.',
    'Set API Key',
  );
  if (setChoice !== 'Set API Key') {
    return false;
  }
  const keyInput = await vscode.window.showInputBox({
    prompt: 'Enter API key for NL-to-SQL',
    password: true,
    ignoreFocusOut: true,
  });
  if (!keyInput) {
    return false;
  }
  await context.secrets.store('driftViewer.nlSql.apiKey', keyInput);
  return true;
}

type IGenerateOutcome =
  | { kind: 'success'; sql: string }
  | { kind: 'retry' }
  | { kind: 'abort' };

/**
 * Runs LLM generation with a status-bar indicator and surfaces failures with
 * an optional **Retry** action (validation errors do not write history).
 */
async function generateSqlWithFeedback(
  context: vscode.ExtensionContext,
  schemaBuilder: SchemaContextBuilder,
  history: NlSqlHistory,
  question: string,
): Promise<IGenerateOutcome> {
  const config = vscode.workspace.getConfiguration('driftViewer.nlSql');
  const resolvedApiKey =
    (await context.secrets.get('driftViewer.nlSql.apiKey')) ?? '';

  const llm = new LlmClient({
    apiUrl: config.get<string>(
      'apiUrl',
      'https://api.openai.com/v1/chat/completions',
    ),
    apiKey: resolvedApiKey,
    model: config.get<string>('model', 'gpt-4o-mini'),
    maxTokens: config.get<number>('maxTokens', 500),
  });
  const provider = new NlSqlProvider(schemaBuilder, llm, history);

  const statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusItem.name = 'Saropa NL-to-SQL';
  statusItem.text = '$(sync~spin) NL-to-SQL: generating…';
  statusItem.tooltip = 'Calling the configured LLM; see notification if it fails.';
  statusItem.show();

  try {
    const sql = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Generating SQL…',
        cancellable: false,
      },
      () => provider.ask(question),
    );
    statusItem.text = '$(check) NL-to-SQL: done';
    statusItem.tooltip = 'SQL generated successfully.';
    setTimeout(() => statusItem.dispose(), 4000);
    return { kind: 'success', sql };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    const rateLimited =
      /\b429\b/i.test(detail) || /\brate\s*limit/i.test(detail);
    if (rateLimited) {
      statusItem.text = '$(warning) NL-to-SQL: rate limited';
      statusItem.tooltip =
        'The LLM provider returned HTTP 429 or a rate-limit message. Wait and use Retry.';
      statusItem.show();
      setTimeout(() => statusItem.dispose(), 12_000);
    } else {
      statusItem.dispose();
    }

    const choice = await vscode.window.showErrorMessage(
      `NL-to-SQL failed: ${detail}`,
      'Retry',
    );
    if (choice === 'Retry') {
      return { kind: 'retry' };
    }
    return { kind: 'abort' };
  }
}
