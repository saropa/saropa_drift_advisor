/**
 * Load diagnostic configuration from VS Code settings.
 */

import * as vscode from 'vscode';
import { DEFAULT_DIAGNOSTIC_CONFIG } from './diagnostic-defaults';
import type { DiagnosticCategory } from './diagnostic-code-types';
import type { IColumnNameExclusionSet, IColumnNameGlobPattern } from './diagnostic-issue-types';
import type { IDiagnosticConfig } from './diagnostic-context-types';

/**
 * Compile a `columnNameExclusions` glob entry (e.g. `*_at`, `created*`,
 * `*mid*`) into a plain prefix/suffix/contains match — deliberately NOT a
 * regex. Only a single leading and/or trailing `*` is meaningful; the string
 * is matched with `startsWith`/`endsWith`/`includes`, which is linear-time
 * with no backtracking, so an arbitrary user-authored pattern (settings.json
 * can be workspace-shared or pasted from elsewhere) can never hang the
 * extension host the way a naively-translated multi-wildcard regex can. A
 * `*` anywhere in the interior (not leading/trailing) falls back to `inert`
 * — it never matches a real column name — rather than silently changing
 * meaning or reintroducing backtracking risk to support it.
 */
function compileColumnNameGlob(pattern: string): IColumnNameGlobPattern {
  const lower = pattern.toLowerCase();
  const leading = lower.startsWith('*');
  // Guard length > 1 so a lone "*" (leading and "trailing" the same char)
  // is treated as leading-only, matching everything via suffix('').
  const trailing = lower.endsWith('*') && lower.length > 1;
  const core = lower.slice(leading ? 1 : 0, trailing ? -1 : undefined);

  if (core.includes('*')) {
    return { kind: 'inert', text: lower };
  }
  if (leading && trailing) {
    return { kind: 'contains', text: core };
  }
  if (leading) {
    return { kind: 'suffix', text: core };
  }
  if (trailing) {
    return { kind: 'prefix', text: core };
  }
  // No leading/trailing '*' but the caller only invokes this when the raw
  // pattern contains '*' somewhere — an interior-only wildcard.
  return { kind: 'inert', text: lower };
}

function parseSeverity(sev: string): vscode.DiagnosticSeverity {
  switch (sev.toLowerCase()) {
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    case 'information':
    case 'info':
      return vscode.DiagnosticSeverity.Information;
    case 'hint':
      return vscode.DiagnosticSeverity.Hint;
    default:
      return vscode.DiagnosticSeverity.Warning;
  }
}

/**
 * Read driftViewer.diagnostics configuration and return a resolved config object.
 */
export function loadDiagnosticConfig(): IDiagnosticConfig {
  const cfg = vscode.workspace.getConfiguration('driftViewer.diagnostics');

  const categories: Record<DiagnosticCategory, boolean> = {
    schema: cfg.get('categories.schema', DEFAULT_DIAGNOSTIC_CONFIG.categories.schema),
    performance: cfg.get('categories.performance', DEFAULT_DIAGNOSTIC_CONFIG.categories.performance),
    dataQuality: cfg.get('categories.dataQuality', DEFAULT_DIAGNOSTIC_CONFIG.categories.dataQuality),
    bestPractices: cfg.get('categories.bestPractices', DEFAULT_DIAGNOSTIC_CONFIG.categories.bestPractices),
    naming: cfg.get('categories.naming', DEFAULT_DIAGNOSTIC_CONFIG.categories.naming),
    runtime: cfg.get('categories.runtime', DEFAULT_DIAGNOSTIC_CONFIG.categories.runtime),
    compliance: cfg.get('categories.compliance', DEFAULT_DIAGNOSTIC_CONFIG.categories.compliance),
  };

  const severityOverrides: Record<string, vscode.DiagnosticSeverity> = {};
  const overridesRaw = cfg.get<Record<string, string>>('severityOverrides', {});
  for (const [code, sev] of Object.entries(overridesRaw)) {
    severityOverrides[code] = parseSeverity(sev);
  }

  const disabledRulesArray = cfg.get<string[]>('disabledRules', []);
  const disabledRules = new Set(disabledRulesArray);

  // Per-table exclusions: { "no-foreign-keys": ["users", "static_data"], ... }
  // Lets users suppress a rule on specific tables while keeping it active elsewhere.
  const exclusionsRaw = cfg.get<Record<string, string[]>>('tableExclusions', {});
  const tableExclusions = new Map<string, Set<string>>();
  for (const [code, tables] of Object.entries(exclusionsRaw)) {
    if (Array.isArray(tables) && tables.length > 0) {
      tableExclusions.set(code, new Set(tables));
    }
  }

  // Per-column exclusions: { "high-null-rate": ["users.middle_name"], ... }
  // Finer than tableExclusions — suppresses a rule on a single `table.column`
  // (e.g. a column expected to be mostly NULL) without silencing the table.
  const columnExclusionsRaw = cfg.get<Record<string, string[]>>('columnExclusions', {});
  const columnExclusions = new Map<string, Set<string>>();
  for (const [code, columns] of Object.entries(columnExclusionsRaw)) {
    if (Array.isArray(columns) && columns.length > 0) {
      columnExclusions.set(code, new Set(columns));
    }
  }

  // Column-name-only exclusions: { "high-null-rate": ["lastModified", "*_at"], ... }
  // Matches a bare column name — or a `*`-glob pattern — across every table,
  // so a nullable-by-design column recurring across the schema (e.g.
  // lastModified, or every *_at timestamp) doesn't need a `table.column`
  // entry per table in columnExclusions. Entries with no `*` go into `exact`
  // for an O(1) lookup; entries with `*` are compiled once here so the
  // per-issue suppression check never re-parses a pattern.
  const columnNameExclusionsRaw = cfg.get<Record<string, string[]>>('columnNameExclusions', {});
  const columnNameExclusions = new Map<string, IColumnNameExclusionSet>();
  for (const [code, columns] of Object.entries(columnNameExclusionsRaw)) {
    if (!Array.isArray(columns) || columns.length === 0) {
      continue;
    }
    const exact = new Set<string>();
    const patterns: IColumnNameGlobPattern[] = [];
    for (const column of columns) {
      if (column.includes('*')) {
        patterns.push(compileColumnNameGlob(column));
      } else {
        exact.add(column.toLowerCase());
      }
    }
    columnNameExclusions.set(code, { exact, patterns });
  }

  // Tables whose live debug rows are unrepresentative (user/demo data or
  // partially-loaded static reference tables). Null-rate / unused-column
  // analysis is skipped for these — a null rate measured on a partial table is
  // meaningless. One flat list instead of repeating each table under both the
  // `high-null-rate` and `unused-column` keys of tableExclusions.
  const userDataTables = new Set(cfg.get<string[]>('userDataTables', []));

  return {
    enabled: cfg.get('enabled', DEFAULT_DIAGNOSTIC_CONFIG.enabled),
    refreshOnSave: cfg.get('refreshOnSave', DEFAULT_DIAGNOSTIC_CONFIG.refreshOnSave),
    refreshIntervalMs: cfg.get('refreshIntervalMs', DEFAULT_DIAGNOSTIC_CONFIG.refreshIntervalMs),
    categories,
    severityOverrides,
    disabledRules,
    tableExclusions,
    columnExclusions,
    columnNameExclusions,
    userDataTables,
  };
}
