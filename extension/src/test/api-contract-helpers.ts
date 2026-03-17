/**
 * Shared helpers for API contract tests.
 */

import * as assert from 'assert';

/** Asserts that an object has all expected keys (catches drift from doc/API.md). */
export function assertHasKeys(
  obj: Record<string, unknown>,
  keys: string[],
  context: string,
): void {
  for (const key of keys) {
    assert.ok(key in obj, `${context}: missing key "${key}"`);
  }
}
