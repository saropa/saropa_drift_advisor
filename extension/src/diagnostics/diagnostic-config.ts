/**
 * Load diagnostic configuration from VS Code settings.
 */

import * as vscode from 'vscode';
import {
  DEFAULT_DIAGNOSTIC_CONFIG,
  type DiagnosticCategory,
  type IDiagnosticConfig,
} from './diagnostic-types';

function parseSeverity(sev: string): vscode.DiagnosticSeverity {
  switch (sev.toLowerCase()) {
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    case 'information':
    case 'info':
      return vscode.DiagnosticSeverity.Information;
    case 'hint':
      return vscode.DiagnosticSeverity.Hint;
    default:
      return vscode.DiagnosticSeverity.Warning;
  }
}

/**
 * Read driftViewer.diagnostics configuration and return a resolved config object.
 */
export function loadDiagnosticConfig(): IDiagnosticConfig {
  const cfg = vscode.workspace.getConfiguration('driftViewer.diagnostics');

  const categories: Record<DiagnosticCategory, boolean> = {
    schema: cfg.get('categories.schema', DEFAULT_DIAGNOSTIC_CONFIG.categories.schema),
    performance: cfg.get('categories.performance', DEFAULT_DIAGNOSTIC_CONFIG.categories.performance),
    dataQuality: cfg.get('categories.dataQuality', DEFAULT_DIAGNOSTIC_CONFIG.categories.dataQuality),
    bestPractices: cfg.get('categories.bestPractices', DEFAULT_DIAGNOSTIC_CONFIG.categories.bestPractices),
    naming: cfg.get('categories.naming', DEFAULT_DIAGNOSTIC_CONFIG.categories.naming),
    runtime: cfg.get('categories.runtime', DEFAULT_DIAGNOSTIC_CONFIG.categories.runtime),
    compliance: cfg.get('categories.compliance', DEFAULT_DIAGNOSTIC_CONFIG.categories.compliance),
  };

  const severityOverrides: Record<string, vscode.DiagnosticSeverity> = {};
  const overridesRaw = cfg.get<Record<string, string>>('severityOverrides', {});
  for (const [code, sev] of Object.entries(overridesRaw)) {
    severityOverrides[code] = parseSeverity(sev);
  }

  const disabledRulesArray = cfg.get<string[]>('disabledRules', []);
  const disabledRules = new Set(disabledRulesArray);

  // Per-table exclusions: { "no-foreign-keys": ["users", "static_data"], ... }
  // Lets users suppress a rule on specific tables while keeping it active elsewhere.
  const exclusionsRaw = cfg.get<Record<string, string[]>>('tableExclusions', {});
  const tableExclusions = new Map<string, Set<string>>();
  for (const [code, tables] of Object.entries(exclusionsRaw)) {
    if (Array.isArray(tables) && tables.length > 0) {
      tableExclusions.set(code, new Set(tables));
    }
  }

  return {
    enabled: cfg.get('enabled', DEFAULT_DIAGNOSTIC_CONFIG.enabled),
    refreshOnSave: cfg.get('refreshOnSave', DEFAULT_DIAGNOSTIC_CONFIG.refreshOnSave),
    refreshIntervalMs: cfg.get('refreshIntervalMs', DEFAULT_DIAGNOSTIC_CONFIG.refreshIntervalMs),
    categories,
    severityOverrides,
    disabledRules,
    tableExclusions,
  };
}
