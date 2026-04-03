import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { IndexSuggestion, Anomaly } from '../api-types';
import type { HealthStatusBar } from '../status-bar-health';
import { HealthScorer } from './health-scorer';
import { HealthPanel } from './health-panel';
import { IndexSuggestionsPanel } from './index-suggestions-panel';
import { AnomaliesPanel } from './anomalies-panel';

/** Register the health score command and action commands. */
export function registerHealthCommands(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  healthStatusBar?: HealthStatusBar,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.healthScore',
      async () => {
        try {
          const scorer = new HealthScorer();
          const score = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Computing health score\u2026',
            },
            () => scorer.compute(client),
          );
          HealthPanel.createOrShow(score, client);
          // Update the status bar so the score is always visible
          healthStatusBar?.update(score.overall, score.grade);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Health score failed: ${msg}`);
        }
      },
    ),
  );

  // Index action: show suggestions in a webview panel
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.showIndexSuggestions',
      async () => {
        try {
          const suggestions = await client.indexSuggestions();
          if (suggestions.length === 0) {
            vscode.window.showInformationMessage('No missing indexes detected.');
            return;
          }
          IndexSuggestionsPanel.createOrShow(suggestions, client);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to fetch index suggestions: ${msg}`);
        }
      },
    ),
  );

  // Index action: create all missing indexes
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.createAllIndexes',
      async (args?: { indexes?: IndexSuggestion[] }) => {
        const indexes = args?.indexes ?? await client.indexSuggestions();
        if (indexes.length === 0) {
          vscode.window.showInformationMessage('No missing indexes to create.');
          return;
        }
        const confirm = await vscode.window.showWarningMessage(
          `Create ${indexes.length} index(es)? This will modify your database.`,
          { modal: true },
          'Create Indexes',
        );
        if (confirm !== 'Create Indexes') return;

        let created = 0;
        let failed = 0;
        for (const idx of indexes) {
          try {
            await client.sql(idx.sql);
            created++;
          } catch {
            failed++;
          }
        }
        vscode.window.showInformationMessage(
          `Created ${created} index(es)${failed > 0 ? `, ${failed} failed` : ''}.`,
        );
      },
    ),
  );

  // Anomaly action: show anomalies in a webview panel with severity filters
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.showAnomalies',
      async (args?: { filter?: 'error' | 'warning' | 'info' }) => {
        try {
          let anomalies = await client.anomalies();
          if (args?.filter) {
            anomalies = anomalies.filter((a) => a.severity === args.filter);
          }
          if (anomalies.length === 0) {
            vscode.window.showInformationMessage('No anomalies found.');
            return;
          }
          AnomaliesPanel.createOrShow(anomalies, client);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Failed to fetch anomalies: ${msg}`);
        }
      },
    ),
  );

  // Anomaly action: generate fix SQL for FK integrity issues
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.generateAnomalyFixes',
      async (args?: { anomalies?: Anomaly[] }) => {
        const anomalies = args?.anomalies ?? (await client.anomalies())
          .filter((a) => a.severity === 'error');
        if (anomalies.length === 0) {
          vscode.window.showInformationMessage('No error-level anomalies to fix.');
          return;
        }
        const lines = [
          '-- Saropa Drift Advisor: Anomaly Fix SQL',
          '-- Review carefully before executing!',
          '',
        ];
        for (const a of anomalies) {
          lines.push(`-- ${a.message}`);
          const fixSql = generateAnomalyFixSql(a);
          if (fixSql) {
            lines.push(fixSql);
          } else {
            lines.push('-- (Manual review required)');
          }
          lines.push('');
        }
        const doc = await vscode.workspace.openTextDocument({
          content: lines.join('\n'),
          language: 'sql',
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
      },
    ),
  );

  // Table sampling action
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.sampleTable',
      async (args?: { table?: string }) => {
        if (args?.table) {
          vscode.commands.executeCommand('driftViewer.openSqlNotebook');
          const sql = `SELECT * FROM "${args.table}" ORDER BY RANDOM() LIMIT 100`;
          await vscode.env.clipboard.writeText(sql);
          vscode.window.showInformationMessage(
            `Sample query copied: ${sql.substring(0, 50)}...`,
          );
        }
      },
    ),
  );
}

function generateAnomalyFixSql(anomaly: Anomaly): string | undefined {
  const msg = anomaly.message.toLowerCase();
  if (msg.includes('orphan') || msg.includes('foreign key')) {
    const tableMatch = anomaly.message.match(/(\w+)\.(\w+)/);
    if (tableMatch) {
      const [, table, column] = tableMatch;
      return `-- DELETE FROM "${table}" WHERE "${column}" NOT IN (SELECT id FROM parent_table);`;
    }
  }
  if (msg.includes('duplicate')) {
    const tableMatch = anomaly.message.match(/in (\w+)/i);
    if (tableMatch) {
      return `-- DELETE FROM "${tableMatch[1]}" WHERE rowid NOT IN (SELECT MIN(rowid) FROM "${tableMatch[1]}" GROUP BY all_columns);`;
    }
  }
  if (msg.includes('empty string')) {
    const tableMatch = anomaly.message.match(/(\w+)\.(\w+)/);
    if (tableMatch) {
      const [, table, column] = tableMatch;
      return `UPDATE "${table}" SET "${column}" = NULL WHERE "${column}" = '';`;
    }
  }
  return undefined;
}
