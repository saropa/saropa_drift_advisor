/**
 * BLOB-safe column projection for full-table sampling/capture sweeps.
 *
 * Why this exists: the timeline snapshot, branch, and data-breakpoint sweeps
 * issue `SELECT * FROM "<t>"<order> LIMIT N` to read row content for diffing /
 * change detection. On a table with image/attachment BLOB columns, `SELECT *`
 * pulls every blob's raw bytes for up to N rows. The host serializes each blob
 * as a JSON array of integers (see lib/src/server/server_utils.dart:60), so the
 * host's Dart isolate materializes the full multi-KB..multi-MB payload of every
 * captured row into one response. On a host that runs Drift same-isolate (its
 * debug config) this exhausted the native heap and SIGABRT-crashed the connected
 * app — the sweep meant to inspect the DB killed the process inspecting it.
 * See plans/history/2026.06/2026.06.28/BUG_TIMELINE_CAPTURE_SELECT_STAR_BLOB_OOM.md.
 *
 * Change detection never needed the bytes. Projecting `length("col")` makes
 * SQLite compute a single integer on the host and return that instead of the
 * payload, so the bytes are never materialized or transferred. The result column
 * is aliased back to the original name so downstream code (rowsToObjects, the
 * diff, the column list) is unchanged — a BLOB cell simply reads as its byte
 * length rather than its bytes.
 *
 * Limitation: a blob edited to a different value of the SAME byte length is not
 * detected as changed. That is the accepted trade for never moving blob payloads
 * — SQLite has no built-in row hash, and `length()` catches the overwhelming
 * majority of real changes (add/remove/replace-with-different-size). It also does
 * NOT regress restore round-tripping: the int-array representation of a blob was
 * already non-restorable (sqlLiteral stringifies it to a comma-joined decimal),
 * so no faithful blob-restore path is lost here.
 */

import type { ColumnMetadata } from '../api-types';
import { quoteIdent } from './sampling-order';

/**
 * True when a declared column type has SQLite BLOB affinity. Matches the
 * substring "BLOB" case-insensitively, mirroring SQLite's own affinity rule
 * (any declared type containing "BLOB" gets BLOB affinity).
 */
function isBlobColumn(type: string): boolean {
  return type.toUpperCase().includes('BLOB');
}

/**
 * Builds the comma-separated SELECT projection for a capture read, replacing
 * each BLOB column with `length("col") AS "col"` and passing every other column
 * through verbatim. Falls back to `*` when no column metadata is available (e.g.
 * the table vanished between metadata and read), preserving prior behavior for
 * the no-info case.
 */
export function blobSafeSelectList(columns: readonly ColumnMetadata[]): string {
  if (columns.length === 0) return '*';
  return columns
    .map((c) => {
      const ident = quoteIdent(c.name);
      return isBlobColumn(c.type) ? `length(${ident}) AS ${ident}` : ident;
    })
    .join(', ');
}
