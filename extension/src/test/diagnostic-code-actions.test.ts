import * as assert from 'assert';
import * as sinon from 'sinon';
import {
  CodeAction,
  CodeActionKind,
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Uri,
} from './vscode-mock-classes';
import { resetMocks } from './vscode-mock';
import { DriftApiClient } from '../api-client';
import { SchemaIntelligence } from '../engines/schema-intelligence';
import { QueryIntelligence } from '../engines/query-intelligence';
import {
  DiagnosticManager,
  DiagnosticCodeActionProvider,
} from '../diagnostics/diagnostic-manager';
import type { IDiagnosticProvider } from '../diagnostics/diagnostic-types';

describe('DiagnosticCodeActionProvider', () => {
  let client: DriftApiClient;
  let manager: DiagnosticManager;
  let actionProvider: DiagnosticCodeActionProvider;
  let fetchStub: sinon.SinonStub;

  beforeEach(() => {
    fetchStub = sinon.stub(global, 'fetch');
    fetchStub.resolves(new Response(JSON.stringify([]), { status: 200 }));

    client = new DriftApiClient('127.0.0.1', 8642);
    const schemaIntel = new SchemaIntelligence(client);
    const queryIntel = new QueryIntelligence(client);
    manager = new DiagnosticManager(client, schemaIntel, queryIntel);
    actionProvider = new DiagnosticCodeActionProvider(manager);

    resetMocks();
  });

  afterEach(() => {
    manager.dispose();
    sinon.restore();
  });

  it('should only handle Drift Advisor diagnostics', () => {
    const otherDiag = new Diagnostic(
      new Range(0, 0, 0, 10),
      'Other error',
      DiagnosticSeverity.Error,
    );
    otherDiag.source = 'TypeScript';

    const actions = actionProvider.provideCodeActions(
      {} as any,
      new Range(0, 0, 0, 10) as any,
      { diagnostics: [otherDiag] } as any,
    );

    assert.strictEqual(actions.length, 0);
  });

  it('should attach diagnostics to code actions', () => {
    const codeAction = new CodeAction('Fix it', CodeActionKind.QuickFix);

    const provider: IDiagnosticProvider = {
      id: 'schema',
      category: 'schema',
      collectDiagnostics: () => Promise.resolve([]),
      provideCodeActions: () => [codeAction] as any,
      dispose: () => {},
    };

    manager.registerProvider(provider);

    const diag = new Diagnostic(
      new Range(0, 0, 0, 10),
      '[drift_advisor] Test',
      DiagnosticSeverity.Warning,
    );
    diag.source = 'Drift Advisor';
    diag.code = 'missing-fk-index';

    const actions = actionProvider.provideCodeActions(
      { uri: Uri.parse('file:///lib/x.dart') } as any,
      new Range(0, 0, 0, 10) as any,
      { diagnostics: [diag] } as any,
    );

    // Provider's "Fix it" plus the two always-on inline-ignore quick fixes the
    // manager appends. Every returned action gets the source diagnostic attached.
    assert.strictEqual(actions.length, 3);
    assert.ok(actions.some((a) => a.title === 'Fix it'));
    for (const a of actions) {
      assert.deepStrictEqual(a.diagnostics, [diag]);
    }
  });
});
