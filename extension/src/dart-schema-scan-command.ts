/**
 * Command: scan workspace Dart sources for Drift table classes, columns,
 * indexes, and uniqueKeys — no running app or database required.
 *
 * Failures during file discovery or parsing are written to the output channel
 * so the notification progress can complete without an unhandled rejection.
 */

import * as vscode from 'vscode';
import { parseDartFilesInWorkspace } from './diagnostics/dart-file-parser';
import type { IDartIndexDef, IDartTable } from './schema-diff/dart-schema';

let _dartSchemaOutput: vscode.OutputChannel | undefined;

/** Shared output channel for scan results (lazy-created). */
export function getDartSchemaScanOutputChannel(): vscode.OutputChannel {
  if (!_dartSchemaOutput) {
    _dartSchemaOutput = vscode.window.createOutputChannel('Drift Dart schema');
  }
  return _dartSchemaOutput;
}

function formatIndexLine(idx: IDartIndexDef): string {
  const kind = idx.unique ? 'UniqueIndex' : 'Index';
  const cols = idx.columns.length ? idx.columns.join(', ') : '(no columns parsed)';
  return `    ${kind} ${idx.name} (${cols})`;
}

function formatTableSection(t: IDartTable): string {
  const uri = vscode.Uri.parse(t.fileUri);
  const pathLabel = vscode.workspace.workspaceFolders?.length
    ? vscode.workspace.asRelativePath(uri, false)
    : uri.fsPath;

  const lines: string[] = [];
  lines.push('');
  lines.push(
    `▸ ${t.sqlTableName}  (class ${t.dartClassName})  — ${pathLabel}:${t.line + 1}`,
  );

  if (t.columns.length === 0) {
    lines.push('  (no column getters matched)');
  } else {
    lines.push('  Columns:');
    for (const c of t.columns) {
      const nullPart = c.nullable ? ' NULL' : '';
      const ai = c.autoIncrement ? ' AUTO_INCREMENT' : '';
      lines.push(
        `    • ${c.sqlName}  ${c.sqlType}  (${c.dartType})${nullPart}${ai}`,
      );
    }
  }

  if (t.uniqueKeys.length > 0) {
    lines.push('  uniqueKeys:');
    for (const set of t.uniqueKeys) {
      lines.push(`    { ${set.join(', ')} }`);
    }
  }

  if (t.indexes.length > 0) {
    lines.push('  indexes:');
    for (const idx of t.indexes) {
      lines.push(formatIndexLine(idx));
    }
  }

  return lines.join('\n');
}

/**
 * Walks all workspace `.dart` files (excluding build/), parses Drift `Table` classes,
 * and prints a structured report to the **Drift Dart schema** output channel.
 */
export async function runDartSchemaScanCommand(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('driftViewer');
  const openOutput = cfg.get<boolean>('dartSchemaScan.openOutput', true) !== false;

  const ch = getDartSchemaScanOutputChannel();
  ch.clear();
  ch.appendLine('Drift schema (from Dart sources)');
  ch.appendLine('— Tables, columns, uniqueKeys, Index/UniqueIndex —');
  ch.appendLine('');

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Scanning Dart files for Drift tables…',
      cancellable: false,
    },
    async () => {
      try {
        const files = await parseDartFilesInWorkspace();
        const allTables = files.flatMap((f) => f.tables);
        if (allTables.length === 0) {
          ch.appendLine(
            'No `class … extends Table` definitions found (or no readable .dart files).',
          );
          ch.appendLine(
            'Tip: table classes must extend `Table` directly; build/ is excluded.',
          );
          return;
        }

        ch.appendLine(
          `Found ${allTables.length} table(s) in ${files.length} file(s).`,
        );
        for (const t of allTables) {
          ch.appendLine(formatTableSection(t));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ch.appendLine(`Scan failed: ${msg}`);
      }
    },
  );

  if (openOutput) {
    ch.show(true);
  }
}
