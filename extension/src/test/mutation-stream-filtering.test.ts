import * as assert from 'assert';
import type { MutationEvent } from '../api-types';
import {
  matchesColumnValue,
  matchesSearch,
} from '../mutation-stream/mutation-stream-filtering';

describe('mutation-stream-filtering', () => {
  describe('matchesColumnValue() (column-value mode)', () => {
    const baseEvent: MutationEvent = {
      id: 1,
      type: 'update',
      table: 'users',
      sql: 'UPDATE users SET name = ? WHERE id = ?',
      before: [{ id: 1, name: 'Alice', email: 'a@example.com' }],
      after: [{ id: 1, name: 'Bob', email: 'b@example.com' }],
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    it('should match case-insensitively across both before+after snapshots', () => {
      assert.strictEqual(
        matchesColumnValue(baseEvent, 'name', 'alice'),
        true,
      );
      assert.strictEqual(
        matchesColumnValue(baseEvent, 'name', 'bob'),
        true,
      );
    });

    it('should support substring matching as a fallback', () => {
      assert.strictEqual(
        matchesColumnValue(baseEvent, 'name', 'lic'),
        true,
      );
      assert.strictEqual(
        matchesColumnValue(baseEvent, 'email', 'example'),
        true,
      );
    });

    it('should return true when the query is empty (no column filter)', () => {
      assert.strictEqual(matchesColumnValue(baseEvent, 'name', ''), true);
      assert.strictEqual(matchesColumnValue(baseEvent, 'name', '   '), true);
    });

    it('should return false when column is missing and query is non-empty', () => {
      assert.strictEqual(
        matchesColumnValue(baseEvent, 'does_not_exist', 'x'),
        false,
      );
    });
  });

  describe('matchesSearch() (free-text mode)', () => {
    const event: MutationEvent = {
      id: 2,
      type: 'insert',
      table: 'orders',
      sql: 'INSERT INTO orders(id, total) VALUES (1, 49.99)',
      before: null,
      after: [{ id: 1, total: 49.99 }],
      timestamp: '2026-01-01T00:00:00.000Z',
    };

    it('should match against sql text', () => {
      assert.strictEqual(matchesSearch(event, 'insert'), true);
      assert.strictEqual(matchesSearch(event, 'orders'), true);
    });

    it('should match against JSON snapshots', () => {
      assert.strictEqual(matchesSearch(event, '49.99'), true);
    });

    it('should return true on empty query', () => {
      assert.strictEqual(matchesSearch(event, ''), true);
    });
  });
});

