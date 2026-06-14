/**
 * Tests for the shared sibling-notes renderer and the secure fix-action path
 * (plan 67 R1 / R3).
 */
import * as assert from 'assert';
import { resetMocks, commands } from './vscode-mock';
import { isAllowedSuiteCommand } from '../suite/suite-diagnostics';
import {
  renderSuiteFixButton,
  renderSuiteNotesSection,
  executeSuiteFix,
} from '../suite/suite-notes-html';

describe('isAllowedSuiteCommand', () => {
  it('allows only suite command prefixes', () => {
    assert.ok(isAllowedSuiteCommand('driftViewer.openTable'));
    assert.ok(isAllowedSuiteCommand('saropaLints.explainRule'));
    assert.ok(isAllowedSuiteCommand('saropaLogCapture.openSignal'));
  });

  it('rejects other commands and non-strings', () => {
    assert.ok(!isAllowedSuiteCommand('workbench.action.reloadWindow'));
    assert.ok(!isAllowedSuiteCommand('eval'));
    assert.ok(!isAllowedSuiteCommand(undefined));
    assert.ok(!isAllowedSuiteCommand(42));
  });
});

describe('renderSuiteFixButton', () => {
  const fixDiag = {
    fix: { title: 'Go to table definition', command: 'driftViewer.goToDefinitionForTable', args: [{ table: 'orders' }] },
  };

  it('renders a button when the command is allowed and available', () => {
    const html = renderSuiteFixButton(fixDiag, {
      availableCommands: new Set(['driftViewer.goToDefinitionForTable']),
    });
    assert.ok(html.includes('class="suite-fix"'));
    assert.ok(html.includes('Go to table definition'));
    assert.ok(html.includes('data-fix-cmd="driftViewer.goToDefinitionForTable"'));
  });

  it('renders nothing when the command is not registered', () => {
    assert.strictEqual(
      renderSuiteFixButton(fixDiag, { availableCommands: new Set() }),
      '',
    );
  });

  it('renders nothing for a disallowed command even if "available"', () => {
    const evil = { fix: { title: 'x', command: 'workbench.action.reloadWindow' } };
    assert.strictEqual(
      renderSuiteFixButton(evil, { availableCommands: new Set(['workbench.action.reloadWindow']) }),
      '',
    );
  });

  it('renders nothing when there is no fix', () => {
    assert.strictEqual(renderSuiteFixButton({ title: 'x' }), '');
  });
});

describe('renderSuiteNotesSection', () => {
  it('includes a fix button for an available command', () => {
    const html = renderSuiteNotesSection(
      [{ source: 'advisor', title: 'orphan table', fix: { title: 'Open', command: 'driftViewer.openTable', args: [] } }],
      { availableCommands: new Set(['driftViewer.openTable']) },
    );
    assert.ok(html.includes('class="suite-fix"'));
    assert.ok(html.includes('driftViewer.openTable'));
  });
});

describe('executeSuiteFix', () => {
  beforeEach(() => resetMocks());

  it('runs an allowed, registered command', async () => {
    let ran = false;
    commands.registerCommand('driftViewer.testFix', () => { ran = true; });
    const ok = await executeSuiteFix({ fixCommand: 'driftViewer.testFix', fixArgs: [] });
    assert.strictEqual(ok, true);
    assert.strictEqual(ran, true);
  });

  it('refuses a disallowed command', async () => {
    let ran = false;
    commands.registerCommand('workbench.action.reloadWindow', () => { ran = true; });
    const ok = await executeSuiteFix({ fixCommand: 'workbench.action.reloadWindow', fixArgs: [] });
    assert.strictEqual(ok, false);
    assert.strictEqual(ran, false);
  });

  it('refuses an allowed-but-unregistered command', async () => {
    const ok = await executeSuiteFix({ fixCommand: 'driftViewer.notRegistered', fixArgs: [] });
    assert.strictEqual(ok, false);
  });
});
