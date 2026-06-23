import * as assert from 'assert';
import * as sinon from 'sinon';
import { DriftApiClient } from '../api-client';
import { DriftTreeProvider } from '../tree/drift-tree-provider';
import { resetMocks } from './vscode-mock';
import {
  ColumnItem,
  ConnectionStatusItem,
  ForeignKeyItem,
  TableGroupItem,
  TableItem,
} from '../tree/tree-items';
import { TableGroupingStore } from '../tree/table-grouping-store';

describe('DriftTreeProvider', () => {
  let fetchStub: sinon.SinonStub;
  let client: DriftApiClient;
  let provider: DriftTreeProvider;

  const sampleMetadata = [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'INTEGER', pk: true },
        { name: 'name', type: 'TEXT', pk: false },
        { name: 'avatar', type: 'BLOB', pk: false },
        { name: 'score', type: 'REAL', pk: false },
      ],
      rowCount: 42,
    },
    {
      name: 'orders',
      columns: [
        { name: 'id', type: 'INTEGER', pk: true },
        { name: 'user_id', type: 'INTEGER', pk: false },
      ],
      rowCount: 100,
    },
  ];

  beforeEach(() => {
    resetMocks();
    fetchStub = sinon.stub(globalThis, 'fetch');
    client = new DriftApiClient('127.0.0.1', 8642);
    provider = new DriftTreeProvider(client);
  });

  afterEach(() => {
    fetchStub.restore();
  });

  describe('getChildren() — table expansion', () => {
    it('should return columns and FKs for a table', async () => {
      fetchStub.onFirstCall().resolves(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      fetchStub.onSecondCall().resolves(
        new Response(JSON.stringify(sampleMetadata), { status: 200 }),
      );

      await provider.refresh();
      const root = await provider.getChildren();
      const usersTable = root[1] as TableItem;

      // FK metadata fetch
      const fks = [{ fromColumn: 'manager_id', toTable: 'users', toColumn: 'id' }];
      fetchStub.resolves(new Response(JSON.stringify(fks), { status: 200 }));

      const tableChildren = await provider.getChildren(usersTable);

      // 4 columns + 1 FK
      assert.strictEqual(tableChildren.length, 5);

      const colItems = tableChildren.filter((c) => c instanceof ColumnItem) as ColumnItem[];
      assert.strictEqual(colItems.length, 4);

      const fkItems = tableChildren.filter((c) => c instanceof ForeignKeyItem) as ForeignKeyItem[];
      assert.strictEqual(fkItems.length, 1);
      assert.strictEqual(fkItems[0].description, '\u2192 users.id');
    });

    it('should return columns only when FK fetch fails', async () => {
      fetchStub.onFirstCall().resolves(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      fetchStub.onSecondCall().resolves(
        new Response(JSON.stringify(sampleMetadata), { status: 200 }),
      );

      await provider.refresh();
      const root = await provider.getChildren();
      const usersTable = root[1] as TableItem;

      // FK metadata fetch fails
      fetchStub.rejects(new Error('fk fetch failed'));

      const tableChildren = await provider.getChildren(usersTable);
      assert.strictEqual(tableChildren.length, 4); // columns only
    });
  });

  describe('tree item icons', () => {
    it('should assign correct icons by column type', async () => {
      fetchStub.onFirstCall().resolves(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      fetchStub.onSecondCall().resolves(
        new Response(JSON.stringify(sampleMetadata), { status: 200 }),
      );
      // FK fetch — empty
      fetchStub.onCall(2).resolves(new Response('[]', { status: 200 }));

      await provider.refresh();
      const root = await provider.getChildren();
      const usersTable = root[1] as TableItem;
      const children = await provider.getChildren(usersTable) as ColumnItem[];

      // id: INTEGER PK → key
      assert.strictEqual((children[0].iconPath as any).id, 'key');
      assert.strictEqual(children[0].contextValue, 'driftColumnPk');

      // name: TEXT → symbol-string
      assert.strictEqual((children[1].iconPath as any).id, 'symbol-string');

      // avatar: BLOB → file-binary
      assert.strictEqual((children[2].iconPath as any).id, 'file-binary');

      // score: REAL → symbol-number
      assert.strictEqual((children[3].iconPath as any).id, 'symbol-number');
    });

    it('should show row count on table items', async () => {
      fetchStub.onFirstCall().resolves(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      fetchStub.onSecondCall().resolves(
        new Response(JSON.stringify(sampleMetadata), { status: 200 }),
      );

      await provider.refresh();
      const root = await provider.getChildren();
      const usersTable = root[1] as TableItem;

      assert.strictEqual(usersTable.description, '4 cols, 42 rows');
      assert.strictEqual((usersTable.iconPath as any).id, 'table');
    });
  });

  describe('row count pluralisation', () => {
    it('should show "1 row" for single-row table', () => {
      const item = new TableItem({
        name: 'config',
        columns: [{ name: 'id', type: 'INTEGER', pk: true }],
        rowCount: 1,
      });
      assert.strictEqual(item.description, '1 col, 1 row');
    });

    it('should show "0 rows" for empty table', () => {
      const item = new TableItem({
        name: 'empty',
        columns: [],
        rowCount: 0,
      });
      assert.strictEqual(item.description, '0 cols, 0 rows');
    });
  });

  describe('ConnectionStatusItem click behavior', () => {
    it('should set openInBrowser command when connected', () => {
      const item = new ConnectionStatusItem('http://127.0.0.1:8642', true);
      assert.ok(item.command, 'connected item should have a command');
      assert.strictEqual(item.command!.command, 'driftViewer.openInBrowser');
    });

    it('should set tooltip with URL hint when connected', () => {
      const item = new ConnectionStatusItem('http://127.0.0.1:8642', true);
      assert.strictEqual(
        item.tooltip,
        'http://127.0.0.1:8642 — click to open in browser',
      );
    });

    it('should open the troubleshooting panel when disconnected', () => {
      // The disconnected/offline row used to be inert (no command). It now opens
      // the connection-help panel with a state hint so the user has an action.
      const item = new ConnectionStatusItem('http://127.0.0.1:8642', false);
      assert.ok(item.command, 'disconnected item should have a command');
      assert.strictEqual(item.command!.command, 'driftViewer.showTroubleshooting');
      assert.deepStrictEqual(item.command!.arguments, ['disconnected']);
    });

    it('should open the troubleshooting panel with the offline hint when offline', () => {
      const item = new ConnectionStatusItem('http://127.0.0.1:8642', false, true);
      assert.ok(item.command, 'offline item should have a command');
      assert.strictEqual(item.command!.command, 'driftViewer.showTroubleshooting');
      assert.deepStrictEqual(item.command!.arguments, ['offline']);
    });
  });

  describe('getTreeItem()', () => {
    it('should return the element itself', () => {
      const item = new ConnectionStatusItem('http://localhost', true);
      assert.strictEqual(provider.getTreeItem(item), item);
    });
  });

  describe('group tables by name', () => {
    // Minimal Memento backing the grouping toggle without a real workspace.
    function fakeMemento(): any {
      const data = new Map<string, unknown>();
      return {
        get: (key: string, def?: unknown) => (data.has(key) ? data.get(key) : def),
        update: (key: string, value: unknown) => {
          data.set(key, value);
          return Promise.resolve();
        },
        keys: () => [...data.keys()],
      };
    }

    function meta(...names: string[]) {
      return names.map((name) => ({
        name,
        columns: [{ name: 'id', type: 'INTEGER', pk: true }],
        rowCount: 1,
      }));
    }

    // The plural base table `contacts` must join its singular-prefixed children
    // (`contact_*`); `activities` has no mate and stays flat.
    const groupedMetadata = meta('contact_avatars', 'contact_groups', 'contacts', 'activities');

    async function loadGroupedWith(metadata: unknown[]): Promise<DriftTreeProvider> {
      fetchStub.onFirstCall().resolves(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      fetchStub.onSecondCall().resolves(new Response(JSON.stringify(metadata), { status: 200 }));
      const store = new TableGroupingStore(fakeMemento());
      await store.setGrouped(true);
      provider.setGroupingStore(store);
      await provider.refresh();
      return provider;
    }

    it('groups a plural base table with its singular-prefixed children, leaving singletons flat', async () => {
      await loadGroupedWith(groupedMetadata);
      const root = await provider.getChildren();

      const group = root.find((n) => n instanceof TableGroupItem) as TableGroupItem | undefined;
      assert.ok(group, 'expected a contact group node');
      assert.strictEqual(group!.groupKey, 'contact');
      // contacts + contact_avatars + contact_groups all resolve to stem "contact".
      assert.strictEqual(group!.tables.length, 3);

      const singleton = root.find(
        (n) => n instanceof TableItem && (n as TableItem).table.name === 'activities',
      );
      assert.ok(singleton, 'activities should remain a flat table, not a group');
    });

    it('merges "es" / "ss" plurals with their prefix stem', async () => {
      // addresses (base, "sses") + address_lat_longs (child prefix "address")
      // both singularize to "address"; a lone "connections" stays flat.
      await loadGroupedWith(meta('addresses', 'address_lat_longs', 'connections'));
      const root = await provider.getChildren();

      const group = root.find((n) => n instanceof TableGroupItem) as TableGroupItem | undefined;
      assert.ok(group, 'expected an address group node');
      assert.strictEqual(group!.groupKey, 'address');
      assert.strictEqual(group!.tables.length, 2);

      assert.ok(
        root.some((n) => n instanceof TableItem && (n as TableItem).table.name === 'connections'),
        'connections should remain flat (no prefix-mate)',
      );
    });

    it('returns the member tables when a group node is expanded', async () => {
      await loadGroupedWith(groupedMetadata);
      const root = await provider.getChildren();
      const group = root.find((n) => n instanceof TableGroupItem) as TableGroupItem;

      const members = await provider.getChildren(group);
      assert.deepStrictEqual(
        members.map((m) => (m as TableItem).table.name),
        ['contact_avatars', 'contact_groups', 'contacts'],
      );
    });

    it('defaults to grouped (on) with expanded group nodes', async () => {
      const store = new TableGroupingStore(fakeMemento());
      assert.strictEqual(store.grouped, true, 'grouping should be on by default');

      await loadGroupedWith(groupedMetadata);
      const root = await provider.getChildren();
      const group = root.find((n) => n instanceof TableGroupItem) as TableGroupItem;
      // Expanded so the grouped view reveals tables without an extra click.
      assert.strictEqual(group.collapsibleState, 2 /* Expanded */);
    });

    it('shows a flat table list when no grouping store is attached', async () => {
      fetchStub.onFirstCall().resolves(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      fetchStub.onSecondCall().resolves(new Response(JSON.stringify(groupedMetadata), { status: 200 }));
      await provider.refresh();

      const root = await provider.getChildren();
      assert.ok(!root.some((n) => n instanceof TableGroupItem), 'no groups when toggle is off');
    });
  });
});
