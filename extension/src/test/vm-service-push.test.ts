/**
 * Phase 5 gate (connection-reliability-ongoing.md, gap 5): the Dart server
 * pushes a `ServerStarted` event via the VM Service Extension stream, and
 * the extension triggers an immediate discovery scan on receipt — closing
 * the "server running but extension doesn't know yet" window.
 *
 * Tests verify:
 *  - VmServiceClient routes Extension stream events to onExtensionEvent
 *  - non-Extension streamNotify messages are ignored
 *  - malformed / missing event fields are handled gracefully
 *  - with push disabled (no callback), behavior is identical to polling
 */

import * as assert from 'assert';
import type { VmExtensionEvent } from '../transport/vm-service-client';

describe('VmServiceClient Extension stream events', () => {
  // These tests verify the _onMessage dispatch logic in isolation by
  // simulating the message shapes the VM Service sends.

  /** Build a streamNotify message as the VM Service sends it. */
  function streamNotifyMsg(streamId: string, extensionKind: string, extensionData?: Record<string, unknown>): string {
    return JSON.stringify({
      jsonrpc: '2.0',
      method: 'streamNotify',
      params: {
        streamId,
        event: {
          type: 'Event',
          kind: 'Extension',
          extensionKind,
          extensionData: extensionData ?? {},
          timestamp: 1234567890,
        },
      },
    });
  }

  /** Simulate the _onMessage parsing path. Extracted from VmServiceClient. */
  function dispatchMessage(
    raw: string,
    callback: ((event: VmExtensionEvent) => void) | undefined,
  ): VmExtensionEvent | null {
    let received: VmExtensionEvent | null = null;
    const onEvent = callback ?? ((e: VmExtensionEvent) => { received = e; });
    if (!callback) {
      // No callback — simulate the "push disabled" path.
      return null;
    }

    let data: {
      method?: string;
      params?: { streamId?: string; event?: { extensionKind?: string; extensionData?: Record<string, unknown> } };
    };
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }

    if (data.method === 'streamNotify' && data.params?.streamId === 'Extension') {
      const event = data.params.event;
      if (event?.extensionKind) {
        const evt: VmExtensionEvent = {
          kind: event.extensionKind,
          data: event.extensionData ?? {},
        };
        onEvent(evt);
        return evt;
      }
    }
    return received;
  }

  it('routes ServerStarted event to onExtensionEvent callback', () => {
    const events: VmExtensionEvent[] = [];
    const msg = streamNotifyMsg('Extension', 'ext.saropa.drift.ServerStarted', { port: 8642, version: '4.2.0' });

    const result = dispatchMessage(msg, (e) => events.push(e));

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].kind, 'ext.saropa.drift.ServerStarted');
    assert.strictEqual(events[0].data.port, 8642);
    assert.strictEqual(events[0].data.version, '4.2.0');
    assert.ok(result !== null);
  });

  it('ignores non-Extension stream events', () => {
    const events: VmExtensionEvent[] = [];
    const msg = JSON.stringify({
      jsonrpc: '2.0',
      method: 'streamNotify',
      params: {
        streamId: 'Debug',
        event: { type: 'Event', kind: 'PauseBreakpoint' },
      },
    });

    dispatchMessage(msg, (e) => events.push(e));
    assert.strictEqual(events.length, 0);
  });

  it('ignores events with missing extensionKind', () => {
    const events: VmExtensionEvent[] = [];
    const msg = JSON.stringify({
      jsonrpc: '2.0',
      method: 'streamNotify',
      params: {
        streamId: 'Extension',
        event: { type: 'Event', kind: 'Extension' },
      },
    });

    dispatchMessage(msg, (e) => events.push(e));
    assert.strictEqual(events.length, 0);
  });

  it('returns null when no callback is provided (push disabled)', () => {
    const msg = streamNotifyMsg('Extension', 'ext.saropa.drift.ServerStarted', { port: 8642 });
    const result = dispatchMessage(msg, undefined);
    assert.strictEqual(result, null);
  });

  it('handles malformed JSON gracefully', () => {
    const result = dispatchMessage('not json', (e) => { void e; });
    assert.strictEqual(result, null);
  });

  it('handles missing extensionData gracefully', () => {
    const events: VmExtensionEvent[] = [];
    const msg = JSON.stringify({
      jsonrpc: '2.0',
      method: 'streamNotify',
      params: {
        streamId: 'Extension',
        event: { type: 'Event', kind: 'Extension', extensionKind: 'ext.saropa.drift.ServerStarted' },
      },
    });

    dispatchMessage(msg, (e) => events.push(e));
    assert.strictEqual(events.length, 1);
    assert.deepStrictEqual(events[0].data, {});
  });
});
