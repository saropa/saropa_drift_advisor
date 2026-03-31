import * as assert from 'assert';
import * as sinon from 'sinon';
import { DriftApiClient } from '../api-client';
import { DriftTreeProvider } from '../tree/drift-tree-provider';
import { commands as vscodeCommands, resetMocks } from './vscode-mock';
import {
  ConnectionStatusItem,
  DisconnectedBannerItem,
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

});
