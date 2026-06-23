/**
 * Singleton webview panel for configuring Drift Advisor diagnostic rules.
 *
 * Replaces the old "Drift Advisor Rules" sidebar tree (a mute/unmute list) with
 * a full screen: every rule grouped by category, each with an enable/disable
 * toggle, a live finding count, and a severity-override dropdown. Toggles write
 * `driftViewer.diagnostics.disabledRules`; severity changes write
 * `driftViewer.diagnostics.severityOverrides`. Both settings are registered in
 * package.json — VS Code rejects writes to unregistered configuration, which is
 * exactly what broke the old sidebar toggle.
 *
 * The panel holds no rule state of its own: it reads counts from a getter (the
 * diagnostic manager's last cycle) and enabled/severity state from live config
 * on every render, so an external settings edit or a fresh analysis cycle is
 * reflected by a single `refresh()`.
 */

import * as vscode from 'vscode';

import { t } from '../l10n';
import { secureWebviewHtml } from '../webview-csp';
import { DIAGNOSTIC_CODES } from './diagnostic-codes';
import type { DiagnosticCategory } from './diagnostic-types';
import {
  buildRulesConfigHtml,
  type RuleCategoryModel,
  type RuleRowModel,
  type RuleSeverityValue,
} from './rules-config-html';

/** Fixed category render order + their l10n label keys. */
const CATEGORY_ORDER: Array<{ category: DiagnosticCategory; labelKey: string }> = [
  { category: 'schema', labelKey: 'panel.rules.category.schema' },
  { category: 'performance', labelKey: 'panel.rules.category.performance' },
  { category: 'dataQuality', labelKey: 'panel.rules.category.dataQuality' },
  { category: 'bestPractices', labelKey: 'panel.rules.category.bestPractices' },
  { category: 'naming', labelKey: 'panel.rules.category.naming' },
  { category: 'runtime', labelKey: 'panel.rules.category.runtime' },
  { category: 'compliance', labelKey: 'panel.rules.category.compliance' },
];

/** Message shapes posted from the webview client script. */
interface RulesPanelMessage {
  command: string;
  code?: string;
  severity?: string;
  disabled?: boolean;
}

/** Map a built-in `DiagnosticSeverity` to its translated label for the dropdown. */
function defaultSeverityLabel(sev: vscode.DiagnosticSeverity): string {
  switch (sev) {
    case vscode.DiagnosticSeverity.Error:
      return t('panel.rules.severity.error');
    case vscode.DiagnosticSeverity.Information:
      return t('panel.rules.severity.info');
    case vscode.DiagnosticSeverity.Hint:
      return t('panel.rules.severity.hint');
    default:
      return t('panel.rules.severity.warning');
  }
}

/** Coerce a raw stored override token to one the dropdown understands. */
function normalizeSeverity(raw: string | undefined): RuleSeverityValue {
  switch ((raw ?? '').toLowerCase()) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    case 'info':
    case 'information':
      return 'info';
    case 'hint':
      return 'hint';
    default:
      return '';
  }
}

export class RulesConfigPanel {
  private static _current: RulesConfigPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _getCounts: () => Map<string, number>;
  private readonly _rerunDiagnostics: () => void;

  /**
   * Open the panel (or reveal the existing one). [getCounts] returns the live
   * per-code finding counts; [rerunDiagnostics] forces a fresh analysis cycle so
   * a severity/enable change is reflected in the editor diagnostics.
   */
  static createOrShow(
    getCounts: () => Map<string, number>,
    rerunDiagnostics: () => void,
  ): void {
    const column = vscode.ViewColumn.Active;
    if (RulesConfigPanel._current) {
      RulesConfigPanel._current._render();
      RulesConfigPanel._current._panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'driftRulesConfig',
      t('panel.rules.title'),
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    RulesConfigPanel._current = new RulesConfigPanel(panel, getCounts, rerunDiagnostics);
  }

  /** Re-render the open panel (no-op when closed). Called after a refresh cycle. */
  static refreshIfOpen(): void {
    RulesConfigPanel._current?._render();
  }

  private constructor(
    panel: vscode.WebviewPanel,
    getCounts: () => Map<string, number>,
    rerunDiagnostics: () => void,
  ) {
    this._panel = panel;
    this._getCounts = getCounts;
    this._rerunDiagnostics = rerunDiagnostics;

    this._panel.onDidDispose(() => this._dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg: RulesPanelMessage) => this._handleMessage(msg),
      null,
      this._disposables,
    );
    this._render();
  }

  /** Build the category/rule model from the code registry + live config. */
  private _buildModel(): {
    categories: RuleCategoryModel[];
    enabled: number;
    disabled: number;
  } {
    const cfg = vscode.workspace.getConfiguration('driftViewer.diagnostics');
    const disabledRules = new Set(cfg.get<string[]>('disabledRules', []));
    const overrides = cfg.get<Record<string, string>>('severityOverrides', {});
    const counts = this._getCounts();

    let enabled = 0;
    let disabled = 0;
    const byCategory = new Map<DiagnosticCategory, RuleRowModel[]>();

    for (const info of Object.values(DIAGNOSTIC_CODES)) {
      const isDisabled = disabledRules.has(info.code);
      if (isDisabled) disabled++;
      else enabled++;

      const row: RuleRowModel = {
        code: info.code,
        description: info.messageTemplate,
        count: counts.get(info.code) ?? 0,
        disabled: isDisabled,
        severity: normalizeSeverity(overrides[info.code]),
        defaultSeverityLabel: defaultSeverityLabel(info.defaultSeverity),
      };
      const list = byCategory.get(info.category);
      if (list) list.push(row);
      else byCategory.set(info.category, [row]);
    }

    const categories: RuleCategoryModel[] = [];
    for (const { category, labelKey } of CATEGORY_ORDER) {
      const rules = byCategory.get(category);
      if (!rules || rules.length === 0) continue;
      // Noisiest rules first within a category, then by code for stability.
      rules.sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
      categories.push({ category, label: t(labelKey), rules });
    }
    return { categories, enabled, disabled };
  }

  private _render(): void {
    const { categories, enabled, disabled } = this._buildModel();
    this._panel.webview.html = secureWebviewHtml(
      buildRulesConfigHtml(categories, enabled, disabled),
    );
  }

  private async _handleMessage(msg: RulesPanelMessage): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('driftViewer.diagnostics');
    switch (msg.command) {
      case 'toggleRule': {
        if (!msg.code) break;
        const disabled = cfg.get<string[]>('disabledRules', []);
        const next = msg.disabled
          ? [...new Set([...disabled, msg.code])]
          : disabled.filter((c) => c !== msg.code);
        await cfg.update('disabledRules', next, vscode.ConfigurationTarget.Workspace);
        this._afterConfigChange();
        break;
      }
      case 'setSeverity': {
        if (!msg.code) break;
        const overrides = { ...cfg.get<Record<string, string>>('severityOverrides', {}) };
        const value = normalizeSeverity(msg.severity);
        // Empty value means "use the rule's default" — drop the key so the
        // override map never accumulates dead entries.
        if (value === '') delete overrides[msg.code];
        else overrides[msg.code] = value;
        await cfg.update('severityOverrides', overrides, vscode.ConfigurationTarget.Workspace);
        this._afterConfigChange();
        break;
      }
      case 'enableAll': {
        await cfg.update('disabledRules', [], vscode.ConfigurationTarget.Workspace);
        this._afterConfigChange();
        break;
      }
      case 'resetSeverities': {
        await cfg.update('severityOverrides', {}, vscode.ConfigurationTarget.Workspace);
        this._afterConfigChange();
        break;
      }
      case 'rerun': {
        this._rerunDiagnostics();
        break;
      }
    }
  }

  /** Re-run analysis (counts/diagnostics) and re-render the panel after a write. */
  private _afterConfigChange(): void {
    this._rerunDiagnostics();
    this._render();
  }

  private _dispose(): void {
    RulesConfigPanel._current = undefined;
    this._panel.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
