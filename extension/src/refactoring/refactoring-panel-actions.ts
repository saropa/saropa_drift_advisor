/**
 * Side-effecting actions for the refactoring panel: confirm destructive SQL,
 * copy a plan's SQL/Dart/Drift output to the clipboard, and deep-link into
 * migration preview / ER diagram / NL-SQL. Extracted from refactoring-panel.ts
 * so the panel class holds only analyze + plan caching + message routing. Each
 * takes the already-resolved plan or suggestion (possibly undefined) and shows
 * its own "not available" message, mirroring the prior inline behavior.
 */

import * as vscode from 'vscode';
import { buildNlSqlSeedFromSuggestion } from './refactoring-nl-bridge';
import type { IMigrationPlan, IRefactoringSuggestion } from './refactoring-types';

/** Render a plan's steps as commented SQL (single source for copy + preview suffix). */
export function planToSql(plan: IMigrationPlan): string {
  return plan.steps.map((s) => `-- ${s.title}\n${s.sql}`).join('\n\n');
}

/** Confirm before copying a plan that contains destructive (e.g. DROP COLUMN) SQL. */
export async function maybeConfirmDestructive(plan: IMigrationPlan): Promise<boolean> {
  const destructive = plan.steps.some((s) => s.destructive);
  if (!destructive) return true;
  const choice = await vscode.window.showWarningMessage(
    'This plan includes destructive SQL (for example DROP COLUMN). Copy anyway?',
    { modal: true },
    'Copy',
  );
  return choice === 'Copy';
}

export async function copyPlanSql(plan: IMigrationPlan | undefined): Promise<void> {
  if (!plan) {
    void vscode.window.showErrorMessage('No plan available; open a migration plan first.');
    return;
  }
  if (!(await maybeConfirmDestructive(plan))) return;
  await vscode.env.clipboard.writeText(planToSql(plan));
  void vscode.window.showInformationMessage('SQL copied to clipboard.');
}

export async function copyPlanDart(plan: IMigrationPlan | undefined): Promise<void> {
  if (!plan) {
    void vscode.window.showErrorMessage('No plan available.');
    return;
  }
  await vscode.env.clipboard.writeText(plan.dartCode);
  void vscode.window.showInformationMessage('Dart migration snippet copied.');
}

export async function copyPlanDrift(plan: IMigrationPlan | undefined): Promise<void> {
  if (!plan) {
    void vscode.window.showErrorMessage('No plan available.');
    return;
  }
  await vscode.env.clipboard.writeText(plan.driftTableClass);
  void vscode.window.showInformationMessage('Drift table snippet copied.');
}

export async function openMigrationPreviewWithPlan(plan: IMigrationPlan | undefined): Promise<void> {
  if (!plan) {
    void vscode.window.showErrorMessage('No plan available for this suggestion.');
    return;
  }
  if (!(await maybeConfirmDestructive(plan))) return;
  await vscode.commands.executeCommand('driftViewer.migrationPreview', {
    advisorySqlSuffix: planToSql(plan),
  });
}

export async function openErDiagramFocused(
  suggestion: IRefactoringSuggestion | undefined,
): Promise<void> {
  const focus = suggestion?.tables[0];
  if (!focus) {
    void vscode.window.showErrorMessage('No table context for this suggestion.');
    return;
  }
  await vscode.commands.executeCommand('driftViewer.showErDiagram', { focusTable: focus });
}

export async function openNlSqlPrefilled(
  suggestion: IRefactoringSuggestion | undefined,
): Promise<void> {
  if (!suggestion) {
    void vscode.window.showErrorMessage('Suggestion not found; run Analyze again.');
    return;
  }
  const initialQuestion = buildNlSqlSeedFromSuggestion(suggestion);
  await vscode.commands.executeCommand('driftViewer.askNaturalLanguage', { initialQuestion });
}
