/**
 * Tests for the Suite Findings dashboard widget (plan 67 R3 holistic surface).
 *
 * The widget is exercised through the public registry definition: render is
 * pure given a summary, and fetch reduces a client envelope (siblings resolve to
 * [] here because the vscode mock has no workspace folder, so the counts come
 * solely from the Advisor envelope — deterministic).
 */
import * as assert from 'assert';
import { getWidgetDefinition } from '../dashboard/widget-registry';

describe('suiteFindings widget', () => {
  it('is registered with the expected metadata', () => {
    const def = getWidgetDefinition('suiteFindings');
    assert.ok(def, 'suiteFindings widget should be registered');
    assert.strictEqual(def.label, 'Suite Findings');
    assert.deepStrictEqual(def.configSchema, []);
  });

  it('renders the clean state with the open-panel deep link when there are no findings', () => {
    const def = getWidgetDefinition('suiteFindings')!;
    const html = def.renderHtml(
      { total: 0, tables: 0, advisor: 0, lints: 0, logCapture: 0, errors: 0, warnings: 0 },
      {},
    );
    assert.ok(html.includes('No suite findings'));
    // The deep link targets Advisor's own stable command id (plan 67 §3 / R5).
    assert.ok(html.includes("actionCommand:'driftViewer.openDriftHealth'"));
  });

  it('renders total, per-severity, and per-tool counts when there are findings', () => {
    const def = getWidgetDefinition('suiteFindings')!;
    const html = def.renderHtml(
      { total: 5, tables: 2, advisor: 3, lints: 1, logCapture: 1, errors: 2, warnings: 1 },
      {},
    );
    assert.ok(html.includes('>5<')); // total
    assert.ok(html.includes('2 tables'));
    assert.ok(html.includes('2 errors'));
    assert.ok(html.includes('1 warning')); // singular
    assert.ok(html.includes('Drift Advisor: <strong>3</strong>'));
    assert.ok(html.includes('Saropa Lints: <strong>1</strong>'));
    assert.ok(html.includes('Log Capture: <strong>1</strong>'));
  });

  it('reduces an Advisor envelope to tool and severity counts', async () => {
    const def = getWidgetDefinition('suiteFindings')!;
    // No workspace folder in the mock → sibling mirrors resolve to [], so the
    // counts come entirely from this envelope, relabeled source=advisor.
    const client = {
      issues: async () => ({
        issues: [
          { source: 'index-suggestion', table: 'orders', severity: 'warning' },
          { source: 'anomaly', table: 'users', severity: 'error' },
        ],
      }),
    };
    const summary = (await def.fetchData(client as never, {})) as {
      total: number; tables: number; advisor: number; errors: number; warnings: number;
    };
    assert.strictEqual(summary.total, 2);
    assert.strictEqual(summary.tables, 2);
    assert.strictEqual(summary.advisor, 2); // both relabeled source=advisor
    assert.strictEqual(summary.errors, 1);
    assert.strictEqual(summary.warnings, 1);
  });

  it('survives a thrown issues() call (server down) with zero counts', async () => {
    const def = getWidgetDefinition('suiteFindings')!;
    const client = { issues: async () => { throw new Error('server down'); } };
    const summary = (await def.fetchData(client as never, {})) as { total: number };
    assert.strictEqual(summary.total, 0);
  });
});
