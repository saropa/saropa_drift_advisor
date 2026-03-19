/**
 * Mutation Stream filtering helpers.
 *
 * Kept as pure functions so they are unit-testable and independent
 * from VS Code/Vite webview lifecycles.
 */

import type { MutationEvent } from '../api-types';

/**
 * Stringify values for heuristic text matching.
 *
 * The goal is to avoid JS's default `[object Object]` stringification,
 * so user-provided search terms can actually match values.
 */
export function stringifyForMatch(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (
    typeof v === 'number'
    || typeof v === 'boolean'
    || typeof v === 'bigint'
  ) {
    return String(v);
  }
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return '[unserializable]';
    }
  }
  if (typeof v === 'function') return '[function]';
  if (typeof v === 'symbol') return v.toString();
  // Should be unreachable (all relevant primitives handled above).
  return '[unhandled]';
}

/**
 * Match an event against the free-text query.
 * Matches against table/type/sql and JSON snapshots.
 */
export function matchesSearch(event: MutationEvent, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    event.table,
    event.type,
    event.sql,
    event.before ? JSON.stringify(event.before) : '',
    event.after ? JSON.stringify(event.after) : '',
  ].join(' ').toLowerCase();
  return hay.includes(q);
}

/**
 * Match a single event by column value.
 *
 * "Both" behavior (recommended UX): matches against both `before` and `after`
 * row snapshots for the UPDATE case (and for INSERT/DELETE where one side
 * may be missing).
 *
 * Matching strategy:
 * - exact equals first
 * - then substring contains (case-insensitive) as a fallback
 */
export function matchesColumnValue(
  event: MutationEvent,
  column: string,
  value: string,
): boolean {
  const q = value.trim().toLowerCase();
  if (!q) return true;
  if (!column) return false;

  const candidates = [
    ...(event.before ?? []),
    ...(event.after ?? []),
  ];

  for (const row of candidates) {
    if (!row) continue;
    const raw = row[column];
    if (raw === undefined) continue;
    const s = stringifyForMatch(raw).toLowerCase();
    if (!s) continue;
    if (s === q) return true;
    if (s.includes(q)) return true;
  }

  return false;
}

