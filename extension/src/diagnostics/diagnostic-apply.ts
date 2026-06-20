import * as vscode from 'vscode';
import { DIAGNOSTIC_CODES } from './diagnostic-codes';
import {
  DIAGNOSTIC_PREFIX,
  DIAGNOSTIC_SOURCE,
  type IDartFileInfo,
  type IDiagnosticConfig,
  type IDiagnosticIssue,
} from './diagnostic-types';
import { isInlineSuppressed, type IInlineSuppressions } from './suppression';

/**
 * Convert collected issues into VS Code diagnostics grouped by file URI,
 * applying every suppression layer (disabled rules, inline directives, per-table
 * and per-column exclusions, severity overrides). Split out of DiagnosticManager
 * so the filtering rules stay pure (no collection I/O) and individually testable.
 */
export function buildDiagnosticsByFile(
  issues: IDiagnosticIssue[],
  config: IDiagnosticConfig,
  dartFiles: IDartFileInfo[],
): Map<string, vscode.Diagnostic[]> {
  const byFile = new Map<string, vscode.Diagnostic[]>();

  // Index inline-suppression directives by file URI so an issue can be
  // checked against the `// drift-advisor:ignore[-file]` comments in its own
  // source file. Built once per refresh rather than per issue.
  const suppressionsByUri = new Map<string, IInlineSuppressions>();
  for (const file of dartFiles) {
    suppressionsByUri.set(file.uri.toString(), file.suppressions);
  }

  for (const issue of issues) {
    // Skip disabled rules
    if (config.disabledRules.has(issue.code)) {
      continue;
    }

    // Skip inline-suppressed issues (file-level or field-level directives in
    // the source). Field-level matches on the diagnostic's pinned line, which
    // is the column getter / table class line the providers anchor to.
    const supps = suppressionsByUri.get(issue.fileUri.toString());
    if (
      supps &&
      isInlineSuppressed(supps, issue.code, issue.range.start.line)
    ) {
      continue;
    }

    // Skip per-table exclusions. Most providers set data.tableName, but the
    // runtime event converter emits data.table; accept either so runtime/query
    // diagnostics are actually suppressible (they previously never matched
    // because only `tableName` was read). See plans/full-codebase-audit-2026.06.12.md M12.
    const tableName = issue.data?.tableName ?? issue.data?.table;
    if (typeof tableName === 'string') {
      const excludedTables = config.tableExclusions.get(issue.code);
      if (excludedTables?.has(tableName)) {
        continue;
      }

      // Per-column exclusion: finer than the table check above. Suppress a
      // rule on a single `table.column` (e.g. a column expected to be mostly
      // NULL) while leaving the rest of the table reporting. Only applies to
      // column-scoped diagnostics that carry data.column.
      const columnName = issue.data?.column;
      if (typeof columnName === 'string') {
        const excludedColumns = config.columnExclusions.get(issue.code);
        if (excludedColumns?.has(`${tableName}.${columnName}`)) {
          continue;
        }
      }
    }

    const codeInfo = DIAGNOSTIC_CODES[issue.code];
    if (!codeInfo) {
      continue;
    }

    const overrideSeverity = config.severityOverrides[issue.code];
    const severity =
      overrideSeverity ?? issue.severity ?? codeInfo.defaultSeverity;

    const prefixedMessage = `${DIAGNOSTIC_PREFIX} ${issue.message}`;

    const diag = new vscode.Diagnostic(issue.range, prefixedMessage, severity);
    diag.source = DIAGNOSTIC_SOURCE;
    diag.code = issue.code;

    if (issue.relatedInfo) {
      diag.relatedInformation = issue.relatedInfo;
    }

    const key = issue.fileUri.toString();
    const list = byFile.get(key) ?? [];
    list.push(diag);
    byFile.set(key, list);
  }

  return byFile;
}

/**
 * Inline-suppression quick fixes, offered on every advisor diagnostic so a user
 * drowning in findings can silence one column or a whole file in one click
 * instead of editing settings JSON. These insert the
 * `// drift-advisor:ignore[-file]` directives the parser honors.
 */
export function buildSuppressionQuickFixes(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  codeStr: string,
): vscode.CodeAction[] {
  const actions: vscode.CodeAction[] = [];
  const line = diagnostic.range.start.line;

  const ignoreColumn = new vscode.CodeAction(
    `Ignore "${codeStr}" for this column`,
    vscode.CodeActionKind.QuickFix,
  );
  ignoreColumn.command = {
    command: 'driftViewer.suppressDiagnosticInColumn',
    title: 'Ignore for this column',
    arguments: [{ uri: document.uri.toString(), line, code: codeStr }],
  };
  actions.push(ignoreColumn);

  const ignoreFile = new vscode.CodeAction(
    `Ignore "${codeStr}" in this file`,
    vscode.CodeActionKind.QuickFix,
  );
  ignoreFile.command = {
    command: 'driftViewer.suppressDiagnosticInFile',
    title: 'Ignore in this file',
    arguments: [{ uri: document.uri.toString(), code: codeStr }],
  };
  actions.push(ignoreFile);

  return actions;
}
