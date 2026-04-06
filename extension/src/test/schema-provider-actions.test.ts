/**
 * Schema provider tests — Part 3: Code actions (quick fixes).
 *
 * Covers provideCodeActions for all diagnostic codes that offer actions:
 *   - missing-fk-index       -> Copy CREATE INDEX
 *   - missing-id-index       -> Copy CREATE INDEX
 *   - missing-datetime-index -> Copy CREATE INDEX
 *   - column-name-acronym-mismatch -> Schema Diff
 *   - missing-column-in-db   -> Generate Migration + Schema Diff
 *   - orphaned-fk            -> View Anomaly Panel
 *
 * Basic schema checks live in schema-provider.test.ts.
 * Matching/anomaly tests live in schema-provider-matching.test.ts.
 */
import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  Diagnostic,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  Location,
  Range,
  Uri,
} from './vscode-mock-classes';
import { resetMocks } from './vscode-mock';
import { SchemaProvider } from '../diagnostics/providers/schema-provider';

describe('SchemaProvider', () => {
  /** Shared test fixtures — recreated before every test for isolation. */
  let provider: SchemaProvider;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    // Stub global fetch so no real HTTP requests escape during tests.
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify([]), { status: 200 }));

    provider = new SchemaProvider();

    resetMocks();
  });

  afterEach(() => {
    provider.dispose();
    sinon.restore();
  });

  describe('provideCodeActions', () => {
    it('should provide Copy action for missing-fk-index', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] FK column lacks index',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'missing-fk-index';
      diag.relatedInformation = [
        new DiagnosticRelatedInformation(
          new Location(
            Uri.parse('file:///test.dart'),
            new Range(10, 0, 10, 100),
          ),
          'Suggested: CREATE INDEX idx_test ON test(col)',
        ),
      ];

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.strictEqual(actions.length, 1);
      assert.ok(actions.some((a) => a.title.includes('Copy')));
      // "Run CREATE INDEX Now" was removed — server is read-only
      assert.ok(!actions.some((a) => a.title.includes('Run')));
      assert.ok(actions[0].isPreferred, 'Copy action should be preferred');
    });

    it('should provide Copy action for missing-id-index', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] Column ends in _id',
        DiagnosticSeverity.Hint,
      );
      diag.code = 'missing-id-index';
      diag.relatedInformation = [
        new DiagnosticRelatedInformation(
          new Location(
            Uri.parse('file:///test.dart'),
            new Range(10, 0, 10, 100),
          ),
          'Suggested: CREATE INDEX idx_orders_customer_id ON orders(customer_id)',
        ),
      ];

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.strictEqual(actions.length, 1);
      assert.ok(actions.some((a) => a.title.includes('Copy')));
    });

    it('should provide Copy action for missing-datetime-index', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] Date/time column may benefit from index',
        DiagnosticSeverity.Hint,
      );
      diag.code = 'missing-datetime-index';
      diag.relatedInformation = [
        new DiagnosticRelatedInformation(
          new Location(
            Uri.parse('file:///test.dart'),
            new Range(10, 0, 10, 100),
          ),
          'Suggested: CREATE INDEX idx_users_created_at ON users(created_at)',
        ),
      ];

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.strictEqual(actions.length, 1);
      assert.ok(actions.some((a) => a.title.includes('Copy')));
    });

    it('should provide Schema Diff action for column-name-acronym-mismatch', () => {
      const diag = new Diagnostic(
        new Range(15, 0, 15, 100),
        '[drift_advisor] Column name mismatch due to acronym splitting',
        DiagnosticSeverity.Error,
      );
      diag.code = 'column-name-acronym-mismatch';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(actions.some((a) => a.title.includes('Schema Diff')));
      assert.ok(actions[0].isPreferred, 'Schema Diff action should be preferred');
    });

    it('should provide migration actions for missing-column-in-db', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] Column missing',
        DiagnosticSeverity.Error,
      );
      diag.code = 'missing-column-in-db';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(actions.some((a) => a.title.includes('Generate Migration')));
      assert.ok(actions.some((a) => a.title.includes('Schema Diff')));
    });

    it('should provide View Anomaly action for orphaned-fk', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] Orphaned FK',
        DiagnosticSeverity.Error,
      );
      diag.code = 'orphaned-fk';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(actions.some((a) => a.title.includes('Anomaly Panel')));
    });
  });
});
