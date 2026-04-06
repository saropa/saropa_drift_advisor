/**
 * Resolves caller location from QueryEntry data provided by the
 * Dart server. When the server captures a stack trace at query
 * time it populates callerFile / callerLine on the timing record.
 *
 * This lets runtime diagnostics (slow-query, N+1) point at the
 * Dart call site that issued the query, rather than the table
 * definition file — which the developer cannot change to fix a
 * runtime access pattern.
 */

import * as vscode from 'vscode';
import type { QueryEntry } from '../../api-types';

/** Resolved caller location ready for diagnostic placement. */
export interface CallerLocation {
  uri: vscode.Uri;
  line: number;
}

/**
 * Extracts a usable diagnostic location from a query's caller
 * fields. Returns null when the server did not provide caller
 * info (e.g. release builds, obfuscated code, or older server
 * versions that predate this feature).
 */
export function resolveCallerLocation(
  query: QueryEntry | undefined,
): CallerLocation | null {
  if (!query?.callerFile || query.callerLine == null) {
    return null;
  }

  // The server sends either a package: URI or a file: URI.
  // vscode.Uri.parse handles both correctly.
  const uri = vscode.Uri.parse(query.callerFile);

  // callerLine from the server is 1-based (Dart convention);
  // VS Code Range is 0-based, so subtract 1.
  const line = Math.max(0, query.callerLine - 1);

  return { uri, line };
}
