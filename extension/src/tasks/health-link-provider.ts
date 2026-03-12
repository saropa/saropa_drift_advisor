import * as vscode from 'vscode';
import { HEALTH_PANEL_LINK } from './health-check-runner';

/**
 * Terminal link provider that detects "View Health Score Dashboard" text
 * and makes it clickable to open the Health Score panel.
 */
export class HealthTerminalLinkProvider implements vscode.TerminalLinkProvider {
  provideTerminalLinks(
    context: vscode.TerminalLinkContext,
  ): vscode.TerminalLink[] {
    const links: vscode.TerminalLink[] = [];
    const line = context.line;

    const startIndex = line.indexOf(HEALTH_PANEL_LINK);
    if (startIndex !== -1) {
      links.push({
        startIndex,
        length: HEALTH_PANEL_LINK.length,
        tooltip: 'Open Health Score Dashboard',
      });
    }

    return links;
  }

  handleTerminalLink(link: vscode.TerminalLink): void {
    vscode.commands.executeCommand('driftViewer.healthScore');
  }
}
