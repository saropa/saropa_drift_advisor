/**
 * Saropa suite integration — the Drift Health join model (plan 67 R4 / §5).
 *
 * Joins the three lenses on a Drift database — Advisor's live runtime issues,
 * Saropa Lints' static findings, and Saropa Log Capture's runtime signals —
 * keyed on the table each concerns, so a developer sees the static rule, the
 * runtime data problem, and the production symptom for one table in one place.
 *
 * Pure data shaping only (no I/O, no vscode): the panel fetches the inputs and
 * renders the output, this module just merges them. Exported for direct testing.
 */
import type { SuiteDiagnostic } from './suite-diagnostics';

/** All findings that concern one table, split by the tool that produced them. */
export interface DriftHealthTable {
  table: string;
  advisor: SuiteDiagnostic[];
  lints: SuiteDiagnostic[];
  logCapture: SuiteDiagnostic[];
  /** Total findings across all three tools for this table (sort key). */
  total: number;
}

/** The merged model rendered by the Drift Health panel. */
export interface DriftHealthModel {
  /** Per-table groups, most findings first. */
  tables: DriftHealthTable[];
  /** Findings with no table (query-level signals, project-wide lint rules). */
  untabled: SuiteDiagnostic[];
  /** Total findings across every group (header count). */
  totalIssues: number;
}

/** Routes a diagnostic to its tool bucket from the (relabeled) `source` token. */
function bucketOf(d: SuiteDiagnostic): 'advisor' | 'lints' | 'logCapture' | null {
  switch (d.source) {
    case 'advisor': return 'advisor';
    case 'lints': return 'lints';
    case 'log-capture': return 'logCapture';
    default: return null; // unknown producer — not shown in the three-tool view
  }
}

/**
 * Builds the Drift Health model from the three tools' diagnostics (already
 * source-tagged: advisor's via diagnosticsFromEnvelope(..., 'advisor', true),
 * the siblings' via readSiblingDiagnostics).
 *
 * Grouping key is the lowercased table name (a finding's own casing is kept for
 * display, first-seen wins). Tables are sorted by total findings descending,
 * then by name for a stable order; ties never reorder between renders.
 */
export function buildDriftHealth(
  diagnostics: ReadonlyArray<SuiteDiagnostic>,
): DriftHealthModel {
  const byTable = new Map<string, DriftHealthTable>();
  const untabled: SuiteDiagnostic[] = [];
  let totalIssues = 0;

  for (const d of diagnostics) {
    const bucket = bucketOf(d);
    if (!bucket) continue;
    totalIssues++;

    const table = d.table?.trim();
    if (!table) {
      untabled.push(d);
      continue;
    }

    const key = table.toLowerCase();
    let group = byTable.get(key);
    if (!group) {
      group = { table, advisor: [], lints: [], logCapture: [], total: 0 };
      byTable.set(key, group);
    }
    group[bucket].push(d);
    group.total++;
  }

  const tables = [...byTable.values()].sort(
    (a, b) => b.total - a.total || a.table.localeCompare(b.table),
  );
  return { tables, untabled, totalIssues };
}

/** Flat counts across the whole join — per-tool and per-severity. */
export interface SuiteFindingsSummary {
  /** Total findings from known producers (the model's totalIssues). */
  total: number;
  /** Number of distinct tables carrying at least one finding. */
  tables: number;
  advisor: number;
  lints: number;
  logCapture: number;
  errors: number;
  warnings: number;
}

/**
 * Reduces a built Drift Health model to flat per-tool / per-severity counts.
 * The single source of truth for "how the suite counts findings": both the
 * Suite Findings dashboard widget and the commit timeline use it, so a count
 * shown in one surface can never disagree with another. Counts only known
 * producers (buildDriftHealth already dropped the rest), so it matches the
 * per-table view exactly.
 */
export function summarizeDriftHealth(model: DriftHealthModel): SuiteFindingsSummary {
  let advisor = 0;
  let lints = 0;
  let logCapture = 0;
  let errors = 0;
  let warnings = 0;
  const tally = (d: SuiteDiagnostic): void => {
    if (d.severity === 'error') errors++;
    else if (d.severity === 'warning') warnings++;
  };
  for (const g of model.tables) {
    advisor += g.advisor.length;
    lints += g.lints.length;
    logCapture += g.logCapture.length;
    g.advisor.forEach(tally);
    g.lints.forEach(tally);
    g.logCapture.forEach(tally);
  }
  // Untabled findings still count toward tool totals and severities; they just
  // have no table to group under (query-level signals, project-wide rules).
  for (const d of model.untabled) {
    if (d.source === 'advisor') advisor++;
    else if (d.source === 'lints') lints++;
    else if (d.source === 'log-capture') logCapture++;
    tally(d);
  }
  return {
    total: model.totalIssues,
    tables: model.tables.length,
    advisor,
    lints,
    logCapture,
    errors,
    warnings,
  };
}
