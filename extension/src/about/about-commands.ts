/**
 * Registers "About" and "About Saropa" commands.
 *  - driftViewer.about       → opens bundled CHANGELOG.md (release notes)
 *  - driftViewer.aboutSaropa → opens bundled ABOUT_SAROPA.md (company overview)
 * Both open in VS Code's markdown preview, falling back to GitHub if the
 * local file is missing from the extension bundle.
 */

import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Open a bundled markdown file in VS Code's built-in markdown preview.
 * Falls back to an external URL if the local file cannot be found
 * (e.g. the file was excluded from the VSIX by accident).
 */
async function openBundledMarkdown(
  extensionPath: string,
  filename: string,
  fallbackUrl: string,
): Promise<void> {
  const filePath = path.join(extensionPath, filename);
  const fileUri = vscode.Uri.file(filePath);

  try {
    // Verify the bundled file exists before trying to open it
    await vscode.workspace.fs.stat(fileUri);
    // Open in VS Code's built-in markdown preview
    await vscode.commands.executeCommand('markdown.showPreview', fileUri);
  } catch {
    // Fallback: open the GitHub copy if the local file is missing
    void vscode.env.openExternal(vscode.Uri.parse(fallbackUrl));
  }
}

/**
 * Register the about / release-notes commands.
 */
export function registerAboutCommands(context: vscode.ExtensionContext): void {
  // "About" command — opens the CHANGELOG in markdown preview
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.about', () =>
      openBundledMarkdown(
        context.extensionPath,
        'CHANGELOG.md',
        'https://github.com/saropa/saropa_drift_advisor/blob/main/extension/CHANGELOG.md',
      ),
    ),
  );

  // "About Saropa" command — opens the company/product overview in markdown
  // preview. Shown as an (i) icon in the Database section header.
  context.subscriptions.push(
    vscode.commands.registerCommand('driftViewer.aboutSaropa', () =>
      openBundledMarkdown(
        context.extensionPath,
        'ABOUT_SAROPA.md',
        'https://github.com/saropa/saropa_drift_advisor/blob/main/ABOUT_SAROPA.md',
      ),
    ),
  );
}
