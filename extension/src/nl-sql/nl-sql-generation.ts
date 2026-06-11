/**
 * NL-to-SQL API-key gate and LLM generation flow: ensures a key is configured,
 * then runs generation with a status-bar indicator and a Retry path on failure
 * (rate-limit messages get a longer-lived warning state).
 */

import * as vscode from 'vscode';
import { LlmClient } from './llm-client';
import { NlSqlHistory } from './nl-sql-history';
import { NlSqlProvider } from './nl-sql-provider';
import { SchemaContextBuilder } from './schema-context-builder';

/** Returns false if the user cancels API key setup. */
export async function ensureNlSqlApiKey(
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

export type IGenerateOutcome =
  | { kind: 'success'; sql: string }
  | { kind: 'retry' }
  | { kind: 'abort' };

/**
 * Runs LLM generation with a status-bar indicator and surfaces failures with
 * an optional **Retry** action (validation errors do not write history).
 */
export async function generateSqlWithFeedback(
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
