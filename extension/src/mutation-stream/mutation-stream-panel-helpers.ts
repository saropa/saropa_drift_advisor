/**
 * Helpers for mutation stream panel rendering concerns.
 */

import type { MutationEvent } from '../api-types';

/**
 * Builds the static HTML shown when mutation streaming is unavailable.
 *
 * This occurs for VM service mode because mutation capture depends on the
 * HTTP debug server's writeQuery wrapper.
 */
export function buildVmServiceUnavailableHtml(): string {
  return `
    <html><body style="padding:14px;font-family:var(--vscode-font-family,sans-serif);color:var(--vscode-editor-foreground,#ccc);background:var(--vscode-editor-background,#1e1e1e);">
      <h3 style="margin-top:0;">Mutation Stream unavailable</h3>
      <p style="opacity:0.8;">
        This feature requires the HTTP Drift debug server because mutation events are captured via the <code>writeQuery</code> wrapper.
      </p>
    </body></html>`;
}

/**
 * Resolves table options for the filter dropdown.
 *
 * Prefers schema metadata when available, and falls back to event-derived table
 * names so users can still filter in partial initialization scenarios.
 *
 * @param knownTables - Table names from schema metadata.
 * @param events - Buffered mutation events.
 * @returns Ordered table names for UI selection.
 */
export function resolveMutationFilterTables(
  knownTables: readonly string[],
  events: readonly MutationEvent[],
): string[] {
  if (knownTables.length > 0) return [...knownTables];
  return Array.from(new Set(events.map((e) => e.table)));
}
