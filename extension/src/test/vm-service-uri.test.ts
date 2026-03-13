/**
 * Unit tests for VM Service URI parsing (Plan 68).
 * Tests parseVmServiceUriFromOutput with sample Flutter/Dart debug output.
 */

import * as assert from 'assert';
import { parseVmServiceUriFromOutput } from '../vm-service-uri';

describe('parseVmServiceUriFromOutput', () => {
  it('extracts WebSocket URI from HTTP VM Service line (Flutter-style)', () => {
    const text = 'The Dart VM service is listening on http://127.0.0.1:56083/abc123/';
    const uri = parseVmServiceUriFromOutput(text);
    assert.strictEqual(uri, 'ws://127.0.0.1:56083/abc123/ws');
  });

  it('extracts WebSocket URI when output includes "available at:"', () => {
    const text = 'Flutter run key commands. r Hot reload. The VM service is available at: http://127.0.0.1:12345/xyz/';
    const uri = parseVmServiceUriFromOutput(text);
    assert.strictEqual(uri, 'ws://127.0.0.1:12345/xyz/ws');
  });

  it('returns existing ws:// URI unchanged', () => {
    const text = 'VM Service at ws://127.0.0.1:55998/def456/ws';
    const uri = parseVmServiceUriFromOutput(text);
    assert.strictEqual(uri, 'ws://127.0.0.1:55998/def456/ws');
  });

  it('normalizes http to ws and appends /ws when path has no trailing slash', () => {
    const text = 'http://127.0.0.1:8642/abc';
    const uri = parseVmServiceUriFromOutput(text);
    assert.strictEqual(uri, 'ws://127.0.0.1:8642/abc/ws');
  });

  it('returns undefined when no VM URL in text', () => {
    assert.strictEqual(parseVmServiceUriFromOutput('Hello world'), undefined);
    assert.strictEqual(parseVmServiceUriFromOutput('Listening on port 8642'), undefined);
  });

  it('uses first match when multiple URLs present', () => {
    const text = 'First http://127.0.0.1:1111/a/ then http://127.0.0.1:2222/b/';
    const uri = parseVmServiceUriFromOutput(text);
    assert.strictEqual(uri, 'ws://127.0.0.1:1111/a/ws');
  });
});
