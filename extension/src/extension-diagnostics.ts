/**
 * Diagnostic manager and provider registration.
 * Central drift-advisor collection plus disable/clear/copy commands.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from './api-client';
import type { SchemaIntelligence } from './engines/schema-intelligence';
import type { QueryIntelligence } from './engines/query-intelligence';
import {
  BestPracticeProvider,
  ComplianceProvider,
  DataQualityProvider,
  DiagnosticCodeActionProvider,
  DiagnosticManager,
  NamingProvider,
  PerformanceProvider,
  RuntimeProvider,
  SchemaProvider,
} from './diagnostics';
import { registerSuppressionCommands } from './diagnostics/suppression-commands';
import {
  RulesTreeProvider,
  type RuleItem,
} from './diagnostics/rules-tree-provider';

export interface DiagnosticSetupResult {
  diagnosticManager: DiagnosticManager;
}

/**
 * Create diagnostic collection, register all providers and related commands.
 * Caller must pass schemaIntel and queryIntel (created from client).
 */
export function setupDiagnostics(
  context: vscode.ExtensionContext,
  client: DriftApiClient,
  schemaIntel: SchemaIntelligence,
  queryIntel: QueryIntelligence,
): DiagnosticSetupResult {
  const diagnosticManager = new DiagnosticManager(client, schemaIntel, queryIntel);
  context.subscriptions.push(diagnosticManager);

  context.subscriptions.push(
    diagnosticManager.registerProvider(new SchemaProvider()),
    diagnosticManager.registerProvider(new PerformanceProvider()),
    diagnosticManager.registerProvider(new DataQualityProvider()),
    diagnosticManager.registerProvider(new BestPracticeProvider()),
    diagnosticManager.registerProvider(new NamingProvider()),
    diagnosticManager.registerProvider(new RuntimeProvider()),
    diagnosticManager.registerProvider(
      new ComplianceProvider(() => {
        diagnosticManager.refresh().catch(() => {});
      }),
    ),
  );

  // Inline-suppression insert commands (used by the quick-fix lightbulbs).
  // Refresh after a directive is inserted so the silenced finding clears now.
  registerSuppressionCommands(context, () => diagnosticManager.refresh());

  // "Drift Advisor Rules" sidebar: every rule with its live finding count and
  // enabled/disabled state. Clicking a rule mutes/unmutes it — the relief valve
  // for a workspace with hundreds of findings.
  const rulesProvider = new RulesTreeProvider(
    () => diagnosticManager.getCollectedCountsByCode(),
    (code) =>
      vscode.workspace
        .getConfiguration('driftViewer.diagnostics')
        .get<string[]>('disabledRules', [])
        .includes(code),
  );
  context.subscriptions.push(
    // registerTreeDataProvider (not createTreeView): createTreeView throws
    // "No view is registered with id" synchronously if VS Code's currently
    // loaded manifest doesn't yet contain the view — which happens whenever the
    // extension's JS reloads but the package.json contribution hasn't been
    // re-read yet — and that exception would break the rest of diagnostics
    // setup. registerTreeDataProvider is tolerant: it wires up once the view
    // exists and never throws. The TreeView handle is unused here.
    vscode.window.registerTreeDataProvider('driftViewer.rules', rulesProvider),
    // Re-render counts whenever a refresh cycle completes.
    diagnosticManager.onDidRefresh(() => rulesProvider.refresh()),
    vscode.commands.registerCommand(
      'driftViewer.rules.toggleRule',
      async (item: RuleItem) => {
        const cfg = vscode.workspace.getConfiguration('driftViewer.diagnostics');
        const disabled = cfg.get<string[]>('disabledRules', []);
        const next = item.disabled
          ? disabled.filter((c) => c !== item.code)
          : [...new Set([...disabled, item.code])];
        await cfg.update(
          'disabledRules',
          next,
          vscode.ConfigurationTarget.Workspace,
        );
        rulesProvider.refresh();
        void diagnosticManager.refresh();
      },
    ),
    vscode.commands.registerCommand('driftViewer.rules.refresh', () => {
      void diagnosticManager.refresh();
      rulesProvider.refresh();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.openComplianceConfig',
      async () => {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders?.length) return;
        const configUri = vscode.Uri.joinPath(
          folders[0].uri,
          '.drift-rules.json',
        );
        try {
          const doc = await vscode.workspace.openTextDocument(configUri);
          await vscode.window.showTextDocument(doc);
        } catch {
          vscode.window.showInformationMessage(
            'No .drift-rules.json found. Create one in your workspace root.',
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.disableDiagnosticRule',
      async (ruleCode: string) => {
        const config = vscode.workspace.getConfiguration('driftViewer.diagnostics');
        const currentDisabled = config.get<string[]>('disabledRules', []);
        if (!currentDisabled.includes(ruleCode)) {
          await config.update(
            'disabledRules',
            [...currentDisabled, ruleCode],
            vscode.ConfigurationTarget.Workspace,
          );
          vscode.window.showInformationMessage(
            `Disabled diagnostic rule: ${ruleCode}`,
          );
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.clearRuntimeAlerts',
      () => {
        const runtimeProvider = diagnosticManager.getProvider('runtime') as RuntimeProvider | undefined;
        if (runtimeProvider) {
          runtimeProvider.clearEvents();
          diagnosticManager.refresh();
          vscode.window.showInformationMessage('Runtime alerts cleared');
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.copySuggestedName',
      async (name: string) => {
        await vscode.env.clipboard.writeText(name);
        vscode.window.showInformationMessage(`Copied "${name}" to clipboard`);
      },
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'dart', scheme: 'file' },
      new DiagnosticCodeActionProvider(diagnosticManager),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
  );

  return { diagnosticManager };
}
