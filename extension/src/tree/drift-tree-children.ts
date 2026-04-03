/**
 * Child resolution and decoration logic for the Database Explorer tree.
 * Extracted from drift-tree-provider to keep both files under the line cap.
 */
import type { DriftApiClient, TableMetadata } from '../api-client';
import type { AnnotationStore } from '../annotations/annotation-store';
import { ANNOTATION_ICON_EMOJI } from '../annotations/annotation-types';
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

/** Max characters for an annotation preview in tree item descriptions. */
const NOTE_PREVIEW_MAX = 40;

/** Truncate text to a max length, appending ellipsis if trimmed. */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '\u2026';
}

/**
 * Append annotation icon + note preview to table item descriptions.
 * Shows the first annotation's emoji and note text so it's obvious at a glance.
 */
export function decorateTableItems(
  items: TableItem[],
  annotationStore?: AnnotationStore,
): void {
  if (!annotationStore) return;
  for (const item of items) {
    // Reset to base description to avoid accumulation on repeated calls.
    // Must stay in sync with the TableItem constructor in tree-items.ts.
    const cols = item.table.columns.length;
    const rc = item.table.rowCount;
    const base = `${cols} ${cols === 1 ? 'col' : 'cols'}, ${rc} ${rc === 1 ? 'row' : 'rows'}`;
    const anns = annotationStore.forTable(item.table.name);
    if (anns.length === 0) {
      item.description = base;
      continue;
    }
    // Show first annotation icon + note, and count if more than one
    const first = anns[0];
    const emoji = ANNOTATION_ICON_EMOJI[first.icon] ?? '\u{1F4A1}';
    const preview = truncate(first.note, NOTE_PREVIEW_MAX);
    const suffix = anns.length > 1 ? ` +${anns.length - 1} more` : '';
    item.description = `${base} \u00B7 ${emoji} ${preview}${suffix}`;
  }
}

/**
 * Append annotation icon + note preview to column item descriptions.
 * Shows the actual annotation content instead of a generic pin icon.
 */
export function decorateColumnItems(
  columns: ColumnItem[],
  tableName: string,
  annotationStore?: AnnotationStore,
): void {
  if (!annotationStore) return;
  for (const col of columns) {
    const anns = annotationStore.forColumn(tableName, col.column.name);
    if (anns.length === 0) continue;
    // Show first annotation icon + note preview
    const first = anns[0];
    const emoji = ANNOTATION_ICON_EMOJI[first.icon] ?? '\u{1F4A1}';
    const preview = truncate(first.note, NOTE_PREVIEW_MAX);
    const suffix = anns.length > 1 ? ` +${anns.length - 1} more` : '';
    col.description = `${col.description} \u00B7 ${emoji} ${preview}${suffix}`;
  }
}
