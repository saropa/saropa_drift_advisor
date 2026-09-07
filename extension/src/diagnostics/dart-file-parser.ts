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
import { parseInlineSuppressions } from './suppression';

/**
 * Matches raw-SQL call sites that need column validation even when no table
 * class is defined in the file. Without this, DAO/repository files — the
 * standard location for raw SQL in Drift projects — are silently skipped.
 * See BUG_RAW_SQL_UNKNOWN_COLUMN_FALSE_NEGATIVE_FILES_WITHOUT_TABLES.md.
 */
export const RAW_SQL_CALL = /\b(?:customSelect|customStatement)\s*\(/;

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
export async function workspaceUsesDrift(): Promise<boolean> {
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
 * Read the `store_date_time_values_as_text` flag from the workspace's
 * `build.yaml`. Drift reads this from two builder key forms:
 *   - `drift_dev` (short form)
 *   - `drift_dev|drift_dev` (fully-qualified form)
 * Returns `true` when the option is explicitly enabled, `false` when it
 * is explicitly disabled or absent, and `undefined` when `build.yaml`
 * is missing or unparseable (so callers can accept either type rather
 * than guessing wrong).
 */
export async function readDateTimeAsText(): Promise<boolean | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return undefined;

  const buildUri = vscode.Uri.joinPath(folders[0].uri, 'build.yaml');
  let content: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(buildUri);
    content = Buffer.from(bytes).toString('utf-8');
  } catch {
    // build.yaml missing or unreadable — caller will accept either type
    return undefined;
  }

  try {
    return parseDateTimeAsText(content);
  } catch {
    // Malformed YAML — treat as absent so we don't false-positive
    return undefined;
  }
}

/**
 * Extract `store_date_time_values_as_text` from parsed build.yaml text.
 * Handles both `drift_dev` and `drift_dev|drift_dev` builder key forms.
 * Exported for unit testing without filesystem access.
 */
export function parseDateTimeAsText(buildYamlContent: string): boolean {
  // Simple regex-based extraction to avoid adding a YAML parser dependency.
  // Drift's build.yaml is structured enough that the option value always
  // follows its key on the same line or the next.
  // Reject lines that start with a YAML comment — a commented-out
  // `# store_date_time_values_as_text: true` must not activate the flag.
  // Match only lines where the key is NOT preceded by a `#` comment marker.
  const pattern = /^[^#\n]*store_date_time_values_as_text\s*:\s*(true|false)/m;
  const match = pattern.exec(buildYamlContent);
  // When the key is absent the Drift default is false (INTEGER storage)
  return match ? match[1] === 'true' : false;
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

      // Include files that define table classes (for schema checks) OR
      // contain raw-SQL calls like customSelect/customStatement (for
      // column-name validation). Without the raw-SQL arm, DAO/repository
      // files — the standard location for raw SQL — are never scanned.
      // Table-scoped checkers iterate file.tables, so a file with zero
      // tables contributes nothing to them and needs no further guarding.
      if (tables.length > 0 || RAW_SQL_CALL.test(text)) {
        files.push({
          uri,
          text,
          tables,
          suppressions: parseInlineSuppressions(text),
        });
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return files;
}
