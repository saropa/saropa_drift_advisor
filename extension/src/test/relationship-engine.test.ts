import * as assert from 'assert';
import { RelationshipEngine } from '../engines/relationship-engine';
import type { DriftApiClient } from '../api-client';

// Audit H6: the delete planner must delete dependent rows deepest-first,
// including LEAF rows (the ones holding the FKs that block the parent delete),
// each targeted by its OWN primary-key column; and traversal depth must reflect
// the real nesting level rather than being overwritten to 1.
//
// Schema for the fixture:
//   users(id) <- orders(id, user_id->users.id) <- order_items(id, order_id->orders.id)
describe('RelationshipEngine (H6 — safe delete + depth)', () => {
  function fakeClient(): DriftApiClient {
    const fks: Record<string, { fromColumn: string; toTable: string; toColumn: string }[]> = {
      users: [],
      orders: [{ fromColumn: 'user_id', toTable: 'users', toColumn: 'id' }],
      order_items: [{ fromColumn: 'order_id', toTable: 'orders', toColumn: 'id' }],
    };
    return {
      tableFkMeta: async (t: string) => fks[t] ?? [],
      schemaMetadata: async () => [
        { name: 'users' }, { name: 'orders' }, { name: 'order_items' },
      ],
      sql: async (query: string) => {
        // Dependent-row lookups (SELECT * FROM child WHERE fk = value).
        if (query.includes('"orders"') && query.includes('"user_id"')) {
          return { columns: ['id', 'user_id'], rows: [[10, 1], [11, 1]] };
        }
        if (query.includes('"order_items"') && query.includes('= 10')) {
          return { columns: ['id', 'order_id'], rows: [[100, 10]] };
        }
        if (query.includes('"order_items"') && query.includes('= 11')) {
          return { columns: ['id', 'order_id'], rows: [[101, 11]] };
        }
        return { columns: [] as string[], rows: [] as unknown[][] };
      },
    } as unknown as DriftApiClient;
  }

  it('safe-delete includes leaf rows, deepest-first, root last, by own pk column', async () => {
    const engine = new RelationshipEngine(fakeClient());
    const plan = await engine.generateSafeDeleteSql('users', 'id', 1);

    // Leaf order_items deletes MUST be present (the prior gate skipped leaves).
    const items = plan.statements.filter((s) => s.includes('"order_items"'));
    assert.strictEqual(items.length, 2, 'both leaf order_items rows deleted');
    assert.ok(plan.statements.some((s) => s.includes('"order_items" WHERE "id" = 100')));
    assert.ok(plan.statements.some((s) => s.includes('"order_items" WHERE "id" = 101')));

    // Ordering: every order_items delete precedes its parent orders delete, and
    // the root users delete is last.
    const idxItem100 = plan.statements.findIndex((s) => s.includes('"order_items" WHERE "id" = 100'));
    const idxOrder10 = plan.statements.findIndex((s) => s.includes('"orders" WHERE "id" = 10'));
    assert.ok(idxItem100 < idxOrder10, 'leaf before its parent');
    assert.ok(plan.statements[plan.statements.length - 1].includes('"users" WHERE "id" = 1'));

    engine.dispose();
  });

  it('tracks absolute traversal depth (not overwritten to 1)', async () => {
    const engine = new RelationshipEngine(fakeClient());
    const tree = await engine.walkDownstream('users', 1, 5, 20, 'id');
    assert.strictEqual(tree.depth, 0);
    const order = tree.children[0];
    assert.strictEqual(order.depth, 1);
    const item = order.children[0];
    assert.strictEqual(item.depth, 2, 'grandchild depth is 2, not 1');
    engine.dispose();
  });
});
