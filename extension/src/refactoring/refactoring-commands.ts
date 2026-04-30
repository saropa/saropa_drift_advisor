/**
 * Registers schema refactoring (Feature 66) commands.
 */
import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import { RefactoringPanel } from './refactoring-panel';

/**
 * Registers the command that opens the refactoring suggestions panel.
 */
export function registerRefactoringCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.suggestSchemaRefactorings', () => {
      RefactoringPanel.createOrShow(context, client);
    }),
    vscode.commands.registerCommand(
      'driftViewer.refactoringOpenWithHint',
      (args?: { title?: string; description?: string; table?: string; column?: string }) => {
        RefactoringPanel.openWithExternalHint(context, client, args ?? {});
      },
    ),
  );
}
