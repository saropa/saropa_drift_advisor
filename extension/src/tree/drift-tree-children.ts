/**
 * Child resolution and decoration logic for the Database Explorer tree.
 * Extracted from drift-tree-provider to keep both files under the line cap.
 */
import type { DriftApiClient, TableMetadata } from '../api-client';
import type { AnnotationStore } from '../annotations/annotation-store';
import {
  ColumnItem,
  ConnectionStatusItem,
  DisconnectedBannerItem,
  ForeignKeyItem,
  PinnedGroupItem,
  SchemaRestFailureBannerItem,
  TableItem,
} from './tree-items';
import {
  ActionItem,
  getDisconnectedActions,
  getSchemaRestFailureActions,
} from './quick-action-items';

/** Union of all node types the Database Explorer tree can display. */
export type TreeNode =
  | ConnectionStatusItem
  | DisconnectedBannerItem
  | SchemaRestFailureBannerItem
  | PinnedGroupItem
  | ActionItem
  | TableItem
  | ColumnItem
  | ForeignKeyItem;

/** Snapshot of tree state needed by the child resolution functions. */
export interface TreeChildrenState {
  client: DriftApiClient;
  connected: boolean;
  offlineSchema: boolean;
  isDriftUiConnected: () => boolean;
  tableItems: TableItem[];
  annotationStore?: AnnotationStore;
}

/**
 * Resolve children for the given tree element.
 *
 * - **Root (no element):** status row + table items, or disconnected/REST-failure banners + actions.
 * - **TableItem:** column items + foreign key items (FK fetch may fail gracefully).
 * - **Other:** empty.
 */
export async function resolveChildren(
  element: TreeNode | undefined,
  state: TreeChildrenState,
): Promise<TreeNode[]> {
  // Root level
  if (!element) {
    if (!state.connected && !state.offlineSchema) {
      // Hosts where welcome-view markdown `command:` links do nothing still execute
      // TreeItem.command, so surface the same actions as real clickable tree rows.
      if (state.isDriftUiConnected()) {
        return [
          new SchemaRestFailureBannerItem(),
          ...getSchemaRestFailureActions(),
        ];
      }
      // Fully disconnected: show banner + discovery/diagnostic actions instead of
      // an empty tree (which would display viewsWelcome markdown links that silently
      // fail in some VS Code forks/versions).
      return [
        new DisconnectedBannerItem(),
        ...getDisconnectedActions(),
      ];
    }
    const status = new ConnectionStatusItem(
      state.client.connectionDisplayName,
      state.connected,
      state.offlineSchema,
    );
    decorateTableItems(state.tableItems, state.annotationStore);

    const pinned = state.tableItems.filter((t) => t.pinned);
    const unpinned = state.tableItems.filter((t) => !t.pinned);
    const items: TreeNode[] = [status];
    if (pinned.length > 0) {
      items.push(new PinnedGroupItem(pinned.length));
    }
    items.push(...pinned, ...unpinned);
    return items;
  }

  // Table level: columns + foreign keys (lazy-loaded)
  if (element instanceof TableItem) {
    const columns = element.table.columns.map(
      (c) => new ColumnItem(c, element.table.name),
    );
    decorateColumnItems(columns, element.table.name, state.annotationStore);
    let fks: ForeignKeyItem[] = [];
    try {
      const fkData = await state.client.tableFkMeta(element.table.name);
      fks = fkData.map((fk) => new ForeignKeyItem(fk));
    } catch {
      // FK fetch failed — show columns only
    }
    return [...columns, ...fks];
  }

  return [];
}

/** Append annotation count to table item descriptions. */
export function decorateTableItems(
  items: TableItem[],
  annotationStore?: AnnotationStore,
): void {
  if (!annotationStore) return;
  for (const item of items) {
    // Reset to base description to avoid accumulation on repeated calls
    const rc = item.table.rowCount;
    const base = `${rc} ${rc === 1 ? 'row' : 'rows'}`;
    const count = annotationStore.countForTable(item.table.name);
    item.description = count > 0
      ? `${base} \u00B7 ${count === 1 ? '1 note' : `${count} notes`}`
      : base;
  }
}

/** Append annotation indicator to column item descriptions. */
export function decorateColumnItems(
  columns: ColumnItem[],
  tableName: string,
  annotationStore?: AnnotationStore,
): void {
  if (!annotationStore) return;
  for (const col of columns) {
    const has = annotationStore.hasAnnotations(tableName, col.column.name);
    if (has) {
      col.description = `${col.description} \u00B7 \u{1F4CC}`;
    }
  }
}
