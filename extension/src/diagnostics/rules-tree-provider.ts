/**
 * "Drift Advisor Rules" sidebar tree.
 *
 * Lists every diagnostic rule grouped by category with its live finding count
 * and enabled/disabled state, so a user buried in findings can see which rules
 * are noisiest and mute them in one click — instead of hand-editing the
 * `driftViewer.diagnostics.disabledRules` setting. Clicking a rule toggles it.
 */

import * as vscode from 'vscode';
import { DIAGNOSTIC_CODES } from './diagnostic-codes';
import type { DiagnosticCategory } from './diagnostic-types';

/** Human-readable category labels for the group headers. */
const CATEGORY_LABELS: Record<DiagnosticCategory, string> = {
  schema: 'Schema',
  performance: 'Performance',
  dataQuality: 'Data Quality',
  bestPractices: 'Best Practices',
  naming: 'Naming',
  runtime: 'Runtime',
  compliance: 'Compliance',
};

export type RulesTreeNode = RuleCategoryItem | RuleItem;

/** Collapsible category header showing the total findings in the category. */
export class RuleCategoryItem extends vscode.TreeItem {
  constructor(
    readonly category: DiagnosticCategory,
    readonly rules: RuleItem[],
    totalFindings: number,
  ) {
    super(
      CATEGORY_LABELS[category],
      vscode.TreeItemCollapsibleState.Expanded,
    );
    this.contextValue = 'driftRuleCategory';
    this.iconPath = new vscode.ThemeIcon('list-tree');
    // Show how much noise this category contributes at a glance.
    this.description = totalFindings > 0 ? `${totalFindings}` : undefined;
  }
}

/** Leaf item for one rule code; clicking it toggles enabled/disabled. */
export class RuleItem extends vscode.TreeItem {
  constructor(
    readonly code: string,
    readonly count: number,
    readonly disabled: boolean,
  ) {
    super(code, vscode.TreeItemCollapsibleState.None);

    // Description carries the live count and the muted state — the two things a
    // user scanning the list cares about.
    const parts: string[] = [];
    if (count > 0) parts.push(`${count}`);
    if (disabled) parts.push('disabled');
    this.description = parts.join(' • ') || undefined;

    this.contextValue = disabled ? 'driftRuleDisabled' : 'driftRuleEnabled';
    this.iconPath = disabled
      ? new vscode.ThemeIcon(
          'circle-slash',
          new vscode.ThemeColor('disabledForeground'),
        )
      : new vscode.ThemeIcon(count > 0 ? 'warning' : 'pass');

    this.tooltip = disabled
      ? `"${code}" is disabled. Click to re-enable.`
      : `"${code}" — ${count} finding(s). Click to disable everywhere.`;

    // Click toggles the rule. The command resolves the code from the node.
    this.command = {
      command: 'driftViewer.rules.toggleRule',
      title: 'Toggle Rule',
      arguments: [this],
    };
  }
}

/**
 * Tree data provider. Counts come from a getter (the diagnostic manager's last
 * collected issues) and disabled-state from a getter (the live config), so the
 * provider holds no state of its own beyond the render trigger.
 */
export class RulesTreeProvider implements vscode.TreeDataProvider<RulesTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    RulesTreeNode | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly _getCounts: () => Map<string, number>,
    private readonly _isDisabled: (code: string) => boolean,
  ) {}

  /** Re-render the whole tree (after a toggle or a diagnostics refresh). */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RulesTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: RulesTreeNode): RulesTreeNode[] {
    if (element instanceof RuleCategoryItem) {
      return element.rules;
    }
    if (element) {
      return [];
    }
    return this._buildCategories();
  }

  /** Group all known rule codes by category, attaching counts + state. */
  private _buildCategories(): RuleCategoryItem[] {
    const counts = this._getCounts();
    const byCategory = new Map<DiagnosticCategory, RuleItem[]>();

    for (const info of Object.values(DIAGNOSTIC_CODES)) {
      const count = counts.get(info.code) ?? 0;
      const item = new RuleItem(
        info.code,
        count,
        this._isDisabled(info.code),
      );
      const list = byCategory.get(info.category);
      if (list) list.push(item);
      else byCategory.set(info.category, [item]);
    }

    const categories: RuleCategoryItem[] = [];
    for (const [category, rules] of byCategory) {
      // Noisiest rules first so the findings driving the user crazy surface at
      // the top of each category.
      rules.sort((a, b) => b.count - a.count);
      const total = rules.reduce((sum, r) => sum + r.count, 0);
      categories.push(new RuleCategoryItem(category, rules, total));
    }
    // Categories with findings first, then alphabetical for stability.
    categories.sort((a, b) => {
      const at = a.rules.reduce((s, r) => s + r.count, 0);
      const bt = b.rules.reduce((s, r) => s + r.count, 0);
      if (at !== bt) return bt - at;
      return CATEGORY_LABELS[a.category].localeCompare(CATEGORY_LABELS[b.category]);
    });
    return categories;
  }
}
