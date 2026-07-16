import * as assert from 'assert';
import { Diagnostic, DiagnosticSeverity, Position, Range, Uri } from './vscode-mock-classes';
import {
  window,
  commands,
  mockCommands,
  resetMocks,
  mockDiagnosticsByUri,
  mockTextDocuments,
  appliedEdits,
  MockTextDocument,
  dialogMock,
  messageMock,
  fireDiagnosticsChanged,
  fireSelectionChanged,
} from './vscode-mock';
import { registerSuppressionCommands } from '../diagnostics/suppression-commands';
import { DIAGNOSTIC_SOURCE } from '../diagnostics/diagnostic-types';

const FILE_URI = Uri.parse('file:///lib/database/tables/user_data_table.dart');
// suppressInColumn/suppressInFile re-parse `document.uri.toString()` via
// `vscode.Uri.parse(args.uri)` before opening the document. The mock Uri
// isn't idempotent under that round trip (it re-wraps rather than
// re-parsing), so the doc-fixture lookup key differs from FILE_URI.toString()
// — compute it the same way the code under test does, not by re-deriving it.
const DOC_LOOKUP_KEY = Uri.parse(FILE_URI.toString()).toString();

/** Builds a Drift Advisor diagnostic at the given line, mirroring what the diagnostic providers emit. */
function driftDiagnostic(line: number, code: string, message = 'finding'): Diagnostic {
  const diag = new Diagnostic(new Range(line, 0, line, 10), message, DiagnosticSeverity.Warning);
  diag.source = DIAGNOSTIC_SOURCE;
  diag.code = code;
  return diag;
}

/** Points the mock active editor at FILE_URI with the cursor on `line`. */
function setCursor(line: number): void {
  window.activeTextEditor = {
    document: { uri: FILE_URI },
    selection: { active: new Position(line, 0) },
  } as any;
}

describe('suppression-commands', () => {
  let refreshCalls: number;

  beforeEach(() => {
    resetMocks();
    refreshCalls = 0;
    registerSuppressionCommands({ subscriptions: [] } as any, () => {
      refreshCalls++;
    });
    // 30 blank lines so suppressInColumn's `doc.lineCount` clamp never
    // shortens a target line back to 0 for the line numbers these tests use.
    mockTextDocuments.set(
      DOC_LOOKUP_KEY,
      // Unindented on purpose: suppressInColumn mirrors the target line's
      // indentation into the inserted comment, and assertions below check
      // the directive text verbatim — indentation is covered separately by
      // suppression-commands.ts's existing lightbulb-path tests.
      new MockTextDocument(FILE_URI, Array.from({ length: 30 }, () => 'final x = 1;')),
    );
  });

  describe('suppressDiagnosticAtCursor (column scope)', () => {
    it('warns and inserts nothing when no editor is active', async () => {
      window.activeTextEditor = undefined;
      await commands.executeRegistered('driftViewer.suppressDiagnosticAtCursor');

      assert.strictEqual(appliedEdits.length, 0);
      assert.strictEqual(refreshCalls, 0);
      assert.ok(messageMock.warnings.some((w) => w.includes('Open the file')));
    });

    it('warns when the file has no Drift Advisor findings at all', async () => {
      setCursor(5);
      mockDiagnosticsByUri.set(FILE_URI.toString(), []);
      await commands.executeRegistered('driftViewer.suppressDiagnosticAtCursor');

      assert.strictEqual(appliedEdits.length, 0);
      assert.ok(messageMock.warnings.some((w) => w.includes('No Drift Advisor findings in this file')));
    });

    it('resolves a diagnostic exactly on the cursor line and inserts its code', async () => {
      setCursor(5);
      mockDiagnosticsByUri.set(FILE_URI.toString(), [driftDiagnostic(5, 'missing-fk-index')]);
      await commands.executeRegistered('driftViewer.suppressDiagnosticAtCursor');

      assert.strictEqual(appliedEdits.length, 1);
      const insert = appliedEdits[0].inserts[0];
      assert.strictEqual(insert.text, '// drift-advisor:ignore missing-fk-index\n');
      assert.strictEqual(insert.position.line, 5);
      assert.strictEqual(refreshCalls, 1);
    });

    it('falls back to the nearest finding when the cursor line has none, within the window', async () => {
      setCursor(5);
      // 2 lines away — inside NEAR_CURSOR_LINE_WINDOW (3).
      mockDiagnosticsByUri.set(FILE_URI.toString(), [driftDiagnostic(7, 'unindexed-fk')]);
      await commands.executeRegistered('driftViewer.suppressDiagnosticAtCursor');

      assert.strictEqual(appliedEdits.length, 1);
      assert.strictEqual(appliedEdits[0].inserts[0].text, '// drift-advisor:ignore unindexed-fk\n');
    });

    it('refuses to resolve a finding outside the near-cursor window', async () => {
      setCursor(5);
      // 10 lines away — outside NEAR_CURSOR_LINE_WINDOW (3).
      mockDiagnosticsByUri.set(FILE_URI.toString(), [driftDiagnostic(15, 'unindexed-fk')]);
      await commands.executeRegistered('driftViewer.suppressDiagnosticAtCursor');

      assert.strictEqual(appliedEdits.length, 0);
      assert.ok(
        messageMock.warnings.some((w) => w.includes('No Drift Advisor finding within 3 lines')),
      );
    });

    it('offers a QuickPick when two findings tie on the same line, and inserts the picked code', async () => {
      setCursor(5);
      const first = driftDiagnostic(5, 'code-a', 'first finding');
      const second = driftDiagnostic(5, 'code-b', 'second finding');
      mockDiagnosticsByUri.set(FILE_URI.toString(), [first, second]);
      dialogMock.quickPickResult = { label: 'code-b', diagnostic: second };

      await commands.executeRegistered('driftViewer.suppressDiagnosticAtCursor');

      assert.strictEqual(appliedEdits.length, 1);
      assert.strictEqual(appliedEdits[0].inserts[0].text, '// drift-advisor:ignore code-b\n');
    });

    it('offers a QuickPick when two findings on DIFFERENT lines are equidistant from the cursor', async () => {
      setCursor(5);
      // Lines 4 and 6 are both exactly 1 line from the cursor — a cross-line tie,
      // not the same-line case; both must be offered, not silently the first-found.
      const above = driftDiagnostic(4, 'code-above');
      const below = driftDiagnostic(6, 'code-below');
      mockDiagnosticsByUri.set(FILE_URI.toString(), [above, below]);
      dialogMock.quickPickResult = { label: 'code-below', diagnostic: below };

      await commands.executeRegistered('driftViewer.suppressDiagnosticAtCursor');

      assert.strictEqual(appliedEdits.length, 1);
      assert.strictEqual(appliedEdits[0].inserts[0].text, '// drift-advisor:ignore code-below\n');
    });

    it('inserts nothing when the user cancels the tie-break QuickPick', async () => {
      setCursor(5);
      mockDiagnosticsByUri.set(FILE_URI.toString(), [
        driftDiagnostic(5, 'code-a'),
        driftDiagnostic(5, 'code-b'),
      ]);
      dialogMock.quickPickResult = undefined;

      await commands.executeRegistered('driftViewer.suppressDiagnosticAtCursor');

      assert.strictEqual(appliedEdits.length, 0);
      assert.strictEqual(refreshCalls, 0);
    });

    it('refuses a finding with no diagnostic code instead of writing a suppress-all directive', async () => {
      setCursor(5);
      const noCode = driftDiagnostic(5, '');
      noCode.code = undefined;
      mockDiagnosticsByUri.set(FILE_URI.toString(), [noCode]);

      await commands.executeRegistered('driftViewer.suppressDiagnosticAtCursor');

      assert.strictEqual(appliedEdits.length, 0);
      assert.ok(messageMock.warnings.some((w) => w.includes('cannot be ignored individually')));
    });

    it('refuses a stale QuickPick pick if the finding changed while the pick was pending', async () => {
      setCursor(5);
      const first = driftDiagnostic(5, 'code-a');
      const second = driftDiagnostic(5, 'code-b');
      mockDiagnosticsByUri.set(FILE_URI.toString(), [first, second]);
      // Simulates the diagnostics refreshing (e.g. an edit or a background
      // sweep) in the gap between the QuickPick opening and the user
      // answering it — the picked object is now stale.
      dialogMock.quickPickResult = () => {
        mockDiagnosticsByUri.set(FILE_URI.toString(), [driftDiagnostic(5, 'code-a')]);
        return { label: 'code-b', diagnostic: second };
      };

      await commands.executeRegistered('driftViewer.suppressDiagnosticAtCursor');

      assert.strictEqual(appliedEdits.length, 0);
      assert.strictEqual(refreshCalls, 0);
      assert.ok(
        messageMock.warnings.some((w) => w.includes('changed before the pick was confirmed')),
      );
    });

    it('accepts a QuickPick pick that is still present after the pick resolves', async () => {
      setCursor(5);
      const first = driftDiagnostic(5, 'code-a');
      const second = driftDiagnostic(5, 'code-b');
      mockDiagnosticsByUri.set(FILE_URI.toString(), [first, second]);
      // Side effect that does NOT remove the picked finding — the accepted case.
      dialogMock.quickPickResult = () => {
        mockDiagnosticsByUri.set(FILE_URI.toString(), [first, second]);
        return { label: 'code-b', diagnostic: second };
      };

      await commands.executeRegistered('driftViewer.suppressDiagnosticAtCursor');

      assert.strictEqual(appliedEdits.length, 1);
      assert.strictEqual(appliedEdits[0].inserts[0].text, '// drift-advisor:ignore code-b\n');
    });
  });

  describe('suppressDiagnosticAtCursorFile (file scope)', () => {
    it('inserts a file-level ignore directive at the top of the file', async () => {
      setCursor(5);
      mockDiagnosticsByUri.set(FILE_URI.toString(), [driftDiagnostic(5, 'missing-fk-index')]);
      await commands.executeRegistered('driftViewer.suppressDiagnosticAtCursorFile');

      assert.strictEqual(appliedEdits.length, 1);
      const insert = appliedEdits[0].inserts[0];
      assert.strictEqual(insert.text, '// drift-advisor:ignore-file missing-fk-index\n');
      assert.strictEqual(insert.position.line, 0);
    });
  });

  describe('driftViewer.hasFindingNearCursor context key', () => {
    it('is true when a finding sits within the near-cursor window at registration time', () => {
      resetMocks();
      setCursor(5);
      mockDiagnosticsByUri.set(FILE_URI.toString(), [driftDiagnostic(7, 'code')]);
      registerSuppressionCommands({ subscriptions: [] } as any, () => {});

      assert.strictEqual(commands.getContext('driftViewer.hasFindingNearCursor'), true);
    });

    it('is false when the nearest finding is outside the window at registration time', () => {
      resetMocks();
      setCursor(5);
      mockDiagnosticsByUri.set(FILE_URI.toString(), [driftDiagnostic(20, 'code')]);
      registerSuppressionCommands({ subscriptions: [] } as any, () => {});

      assert.strictEqual(commands.getContext('driftViewer.hasFindingNearCursor'), false);
    });

    /** Debounce settles at 50ms; wait comfortably past it before asserting. */
    const DEBOUNCE_SETTLE_MS = 80;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    it('does not recompute when onDidChangeDiagnostics fires for an unrelated document', async () => {
      resetMocks();
      setCursor(5);
      registerSuppressionCommands({ subscriptions: [] } as any, () => {});
      assert.strictEqual(commands.getContext('driftViewer.hasFindingNearCursor'), false);

      // A finding now exists near the cursor, but the change event names a
      // DIFFERENT document — must not trigger a recompute.
      mockDiagnosticsByUri.set(FILE_URI.toString(), [driftDiagnostic(5, 'code')]);
      fireDiagnosticsChanged([Uri.parse('file:///lib/some/other_file.dart')]);
      await sleep(DEBOUNCE_SETTLE_MS);

      assert.strictEqual(commands.getContext('driftViewer.hasFindingNearCursor'), false);
    });

    it('recomputes when onDidChangeDiagnostics fires for the active document', async () => {
      resetMocks();
      setCursor(5);
      registerSuppressionCommands({ subscriptions: [] } as any, () => {});
      assert.strictEqual(commands.getContext('driftViewer.hasFindingNearCursor'), false);

      mockDiagnosticsByUri.set(FILE_URI.toString(), [driftDiagnostic(5, 'code')]);
      fireDiagnosticsChanged([FILE_URI]);
      await sleep(DEBOUNCE_SETTLE_MS);

      assert.strictEqual(commands.getContext('driftViewer.hasFindingNearCursor'), true);
    });

    it('coalesces rapid selection changes into a single setContext call', async () => {
      resetMocks();
      setCursor(5);
      registerSuppressionCommands({ subscriptions: [] } as any, () => {});
      mockDiagnosticsByUri.set(FILE_URI.toString(), [driftDiagnostic(5, 'code')]);
      mockCommands.reset(); // Drop the registration-time setContext call from the count.

      // Five selection changes back-to-back, no await between them — each
      // should reset the debounce timer rather than firing its own update.
      for (let i = 0; i < 5; i++) {
        fireSelectionChanged();
      }
      await sleep(DEBOUNCE_SETTLE_MS);

      const setContextCalls = mockCommands.executed.filter((id) => id === 'setContext');
      assert.strictEqual(setContextCalls.length, 1);
      assert.strictEqual(commands.getContext('driftViewer.hasFindingNearCursor'), true);
    });
  });
});
