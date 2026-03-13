/**
 * Rule wizard prompts for adding, editing, and removing invariants.
 * Used by InvariantPanel and optionally by commands.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { IInvariant } from './invariant-types';
import {
  InvariantTemplates,
  templateToQuickPickItem,
} from './invariant-templates';

/** Context for prompt functions: client, manager, and table list. */
export interface IInvariantPromptContext {
  client: DriftApiClient;
  manager: {
    get: (id: string) => IInvariant | undefined;
    add: (rule: Omit<IInvariant, 'id'>) => void;
    update: (id: string, patch: Partial<Pick<IInvariant, 'name' | 'sql' | 'expectation' | 'severity'>>) => void;
    remove: (id: string) => void;
  };
  getTableList: () => Promise<string[]>;
}

/** Run the "add rule" wizard (table + template or custom). */
export async function promptAddRule(ctx: IInvariantPromptContext): Promise<void> {
  const tables = await ctx.getTableList();
  if (tables.length === 0) {
    vscode.window.showWarningMessage('No tables found in database.');
    return;
  }

  const tablePick = await vscode.window.showQuickPick(
    tables.map((t) => ({ label: t, table: t })),
    { placeHolder: 'Select a table for the invariant' },
  );
  if (!tablePick) return;

  const table = tablePick.table;

  const allTemplates = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Loading invariant templates...',
      cancellable: false,
    },
    async () => {
      const templates = new InvariantTemplates(ctx.client);
      const available = await templates.getTemplatesForTable(table);
      const common = templates.getCommonTemplates(table);
      return [...available, ...common];
    },
  );

  const items = [
    ...allTemplates.map((t) => templateToQuickPickItem(t)),
    {
      label: '$(code) Custom SQL',
      description: 'custom',
      detail: 'Write your own invariant query',
      template: null,
    },
  ];

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select an invariant template',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!pick) return;

  const t = (pick as { template: { name: string; sql: string; expectation: 'zero_rows' | 'non_zero'; severity: 'error' | 'warning' | 'info' } | null }).template;
  if (t) {
    ctx.manager.add({
      name: t.name,
      table,
      sql: t.sql,
      expectation: t.expectation,
      severity: t.severity,
      enabled: true,
    });
    vscode.window.showInformationMessage(`Added invariant: ${t.name}`);
  } else {
    await promptCustomRule(ctx, table);
  }
}

/** Run the "custom rule" flow (name, SQL, expectation, severity). */
export async function promptCustomRule(ctx: IInvariantPromptContext, table: string): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: 'Invariant name',
    placeHolder: 'e.g., "Users must have email"',
  });
  if (!name) return;

  const sql = await vscode.window.showInputBox({
    prompt: 'SQL query (should return violating rows)',
    placeHolder: `SELECT * FROM "${table}" WHERE ...`,
    value: `SELECT * FROM "${table}" WHERE `,
  });
  if (!sql) return;

  const expectation = await vscode.window.showQuickPick(
    [
      { label: 'Zero rows (violations are errors)', value: 'zero_rows' as const },
      { label: 'At least one row (empty is error)', value: 'non_zero' as const },
    ],
    { placeHolder: 'What should the query return to pass?' },
  );
  if (!expectation) return;

  const severity = await vscode.window.showQuickPick(
    [
      { label: '$(error) Error', value: 'error' as const },
      { label: '$(warning) Warning', value: 'warning' as const },
      { label: '$(info) Info', value: 'info' as const },
    ],
    { placeHolder: 'Severity level for violations' },
  );
  if (!severity) return;

  ctx.manager.add({
    name,
    table,
    sql,
    expectation: expectation.value,
    severity: severity.value,
    enabled: true,
  });
  vscode.window.showInformationMessage(`Added invariant: ${name}`);
}

/** Run the "edit rule" wizard. */
export async function promptEditRule(ctx: IInvariantPromptContext, id: string): Promise<void> {
  const inv = ctx.manager.get(id);
  if (!inv) return;

  const name = await vscode.window.showInputBox({
    prompt: 'Invariant name',
    value: inv.name,
  });
  if (name === undefined) return;

  const sql = await vscode.window.showInputBox({
    prompt: 'SQL query',
    value: inv.sql,
  });
  if (sql === undefined) return;

  const expectation = await vscode.window.showQuickPick(
    [
      { label: 'Zero rows (violations are errors)', value: 'zero_rows' as const, picked: inv.expectation === 'zero_rows' },
      { label: 'At least one row (empty is error)', value: 'non_zero' as const, picked: inv.expectation === 'non_zero' },
    ],
    { placeHolder: 'What should the query return to pass?' },
  );
  if (!expectation) return;

  const severity = await vscode.window.showQuickPick(
    [
      { label: '$(error) Error', value: 'error' as const, picked: inv.severity === 'error' },
      { label: '$(warning) Warning', value: 'warning' as const, picked: inv.severity === 'warning' },
      { label: '$(info) Info', value: 'info' as const, picked: inv.severity === 'info' },
    ],
    { placeHolder: 'Severity level for violations' },
  );
  if (!severity) return;

  ctx.manager.update(id, {
    name: name || inv.name,
    sql: sql || inv.sql,
    expectation: expectation.value,
    severity: severity.value,
  });
  vscode.window.showInformationMessage(`Updated invariant: ${name || inv.name}`);
}

/** Run the "remove rule" confirmation. */
export async function promptRemoveRule(ctx: IInvariantPromptContext, id: string): Promise<void> {
  const inv = ctx.manager.get(id);
  if (!inv) return;

  const confirm = await vscode.window.showWarningMessage(
    `Remove invariant "${inv.name}"?`,
    { modal: true },
    'Remove',
  );
  if (confirm !== 'Remove') return;

  ctx.manager.remove(id);
  vscode.window.showInformationMessage(`Removed invariant: ${inv.name}`);
}
