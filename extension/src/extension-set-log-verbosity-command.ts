/**
 * The `driftViewer.setLogVerbosity` command: a quick-pick to switch the output
 * channel's log verbosity. Extracted from extension-commands.ts as a
 * self-contained registration (it depends only on `vscode`).
 */
import * as vscode from 'vscode';

export function registerSetLogVerbosityCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.setLogVerbosity',
      async () => {
        const cfg = vscode.workspace.getConfiguration('driftViewer');
        const current = cfg.get<string>('logVerbosity', 'verbose') ?? 'verbose';

        const items: Array<vscode.QuickPickItem & { value: string }> = [
          {
            label: 'quiet',
            description: 'Only errors + important connection events',
            value: 'quiet',
          },
          {
            label: 'normal',
            description: 'Reduce noise; keep important lines',
            value: 'normal',
          },
          {
            label: 'verbose',
            description: 'Most runtime information (default)',
            value: 'verbose',
          },
        ];

        const pick = await vscode.window.showQuickPick(items, {
          placeHolder: `Select log verbosity (current: ${current})`,
        });
        if (!pick) return;

        await cfg.update(
          'logVerbosity',
          pick.value,
          vscode.ConfigurationTarget.Workspace,
        );
        void vscode.window.showInformationMessage(
          `Saropa Drift Advisor log verbosity set to: ${pick.value}`,
        );
      },
    ),
  );
}
