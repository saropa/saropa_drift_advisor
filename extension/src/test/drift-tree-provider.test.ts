import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
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

      assert.strictEqual(children.length, 3); // status + 2 tables
      assert.ok(children[0] instanceof ConnectionStatusItem);
      assert.ok(children[1] instanceof TableItem);
      assert.ok(children[2] instanceof TableItem);
    });

    it('should not include a Quick Actions group (tool commands live in Drift Tools panel)', async () => {
      fetchStub.onFirstCall().resolves(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      fetchStub.onSecondCall().resolves(
        new Response(JSON.stringify(sampleMetadata), { status: 200 }),
      );

      await provider.refresh();
      const children = await provider.getChildren();

      // Every root item must be ConnectionStatusItem or TableItem — no
      // Quick Actions group node should appear (those commands are in the
      // separate Drift Tools panel to avoid duplication).
      for (const child of children) {
        assert.ok(
          child instanceof ConnectionStatusItem || child instanceof TableItem,
          `Unexpected root item type: ${child.constructor.name} ("${child.label}")`,
        );
      }
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

  // ────────────────────────────────────────────────────────────────────────
  // REGRESSION SUITE: buttons always clickable, tree never empty at root
  //
  // This suite exists because viewsWelcome markdown `command:` links silently
  // fail in some VS Code forks — no toast, no error, no output.  Previously
  // getChildren() returned [] when disconnected, so the only buttons the user
  // could see were those broken markdown links.  Every test below is a guard
  // against that class of bug shipping again.
  // ────────────────────────────────────────────────────────────────────────

  describe('REGRESSION: tree root never empty — always clickable items', () => {

    // ── Helper: load declared command IDs from package.json ──────────

    /** All command IDs declared in extension/package.json contributes.commands. */
    function loadDeclaredCommandIds(): Set<string> {
      // Compiled test lives at out/test/…, package.json is at extension root.
      const pkgPath = path.resolve(__dirname, '../../package.json');
      const raw = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw) as {
        contributes?: { commands?: { command: string }[] };
      };
      const cmds = pkg.contributes?.commands ?? [];
      return new Set(cmds.map((c) => c.command));
    }

    // ── Root never returns [] ────────────────────────────────────────

    it('should return items before first refresh (never called refresh yet)', async () => {
      // Tree is constructed but refresh() has never been awaited.
      // Previously this returned [] — viewsWelcome was the only UI.
      const children = await provider.getChildren();
      assert.ok(
        children.length > 0,
        `Root must never be empty — got ${children.length} items`,
      );
    });

    it('should return items when fully disconnected (no server, no VM)', async () => {
      fetchStub.rejects(new Error('ECONNREFUSED'));
      await provider.refresh();
      const children = await provider.getChildren();
      assert.ok(
        children.length > 0,
        `Disconnected root must never be empty — got ${children.length} items`,
      );
    });

    it('should return items when UI connected but REST schema fails', async () => {
      const uiConnected = new DriftTreeProvider(client, undefined, () => true);
      fetchStub.rejects(new Error('ECONNREFUSED'));
      await uiConnected.refresh();
      const children = await uiConnected.getChildren();
      assert.ok(
        children.length > 0,
        `REST-failure root must never be empty — got ${children.length} items`,
      );
    });

    it('should return items when fully connected with tables', async () => {
      fetchStub.onFirstCall().resolves(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      fetchStub.onSecondCall().resolves(
        new Response(JSON.stringify(sampleMetadata), { status: 200 }),
      );
      await provider.refresh();
      const children = await provider.getChildren();
      assert.ok(
        children.length > 0,
        `Connected root must never be empty — got ${children.length} items`,
      );
    });

    it('should return items when connected with zero tables', async () => {
      fetchStub.onFirstCall().resolves(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      fetchStub.onSecondCall().resolves(
        new Response(JSON.stringify([]), { status: 200 }),
      );
      await provider.refresh();
      const children = await provider.getChildren();
      // At minimum: ConnectionStatusItem
      assert.ok(
        children.length >= 1,
        `Connected-empty root must have at least status — got ${children.length}`,
      );
    });

    // ── Every ActionItem has a .command ──────────────────────────────

    it('every disconnected action must have a .command with a non-empty command ID', () => {
      const actions = getDisconnectedActions();
      assert.ok(actions.length > 0, 'getDisconnectedActions must not be empty');
      for (const action of actions) {
        assert.ok(
          action.command,
          `Disconnected action "${action.label}" is missing .command — it will do NOTHING when clicked`,
        );
        assert.ok(
          typeof action.command!.command === 'string' && action.command!.command.length > 0,
          `Disconnected action "${action.label}" has empty command ID`,
        );
      }
    });

    it('every REST-failure action must have a .command with a non-empty command ID', () => {
      const actions = getSchemaRestFailureActions();
      assert.ok(actions.length > 0, 'getSchemaRestFailureActions must not be empty');
      for (const action of actions) {
        assert.ok(
          action.command,
          `REST-failure action "${action.label}" is missing .command — it will do NOTHING when clicked`,
        );
        assert.ok(
          typeof action.command!.command === 'string' && action.command!.command.length > 0,
          `REST-failure action "${action.label}" has empty command ID`,
        );
      }
    });

    // ── Every ActionItem has an icon ─────────────────────────────────

    it('every disconnected action must have an icon (visible feedback)', () => {
      for (const action of getDisconnectedActions()) {
        assert.ok(
          action.iconPath,
          `Disconnected action "${action.label}" has no icon — invisible in the tree`,
        );
      }
    });

    it('every REST-failure action must have an icon', () => {
      for (const action of getSchemaRestFailureActions()) {
        assert.ok(
          action.iconPath,
          `REST-failure action "${action.label}" has no icon — invisible in the tree`,
        );
      }
    });

    // ── Command IDs declared in package.json ─────────────────────────

    it('every disconnected action command ID must be declared in package.json', () => {
      const declared = loadDeclaredCommandIds();
      for (const action of getDisconnectedActions()) {
        const id = action.command!.command;
        assert.ok(
          declared.has(id),
          `Disconnected action "${action.label}" uses command "${id}" which is NOT declared in `
          + 'package.json contributes.commands — VS Code will silently ignore it',
        );
      }
    });

    it('every REST-failure action command ID must be declared in package.json', () => {
      const declared = loadDeclaredCommandIds();
      for (const action of getSchemaRestFailureActions()) {
        const id = action.command!.command;
        assert.ok(
          declared.has(id),
          `REST-failure action "${action.label}" uses command "${id}" which is NOT declared in `
          + 'package.json contributes.commands — VS Code will silently ignore it',
        );
      }
    });

    // ── Banner items have user-visible guidance ──────────────────────

    it('DisconnectedBannerItem must have label, description, icon, and tooltip', () => {
      const banner = new DisconnectedBannerItem();
      assert.ok(banner.label, 'banner must have a label');
      assert.ok(banner.description, 'banner must have a description');
      assert.ok(banner.iconPath, 'banner must have an icon');
      assert.ok(banner.tooltip, 'banner must have a tooltip with guidance');
    });

    it('SchemaRestFailureBannerItem must have label, description, icon, and tooltip', () => {
      const banner = new SchemaRestFailureBannerItem();
      assert.ok(banner.label, 'banner must have a label');
      assert.ok(banner.description, 'banner must have a description');
      assert.ok(banner.iconPath, 'banner must have an icon');
      assert.ok(banner.tooltip, 'banner must have a tooltip with guidance');
    });

    // ── viewsWelcome parity: tree items cover the same commands ──────

    it('disconnected tree actions must cover all viewsWelcome disconnected command IDs', () => {
      // These are the command IDs from the package.json viewsWelcome entries for
      // the "not connected" state. If viewsWelcome is updated, this list must match.
      const viewsWelcomeDisconnectedCommandIds = [
        'driftViewer.openInBrowser',
        'driftViewer.showTroubleshooting',
        'driftViewer.showConnectionLog',
        'driftViewer.diagnoseConnection',
        'driftViewer.retryDiscovery',
        'driftViewer.refreshConnectionUi',
        'driftViewer.forwardPortAndroid',
        'driftViewer.selectServer',
      ];
      const treeCommandIds = new Set(
        getDisconnectedActions().map((a) => a.command!.command),
      );
      for (const id of viewsWelcomeDisconnectedCommandIds) {
        assert.ok(
          treeCommandIds.has(id),
          `viewsWelcome disconnected command "${id}" has no matching tree action — `
          + 'users in broken VS Code forks will have no way to trigger this command',
        );
      }
    });

    it('REST-failure tree actions must cover all viewsWelcome REST-failure command IDs', () => {
      const viewsWelcomeRestFailureCommandIds = [
        'driftViewer.refreshTree',
        'driftViewer.diagnoseConnection',
        'driftViewer.showTroubleshooting',
        'driftViewer.showConnectionLog',
        'driftViewer.openInBrowser',
        'driftViewer.selectServer',
        'driftViewer.openConnectionHelp',
      ];
      const treeCommandIds = new Set(
        getSchemaRestFailureActions().map((a) => a.command!.command),
      );
      for (const id of viewsWelcomeRestFailureCommandIds) {
        assert.ok(
          treeCommandIds.has(id),
          `viewsWelcome REST-failure command "${id}" has no matching tree action — `
          + 'users in broken VS Code forks will have no way to trigger this command',
        );
      }
    });

    // ── No duplicate command IDs within a single action list ─────────

    it('disconnected actions must not have duplicate command IDs', () => {
      const ids = getDisconnectedActions().map((a) => a.command!.command);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      assert.deepStrictEqual(dupes, [], `Duplicate command IDs in disconnected actions: ${dupes.join(', ')}`);
    });

    it('REST-failure actions must not have duplicate command IDs', () => {
      const ids = getSchemaRestFailureActions().map((a) => a.command!.command);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      assert.deepStrictEqual(dupes, [], `Duplicate command IDs in REST-failure actions: ${dupes.join(', ')}`);
    });

    // ── databaseTreeEmpty is always false (prevents welcome overlay) ─

    it('databaseTreeEmpty must be false in every connection state', async () => {
      // State 1: fresh construction
      assert.strictEqual(
        vscodeCommands.getContext('driftViewer.databaseTreeEmpty'),
        false,
        'must be false on construction',
      );

      // State 2: after failed refresh (disconnected)
      fetchStub.rejects(new Error('ECONNREFUSED'));
      await provider.refresh();
      assert.strictEqual(
        vscodeCommands.getContext('driftViewer.databaseTreeEmpty'),
        false,
        'must be false after disconnected refresh',
      );

      // State 3: after successful refresh (connected)
      fetchStub.reset();
      fetchStub.onFirstCall().resolves(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
      fetchStub.onSecondCall().resolves(
        new Response(JSON.stringify(sampleMetadata), { status: 200 }),
      );
      await provider.refresh();
      assert.strictEqual(
        vscodeCommands.getContext('driftViewer.databaseTreeEmpty'),
        false,
        'must be false after connected refresh',
      );

      // State 4: after server goes away (connected → disconnected)
      fetchStub.reset();
      fetchStub.rejects(new Error('ECONNREFUSED'));
      await provider.refresh();
      assert.strictEqual(
        vscodeCommands.getContext('driftViewer.databaseTreeEmpty'),
        false,
        'must be false after server disappears',
      );
    });
  });
});
