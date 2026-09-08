import type { IDiagnosticConfig } from './diagnostic-context-types';

/** Default configuration values. */
export const DEFAULT_DIAGNOSTIC_CONFIG: IDiagnosticConfig = {
  enabled: true,
  refreshOnSave: true,
  refreshIntervalMs: 30000,
  categories: {
    schema: true,
    performance: true,
    dataQuality: true,
    bestPractices: true,
    naming: false,
    runtime: true,
    compliance: true,
  },
  severityOverrides: {},
  disabledRules: new Set(),
  tableExclusions: new Map(),
  columnExclusions: new Map(),
  columnNameExclusions: new Map(),
  userDataTables: new Set(),
};

/** Prefix added to all diagnostic messages for filtering. */
export const DIAGNOSTIC_PREFIX = '[drift_advisor]';

/** Value used for `diag.source` on every diagnostic we emit. */
export const DIAGNOSTIC_SOURCE = 'Drift Advisor';

/** Name of the diagnostic collection in VS Code. */
export const DIAGNOSTIC_COLLECTION_NAME = 'drift-advisor';
