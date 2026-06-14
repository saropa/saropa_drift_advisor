/**
 * HTML formatting for the DVR selection-detail pane: escape and render a
 * recorded query's params/before/after/meta as a clipped <pre> block. Extracted
 * from dvr-panel.ts so the panel keeps only state and message routing.
 */

import { escapeHtml } from '../shared-utils';
import type { IRecordedQueryV1 } from '../api-types';

// Re-exported from the single canonical escaper (audit L5) so existing
// importers of this module are unaffected.
export { escapeHtml };

/** Cap detail JSON so a huge before/after state can't bloat the webview. */
const DETAIL_JSON_MAX = 12_000;

/** Render the detail pane HTML for one recorded query. */
export function buildDetailHtml(q: IRecordedQueryV1): string {
  const chunk = JSON.stringify(
    {
      params: q.params,
      beforeState: q.beforeState,
      afterState: q.afterState,
      meta: q.meta,
    },
    null,
    2,
  );
  const clipped = chunk.length > DETAIL_JSON_MAX ? `${chunk.slice(0, DETAIL_JSON_MAX)}…` : chunk;
  return `<pre>${escapeHtml(clipped)}</pre>`;
}
