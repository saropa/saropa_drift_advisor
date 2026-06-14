/**
 * Tests for the Drift Health join model + panel HTML (plan 67 R4).
 */
import * as assert from 'assert';
import { buildDriftHealth } from '../suite/drift-health';
import { buildDriftHealthHtml } from '../suite/drift-health-html';
import type { SuiteDiagnostic } from '../suite/suite-diagnostics';

const d = (over: Partial<SuiteDiagnostic>): SuiteDiagnostic => ({ severity: 'info', ...over });

describe('buildDriftHealth', () => {
  it('groups by table and splits findings by tool', () => {
    const model = buildDriftHealth([
      d({ source: 'advisor', table: 'orders', title: 'missing index' }),
      d({ source: 'lints', table: 'orders', title: 'no where', ruleId: 'avoid_drift_update_without_where' }),
      d({ source: 'log-capture', table: 'orders', title: 'slow' }),
    ]);
    assert.strictEqual(model.tables.length, 1);
    const g = model.tables[0];
    assert.strictEqual(g.table, 'orders');
    assert.strictEqual(g.advisor.length, 1);
    assert.strictEqual(g.lints.length, 1);
    assert.strictEqual(g.logCapture.length, 1);
    assert.strictEqual(g.total, 3);
    assert.strictEqual(model.totalIssues, 3);
  });

  it('merges case-variant table names and keeps first-seen display casing', () => {
    const model = buildDriftHealth([
      d({ source: 'advisor', table: 'Orders' }),
      d({ source: 'lints', table: 'orders' }),
    ]);
    assert.strictEqual(model.tables.length, 1);
    assert.strictEqual(model.tables[0].table, 'Orders');
    assert.strictEqual(model.tables[0].total, 2);
  });

  it('sorts tables by total desc, then name', () => {
    const model = buildDriftHealth([
      d({ source: 'advisor', table: 'a' }),
      d({ source: 'advisor', table: 'b' }),
      d({ source: 'lints', table: 'b' }),
    ]);
    assert.deepStrictEqual(model.tables.map((t) => t.table), ['b', 'a']);
  });

  it('routes table-less findings to untabled', () => {
    const model = buildDriftHealth([
      d({ source: 'log-capture', sql: 'SELECT 1', title: 'query-level' }),
    ]);
    assert.strictEqual(model.tables.length, 0);
    assert.strictEqual(model.untabled.length, 1);
    assert.strictEqual(model.totalIssues, 1);
  });

  it('ignores findings from unknown producers', () => {
    const model = buildDriftHealth([
      d({ source: 'mystery', table: 'orders' }),
      d({ source: 'advisor', table: 'orders' }),
    ]);
    assert.strictEqual(model.totalIssues, 1);
    assert.strictEqual(model.tables[0].advisor.length, 1);
  });
});

describe('buildDriftHealthHtml', () => {
  it('shows the empty state with no findings', () => {
    const html = buildDriftHealthHtml({ tables: [], untabled: [], totalIssues: 0 });
    assert.ok(html.includes('No suite findings'));
  });

  it('flags a finding from a different commit as stale, but not a matching or unknown one', () => {
    const model = buildDriftHealth([
      d({ source: 'lints', table: 'orders', title: 'old finding', commitSha: 'OLD' }),
    ]);
    // Assert on the rendered badge (class="dh-stale"); the bare token dh-stale
    // also appears in the CSS, so match the attribute form that only a rendered
    // finding produces.
    // Different current commit → stale.
    assert.ok(buildDriftHealthHtml(model, 'NEW').includes('class="dh-stale"'));
    // Same commit → not stale.
    assert.ok(!buildDriftHealthHtml(model, 'OLD').includes('class="dh-stale"'));
    // Unknown current commit → never guess.
    assert.ok(!buildDriftHealthHtml(model).includes('class="dh-stale"'));
  });

  it('renders the severity filter toolbar with per-severity counts and sort control', () => {
    const html = buildDriftHealthHtml(buildDriftHealth([
      d({ source: 'advisor', table: 'orders', severity: 'error' }),
      d({ source: 'lints', table: 'orders', severity: 'warning' }),
      d({ source: 'advisor', table: 'users', severity: 'info' }),
    ]));
    assert.ok(html.includes('data-sev-filter="all"'));
    assert.ok(html.includes('data-sev-filter="error"'));
    assert.ok(html.includes('data-sev-filter="warning"'));
    assert.ok(html.includes('data-sev-filter="info"'));
    assert.ok(html.includes('class="dh-sort-select"'));
    // Cards carry sort keys.
    assert.ok(html.includes('data-total='));
    assert.ok(html.includes('data-table='));
    // Findings carry the severity used by the client-side filter.
    assert.ok(html.includes('data-sev="error"'));
  });

  it('omits the toolbar in the empty state', () => {
    const html = buildDriftHealthHtml({ tables: [], untabled: [], totalIssues: 0 });
    // Assert on the rendered element (class="dh-toolbar"); the bare token also
    // appears in the CSS rule.
    assert.ok(!html.includes('class="dh-toolbar"'));
  });

  it('renders a table card with tool columns and escapes text', () => {
    const html = buildDriftHealthHtml(buildDriftHealth([
      d({ source: 'advisor', table: 'orders', title: 'missing index' }),
      d({ source: 'lints', table: 'orders', title: '<script>x</script>', ruleId: 'r1' }),
    ]));
    assert.ok(html.includes('orders'));
    assert.ok(html.includes('Drift Advisor'));
    assert.ok(html.includes('Saropa Lints'));
    assert.ok(html.includes('r1'));
    assert.ok(!html.includes('<script>x</script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});
