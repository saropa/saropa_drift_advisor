import * as assert from 'assert';
import * as sinon from 'sinon';
import { resetMocks } from './vscode-mock';
import { DataQualityProvider } from '../diagnostics/providers/data-quality-provider';
import { createDartFile } from './diagnostic-test-helpers';
import { createContext } from './data-quality-test-helpers';

describe('DataQualityProvider', () => {
  let provider: DataQualityProvider;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify([]), { status: 200 }));

    provider = new DataQualityProvider();
    resetMocks();
  });

  afterEach(() => {
    provider.dispose();
    sinon.restore();
  });

  describe('collectDiagnostics', () => {
    it('should not report empty-table (diagnostic removed)', async () => {
      // Empty tables are a valid database state, not a data quality issue.
      // Tables start empty and are populated through application logic —
      // user-data tables, cache tables, and static-data tables are all
      // legitimately empty until their respective features are triggered.
      const ctx = createContext({
        dartFiles: [createDartFile('users', ['id', 'name'])],
        tables: [
          { name: 'users', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 0 },
        ],
      });

      const issues = await provider.collectDiagnostics(ctx);

      const issue = issues.find((i) => i.code === 'empty-table');
      assert.ok(!issue, 'Should not report empty-table diagnostic');
    });

    it('should return empty array when server is unreachable', async () => {
      const ctx = createContext({ dartFiles: [], tables: [] });
      (ctx.client.schemaMetadata as any) = () => Promise.reject(new Error('Server down'));

      const issues = await provider.collectDiagnostics(ctx);

      assert.strictEqual(issues.length, 0);
    });
  });
});
