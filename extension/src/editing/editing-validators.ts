/**
 * Guards for editing-webview messages: well-formed message detection, single-PK
 * row identity, and the single-PK schema guard. Extracted from editing-bridge.ts
 * so the validation rules are testable independently of the webview plumbing.
 */

import type { TableMetadata } from '../api-types';
import type { EditMessage } from './editing-message-types';

/**
 * Validates that webview messages include the single PK column identity required
 * by the current pending-change model (`pkColumn` + `pkValue`).
 */
export function hasValidPkColumn(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Ensures the target table has exactly one PK column in schema metadata.
 *
 * The current edit message protocol stores row identity as singular
 * `pkColumn`/`pkValue`, so composite PK tables must be rejected.
 */
export function getSinglePkGuardReason(
  tables: TableMetadata[],
  tableName: string,
): string | undefined {
  const table = tables.find((t) => t.name === tableName);
  if (!table) {
    return `Edit rejected: table "${tableName}" was not found in schema metadata.`;
  }
  const pkCount = table.columns.filter((c) => c.pk).length;
  if (pkCount === 0) {
    return `Edit rejected: table "${tableName}" has no primary key column.`;
  }
  if (pkCount > 1) {
    return `Edit rejected: table "${tableName}" has a composite primary key, which is not yet supported in inline editing.`;
  }
  return undefined;
}

export function isEditMessage(msg: unknown): msg is EditMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const cmd = (msg as Record<string, unknown>).command;
  return (
    cmd === 'cellEdit' || cmd === 'rowDelete' || cmd === 'rowInsert' ||
    cmd === 'undo' || cmd === 'redo' || cmd === 'discardAll'
  );
}
