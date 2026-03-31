import * as assert from 'assert';
import * as sinon from 'sinon';
import { DriftApiClient } from '../api-client';
import { DriftTreeProvider } from '../tree/drift-tree-provider';
import { resetMocks } from './vscode-mock';

describe('DriftTreeProvider — refresh() concurrency guard', () => {
  let fetchStub: sinon.SinonStub;
  let client: DriftApiClient;
  let provider: DriftTreeProvider;

  beforeEach(() => {
    resetMocks();
    fetchStub = sinon.stub(globalThis, 'fetch');
    client = new DriftApiClient('127.0.0.1', 8642);
    provider = new DriftTreeProvider(client);
  });

  afterEach(() => {
    fetchStub.restore();
  });

  it('should queue a pending refresh instead of dropping it', async () => {
    // Make the first health call hang until we resolve it manually.
    let resolveHealth!: (v: Response) => void;
    fetchStub.onCall(0).returns(
      new Promise<Response>((r) => { resolveHealth = r; }),
    );
    // First refresh: schemaMetadata (call index 1)
    fetchStub.onCall(1).resolves(new Response(JSON.stringify([]), { status: 200 }));
    // Queued refresh: health (call index 2)
    fetchStub.onCall(2).resolves(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    // Queued refresh: schemaMetadata (call index 3)
    fetchStub.onCall(3).resolves(new Response(JSON.stringify([]), { status: 200 }));

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
    fetchStub.onCall(1).resolves(new Response(JSON.stringify([]), { status: 200 }));
    // Single coalesced queued refresh: health (call index 2)
    fetchStub.onCall(2).resolves(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    // Single coalesced queued refresh: schemaMetadata (call index 3)
    fetchStub.onCall(3).resolves(new Response(JSON.stringify([]), { status: 200 }));

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
