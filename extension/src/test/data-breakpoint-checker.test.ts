import * as assert from 'assert';
import * as sinon from 'sinon';
import { DriftApiClient } from '../api-client';
import { DataBreakpointChecker } from '../data-breakpoint/data-breakpoint-checker';
import type { IDataBreakpoint } from '../data-breakpoint/data-breakpoint-types';

function makeBp(
  overrides: Partial<IDataBreakpoint> & Pick<IDataBreakpoint, 'type' | 'table'>,
): IDataBreakpoint {
  return {
    id: 'test-bp',
    label: 'test',
    enabled: true,
    hitCount: 0,
    ...overrides,
  };
}

describe('DataBreakpointChecker', () => {
  let fetchStub: sinon.SinonStub;
  let client: DriftApiClient;
  let checker: DataBreakpointChecker;

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch');
    client = new DriftApiClient('127.0.0.1', 8642);
    checker = new DataBreakpointChecker(client);
  });

  afterEach(() => {
    fetchStub.restore();
  });

  // --- conditionMet ---------------------------------------------------------

  describe('conditionMet', () => {
    it('should return hit when count > 0', async () => {
      fetchStub.resolves(
        new Response(
          JSON.stringify({ columns: ['cnt'], rows: [[3]] }),
          { status: 200 },
        ),
      );
      const bp = makeBp({
        type: 'conditionMet',
        table: 'users',
        condition: 'SELECT COUNT(*) FROM "users" WHERE balance < 0',
      });

      const hit = await checker.evaluate(bp);
      assert.ok(hit);
      assert.strictEqual(hit.matchCount, 3);
      assert.deepStrictEqual(hit.rows, [[3]]);
    });

    it('should return null when count is 0', async () => {
      fetchStub.resolves(
        new Response(
          JSON.stringify({ columns: ['cnt'], rows: [[0]] }),
          { status: 200 },
        ),
      );
      const bp = makeBp({
        type: 'conditionMet',
        table: 'users',
        condition: 'SELECT COUNT(*) FROM "users" WHERE balance < 0',
      });

      const hit = await checker.evaluate(bp);
      assert.strictEqual(hit, null);
    });

    it('should return null when result is empty', async () => {
      fetchStub.resolves(
        new Response(
          JSON.stringify({ columns: ['cnt'], rows: [] }),
          { status: 200 },
        ),
      );
      const bp = makeBp({
        type: 'conditionMet',
        table: 'users',
        condition: 'SELECT COUNT(*) FROM "users" WHERE 1=0',
      });

      const hit = await checker.evaluate(bp);
      assert.strictEqual(hit, null);
    });
  });

  // --- rowInserted ----------------------------------------------------------

  describe('rowInserted', () => {
    it('should not hit on first evaluation (baseline)', async () => {
      fetchStub.resolves(
        new Response(
          JSON.stringify({ columns: ['cnt'], rows: [[5]] }),
          { status: 200 },
        ),
      );
      const bp = makeBp({ type: 'rowInserted', table: 'orders' });

      const hit = await checker.evaluate(bp);
      assert.strictEqual(hit, null);
      assert.strictEqual(bp.lastRowCount, 5);
    });

    it('should hit when row count increases', async () => {
      const bp = makeBp({
        type: 'rowInserted',
        table: 'orders',
        lastRowCount: 5,
      });
      fetchStub.resolves(
        new Response(
          JSON.stringify({ columns: ['cnt'], rows: [[8]] }),
          { status: 200 },
        ),
      );

      const hit = await checker.evaluate(bp);
      assert.ok(hit);
      assert.strictEqual(hit.matchCount, 3);
      assert.strictEqual(hit.message, '3 row(s) inserted');
      assert.strictEqual(bp.lastRowCount, 8);
    });

    it('should not hit when count stays the same', async () => {
      const bp = makeBp({
        type: 'rowInserted',
        table: 'orders',
        lastRowCount: 5,
      });
      fetchStub.resolves(
        new Response(
          JSON.stringify({ columns: ['cnt'], rows: [[5]] }),
          { status: 200 },
        ),
      );

      const hit = await checker.evaluate(bp);
      assert.strictEqual(hit, null);
    });

    it('should not hit when count decreases', async () => {
      const bp = makeBp({
        type: 'rowInserted',
        table: 'orders',
        lastRowCount: 5,
      });
      fetchStub.resolves(
        new Response(
          JSON.stringify({ columns: ['cnt'], rows: [[3]] }),
          { status: 200 },
        ),
      );

      const hit = await checker.evaluate(bp);
      assert.strictEqual(hit, null);
    });
  });

  // --- rowDeleted -----------------------------------------------------------

  describe('rowDeleted', () => {
    it('should not hit on first evaluation (baseline)', async () => {
      fetchStub.resolves(
        new Response(
          JSON.stringify({ columns: ['cnt'], rows: [[10]] }),
          { status: 200 },
        ),
      );
      const bp = makeBp({ type: 'rowDeleted', table: 'orders' });

      const hit = await checker.evaluate(bp);
      assert.strictEqual(hit, null);
      assert.strictEqual(bp.lastRowCount, 10);
    });

    it('should hit when row count decreases', async () => {
      const bp = makeBp({
        type: 'rowDeleted',
        table: 'orders',
        lastRowCount: 10,
      });
      fetchStub.resolves(
        new Response(
          JSON.stringify({ columns: ['cnt'], rows: [[7]] }),
          { status: 200 },
        ),
      );

      const hit = await checker.evaluate(bp);
      assert.ok(hit);
      assert.strictEqual(hit.matchCount, 3);
      assert.strictEqual(hit.message, '3 row(s) deleted');
      assert.strictEqual(bp.lastRowCount, 7);
    });

    it('should not hit when count stays the same', async () => {
      const bp = makeBp({
        type: 'rowDeleted',
        table: 'orders',
        lastRowCount: 10,
      });
      fetchStub.resolves(
        new Response(
          JSON.stringify({ columns: ['cnt'], rows: [[10]] }),
          { status: 200 },
        ),
      );

      const hit = await checker.evaluate(bp);
      assert.strictEqual(hit, null);
    });

    it('should not hit when count increases', async () => {
      const bp = makeBp({
        type: 'rowDeleted',
        table: 'orders',
        lastRowCount: 10,
      });
      fetchStub.resolves(
        new Response(
          JSON.stringify({ columns: ['cnt'], rows: [[12]] }),
          { status: 200 },
        ),
      );

      const hit = await checker.evaluate(bp);
      assert.strictEqual(hit, null);
    });
  });

  // --- rowChanged -----------------------------------------------------------

  describe('rowChanged', () => {
    // rowChanged first resolves the table's columns from schema metadata (to
    // project BLOB columns as length() and avoid the blob-payload OOM), then
    // reads the rows. Stub both endpoints; the `users` table has no BLOB column,
    // so the read column list is plain.
    function stubRowChanged(rows: unknown[][]): void {
      fetchStub.withArgs(sinon.match(/schema\/metadata/)).resolves(
        new Response(
          JSON.stringify([
            {
              name: 'users',
              rowCount: rows.length,
              columns: [
                { name: 'id', type: 'INTEGER', pk: true },
                { name: 'name', type: 'TEXT', pk: false },
              ],
            },
          ]),
          { status: 200 },
        ),
      );
      fetchStub.withArgs(sinon.match(/api\/sql/)).resolves(
        new Response(
          JSON.stringify({ columns: ['id', 'name'], rows }),
          { status: 200 },
        ),
      );
    }

    it('should not hit on first evaluation (baseline)', async () => {
      stubRowChanged([[1, 'Alice']]);
      const bp = makeBp({ type: 'rowChanged', table: 'users' });

      const hit = await checker.evaluate(bp);
      assert.strictEqual(hit, null);
      assert.ok(bp.lastRowHash);
    });

    it('should hit when row data changes', async () => {
      const bp = makeBp({
        type: 'rowChanged',
        table: 'users',
        lastRowHash: JSON.stringify([[1, 'Alice']]),
      });
      stubRowChanged([[1, 'Bob']]);

      const hit = await checker.evaluate(bp);
      assert.ok(hit);
      assert.strictEqual(hit.message, 'Data changed');
    });

    it('should not hit when data is the same', async () => {
      const bp = makeBp({
        type: 'rowChanged',
        table: 'users',
        lastRowHash: JSON.stringify([[1, 'Alice']]),
      });
      stubRowChanged([[1, 'Alice']]);

      const hit = await checker.evaluate(bp);
      assert.strictEqual(hit, null);
    });

    it('projects a BLOB column as length() to avoid the blob-payload OOM', async () => {
      // Regression guard for BUG_TIMELINE_CAPTURE_SELECT_STAR_BLOB_OOM: the read
      // must not SELECT * over a table with image bytes.
      fetchStub.withArgs(sinon.match(/schema\/metadata/)).resolves(
        new Response(
          JSON.stringify([
            {
              name: 'contact_avatars',
              rowCount: 1,
              columns: [
                { name: 'id', type: 'INTEGER', pk: true },
                { name: 'image', type: 'BLOB', pk: false },
              ],
            },
          ]),
          { status: 200 },
        ),
      );
      let sentSql = '';
      fetchStub.withArgs(sinon.match(/api\/sql/)).callsFake(async (_url, init) => {
        sentSql = JSON.parse((init as RequestInit).body as string).sql;
        return new Response(
          JSON.stringify({ columns: ['id', 'image'], rows: [[1, 4096]] }),
          { status: 200 },
        );
      });
      const bp = makeBp({ type: 'rowChanged', table: 'contact_avatars' });

      await checker.evaluate(bp);
      assert.strictEqual(
        sentSql,
        'SELECT "id", length("image") AS "image" FROM "contact_avatars" LIMIT 1000',
      );
    });
  });
});
