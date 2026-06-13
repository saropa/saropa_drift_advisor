import * as assert from 'assert';
import { SchemaIntelligence } from '../engines/schema-intelligence';
import type { DriftApiClient } from '../api-client';

// Audit M12: checkGeneration must detect an advancing schema generation and drop
// the cache. It was previously never called; this verifies it behaves correctly
// now that the generation watcher invokes it.
describe('SchemaIntelligence.checkGeneration (M12)', () => {
  it('returns true only when the generation advances', async () => {
    let gen = 1;
    const client = {
      generation: async () => gen,
    } as unknown as DriftApiClient;
    const engine = new SchemaIntelligence(client);

    // First check: -1 (initial) -> 1 is a change.
    assert.strictEqual(await engine.checkGeneration(), true);
    // No change.
    assert.strictEqual(await engine.checkGeneration(), false);

    // Generation advances (a migration landed).
    gen = 2;
    assert.strictEqual(await engine.checkGeneration(), true);
    assert.strictEqual(await engine.checkGeneration(), false);

    engine.dispose();
  });

  it('swallows a generation fetch error and reports no change', async () => {
    const client = {
      generation: async () => {
        throw new Error('offline');
      },
    } as unknown as DriftApiClient;
    const engine = new SchemaIntelligence(client);
    assert.strictEqual(await engine.checkGeneration(), false);
    engine.dispose();
  });
});
