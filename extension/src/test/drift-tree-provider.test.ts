import * as assert from 'assert';
import * as sinon from 'sinon';
import { DriftApiClient } from '../api-client';
import { DriftTreeProvider } from '../tree/drift-tree-provider';
import { commands as vscodeCommands, resetMocks } from './vscode-mock';
import {
  ColumnItem,
  ConnectionStatusItem,
  DisconnectedBannerItem,
  ForeignKeyItem,
  SchemaRestFailureBannerItem,
  TableItem,
} from '../tree/tree-items';
import {
  ActionItem,
  getDisconnectedActions,
  getSchemaRestFailureActions,
  QuickActionsGroupItem,
} from '../tree/quick-action-items';

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

    it('should set driftViewer.databaseTreeEmpty false even when schema load fails (tree always has items)', async () => {
      // The tree now always returns items (disconnected banner + actions), so
      // databaseTreeEmpty is always false — viewsWelcome is never shown.
      fetchStub.rejects(new Error('connection refused'));
      await provider.refresh();
      assert.strictEqual(
        vscodeCommands.getContext('driftViewer.databaseTreeEmpty'),
        false,
        'disconnected tree shows banner + actions, not empty welcome overlay',
      );
    });

    it('should set driftViewer.databaseTreeEmpty false when schema load fails but UI reports connected', async () => {
      const connected = new DriftTreeProvider(client, undefined, () => true);
      fetchStub.rejects(new Error('connection refused'));
      await connected.refresh();
      assert.strictEqual(
        vscodeCommands.getContext('driftViewer.databaseTreeEmpty'),
        false,
        'REST failure with live VM/HTTP: show tree actions instead of welcome markdown',
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

    it('should set driftViewer.databaseTreeEmpty false on construction (tree always has items)', () => {
      // Even before first refresh, the tree returns disconnected banner + actions,
      // so databaseTreeEmpty is always false.
      assert.strictEqual(vscodeCommands.getContext('driftViewer.databaseTreeEmpty'), false);
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

    it('should return disconnected banner + actions when server is down', async () => {
      fetchStub.rejects(new Error('connection refused'));

      await provider.refresh();
      const children = await provider.getChildren();

      // Banner + 8 disconnected actions (retry, diagnose, troubleshoot, log, etc.)
      assert.strictEqual(children.length, 9);
      assert.ok(children[0] instanceof DisconnectedBannerItem);
      assert.ok(children[1] instanceof ActionItem);
      assert.strictEqual(provider.connected, false);
    });

    it('should expose getDisconnectedActions command IDs at tree root when fully disconnected', async () => {
      fetchStub.rejects(new Error('connection refused'));
      await provider.refresh();
      const children = await provider.getChildren();
      // Skip the banner (index 0), check action command IDs match the factory
      const fromTree = children
        .slice(1)
        .map((c) => (c as ActionItem).command?.command);
      const fromFactory = getDisconnectedActions().map((a) => a.command?.command);
      assert.deepStrictEqual(fromTree, fromFactory);
    });

    it('should return banner and command rows when UI connected but REST schema failed', async () => {
      const connected = new DriftTreeProvider(client, undefined, () => true);
      fetchStub.rejects(new Error('connection refused'));
      await connected.refresh();
      const children = await connected.getChildren();
      assert.ok(children[0] instanceof SchemaRestFailureBannerItem);
      assert.ok(children[1] instanceof ActionItem);
      assert.strictEqual(children.length, 8); // banner + 7 actions
    });

    /**
     * Before: root stayed empty (`[]`) whenever schema fetch failed — users relied on
     * `viewsWelcome` markdown links. After: when `isDriftUiConnected` is true, root rows
     * must match [getSchemaRestFailureActions] command IDs (single source for overlay parity).
     */
    it('should expose getSchemaRestFailureActions command IDs at tree root (before vs after parity)', async () => {
      const connected = new DriftTreeProvider(client, undefined, () => true);
      fetchStub.rejects(new Error('connection refused'));
      await connected.refresh();
      const children = await connected.getChildren();
      const fromTree = children
        .slice(1)
        .map((c) => (c as ActionItem).command?.command);
      const fromFactory = getSchemaRestFailureActions().map((a) => a.command?.command);
      assert.deepStrictEqual(fromTree, fromFactory);
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
    it('should queue a pending refresh instead of dropping it', async () => {
      // Make the first health call hang until we resolve it manually.
      let resolveHealth!: (v: Response) => void;
      fetchStub.onCall(0).returns(
        new Promise<Response>((r) => { resolveHealth = r; }),
      );
      // First refresh: schemaMetadata (call index 1)
      fetchStub.onCall(1).resolves(
        new Response(JSON.stringify([]), { status: 200 }),
      );
      // Queued refresh: health (call index 2)
      fetchStub.onCall(2).resolves(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      // Queued refresh: schemaMetadata (call index 3)
      fetchStub.onCall(3).resolves(
        new Response(JSON.stringify([]), { status: 200 }),
      );

      const first = provider.refresh();
      provider.refresh(); // queued as pending, not dropped

      // Unblock the first refresh so it completes and runs the pending one.
      resolveHealth(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      await first;

      // Allow the microtask queue to drain so the queued refresh runs.
      await new Promise<void>((r) => setTimeout(r, 0));

      // 4 calls: first refresh (health + schema) + queued refresh (health + schema)
      assert.strictEqual(fetchStub.callCount, 4);
    });

    it('should coalesce multiple pending refreshes into one', async () => {
      // Make the first health call hang until we resolve it manually.
      let resolveHealth!: (v: Response) => void;
      fetchStub.onCall(0).returns(
        new Promise<Response>((r) => { resolveHealth = r; }),
      );
      // First refresh: schemaMetadata (call index 1)
      fetchStub.onCall(1).resolves(
        new Response(JSON.stringify([]), { status: 200 }),
      );
      // Single coalesced queued refresh: health (call index 2)
      fetchStub.onCall(2).resolves(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      // Single coalesced queued refresh: schemaMetadata (call index 3)
      fetchStub.onCall(3).resolves(
        new Response(JSON.stringify([]), { status: 200 }),
      );

      const first = provider.refresh();
      provider.refresh(); // sets _pendingRefresh = true
      provider.refresh(); // still just _pendingRefresh = true (coalesced)
      provider.refresh(); // still just _pendingRefresh = true (coalesced)

      resolveHealth(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      await first;
      await new Promise<void>((r) => setTimeout(r, 0));

      // Only 4 calls total: first refresh + ONE coalesced queued refresh,
      // not 4 separate refreshes.
      assert.strictEqual(fetchStub.callCount, 4);
    });

    it('should complete refresh even when all fetches hang (safety timeout)', async () => {
      // Before: fetch() hung forever on Windows when AbortController.abort()
      // was ignored — _refreshing stayed true permanently, deadlocking the tree.
      // After: Promise.race safety layers in fetchWithTimeout and refresh()
      // guarantee the refresh always settles and _refreshing is cleared.
      const clock = sinon.useFakeTimers();
      try {
        // Every fetch() call returns a promise that never settles — simulates
        // the Windows/undici bug where AbortController.abort() is ignored.
        fetchStub.returns(new Promise<Response>(() => {}));

        const refreshPromise = provider.refresh();

        // Advance past both fetchWithTimeout safety layers:
        // health() safety ~10s + offline schemaMetadata() safety ~20s.
        await clock.tickAsync(25_000);

        await refreshPromise;

        // refresh() completed without hanging — _refreshing was cleared.
        assert.strictEqual(provider.connected, false);
      } finally {
        clock.restore();
      }
    });

    it('should run pending refresh after safety timeout clears _refreshing', async () => {
      // Before: a hanging first refresh kept _refreshing=true forever, so the
      // coalesced pending refresh (from discovery) never ran — permanent
      // "Could not load schema" state. After: safety timeout clears _refreshing
      // and the queued refresh executes.
      const clock = sinon.useFakeTimers();
      try {
        fetchStub.returns(new Promise<Response>(() => {}));

        const first = provider.refresh();
        provider.refresh(); // queued as pending

        // Process first refresh's safety timeouts (~20s for health + offline schema).
        await clock.tickAsync(25_000);
        await first;

        // The pending refresh has started (via void this.refresh()). Advance
        // past its safety timeouts so it also completes.
        await clock.tickAsync(25_000);

        // Both refreshes ran: first (safety-aborted) + one coalesced pending.
        // Each refresh invokes health + offline-schema = 2 fetch calls.
        assert.strictEqual(
          fetchStub.callCount,
          4,
          'expected 4 fetch calls: 2 per refresh cycle',
        );
      } finally {
        clock.restore();
      }
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
