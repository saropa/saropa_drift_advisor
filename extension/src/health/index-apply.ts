/**
 * Implements `driftViewer.createAllIndexes` (bug 001).
 *
 * The command used to post CREATE INDEX SQL straight to `POST /api/sql`,
 * which `SqlValidator.isReadOnlySql` rejects for anything but SELECT/WITH —
 * so every index failed, silently, behind a bare `catch`. This wires the
 * command to the same endpoints the browser viewer already uses
 * (`POST /api/indexes/preview`, `POST /api/indexes/apply`,
 * `lib/src/server/index_batch_handler.dart`) and adds a before/after
 * EXPLAIN QUERY PLAN comparison per index.
 *
 * Timing note: the proposal (bugs/001) asks for measured wall-clock
 * before/after too. That is deliberately NOT done here — the only
 * representative query available is `column = 1` on a suggestion that, by
 * definition, has no index yet, so timing it for real would force a
 * potentially full-table scan per suggestion on the user's live database
 * (exactly the case where the table is largest). `EXPLAIN QUERY PLAN` never
 * executes the query, so comparing its plan (SCAN vs SEARCH) is bounded-cost
 * and safe to run unconditionally; wall-clock timing is left to the
 * dedicated query-cost/explain panels where the user supplies a real query.
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { IndexSuggestion } from '../api-types';

/** Mirrors `IndexBatchHandler.maxIndexes` server-side; chunk requests to stay under it. */
const INDEX_APPLY_CHUNK_SIZE = 200;

let _indexApplyOutput: vscode.OutputChannel | undefined;

/** Shared, lazily-created output channel so repeated runs append rather than spawn channels. */
function outputChannel(): vscode.OutputChannel {
  _indexApplyOutput ??= vscode.window.createOutputChannel('Saropa Drift Advisor: Index Apply');
  return _indexApplyOutput;
}

/** Splits `items` into chunks of at most `size`, preserving order. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Best-effort EXPLAIN QUERY PLAN line for one suggestion's table/column.
 * Returns `undefined` on any failure (e.g. server can't explain, table
 * renamed mid-flow) rather than throwing — a missing plan line degrades the
 * report, it must not abort the apply.
 */
async function planLine(
  client: DriftApiClient,
  idx: IndexSuggestion,
): Promise<string | undefined> {
  try {
    // LIMIT 1 keeps this bounded even without an index: SQLite can stop the
    // scan at the first match (or after a full scan if there is none), but
    // it never materializes more than one row.
    const probe = `SELECT 1 FROM "${idx.table}" WHERE "${idx.column}" = 1 LIMIT 1`;
    const { rows } = await client.explainSql(probe);
    const detail = rows.map((r) => String(r['detail'] ?? '')).filter(Boolean).join(' | ');
    return detail.length > 0 ? detail : undefined;
  } catch {
    return undefined;
  }
}

/** One index's full before/apply/after story, for the output-channel report. */
interface IIndexOutcome {
  sql: string;
  before?: string;
  ok: boolean;
  /** Rejection (preview) or per-index apply error, verbatim from the server. */
  error?: string;
  after?: string;
}

/**
 * Runs the full preview -> confirm -> apply flow for `indexes` and reports
 * the outcome. Exported separately from the command registration
 * (health-commands.ts) to keep that file under the 300-line cap.
 */
export async function createAllIndexesCommand(
  client: DriftApiClient,
  indexes: IndexSuggestion[],
): Promise<void> {
  if (indexes.length === 0) {
    vscode.window.showInformationMessage('No missing indexes to create.');
    return;
  }

  // sql -> suggestion, so results (keyed by sql) can recover table/column for
  // the EXPLAIN probe without re-parsing the CREATE INDEX statement.
  const bySql = new Map(indexes.map((idx) => [idx.sql, idx]));

  // 1. Preview first (works even on read-only servers) so the confirm dialog
  // and the report reflect what the server will actually accept, instead of
  // guessing from client-side validation.
  const valid: string[] = [];
  const rejected: { sql: string; reason: string }[] = [];
  try {
    for (const batch of chunk(indexes, INDEX_APPLY_CHUNK_SIZE)) {
      const preview = await client.indexPreview(batch.map((idx) => idx.sql));
      valid.push(...preview.valid);
      rejected.push(...preview.rejected.map((r) => ({ sql: r.sql, reason: r.reason })));
    }
  } catch (err: unknown) {
    // The bug this fixes was a bare `catch` that swallowed exactly this kind
    // of failure (e.g. server too old to have /api/indexes/preview, or a
    // network error) — surface it instead.
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Index preview failed: ${msg}`);
    return;
  }

  if (valid.length === 0) {
    const reasons = rejected.map((r) => `"${r.sql}": ${r.reason}`).join('; ');
    vscode.window.showErrorMessage(
      `No indexes could be validated${reasons ? ` — ${reasons}` : '.'}`,
    );
    return;
  }

  const confirmMsg = rejected.length > 0
    ? `Create ${valid.length} index(es)? (${rejected.length} rejected — see confirmation details.) This will modify your database.`
    : `Create ${valid.length} index(es)? This will modify your database.`;
  const confirm = await vscode.window.showWarningMessage(
    confirmMsg,
    { modal: true, detail: rejected.map((r) => `${r.sql}\n  ${r.reason}`).join('\n\n') },
    'Create Indexes',
  );
  if (confirm !== 'Create Indexes') return;

  // 2. Baseline EXPLAIN QUERY PLAN, best-effort, before any index exists.
  // Run in parallel — each probe hits a different table/column and planLine
  // already swallows its own errors, so concurrent requests are safe and cut
  // N-1 round-trip latencies from the command's total wall-clock time.
  const baselineEntries = await Promise.all(
    valid.map(async (sql) => {
      const idx = bySql.get(sql);
      const plan = idx ? await planLine(client, idx) : undefined;
      return [sql, plan] as const;
    }),
  );
  const before = new Map(baselineEntries);

  // 3. Apply. `handleApply` is best-effort per statement (not one
  // transaction), so a single bad statement cannot hide the ones that
  // succeeded — mirror that here by always reading the per-index results
  // array rather than treating the whole call as pass/fail.
  const outcomes = new Map<string, IIndexOutcome>();
  for (const [sql, reason] of rejected.map((r) => [r.sql, r.reason] as const)) {
    outcomes.set(sql, { sql, ok: false, error: reason });
  }
  try {
    for (const batch of chunk(valid, INDEX_APPLY_CHUNK_SIZE)) {
      const applyResult = await client.indexApply(batch);
      for (const r of applyResult.results) {
        outcomes.set(r.sql, { sql: r.sql, before: before.get(r.sql), ok: r.ok, error: r.error });
      }
    }
  } catch (err: unknown) {
    // e.g. writeQuery not configured (501) — the whole apply call throws
    // before any per-index result exists. Surface it plainly rather than
    // reporting "0 created" with no explanation.
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Index apply failed: ${msg}`);
    return;
  }

  // 4. Verify: re-run EXPLAIN QUERY PLAN for every index that actually
  // applied, so the report shows whether the plan really changed (SCAN ->
  // SEARCH) rather than assuming success implies a better plan.
  // Fetch all post-apply plans in parallel — same rationale as baseline above.
  const successSqls = valid.filter((sql) => outcomes.get(sql)?.ok);
  const afterEntries = await Promise.all(
    successSqls.map(async (sql) => {
      const idx = bySql.get(sql);
      const plan = idx ? await planLine(client, idx) : undefined;
      return [sql, plan] as const;
    }),
  );
  const afterPlans = new Map(afterEntries);

  let created = 0;
  let failed = 0;
  const lines: string[] = [];
  for (const sql of valid) {
    const outcome = outcomes.get(sql);
    if (!outcome) continue; // Should not happen; apply reports every requested sql.
    if (outcome.ok) {
      created++;
      const after = afterPlans.get(sql);
      const beforeText = outcome.before ?? '(plan unavailable)';
      const afterText = after ?? '(plan unavailable)';
      const changed = outcome.before !== undefined && after !== undefined && outcome.before !== after;
      lines.push(`OK  ${sql}\n    ${beforeText} -> ${afterText}${changed ? '  (plan changed)' : ''}`);
    } else {
      failed++;
      lines.push(`FAIL  ${sql}\n    ${outcome.error ?? '(no reason given)'}`);
    }
  }
  for (const r of rejected) {
    failed++;
    lines.push(`REJECTED  ${r.sql}\n    ${r.reason}`);
  }

  const channel = outputChannel();
  channel.appendLine(`--- createAllIndexes: ${new Date().toISOString()} ---`);
  channel.appendLine(lines.join('\n'));
  channel.show(true);

  vscode.window.showInformationMessage(
    `Created ${created} index(es)${failed > 0 ? `, ${failed} failed` : ''}. See "Saropa Drift Advisor: Index Apply" output for details.`,
  );
}
