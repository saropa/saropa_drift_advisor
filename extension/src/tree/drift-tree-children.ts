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
  TableGroupItem,
  TableItem,
} from './tree-items';
import {
  ActionItem,
  MonitoringKilledBannerItem,
  getDisconnectedActions,
  getMonitoringKilledActions,
  getSchemaRestFailureActions,
} from './quick-action-items';

/** Union of all node types the Database Explorer tree can display. */
export type TreeNode =
  | ConnectionStatusItem
  | DisconnectedBannerItem
  | SchemaRestFailureBannerItem
  | MonitoringKilledBannerItem
  | PinnedGroupItem
  | TableGroupItem
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
  /**
   * True while the global monitoring & logging kill switch is engaged. Root
   * resolution then shows ONLY the kill-switch banner + resume action —
   * never the disconnected/REST-failure triage rows, which would misread a
   * deliberately dormant server as a broken connection.
   */
  monitoringKilled?: boolean;
  tableItems: TableItem[];
  annotationStore?: AnnotationStore;
  /**
   * When true, unpinned tables are bundled into [TableGroupItem]s by name prefix.
   * Optional so existing callers (and tests) default to the flat list.
   */
  grouped?: boolean;
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
    // Kill switch engaged: replace the whole tree with the blank-state
    // banner + a single resume action, per the kill-switch spec.
    if (state.monitoringKilled) {
      return [
        new MonitoringKilledBannerItem(),
        ...getMonitoringKilledActions(),
      ];
    }
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
    // Pinned tables stay flat for quick access; only the unpinned list is grouped.
    items.push(...pinned);
    items.push(...(state.grouped ? groupTablesByName(unpinned) : unpinned));
    return items;
  }

  // Group level: return the member tables (already built, no recompute).
  if (element instanceof TableGroupItem) {
    return element.tables;
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

/**
 * Reduce a word to its singular stem so a plural base table groups with its
 * singular-prefixed children. Drift's convention is a plural entity table
 * (`contacts`) plus child tables named `<singular>_<plural>` (`contact_avatars`,
 * `contact_groups`); without this, `contacts` keys to `contacts` and the
 * children key to `contact`, so the base table never joins its own group.
 *
 * Deliberately minimal English rules covering the plural forms that appear as
 * entity-name table prefixes:
 *   - `ies -> y`  (`activities -> activity`)
 *   - sibilant `es` drop after ss/x/z/ch/sh  (`addresses -> address`,
 *     `boxes -> box`, `classes -> class`, `matches -> match`)
 *   - trailing `s` otherwise, except `ss`  (`contacts -> contact`,
 *     `connections -> connection`; `address` is left intact, `houses -> house`)
 * The `ss`-vs-`s` distinction is what lets a child prefix (`address`) and its
 * plural base table (`addresses`) resolve to the same stem without mangling a
 * genuine single-`s` plural like `houses`.
 */
function singularize(word: string): string {
  if (word.length > 3 && word.endsWith('ies')) {
    return word.slice(0, -3) + 'y';
  }
  if (word.length > 3 && /(ss|x|z|ch|sh)es$/.test(word)) {
    return word.slice(0, -2);
  }
  if (word.length > 2 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Derive the grouping key for a table: the singular stem of the name segment
 * before the first underscore (e.g. both `contacts` and `contact_avatars` ->
 * `contact`). Tables whose stem is unique never collapse under an unrelated
 * prefix because a one-member bucket is rendered flat.
 */
function tableGroupKey(name: string): string {
  const underscore = name.indexOf('_');
  const head = underscore === -1 ? name : name.slice(0, underscore);
  return singularize(head);
}

/**
 * Bundle tables that share a name prefix into [TableGroupItem]s, leaving
 * single-member prefixes as plain [TableItem]s (a one-table "group" is noise).
 * Groups and lone tables are interleaved alphabetically by key so the order
 * matches a flat alphabetical list with related tables nested.
 */
function groupTablesByName(tables: TableItem[]): TreeNode[] {
  const byKey = new Map<string, TableItem[]>();
  for (const item of tables) {
    const key = tableGroupKey(item.table.name);
    const bucket = byKey.get(key) ?? [];
    bucket.push(item);
    byKey.set(key, bucket);
  }

  // Each entry sorts by its key (group prefix) or, for lone tables, the table
  // name — which equals the key when there is no underscore, and otherwise
  // shares the prefix, so a single localeCompare on the key orders both kinds.
  const entries = [...byKey.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const nodes: TreeNode[] = [];
  for (const [key, members] of entries) {
    if (members.length === 1) {
      nodes.push(members[0]);
      continue;
    }
    members.sort((a, b) => a.table.name.localeCompare(b.table.name));
    nodes.push(new TableGroupItem(key, members));
  }
  return nodes;
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
