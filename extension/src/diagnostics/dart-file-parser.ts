/**
 * Dart file discovery and parsing for diagnostic context.
 * Finds *.dart files in the workspace and extracts table definitions.
 *
 * Skips scanning entirely when the workspace is not a Drift project
 * (neither `drift` nor `saropa_drift_advisor` appears in pubspec.yaml).
 */

import * as vscode from 'vscode';
import { parseDartTables } from '../schema-diff/dart-parser';
import type { IDartFileInfo } from './diagnostic-types';

/**
 * Returns true when pubspec content declares `drift` or `saropa_drift_advisor`
 * anywhere (dependencies, dev_dependencies, dependency_overrides).
 * Used as a fast gate before the expensive workspace-wide Dart scan.
 */
export function isDriftProject(pubspecContent: string): boolean {
  return /\bdrift\s*:/.test(pubspecContent)
    || /\bsaropa_drift_advisor\s*:/.test(pubspecContent);
}

/**
 * Read the root pubspec.yaml and check whether this workspace uses Drift.
 * Returns false when the file is missing or unreadable.
 */
async function workspaceUsesDrift(): Promise<boolean> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return false;

  const pubspecUri = vscode.Uri.joinPath(folders[0].uri, 'pubspec.yaml');
  try {
    const bytes = await vscode.workspace.fs.readFile(pubspecUri);
    return isDriftProject(Buffer.from(bytes).toString('utf-8'));
  } catch {
    // pubspec.yaml missing or unreadable — not a Drift project
    return false;
  }
}

/**
 * Find all Dart files (excluding build/) and parse table definitions.
 * Used by DiagnosticManager to build context for providers.
 *
 * Returns an empty array immediately when the workspace does not declare
 * `drift` or `saropa_drift_advisor` in pubspec.yaml, avoiding false
 * positives in non-Drift projects.
 */
export async function parseDartFilesInWorkspace(): Promise<IDartFileInfo[]> {
  // Guard: skip the entire scan for workspaces that don't use Drift
  if (!(await workspaceUsesDrift())) {
    return [];
  }

  const dartUris = await vscode.workspace.findFiles(
    '**/*.dart',
    '**/build/**',
  );
  const files: IDartFileInfo[] = [];

  for (const uri of dartUris) {
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const text = doc.getText();
      const tables = parseDartTables(text, uri.toString());

      if (tables.length > 0) {
        files.push({ uri, text, tables });
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return files;
}
