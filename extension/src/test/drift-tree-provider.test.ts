import * as assert from 'assert';
import * as sinon from 'sinon';
import { DriftApiClient } from '../api-client';
import { DriftTreeProvider } from '../tree/drift-tree-provider';
import { commands as vscodeCommands, resetMocks } from './vscode-mock';
import {
  ColumnItem,
  ConnectionStatusItem,
  ForeignKeyItem,
  TableItem,
} from '../tree/tree-items';
import { QuickActionsGroupItem } from '../tree/quick-action-items';

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

  describe('refresh()', () => {
    it('should set connected=true when server responds', async () => {
      // health check
      fetchStub.onFirstCall().resolves(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      // schema metadata
      fetchStub.onSecondCall().resolves(
        new Response(JSON.stringify(sampleMetadata), { status: 200 }),
      );

      await provider.refresh();
      assert.strictEqual(provider.connected, true);
    });

    it('should set connected=false when server is down', async () => {
      fetchStub.rejects(new Error('connection refused'));
      await provider.refresh();
      assert.strictEqual(provider.connected, false);
    });

    it('should set VS Code context driftViewer.databaseTreeEmpty true when schema load fails', async () => {
      fetchStub.rejects(new Error('connection refused'));
      await provider.refresh();
      assert.strictEqual(
        vscodeCommands.getContext('driftViewer.databaseTreeEmpty'),
        true,
        'before fix: serverConnected could stay true while tree stayed empty — welcome needs this key',
      );
    });

    it('should set VS Code context driftViewer.databaseTreeEmpty false when schema load succeeds', async () => {
      fetchStub.onFirstCall().resolves(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      fetchStub.onSecondCall().resolves(
        new Response(JSON.stringify(sampleMetadata), { status: 200 }),
      );
      await provider.refresh();
      assert.strictEqual(vscodeCommands.getContext('driftViewer.databaseTreeEmpty'), false);
    });

    it('should set driftViewer.databaseTreeEmpty true on construction (not yet loaded)', () => {
      assert.strictEqual(vscodeCommands.getContext('driftViewer.databaseTreeEmpty'), true);
    });

    it('should fire onDidChangeTreeData', async () => {
      fetchStub.rejects(new Error('connection refused'));

      let fired = false;
      provider.onDidChangeTreeData(() => { fired = true; });
      await provider.refresh();
      assert.strictEqual(fired, true);
    });
  });

  describe('getChildren() — root', () => {
    it('should return status + tables when connected', async () => {
      fetchStub.onFirstCall().resolves(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      fetchStub.onSecondCall().resolves(
        new Response(JSON.stringify(sampleMetadata), { status: 200 }),
      );

      await provider.refresh();
      const children = await provider.getChildren();

      assert.strictEqual(children.length, 4); // status + quickActions + 2 tables
      assert.ok(children[0] instanceof ConnectionStatusItem);
      assert.ok(children[1] instanceof QuickActionsGroupItem);
      assert.ok(children[2] instanceof TableItem);
      assert.ok(children[3] instanceof TableItem);
    });

    it('should return empty array when server is down (for viewsWelcome)', async () => {
      fetchStub.rejects(new Error('connection refused'));

      await provider.refresh();
      const children = await provider.getChildren();

      assert.strictEqual(children.length, 0);
      assert.strictEqual(provider.connected, false);
    });
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
      const usersTable = root[2] as TableItem;

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
      const usersTable = root[2] as TableItem;

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
      const usersTable = root[2] as TableItem;
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
      const usersTable = root[2] as TableItem;

      assert.strictEqual(usersTable.description, '42 rows');
      assert.strictEqual((usersTable.iconPath as any).id, 'table');
    });
  });

  describe('refresh() concurrency guard', () => {
    it('should skip overlapping refresh calls', async () => {
      // Make health hang until we resolve it
      let resolveHealth!: (v: Response) => void;
      fetchStub.onFirstCall().returns(
        new Promise<Response>((r) => { resolveHealth = r; }),
      );
      fetchStub.onSecondCall().resolves(
        new Response(JSON.stringify([]), { status: 200 }),
      );

      const first = provider.refresh();
      const second = provider.refresh(); // should be skipped

      resolveHealth(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      await first;
      await second;

      // health + schemaMetadata = 2 calls; second refresh was skipped
      assert.strictEqual(fetchStub.callCount, 2);
    });
  });

  describe('row count pluralisation', () => {
    it('should show "1 row" for single-row table', () => {
      const item = new TableItem({
        name: 'config',
        columns: [{ name: 'id', type: 'INTEGER', pk: true }],
        rowCount: 1,
      });
      assert.strictEqual(item.description, '1 row');
    });

    it('should show "0 rows" for empty table', () => {
      const item = new TableItem({
        name: 'empty',
        columns: [],
        rowCount: 0,
      });
      assert.strictEqual(item.description, '0 rows');
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

    it('should not set a command when disconnected', () => {
      const item = new ConnectionStatusItem('http://127.0.0.1:8642', false);
      assert.strictEqual(item.command, undefined);
    });
  });

  describe('getTreeItem()', () => {
    it('should return the element itself', () => {
      const item = new ConnectionStatusItem('http://localhost', true);
      assert.strictEqual(provider.getTreeItem(item), item);
    });
  });
});
