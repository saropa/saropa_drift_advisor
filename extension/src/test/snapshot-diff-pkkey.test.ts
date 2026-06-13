import * as assert from 'assert';
import { pkKey } from '../timeline/snapshot-diff';

// Audit M14: pkKey must not collapse values of different type/null-ness to the
// same key, which would mis-pair added/removed rows as "matched".
describe('pkKey (M14)', () => {
  it('distinguishes null from empty string', () => {
    const a = pkKey({ k: null, x: 'v' }, ['k', 'x']);
    const b = pkKey({ k: '', x: 'v' }, ['k', 'x']);
    assert.notStrictEqual(a, b);
  });

  it('distinguishes a number from its string form', () => {
    const a = pkKey({ id: 1 }, ['id']);
    const b = pkKey({ id: '1' }, ['id']);
    assert.notStrictEqual(a, b);
  });

  it('is stable for equal composite keys', () => {
    const a = pkKey({ a: 1, b: 'x' }, ['a', 'b']);
    const b = pkKey({ a: 1, b: 'x' }, ['a', 'b']);
    assert.strictEqual(a, b);
  });

  it('treats missing and null the same (both absent)', () => {
    const a = pkKey({ x: 'v' }, ['k', 'x']);
    const b = pkKey({ k: null, x: 'v' }, ['k', 'x']);
    assert.strictEqual(a, b);
  });
});
