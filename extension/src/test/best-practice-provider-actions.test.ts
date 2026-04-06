/**
 * Code-action tests for `BestPracticeProvider`.
 *
 * Split out from `best-practice-provider.test.ts` to keep each test
 * file under the 300-line budget. These tests exercise
 * `provideCodeActions` — verifying that the correct quick-fix and
 * navigation actions are offered for each diagnostic code.
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
} from './vscode-mock-classes';
import { resetMocks } from './vscode-mock';
import { BestPracticeProvider } from '../diagnostics/providers/best-practice-provider';

describe('BestPracticeProvider', () => {
  let provider: BestPracticeProvider;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify([]), { status: 200 }));

    provider = new BestPracticeProvider();
    resetMocks();
  });

  afterEach(() => {
    provider.dispose();
    sinon.restore();
  });

  describe('provideCodeActions', () => {
    it('should provide Disable Rule action for all diagnostics', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] Some issue',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'no-foreign-keys';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      const disableAction = actions.find((a) => a.title.includes('Disable'));
      assert.ok(disableAction, 'Should have Disable action');
      assert.ok(disableAction.title.includes('no-foreign-keys'));
    });

    it('should provide ER Diagram action for no-foreign-keys', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] No FKs',
        DiagnosticSeverity.Information,
      );
      diag.code = 'no-foreign-keys';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(actions.some((a) => a.title.includes('ER Diagram')));
    });

    it('should provide Impact action for circular-fk', () => {
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] Circular FK',
        DiagnosticSeverity.Warning,
      );
      diag.code = 'circular-fk';

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(actions.some((a) => a.title.includes('Impact')));
    });

    it('should not provide Profile action for blob-column-large (diagnostic removed)', () => {
      // blob-column-large was removed — verify no Profile action is offered
      const diag = new Diagnostic(
        new Range(10, 0, 10, 100),
        '[drift_advisor] BLOB warning',
        DiagnosticSeverity.Information,
      );
      diag.code = 'blob-column-large';
      (diag as any).data = { table: 'docs', column: 'content' };

      const actions = provider.provideCodeActions(diag as any, {} as any);

      assert.ok(!actions.some((a) => a.title.includes('Profile')),
        'Should not offer Profile action for removed diagnostic');
    });
  });
});
