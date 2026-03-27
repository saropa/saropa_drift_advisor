/**
 * Focused tests for DriftApiClient change-detection endpoints.
 */
import * as assert from 'assert';
import * as sinon from 'sinon';
import { DriftApiClient } from '../api-client';

describe('DriftApiClient change detection', () => {
  let fetchStub: sinon.SinonStub;
  let client: DriftApiClient;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
    client = new DriftApiClient('127.0.0.1', 8642);
  });

  afterEach(() => {
    fetchStub.restore();
  });

  describe('getChangeDetection()', () => {
    it('returns true when server returns changeDetection true', async () => {
      fetchStub.resolves(new Response(JSON.stringify({ changeDetection: true }), { status: 200 }));
      const result = await client.getChangeDetection();
      assert.strictEqual(result, true);
    });

    it('returns false when server returns changeDetection false', async () => {
      fetchStub.resolves(new Response(JSON.stringify({ changeDetection: false }), { status: 200 }));
      const result = await client.getChangeDetection();
      assert.strictEqual(result, false);
    });

    it('treats missing changeDetection as true', async () => {
      fetchStub.resolves(new Response(JSON.stringify({}), { status: 200 }));
      const result = await client.getChangeDetection();
      assert.strictEqual(result, true);
    });
  });

  describe('setChangeDetection()', () => {
    it('POSTs enabled true and returns new state', async () => {
      fetchStub.resolves(new Response(JSON.stringify({ changeDetection: true }), { status: 200 }));
      const result = await client.setChangeDetection(true);
      assert.strictEqual(result, true);
    });

    it('POSTs enabled false and returns new state', async () => {
      fetchStub.resolves(new Response(JSON.stringify({ changeDetection: false }), { status: 200 }));
      const result = await client.setChangeDetection(false);
      assert.strictEqual(result, false);
    });
  });
});
