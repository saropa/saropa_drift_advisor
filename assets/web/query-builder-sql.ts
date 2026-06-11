/**
 * SQL rendering and validation for the web multi-table query builder.
 *
 * Re-exports the shared, self-contained implementation from the extension's
 * [query-builder-core] so the website and the VS Code Visual Query Builder render
 * and validate from ONE source of truth (Feature 21, Phase 1). esbuild bundles
 * the core module into the web build; the file imports nothing, so it does not
 * drag `api-client`/`vscode` into the web graph.
 */
export {
  renderQuerySql,
  validateQueryModel,
} from '../../extension/src/query-builder/query-builder-core.ts';
export { getWhereOpsForType } from '../../extension/src/query-builder/query-builder-core-ops.ts';
