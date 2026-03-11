import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { HoverCache } from '../hover/drift-hover-provider';

const vscodeMock = vscode as any;

describe('HoverCache', () => {
  let clock: sinon.SinonFakeTimers;
  let cache: HoverCache;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    cache = new HoverCache();
  });

  afterEach(() => {
    clock.restore();
  });

  it('should return null for unknown key', () => {
    assert.strictEqual(cache.get('missing'), null);
  });

  it('should return cached hover within TTL', () => {
    const hover = new vscodeMock.Hover(
      new vscodeMock.MarkdownString('test'),
    );
    cache.set('users', hover, 10_000);
    assert.strictEqual(cache.get('users'), hover);
  });

  it('should return null after TTL expires', () => {
    const hover = new vscodeMock.Hover(
      new vscodeMock.MarkdownString('test'),
    );
    cache.set('users', hover, 10_000);
    clock.tick(10_001);
    assert.strictEqual(cache.get('users'), null);
  });

  it('should remove expired entries on read', () => {
    const hover = new vscodeMock.Hover(
      new vscodeMock.MarkdownString('test'),
    );
    cache.set('users', hover, 5000);
    clock.tick(5001);
    cache.get('users'); // triggers cleanup
    // Set a new value — should not conflict with old entry
    const hover2 = new vscodeMock.Hover(
      new vscodeMock.MarkdownString('test2'),
    );
    cache.set('users', hover2, 5000);
    assert.strictEqual(cache.get('users'), hover2);
  });

  it('should clear all entries', () => {
    const hover = new vscodeMock.Hover(
      new vscodeMock.MarkdownString('test'),
    );
    cache.set('users', hover, 10_000);
    cache.set('orders', hover, 10_000);
    cache.clear();
    assert.strictEqual(cache.get('users'), null);
    assert.strictEqual(cache.get('orders'), null);
  });
});
