/**
 * Commands for optional saropa_lints integration.
 * Runs `dart run saropa_lints scan .` in the workspace and shows output in an Output channel.
 */

import { spawn } from 'node:child_process';
import * as vscode from 'vscode';

const OUTPUT_CHANNEL_NAME = 'Saropa Lints';

/**
 * Run saropa_lints scan in the workspace root and stream output to a dedicated channel.
 * Fails gracefully if no workspace, dart not found, or saropa_lints not in project.
 */
async function runSaropaLintsScan(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showWarningMessage(
      'To run Saropa Lints you must open a valid workspace folder first.',
    );
    return;
  }

  const channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  channel.clear();
  channel.appendLine(`Running: dart run saropa_lints scan .`);
  channel.appendLine(`Cwd: ${folder.uri.fsPath}`);
  channel.appendLine('');

  await new Promise<void>((resolve) => {
    const child = spawn('dart', ['run', 'saropa_lints', 'scan', '.'], {
      cwd: folder.uri.fsPath,
      shell: process.platform === 'win32',
    });

    child.stdout?.on('data', (data: Buffer | string) => {
      channel.append(data.toString());
    });
    child.stderr?.on('data', (data: Buffer | string) => {
      channel.append(data.toString());
    });

    child.on('error', (err) => {
      channel.appendLine(`Error: ${err.message}`);
      channel.appendLine(
        'Make sure Dart is on PATH and the workspace has saropa_lints in dev_dependencies.',
      );
      resolve();
    });

    child.on('close', (code, signal) => {
      channel.appendLine('');
      if (code === 0) {
        channel.appendLine('Scan completed successfully.');
      } else {
        channel.appendLine(
          `Scan exited with code ${code ?? signal ?? 'unknown'}.`,
        );
      }
      channel.show(true);
      resolve();
    });
  });
}

export function registerSaropaLintsCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.runSaropaLints',
      runSaropaLintsScan,
    ),
  );
}
