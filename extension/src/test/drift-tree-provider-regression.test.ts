import * as assert from 'assert';
import * as sinon from 'sinon';
import { DriftApiClient } from '../api-client';
import { DriftTreeProvider } from '../tree/drift-tree-provider';
import { commands as vscodeCommands, resetMocks } from './vscode-mock';

// REGRESSION SUITE: viewsWelcome `command:` links silently fail in some
// VS Code forks. Every test guards against tree root returning [] again.

describe('DriftTreeProvider — REGRESSION: tree root never empty', () => {
  let fetchStub: sinon.SinonStub;
  let client: DriftApiClient;
  let provider: DriftTreeProvider;

  const sampleMetadata = [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'INTEGER', pk: true },
        { name: 'name', type: 'TEXT', pk: false },
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
