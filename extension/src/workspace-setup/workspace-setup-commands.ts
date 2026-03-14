/**
 * Registers the "Add package to project" command. Installing the extension
 * can install the saropa_drift_advisor Dart package in the workspace (and vice versa).
 * Progress notification shows step messages (e.g. "Running pub get…").
 */

import * as vscode from 'vscode';
import { addPackageToProject } from './add-package';

export function registerWorkspaceSetupCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.addPackageToProject', async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Adding Saropa Drift Advisor to project',
          cancellable: false,
        },
        async (progress) => {
          const result = await addPackageToProject(progress);
          if (result.pubGetOk) {
            void vscode.window.showInformationMessage(result.message);
          } else {
            void vscode.window.showErrorMessage(result.message);
          }
          return result;
        },
      );
    }),
  );
}
