import * as assert from 'assert';
import * as sinon from 'sinon';
import { messageMock, resetMocks } from './vscode-mock';
import { ServerDiscovery, IDiscoveryConfig } from '../server-discovery';

function defaultConfig(): IDiscoveryConfig {
  return { host: '127.0.0.1', portRangeStart: 8642, portRangeEnd: 8644 };
}

function healthJson(): string {
  return JSON.stringify({ ok: true, version: '2.8.2' });
}

function makeResponse(body: string): Response {
  return {
    ok: true,
    json: async () => JSON.parse(body),
  } as Response;
}

describe('ServerDiscovery', () => {
  let fetchStub: sinon.SinonStub;
  let clock: sinon.SinonFakeTimers;
  let discovery: ServerDiscovery;

  beforeEach(() => {
    resetMocks();
    fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.rejects(new Error('connection refused'));
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    discovery?.dispose();
    clock.restore();
    fetchStub.restore();
  });

  function stubPortAlive(port: number): void {
    fetchStub
      .withArgs(`http://127.0.0.1:${port}/api/health`, sinon.match.any)
      .resolves(makeResponse(healthJson()));
  }

  it('should start in searching state', () => {
    discovery = new ServerDiscovery(defaultConfig());
    assert.strictEqual(discovery.state, 'searching');
    assert.strictEqual(discovery.servers.length, 0);
  });

  it('should find a server and transition to connected', async () => {
    stubPortAlive(8642);
    discovery = new ServerDiscovery(defaultConfig());

    const changed = sinon.stub();
    discovery.onDidChangeServers(changed);
    discovery.start();

    // Let the poll complete
    await clock.tickAsync(1);

    assert.strictEqual(discovery.state, 'connected');
    assert.strictEqual(discovery.servers.length, 1);
    assert.strictEqual(discovery.servers[0].port, 8642);
    assert.ok(changed.calledOnce);
    assert.strictEqual(messageMock.infos.length, 1);
    assert.ok(
      messageMock.infos[0].includes('Drift debug server detected on port 8642'),
      'notification should show detected port',
    );
  });

  it('should find multiple servers', async () => {
    stubPortAlive(8642);
    stubPortAlive(8643);
    discovery = new ServerDiscovery(defaultConfig());

    discovery.start();
    await clock.tickAsync(1);

    assert.strictEqual(discovery.servers.length, 2);
    const ports = discovery.servers.map((s) => s.port).sort();
    assert.deepStrictEqual(ports, [8642, 8643]);
  });

  it('should require 2 consecutive misses before removing a server', async () => {
    stubPortAlive(8642);
    discovery = new ServerDiscovery(defaultConfig());

    discovery.start();
    await clock.tickAsync(1);
    assert.strictEqual(discovery.servers.length, 1);

    // Server goes down — first miss
    fetchStub.reset();
    fetchStub.rejects(new Error('connection refused'));
    await clock.tickAsync(10001);
    assert.strictEqual(discovery.servers.length, 1, 'should survive 1 miss');

    // Second miss — removed
    await clock.tickAsync(10001);
    assert.strictEqual(discovery.servers.length, 0, 'should be removed after 2 misses');
  });

  it('should transition to backoff after 5 empty scans', async () => {
    discovery = new ServerDiscovery(defaultConfig());
    discovery.start();

    // 5 empty scans at 30s intervals
    for (let i = 0; i < 5; i++) {
      await clock.tickAsync(30001);
    }

    assert.strictEqual(discovery.state, 'backoff');
  });

  it('should use correct intervals per state', async () => {
    discovery = new ServerDiscovery(defaultConfig());
    discovery.start();
    await clock.tickAsync(1);

    // Searching state — 30s interval
    const callsBefore = fetchStub.callCount;
    await clock.tickAsync(30001);
    assert.ok(fetchStub.callCount > callsBefore, 'should poll at 30s in searching');

    // Transition to connected
    stubPortAlive(8642);
    await clock.tickAsync(30001);
    assert.strictEqual(discovery.state, 'connected');

    // Connected state — 10s interval
    const callsConnected = fetchStub.callCount;
    await clock.tickAsync(3001);
    assert.strictEqual(
      fetchStub.callCount,
      callsConnected,
      'should NOT poll at 3s in connected',
    );
    await clock.tickAsync(7001);
    assert.ok(
      fetchStub.callCount > callsConnected,
      'should poll at 10s in connected',
    );
  });

  it('should stop polling on stop()', async () => {
    discovery = new ServerDiscovery(defaultConfig());
    discovery.start();
    await clock.tickAsync(1);

    discovery.stop();
    const callCount = fetchStub.callCount;
    await clock.tickAsync(10000);
    assert.strictEqual(fetchStub.callCount, callCount, 'no more polls after stop');
  });

  it('should retry from searching state on retry()', async () => {
    discovery = new ServerDiscovery(defaultConfig());
    discovery.start();

    // Go to backoff
    for (let i = 0; i < 5; i++) {
      await clock.tickAsync(30001);
    }
    assert.strictEqual(discovery.state, 'backoff');

    // Retry
    discovery.retry();
    assert.strictEqual(discovery.state, 'searching');
    await clock.tickAsync(1);
    // Should have polled again
    assert.ok(fetchStub.callCount > 0);
  });

  it('should not run further scans while paused', async () => {
    stubPortAlive(8642);
    discovery = new ServerDiscovery(defaultConfig());
    discovery.start();
    await clock.tickAsync(1);

    discovery.pause();
    const n = fetchStub.callCount;
    await clock.tickAsync(120000);
    assert.strictEqual(
      fetchStub.callCount,
      n,
      'pause must stop scheduled polls',
    );

    stubPortAlive(8642);
    discovery.resume();
    await clock.tickAsync(1);
    assert.ok(
      fetchStub.callCount > n,
      'resume should run at least one new scan',
    );
  });

  it('should auto-recover from backoff to searching after 3 backoff cycles', async () => {
    discovery = new ServerDiscovery(defaultConfig());
    discovery.start();

    // 5 empty scans → backoff (initial scan + 4 at 30s)
    for (let i = 0; i < 5; i++) {
      await clock.tickAsync(30001);
    }
    assert.strictEqual(discovery.state, 'backoff');

    // 3 backoff polls at 60s → auto-recovery to searching
    for (let i = 0; i < 3; i++) {
      await clock.tickAsync(60001);
    }
    assert.strictEqual(discovery.state, 'searching');
  });

  it('should reject health without package version', async () => {
    fetchStub
      .withArgs('http://127.0.0.1:8642/api/health', sinon.match.any)
      .resolves(makeResponse(JSON.stringify({ ok: true })));

    discovery = new ServerDiscovery(defaultConfig());
    discovery.start();
    await clock.tickAsync(1);

    assert.strictEqual(discovery.servers.length, 0);
  });

  it('should reject servers with ok !== true', async () => {
    fetchStub
      .withArgs('http://127.0.0.1:8642/api/health', sinon.match.any)
      .resolves(
        makeResponse(JSON.stringify({ ok: false, version: '2.8.2' })),
      );

    discovery = new ServerDiscovery(defaultConfig());
    discovery.start();
    await clock.tickAsync(1);

    assert.strictEqual(discovery.servers.length, 0);
  });

  it('should pass auth headers on discovery probes when configured', async () => {
    const authHeaders = { Authorization: 'Bearer test-token' };
    fetchStub
      .withArgs('http://127.0.0.1:8642/api/health', sinon.match.has('headers', authHeaders))
      .resolves(makeResponse(healthJson()));

    discovery = new ServerDiscovery({ ...defaultConfig(), authHeaders });
    discovery.start();
    await clock.tickAsync(1);

    assert.strictEqual(discovery.servers.length, 1);
    assert.strictEqual(discovery.servers[0].port, 8642);
  });

  it('should throttle notifications per port', async () => {
    stubPortAlive(8642);
    discovery = new ServerDiscovery(defaultConfig());

    discovery.start();
    await clock.tickAsync(1);
    assert.strictEqual(messageMock.infos.length, 1);

    // Server goes down (2 misses → removed) then comes back
    fetchStub.reset();
    fetchStub.rejects(new Error('connection refused'));
    await clock.tickAsync(10001);
    await clock.tickAsync(10001);

    // Server back up within 60s of first notification — poll fires at 30s interval
    stubPortAlive(8642);
    await clock.tickAsync(30001);
    // Notification should be throttled
    assert.strictEqual(messageMock.infos.length, 1, 'should throttle notification');
  });
});
