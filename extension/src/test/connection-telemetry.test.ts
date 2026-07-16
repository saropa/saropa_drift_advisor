/**
 * Campaign candidate D gate (connection-reliability-ongoing.md): a scripted
 * flap sequence must produce a machine-readable transition log and correct
 * derived metrics (time-to-first-connect, flap count, reconnect latency).
 *
 * Uses the REAL ConnectionStateMachine so the telemetry observes exactly the
 * transitions production observes (onDidChange fires only on real phase
 * changes), with an injected fake clock for deterministic latencies.
 */

import * as assert from 'assert';
import { resetMocks } from './vscode-mock';
import { ConnectionStateMachine } from '../connection-state';
import { ConnectionTelemetry } from '../connection-telemetry';

describe('ConnectionTelemetry', () => {
  let machine: ConnectionStateMachine;
  let lines: string[];
  let nowMs: number;
  let telemetry: ConnectionTelemetry;

  beforeEach(() => {
    resetMocks();
    machine = new ConnectionStateMachine();
    lines = [];
    nowMs = 1_000_000;
    telemetry = new ConnectionTelemetry(
      machine,
      { appendLine: (l) => lines.push(l) },
      () => nowMs,
    );
  });

  afterEach(() => {
    telemetry.dispose();
    machine.dispose();
  });

  /** Drive the machine to the `connected` phase. */
  function connect(): void {
    machine.update({ httpServerSelected: true, schemaLoaded: true });
  }

  /** Drop the transport entirely (phase → disconnected). */
  function drop(): void {
    machine.update({ httpServerSelected: false, vmServiceActive: false, schemaLoaded: false });
  }

  it('records time-to-first-connect from session start', () => {
    nowMs += 2500;
    connect();

    const snap = telemetry.snapshot;
    assert.strictEqual(snap.timeToFirstConnectMs, 2500);
    assert.strictEqual(snap.flapCount, 0);
    assert.deepStrictEqual(snap.reconnectLatenciesMs, []);
  });

  it('counts flaps and measures reconnect latency across a scripted flap sequence', () => {
    // Connect at +1000, drop at +5000, reconnect at +7100 (latency 2100),
    // drop again at +9000, reconnect at +9500 (latency 500).
    nowMs += 1000;
    connect();
    nowMs += 4000;
    drop();
    nowMs += 2100;
    connect();
    nowMs += 1900;
    drop();
    nowMs += 500;
    connect();

    const snap = telemetry.snapshot;
    assert.strictEqual(snap.flapCount, 2);
    assert.deepStrictEqual(snap.reconnectLatenciesMs, [2100, 500]);
    // First-connect time is pinned to the FIRST connect, not later ones.
    assert.strictEqual(snap.timeToFirstConnectMs, 1000);
  });

  it('logs one machine-readable line per real transition', () => {
    nowMs += 1000;
    connect();
    nowMs += 4000;
    drop();
    nowMs += 2100;
    connect();

    // Transitions: disconnected→connected, connected→disconnected,
    // disconnected→connected — three lines, each carrying phase pair,
    // ms-since-activation, and flap count.
    assert.strictEqual(lines.length, 3);
    assert.ok(lines[0].includes('phase disconnected → connected'));
    assert.ok(lines[0].includes('+1000ms'));
    assert.ok(lines[0].includes('flaps=0'));
    assert.ok(lines[1].includes('phase connected → disconnected'));
    assert.ok(lines[1].includes('flaps=1'));
    assert.ok(lines[2].includes('reconnect=2100ms'));
  });

  it('does not record no-op signal updates (only real phase transitions)', () => {
    connect();
    const before = telemetry.snapshot.transitions.length;

    // Same signals again: phase unchanged, onDidChange must not fire.
    connect();
    machine.update({ offlineSchema: false });

    assert.strictEqual(telemetry.snapshot.transitions.length, before);
    assert.strictEqual(lines.length, before);
  });

  it('treats connected → connecting (schema lost, transport up) as a flap', () => {
    connect();
    nowMs += 1000;
    // Schema invalidated while the transport stays up — the user-visible
    // working state is gone, so this counts as a drop.
    machine.update({ schemaLoaded: false });
    nowMs += 300;
    machine.update({ schemaLoaded: true });

    const snap = telemetry.snapshot;
    assert.strictEqual(snap.flapCount, 1);
    assert.deepStrictEqual(snap.reconnectLatenciesMs, [300]);
  });

  it('stops observing after dispose', () => {
    connect();
    const count = telemetry.snapshot.transitions.length;
    telemetry.dispose();
    drop();
    assert.strictEqual(telemetry.snapshot.transitions.length, count);
  });
});
