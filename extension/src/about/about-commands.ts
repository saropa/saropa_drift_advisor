/**
 * Registers the "About Saropa Drift Advisor" command.
 * Opens the bundled CHANGELOG.md in VS Code's built-in markdown preview
 * so users can browse release notes without leaving the editor.
 */

import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Register the about / release-notes command.
 * Opens CHANGELOG.md from the extension bundle in markdown preview.
 * Falls back to the GitHub changelog URL if the local file is missing.
 */
export function registerAboutCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.about', async () => {
      // Resolve the CHANGELOG bundled with the extension
      const changelogPath = path.join(context.extensionPath, 'CHANGELOG.md');
      const changelogUri = vscode.Uri.file(changelogPath);

      try {
        // Verify the file exists before trying to open it
        await vscode.workspace.fs.stat(changelogUri);
        // Open in VS Code's built-in markdown preview
        await vscode.commands.executeCommand('markdown.showPreview', changelogUri);
      } catch {
        // Fallback: open the GitHub releases page if the local file is missing
        void vscode.env.openExternal(
          vscode.Uri.parse('https://github.com/saropa/saropa_drift_advisor/blob/main/extension/CHANGELOG.md'),
        );
      }
    }),
  );
}
