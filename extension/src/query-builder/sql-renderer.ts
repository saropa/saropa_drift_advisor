/**
 * SQL rendering and validation for the visual query model.
 *
 * The implementation now lives in the self-contained [query-builder-core] module
 * so the extension and the debug web bundle share ONE renderer/validator instead
 * of hand-synced copies that could silently diverge (Feature 21, Phase 1). This
 * file stays as the extension's import surface — call sites keep importing
 * `renderQuerySql` / `validateQueryModel` / `sqlLiteral` from here, typed against
 * the strict [IQueryModel] (structurally assignable to the core's loose model).
 */
export { renderQuerySql, validateQueryModel, sqlLiteral } from './query-builder-core';
