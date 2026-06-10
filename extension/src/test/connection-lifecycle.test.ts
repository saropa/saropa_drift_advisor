/**
 * Phase 2 gate (connection-reliability-ongoing.md, gap 2): the end-to-end connection
 * lifecycle the project never had a test for —
 *
 *   wiring (activation) → discovery scans → server found → tree loads → command invoked → data appears.
 *
 * The history's whole failure mode is "a single link broke silently and shipped." This test
 * wires the REAL chain (DriftApiClient + ServerDiscovery + ServerManager + DriftTreeProvider +
 * ConnectionStateMachine, plus the mock command registry) against a stubbed HTTP server, asserts
 * data appears at the end, and then DELIBERATELY BREAKS each link once, asserting the end state is
 * NOT reached. If any link silently regresses, one of these cases fails instead of a user screenshot.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { commands as vscodeCommands, resetMocks, MockMemento } from './vscode-mock';
import { DriftApiClient } from '../api-client';
import { ServerDiscovery, type IDiscoveryConfig } from '../server-discovery';
import { ServerManager } from '../server-manager';
import { DriftTreeProvider } from '../tree/drift-tree-provider';
import {
  ConnectionStateMachine,
  type ConnectionPhase,
} from '../connection-state';
import {
  refreshDriftConnectionUi,
  resetConnectionUiPresentationCacheForTests,
} from '../connection-ui-state';
import {
  ConnectionStatusItem,
  DisconnectedBannerItem,
  SchemaRestFailureBannerItem,
  TableItem,
} from '../tree/tree-items';

const SAMPLE_METADATA = [
  {
    name: 'users',
    columns: [
      { name: 'id', type: 'INTEGER', pk: true },
      { name: 'name', type: 'TEXT', pk: false },
    ],
    rowCount: 42,
  },
  { name: 'orders', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 100 },
];

function discoveryConfig(): IDiscoveryConfig {
  return { host: '127.0.0.1', portRangeStart: 8642, portRangeEnd: 8644 };
}

function makeServer(port: number) {
  return { host: '127.0.0.1', port, firstSeen: Date.now(), lastSeen: Date.now(), missedPolls: 0 };
}

/** Stub `fetch` to act as a healthy server: 200 on /api/health, sample schema on metadata. */
function stubHealthyServer(stub: sinon.SinonStub): void {
  stub.callsFake(async (input: unknown) => {
    const url = String(input);
    if (url.includes('/api/health')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.includes('/api/schema/metadata')) {
      return new Response(JSON.stringify(SAMPLE_METADATA), { status: 200 });
    }
    // FK metadata and anything else: empty success so lazy expansion does not throw.
    return new Response(JSON.stringify([]), { status: 200 });
  });
}

/**
 * Harness mirroring production wiring: the tree's `isDriftUiConnected` callback and the
 * connection refresh both read the SAME ConnectionStateMachine, exactly as activation wires them.
 */
class LifecycleHarness {
  readonly client = new DriftApiClient('127.0.0.1', 8642);
  readonly discovery = new ServerDiscovery(discoveryConfig());
  readonly manager = new ServerManager(this.discovery, this.client, new MockMemento());
  readonly machine = new ConnectionStateMachine();
  readonly tree: DriftTreeProvider;
  /** Drift Tools stub — the refresh funnel calls setConnected on it. */
  readonly tools = { setConnected: sinon.stub() };

  constructor() {
    // The tree reports a "UI connected" state from the single machine, not its own boolean.
    this.tree = new DriftTreeProvider(this.client, undefined, () => this.machine.connected);
    // Production wires the tree's postRefreshHook to re-run the connection refresh; mirror that
    // so a completed schema load promotes the phase connecting → connected automatically.
    this.tree.postRefreshHook = () => this.syncConnectionUi();
  }

  /** The single connection-refresh funnel (production: connectionUiRefresh.fn). */
  syncConnectionUi(): void {
    refreshDriftConnectionUi(this.manager, this.client, {
      toolsProvider: this.tools as never,
      treeProvider: this.tree,
      stateMachine: this.machine,
    });
  }

  get phase(): ConnectionPhase {
    return this.machine.phase;
  }

  dispose(): void {
    this.machine.dispose();
    this.manager.dispose();
    this.discovery.dispose();
  }
}

describe('connection lifecycle (end-to-end)', () => {
  let fetchStub: sinon.SinonStub;
  let h: LifecycleHarness;

  beforeEach(() => {
    resetMocks();
    resetConnectionUiPresentationCacheForTests();
    fetchStub = sinon.stub(globalThis, 'fetch');
    h = new LifecycleHarness();
  });

  afterEach(() => {
    h.dispose();
    fetchStub.restore();
  });

  it('HAPPY PATH: wiring → discovery → server found → tree loads → command → data appears', async () => {
    stubHealthyServer(fetchStub);

    // Link 1 — wiring/activation: nothing connected yet.
    h.syncConnectionUi();
    assert.strictEqual(h.phase, 'disconnected', 'starts disconnected');
    let rootChildren = await h.tree.getChildren();
    assert.ok(rootChildren[0] instanceof DisconnectedBannerItem, 'shows disconnected banner initially');

    // Link 2 + 3 — discovery scans and finds a server; ServerManager auto-selects it.
    (h.discovery as unknown as { _onDidChangeServers: { fire(s: unknown[]): void } })._onDidChangeServers.fire([makeServer(8642)]);
    assert.notStrictEqual(h.manager.activeServer, undefined, 'server selected after discovery');
    h.syncConnectionUi();
    assert.strictEqual(h.phase, 'connecting', 'transport up but schema not loaded yet');

    // Link 4 + 5 — a "Refresh" command (registered in the mock registry) loads the schema.
    // The tree's postRefreshHook re-runs syncConnectionUi, promoting connecting → connected.
    const refreshCommand = vscodeCommands.registerCommand('driftViewer.refreshTree', () => h.tree.refresh());
    await vscodeCommands.executeRegistered('driftViewer.refreshTree');
    refreshCommand.dispose();

    assert.strictEqual(h.tree.hasLiveSchema, true, 'tree loaded a live schema');
    assert.strictEqual(h.phase, 'connected', 'phase reaches connected after schema load');

    // Link 6 — data appears: root children include the status row + real table rows.
    rootChildren = await h.tree.getChildren();
    assert.ok(rootChildren[0] instanceof ConnectionStatusItem, 'connected tree leads with status row');
    const tableRows = rootChildren.filter((c) => c instanceof TableItem) as TableItem[];
    assert.strictEqual(tableRows.length, 2, 'both tables visible');
    assert.deepStrictEqual(tableRows.map((t) => t.table.name), ['users', 'orders']);

    // Single-authority cross-check: the context flag agrees with the phase.
    assert.strictEqual(vscodeCommands.getContext('driftViewer.serverConnected'), true);
  });

  it('BREAK discovery: no server is ever found → stays disconnected, no data', async () => {
    stubHealthyServer(fetchStub);
    // Skip the discovery fire. Everything else runs.
    h.syncConnectionUi();
    await h.tree.refresh(); // tree tries, but with no selected server health still 200 via stub...

    // ...however the connection phase is driven by transport selection, which never happened.
    assert.strictEqual(h.manager.activeServer, undefined, 'no server selected without discovery');
    h.syncConnectionUi();
    assert.strictEqual(h.phase, 'disconnected', 'no transport ⇒ disconnected even if a port would answer');
    assert.strictEqual(vscodeCommands.getContext('driftViewer.serverConnected'), false);
  });

  it('BREAK tree load: schema fetch fails → connecting (not connected), no table rows', async () => {
    fetchStub.rejects(new Error('connection refused'));
    (h.discovery as unknown as { _onDidChangeServers: { fire(s: unknown[]): void } })._onDidChangeServers.fire([makeServer(8642)]);
    h.syncConnectionUi();
    await h.tree.refresh();
    h.syncConnectionUi();

    assert.strictEqual(h.tree.hasLiveSchema, false, 'no live schema when load fails');
    // Transport is up (server selected) but schema never loaded — the honest "connecting" state,
    // NOT a false "connected". This is exactly the contradiction Phase 1 made unrepresentable.
    assert.strictEqual(h.phase, 'connecting', 'transport up + no schema ⇒ connecting, never connected');

    const rootChildren = await h.tree.getChildren();
    assert.ok(
      rootChildren[0] instanceof SchemaRestFailureBannerItem,
      'REST failure with live transport shows the failure banner + actions',
    );
    assert.strictEqual(
      rootChildren.filter((c) => c instanceof TableItem).length,
      0,
      'no table rows when schema failed to load',
    );
  });

  it('BREAK command: the refresh command is not registered → invocation is a no-op, no data', async () => {
    stubHealthyServer(fetchStub);
    (h.discovery as unknown as { _onDidChangeServers: { fire(s: unknown[]): void } })._onDidChangeServers.fire([makeServer(8642)]);
    h.syncConnectionUi();

    // Simulate the classic "command not found" regression: the registry never got the command.
    const result = await vscodeCommands.executeRegistered('driftViewer.refreshTree');
    assert.strictEqual(result, undefined, 'missing command resolves to undefined (the silent-failure shape)');

    // Because the load command never ran, the schema never loaded — data does not appear.
    assert.strictEqual(h.tree.hasLiveSchema, false, 'no schema without the command firing');
    const rootChildren = await h.tree.getChildren();
    assert.strictEqual(
      rootChildren.filter((c) => c instanceof TableItem).length,
      0,
      'no table rows until the refresh command actually runs',
    );
  });
});
