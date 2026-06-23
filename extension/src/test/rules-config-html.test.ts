/**
 * Tests for the Drift Advisor Rules configuration panel HTML builder. The panel
 * replaces the old sidebar tree; the invariants that keep it working are: each
 * rule renders a toggle reflecting its disabled state, a severity dropdown with
 * the current override selected, the finding count, exactly one script (so
 * acquireVsCodeApi is called once), and that all interpolated values are escaped.
 */

import * as assert from 'assert';
import {
  buildRulesConfigHtml,
  type RuleCategoryModel,
} from '../diagnostics/rules-config-html';

function categories(): RuleCategoryModel[] {
  return [
    {
      category: 'schema',
      label: 'Schema',
      rules: [
        {
          code: 'no-primary-key',
          description: 'Table has no primary key',
          count: 3,
          disabled: false,
          severity: '',
          defaultSeverityLabel: 'Warning',
        },
        {
          code: 'no-foreign-keys',
          description: 'Table defines no foreign keys',
          count: 0,
          disabled: true,
          severity: 'error',
          defaultSeverityLabel: 'Info',
        },
      ],
    },
  ];
}

describe('buildRulesConfigHtml', () => {
  it('emits exactly one script tag so acquireVsCodeApi is called once', () => {
    const html = buildRulesConfigHtml(categories(), 1, 1);
    const scripts = html.match(/<script/g) ?? [];
    assert.strictEqual(scripts.length, 1, `expected 1 script, got ${scripts.length}`);
    assert.ok(html.includes('acquireVsCodeApi()'));
  });

  it('renders an unchecked toggle for a disabled rule and a checked one otherwise', () => {
    const html = buildRulesConfigHtml(categories(), 1, 1);
    // Enabled rule: checkbox carries its code AND `checked`.
    assert.ok(
      /data-code="no-primary-key"[^>]*\schecked/.test(html),
      'enabled rule checkbox is checked',
    );
    // Disabled rule: checkbox carries its code WITHOUT `checked`.
    assert.ok(
      /data-code="no-foreign-keys"(?![^>]*\schecked)/.test(html),
      'disabled rule checkbox is unchecked',
    );
    assert.ok(html.includes('rule-disabled'), 'disabled row gets the dim class');
  });

  it('selects the current severity override in the dropdown', () => {
    const html = buildRulesConfigHtml(categories(), 1, 1);
    // The error-override rule has <option value="error" selected>.
    assert.ok(
      /<option value="error" selected>/.test(html),
      'overridden severity is the selected option',
    );
    // The no-override rule keeps the empty default option selected.
    assert.ok(
      /<option value=""[^>]*selected>/.test(html),
      'default (no override) option is selected when severity is empty',
    );
  });

  it('shows the finding count and the summary line', () => {
    const html = buildRulesConfigHtml(categories(), 1, 1);
    assert.ok(html.includes('>3<'), 'non-zero finding count rendered');
    assert.ok(html.includes('id="summary"'), 'summary element present');
  });

  it('escapes interpolated rule text to keep injected markup inert', () => {
    const cats: RuleCategoryModel[] = [
      {
        category: 'schema',
        label: 'Schema',
        rules: [
          {
            code: 'x',
            description: '<img src=x onerror=alert(1)>',
            count: 0,
            disabled: false,
            severity: '',
            defaultSeverityLabel: 'Warning',
          },
        ],
      },
    ];
    const html = buildRulesConfigHtml(cats, 1, 0);
    assert.ok(!html.includes('<img src=x'), 'raw injected tag is not present');
    assert.ok(html.includes('&lt;img src=x'), 'description is HTML-escaped');
  });
});
