/** Shared utility functions used across multiple extension features. */

/**
 * True when [host] points at the local machine (loopback). The Bearer auth
 * token must only ever be sent to a loopback host: `driftViewer.host` is
 * free-form workspace config, so a cloned repo's `.vscode/settings.json` can
 * redirect every request — and the token — to an attacker-chosen address the
 * moment the workspace opens. Anything not on this list is treated as remote.
 * See plans/full-codebase-audit-2026.06.12.md H4.
 */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return (
    h === 'localhost' ||
    h === '::1' ||
    h === '0:0:0:0:0:0:0:1' ||
    h.startsWith('127.') // entire 127.0.0.0/8 loopback block (incl. 127.0.0.1)
  );
}

/** Quote a SQL identifier (table or column name). */
export function q(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * Serialize [value] for safe embedding inside an inline `<script>` block.
 * Plain `JSON.stringify` does NOT escape `</script>`, so a DB-derived string
 * containing `</script>` would terminate the script element and inject markup.
 * Escaping `<`, `>`, `&` to `\uXXXX` keeps the JSON valid JS while making a
 * `</script>` (or `<!--`) breakout impossible.
 * See plans/full-codebase-audit-2026.06.12.md C2.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Escape [value] for use as a single-quoted JS string literal that itself sits
 * inside a double-quoted HTML attribute (e.g. `onclick="f('${attrJsString(x)}')"`).
 * The browser HTML-decodes the attribute first, then parses the JS, so the
 * value must survive BOTH contexts: backslash/quote/newline are JS-escaped, and
 * `& " < >` are HTML-entity-escaped so a raw `"` can't close the attribute.
 * Prefer data-* attributes + delegated listeners where possible; this exists for
 * the inline-handler sites that still need it. See audit C2.
 */
export function attrJsString(value: unknown): string {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Zip column names with a row array into a keyed object. */
export function zipRow(
  columns: string[], row: unknown[],
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]] = row[i];
  }
  return obj;
}

/** Escape a value for CSV output (RFC 4180 quoting). */
export function escapeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

/**
 * A compact, unique-enough id for in-memory / persisted-state records
 * (annotations, saved filters, query-builder nodes). Timestamp + random suffix;
 * an optional [prefix] tags the kind (e.g. `tbl`, `flt`, `join`). Consolidates
 * three near-identical local copies (audit L7). Ids are opaque — only compared
 * for equality, never parsed — so the format is free to be uniform.
 */
export function makeId(prefix?: string): string {
  const core = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return prefix ? `${prefix}_${core}` : core;
}
