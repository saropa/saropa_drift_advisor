import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
} from './vscode-mock-classes';
import { resetMocks } from './vscode-mock';
import { DataQualityProvider } from '../diagnostics/providers/data-quality-provider';

describe('DataQualityProvider code actions', () => {
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

  describe('provideCodeActions', () => {
    it('should provide Profile Column action for high-null-rate', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] High null rate',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'high-null-rate';
      (diag as any).data = { table: 'users', column: 'bio' };

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(actions.some((a) => a.title.includes('Profile')));
    });

    it('should provide a Disable rule action for data-quality diagnostics', () => {
      // Previously the data-quality provider offered no "Disable rule" lightbulb,
      // forcing a manual settings edit. Every code here should now expose it.
      for (const code of ['high-null-rate', 'unused-column', 'data-skew']) {
        const diag = new Diagnostic(
          new Range(10, 0, 10, 100),
          `[drift_advisor] ${code}`,
          DiagnosticSeverity.Warning,
        );
        diag.code = code;
        (diag as any).data = { table: 'users', column: 'bio' };

        const actions = provider.provideCodeActions(diag as any, {} as any);
        const disable = actions.find((a) => a.title.includes('Disable'));
        assert.ok(disable, `Should offer Disable rule for ${code}`);
        assert.strictEqual(disable.command?.command, 'driftViewer.disableDiagnosticRule');
        assert.deepStrictEqual(disable.command?.arguments, [code]);
      }
    });

    it('should provide Size Analytics action for data-skew', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] Data skew',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'data-skew';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(actions.some((a) => a.title.includes('Size Analytics')));
    });
  });
});
