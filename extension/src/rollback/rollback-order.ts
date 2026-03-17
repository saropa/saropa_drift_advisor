/**
 * Ordering of schema changes for rollback execution.
 * Reversals should be applied in the opposite order of the forward migration.
 */

import type { ISchemaChange } from '../schema-timeline/schema-timeline-types';

/**
 * Order changes for rollback execution.
 * 1. Drop added tables/columns first (reverse of create-then-alter)
 * 2. Recreate dropped columns/tables last (reverse of alter-then-drop)
 * Within each group, process by type priority then reverse array order.
 */
export function orderForRollback(
  changes: readonly ISchemaChange[],
): ISchemaChange[] {
  const priority: Record<string, number> = {
    table_added: 0,
    column_added: 1,
    column_type_changed: 2,
    fk_added: 3,
    fk_removed: 4,
    column_removed: 5,
    table_dropped: 6,
  };

  return [...changes].sort((a, b) => {
    const pa = priority[a.type] ?? 99;
    const pb = priority[b.type] ?? 99;
    return pa - pb;
  });
}
