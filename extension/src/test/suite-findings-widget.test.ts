/**
 * Tests for the Suite Findings dashboard widget (plan 67 R3 holistic surface).
 *
 * The widget is exercised both through the public registry definition and
 * through the exported renderSuiteFindingsHtml for truncation-badge coverage.
 * Fetch reduces a client envelope (siblings resolve to [] here because the
 * vscode mock has no workspace folder, so the counts come solely from the
 * Advisor envelope — deterministic).
 */
import * as assert from 'assert';
import { getWidgetDefinition } from '../dashboard/widget-registry';
import {
  renderSuiteFindingsHtml,
  type SuiteFindingsData,
} from '../dashboard/widgets/suite-findings-widget';
import type { SuiteFindingsSummary } from '../suite/drift-health';

/** Builds a minimal SuiteFindingsData with overrides. */
function data(
  over: Partial<SuiteFindingsSummary> = {},
  truncated = false,
): SuiteFindingsData {
  return {
    summary: {
      total: 0,
      tables: 0,
      advisor: 0,
      lints: 0,
      logCapture: 0,
      errors: 0,
      warnings: 0,
      ...over,
    },
    truncated,
  };
}

describe('suiteFindings widget', () => {
  it('is registered with the expected metadata', () => {
    const def = getWidgetDefinition('suiteFindings');
    assert.ok(def, 'suiteFindings widget should be registered');
    assert.strictEqual(def.label, 'Suite Findings');
    assert.deepStrictEqual(def.configSchema, []);
  });

  it('renders the clean state with the open-panel deep link when there are no findings', () => {
    const def = getWidgetDefinition('suiteFindings')!;
    // Now expects SuiteFindingsData shape (summary + truncated).
    const html = def.renderHtml(data(), {});
    assert.ok(html.includes('No suite findings'));
    // The deep-link button drives the dashboard's executeAction handler via a
    // delegated data-* attribute (inline onclick was removed for the C2b nonce
    // CSP); the command id is Advisor's own stable target (plan 67 §3 / R5).
    assert.ok(html.includes('data-click="executeAction"'));
    assert.ok(html.includes('data-a0="driftViewer.openDriftHealth"'));
  });

  it('renders total, per-severity, and per-tool counts when there are findings', () => {
    const def = getWidgetDefinition('suiteFindings')!;
    const html = def.renderHtml(
      data({ total: 5, tables: 2, advisor: 3, lints: 1, logCapture: 1, errors: 2, warnings: 1 }),
      {},
    );
    assert.ok(html.includes('>5')); // total (may have badge after it now)
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
    // fetchData now returns SuiteFindingsData with summary + truncated.
    const result = (await def.fetchData(client as never, {})) as SuiteFindingsData;
    assert.strictEqual(result.summary.total, 2);
    assert.strictEqual(result.summary.tables, 2);
    assert.strictEqual(result.summary.advisor, 2); // both relabeled source=advisor
    assert.strictEqual(result.summary.errors, 1);
    assert.strictEqual(result.summary.warnings, 1);
    assert.strictEqual(result.truncated, false);
  });

  it('survives a thrown issues() call (server down) with zero counts', async () => {
    const def = getWidgetDefinition('suiteFindings')!;
    const client = { issues: async () => { throw new Error('server down'); } };
    const result = (await def.fetchData(client as never, {})) as SuiteFindingsData;
    assert.strictEqual(result.summary.total, 0);
    assert.strictEqual(result.truncated, false);
  });

  it('propagates truncated from the Advisor envelope', async () => {
    const def = getWidgetDefinition('suiteFindings')!;
    // Envelope carries truncated: true — fetchData should forward it.
    const client = {
      issues: async () => ({
        issues: [
          { source: 'anomaly', table: 'users', severity: 'warning' },
        ],
        truncated: true,
      }),
    };
    const result = (await def.fetchData(client as never, {})) as SuiteFindingsData;
    assert.strictEqual(result.truncated, true);
    assert.strictEqual(result.summary.total, 1);
  });
});

describe('renderSuiteFindingsHtml — truncated badge', () => {
  it('omits the truncated badge by default', () => {
    const html = renderSuiteFindingsHtml(
      data({ total: 3, tables: 1, advisor: 3, errors: 1, warnings: 2 }),
    );
    // Match the rendered element, not the CSS rule (which always appears in
    // the <style> block regardless of truncation state).
    assert.ok(!html.includes('class="suite-trunc"'));
  });

  it('shows the ⚠ badge when the anomaly scan was partial', () => {
    const html = renderSuiteFindingsHtml(
      data({ total: 2, tables: 1, advisor: 2 }, true),
    );
    // Badge renders with the warning symbol and a tooltip.
    assert.ok(html.includes('class="suite-trunc"'));
    assert.ok(html.includes('⚠'));
    assert.ok(html.includes('title='));
  });

  it('does NOT show clean state when zero findings but truncated', () => {
    // Zero findings + truncated means the scan stopped before finding anything;
    // that is NOT a clean bill of health — the widget must not claim all-clear.
    const html = renderSuiteFindingsHtml(data({}, true));
    assert.ok(!html.includes('No suite findings'));
    assert.ok(html.includes('suite-trunc'));
  });
});
