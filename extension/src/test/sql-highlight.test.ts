/**
 * Tests for the modular SQL syntax highlighter.
 * Ensures keywords, strings, numbers, comments, and identifiers are wrapped
 * with the correct span classes and that output is HTML-safe.
 */

import * as assert from 'assert';
import { highlightSql, sqlHighlightCss } from '../sql-highlight';

describe('highlightSql', () => {
  it('returns empty string for null/empty input', () => {
    assert.strictEqual(highlightSql(''), '');
    assert.strictEqual(highlightSql(null as any), '');
    assert.strictEqual(highlightSql(undefined as any), '');
  });

  it('wraps SQL keywords with sql-kw class', () => {
    const out = highlightSql('CREATE INDEX ON table');
    assert.ok(out.includes('class="sql-kw"'));
    assert.ok(out.includes('>CREATE<'));
    assert.ok(out.includes('>INDEX<'));
    assert.ok(out.includes('>ON<'));
  });

  it('wraps identifiers (non-keywords) as sql-plain', () => {
    const out = highlightSql('SELECT foo FROM bar');
    assert.ok(out.includes('class="sql-plain"'));
    assert.ok(out.includes('>foo<'));
    assert.ok(out.includes('>bar<'));
  });

  it('wraps single-quoted strings with sql-str (doubled quote escape)', () => {
    const out = highlightSql("'hello''world'");
    assert.ok(out.includes('class="sql-str"'));
    assert.ok(out.includes("'hello''world'"));
  });

  it('wraps double-quoted identifiers with sql-id', () => {
    const out = highlightSql('"column_name"');
    assert.ok(out.includes('class="sql-id"'));
    assert.ok(out.includes('column_name')); // content is HTML-escaped (quotes → &quot;)
  });

  it('wraps numbers with sql-num', () => {
    const out = highlightSql('LIMIT 10 OFFSET 0');
    assert.ok(out.includes('class="sql-num"'));
    assert.ok(out.includes('>10<'));
    assert.ok(out.includes('>0<'));
  });

  it('wraps line comments with sql-cmt', () => {
    const out = highlightSql('-- single line comment\nSELECT 1');
    assert.ok(out.includes('class="sql-cmt"'));
    assert.ok(out.includes('-- single line comment'));
  });

  it('wraps block comments with sql-cmt', () => {
    const out = highlightSql('/* block\ncomment */SELECT 1');
    assert.ok(out.includes('class="sql-cmt"'));
    assert.ok(out.includes('/* block'));
  });

  it('escapes HTML in output (no XSS)', () => {
    const out = highlightSql('<script>alert(1)</script>');
    assert.ok(!out.includes('<script>'));
    assert.ok(out.includes('&lt;'));
    assert.ok(out.includes('&gt;'));
  });

  it('handles schema DDL snippet like real usage', () => {
    const sql = 'CREATE INDEX idx_affirmation_focus ON affirmations (focus);';
    const out = highlightSql(sql);
    assert.ok(out.includes('class="sql-kw"')); // CREATE, INDEX, ON
    assert.ok(out.includes('class="sql-plain"')); // idx_affirmation_focus, affirmations, focus
    assert.ok(out.includes('idx_affirmation_focus'));
    assert.ok(out.includes('affirmations'));
  });
});

describe('sqlHighlightCss', () => {
  it('defines classes used by highlightSql', () => {
    assert.ok(sqlHighlightCss.includes('.sql-kw'));
    assert.ok(sqlHighlightCss.includes('.sql-str'));
    assert.ok(sqlHighlightCss.includes('.sql-num'));
    assert.ok(sqlHighlightCss.includes('.sql-cmt'));
    assert.ok(sqlHighlightCss.includes('.sql-id'));
    assert.ok(sqlHighlightCss.includes('.sql-plain'));
  });
});
