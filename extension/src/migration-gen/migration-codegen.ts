/**
 * Barrel re-export for migration codegen. Split into focused modules:
 * types, diff-to-actions conversion, and Dart source generation.
 */

export { IMigrationAction, IColumnDef } from './migration-codegen-types';
export { diffToActions } from './migration-diff-to-actions';
export { generateMigrationDart } from './migration-dart-generator';
