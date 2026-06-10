/**
 * Phase 1 gate (connection-reliability-ongoing.md, gap 1): the connection-state model is the
 * single authority, and the two contradictions the history documents are now UNREPRESENTABLE:
 *   - "connected but no data"      — phase 'connected' without schemaLoaded, and
 *   - "disconnected but server running" — serverConnected=false while a transport is live.
 *
 * The pure-model tests below enumerate ALL 16 signal combinations and assert the invariants
 * hold for every one. The machine tests assert it is the single writer of both context keys
 * and that the change event fires only on real phase transitions.
 */

import * as assert from 'assert';
import { commands as vscodeCommands, resetMocks } from './vscode-mock';
import {
  type ConnectionSignals,
  type ConnectionPhase,
  computeConnectionPhase,
  deriveConnectionContexts,
  phaseHasTransport,
  ConnectionStateMachine,
} from '../connection-state';

/** All 16 combinations of the four boolean signals. */
function allSignalCombos(): ConnectionSignals[] {
  const combos: ConnectionSignals[] = [];
  for (let mask = 0; mask < 16; mask++) {
    combos.push({
      httpServerSelected: (mask & 1) !== 0,
      vmServiceActive: (mask & 2) !== 0,
      schemaLoaded: (mask & 4) !== 0,
      offlineSchema: (mask & 8) !== 0,
    });
  }
  return combos;
}

describe('connection-state (pure model)', () => {
  it('phase is total over all 16 signal combinations', () => {
    const valid: ConnectionPhase[] = ['disconnected', 'connecting', 'connected', 'offline'];
    for (const s of allSignalCombos()) {
      assert.ok(valid.includes(computeConnectionPhase(s)), `unexpected phase for ${JSON.stringify(s)}`);
    }
  });

  it('INVARIANT: serverConnected equals "a transport is live" for every combination', () => {
    for (const s of allSignalCombos()) {
      const transport = s.httpServerSelected || s.vmServiceActive;
      const flags = deriveConnectionContexts(computeConnectionPhase(s));
      assert.strictEqual(
        flags.serverConnected,
        transport,
        `serverConnected must mirror transport for ${JSON.stringify(s)}`,
      );
    }
  });

  it('INVARIANT: "connected but no data" is impossible — phase connected REQUIRES schemaLoaded', () => {
    for (const s of allSignalCombos()) {
      if (computeConnectionPhase(s) === 'connected') {
        assert.strictEqual(s.schemaLoaded, true, `connected phase without schema for ${JSON.stringify(s)}`);
      }
    }
  });

  it('INVARIANT: "disconnected but server running" is impossible — no transport ⇒ serverConnected false', () => {
    for (const s of allSignalCombos()) {
      const transport = s.httpServerSelected || s.vmServiceActive;
      const flags = deriveConnectionContexts(computeConnectionPhase(s));
      if (!transport) {
        assert.strictEqual(flags.serverConnected, false, `serverConnected true without transport: ${JSON.stringify(s)}`);
      }
    }
  });

  it('INVARIANT: databaseTreeEmpty is always false (tree-always-returns-rows workaround preserved)', () => {
    for (const s of allSignalCombos()) {
      assert.strictEqual(deriveConnectionContexts(computeConnectionPhase(s)).databaseTreeEmpty, false);
    }
  });

  it('a live transport wins over a stale offline cache (never reports "offline" while reachable)', () => {
    // http up + offline cache present + schema not yet loaded → connecting, not offline.
    assert.strictEqual(
      computeConnectionPhase({
        httpServerSelected: true,
        vmServiceActive: false,
        schemaLoaded: false,
        offlineSchema: true,
      }),
      'connecting',
    );
  });

  it('phaseHasTransport agrees with the two transport-bearing phases only', () => {
    assert.strictEqual(phaseHasTransport('connected'), true);
    assert.strictEqual(phaseHasTransport('connecting'), true);
    assert.strictEqual(phaseHasTransport('offline'), false);
    assert.strictEqual(phaseHasTransport('disconnected'), false);
  });
});

describe('ConnectionStateMachine (authority + transitions)', () => {
  let machine: ConnectionStateMachine;

  beforeEach(() => {
    resetMocks();
    machine = new ConnectionStateMachine();
  });

  afterEach(() => {
    machine.dispose();
  });

  it('drives the full lifecycle disconnected → connecting → connected → offline → disconnected', () => {
    const seen: ConnectionPhase[] = [];
    machine.onDidChange((p) => seen.push(p));

    // transport appears, schema not loaded yet
    machine.update({ httpServerSelected: true });
    assert.strictEqual(machine.phase, 'connecting');
    assert.strictEqual(machine.connected, true);
    assert.strictEqual(machine.working, false);

    // schema loads
    machine.update({ schemaLoaded: true });
    assert.strictEqual(machine.phase, 'connected');
    assert.strictEqual(machine.working, true);

    // server lost but cached schema remains on screen
    machine.update({ httpServerSelected: false, schemaLoaded: false, offlineSchema: true });
    assert.strictEqual(machine.phase, 'offline');
    assert.strictEqual(machine.connected, false);

    // cache cleared
    machine.update({ offlineSchema: false });
    assert.strictEqual(machine.phase, 'disconnected');

    assert.deepStrictEqual(seen, ['connecting', 'connected', 'offline', 'disconnected']);
  });

  it('is the single writer of BOTH context keys, and they always agree with the phase', () => {
    machine.update({ vmServiceActive: true, schemaLoaded: true });
    assert.strictEqual(vscodeCommands.getContext('driftViewer.serverConnected'), true);
    assert.strictEqual(vscodeCommands.getContext('driftViewer.databaseTreeEmpty'), false);

    machine.update({ vmServiceActive: false, schemaLoaded: false });
    assert.strictEqual(vscodeCommands.getContext('driftViewer.serverConnected'), false);
    assert.strictEqual(vscodeCommands.getContext('driftViewer.databaseTreeEmpty'), false);
  });

  it('re-pushes context on a no-op update (preserves the delayed-sync race workaround)', () => {
    machine.update({ httpServerSelected: true, schemaLoaded: true });
    // Simulate a stale context (a view re-evaluated before the original push landed).
    void vscodeCommands.executeCommand('setContext', 'driftViewer.serverConnected', false);
    // A no-op refresh (same signals) must re-assert the correct value.
    machine.update({});
    assert.strictEqual(vscodeCommands.getContext('driftViewer.serverConnected'), true);
  });

  it('does NOT fire the change event on a no-op update', () => {
    machine.update({ httpServerSelected: true, schemaLoaded: true });
    let fired = 0;
    machine.onDidChange(() => (fired += 1));
    machine.update({}); // same phase
    machine.update({ schemaLoaded: true }); // still connected
    assert.strictEqual(fired, 0);
  });
});
