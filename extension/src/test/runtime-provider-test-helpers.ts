/**
 * Shared test helpers for RuntimeProvider test suites.
 *
 * Contains the `createContext` factory and pubspec constant strings
 * used across both `runtime-provider.test.ts` and
 * `runtime-provider-actions.test.ts`.  Extracted so that each test
 * file stays comfortably under 300 lines.
 */

import type { IDiagnosticContext } from '../diagnostics/diagnostic-types';

// ───────────────────────────────────────────────────────────
// Pubspec fixture strings
// ───────────────────────────────────────────────────────────

/** Minimal pubspec.yaml content that declares `drift` as a dependency. */
export const PUBSPEC_WITH_DRIFT = `
name: my_app
dependencies:
  drift: ^2.0.0
  flutter:
    sdk: flutter
`;

/** Pubspec that does NOT list drift (only drift_dev in dev_dependencies). */
export const PUBSPEC_WITHOUT_DRIFT = `
name: my_app
dependencies:
  flutter:
    sdk: flutter
dev_dependencies:
  drift_dev: ^2.0.0
`;

// ───────────────────────────────────────────────────────────
// Context factory
// ───────────────────────────────────────────────────────────

/**
 * Builds a minimal `IDiagnosticContext` suitable for RuntimeProvider tests.
 *
 * The returned context has all diagnostic categories enabled, an empty
 * dart-files list, and a mock client whose `generation` and
 * `schemaMetadata` methods can be individually overridden via
 * `clientOverrides`.
 *
 * @param clientOverrides - Optional partial bag to replace the default
 *   client methods (e.g. make `generation()` reject to simulate a
 *   connection failure).
 */
export function createContext(clientOverrides?: Partial<{
  generation: () => Promise<number>;
}>): IDiagnosticContext {
  // Build a mock API client with sensible defaults and optional overrides.
  const client = {
    generation: clientOverrides?.generation ?? (() => Promise.resolve(1)),
    schemaMetadata: () => Promise.resolve([]),
  } as any;

  return {
    client,
    schemaIntel: {} as any,
    queryIntel: {} as any,
    dartFiles: [],
    config: {
      enabled: true,
      refreshOnSave: true,
      refreshIntervalMs: 30000,
      categories: {
        schema: true,
        performance: true,
        dataQuality: true,
        bestPractices: true,
        naming: true,
        runtime: true,
        compliance: true,
      },
      severityOverrides: {},
      disabledRules: new Set(),
    },
  };
}
