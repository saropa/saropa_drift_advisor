/**
 * Regression test for plans/history/2026.09/20260902/084_web_viewer_nested_interactive_controls_tab_close_button_and_table_pin_button.md.
 *
 * The HTML content model forbids interactive content inside <button> and
 * inside <a href>. Two widgets violated it: every tab appended its close
 * <button> into the tab's own <button>, and every sidebar row appended its pin
 * <button> into the row's <a href>. Browsers tolerate the DOM-built result,
 * but assistive technology does not — the inner control was folded into the
 * outer accessible name, announced twice, or dropped, and keyboard focus order
 * differed between Chromium and Firefox.
 *
 * Both controls are now siblings inside a non-interactive wrapper. These are
 * source-level assertions: the builders are DOM-heavy and there is no headless
 * DOM in this suite, so the test pins the structural decision at the point
 * where it would be undone — the appendChild call.
 *
 * Run: `npm run test:web` (node --test).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Reads a web-viewer source file as text. */
async function readSrc(name) {
  return readFile(join(here, '..', name), 'utf8');
}

describe('tabs.ts — close button is not nested inside the tab button', () => {
  it('never appends the close button into the tab button', async () => {
    const src = await readSrc('tabs.ts');
    assert.ok(
      !src.includes('btn.appendChild(closeBtn)'),
      'a <button> may not contain another <button>; the close control must be a sibling',
    );
  });

  it('wraps the tab and its close button in a role-less .tab-item', async () => {
    const src = await readSrc('tabs.ts');
    assert.ok(src.includes("wrap.className = 'tab-item'"), 'tab wrapper must carry .tab-item');
    assert.ok(src.includes('wrap.appendChild(btn)'), 'tab button must be a child of the wrapper');
    assert.ok(
      src.includes('wrap.appendChild(closeBtn)'),
      'close button must be a sibling of the tab button inside the wrapper',
    );
  });

  it('does not put any role on the .tab-item wrapper', async () => {
    const src = await readSrc('tabs.ts');
    // A previous revision set role="presentation" here, believing it stopped
    // #tab-bar (role="tablist") from owning the close button. It does not.
    // WAI-ARIA 1.2 defines an owned element as "any DOM descendant" of the
    // owner, so ownership reaches through the wrapper whatever its role; and
    // axe-core descends into a child with no role, no global ARIA attribute
    // and no focusability, which covers a bare <div> and a
    // role="presentation" <div> alike (axe gives <div> no implicit role, and
    // getRole({noPresentational:true}) returns null for presentation/none).
    // The attribute was a no-op documenting a false rule, so it must not come
    // back.
    assert.ok(
      !src.includes("wrap.setAttribute('role'"),
      'the .tab-item wrapper must carry no role: a role here changes nothing about ' +
        'tablist ownership and previously encoded an incorrect rationale',
    );
  });

  it('keeps real tab semantics on the tab button', async () => {
    const src = await readSrc('tabs.ts');
    // The accepted trade-off (see the comment in createClosableTab): the close
    // button remains an owned non-tab child of the tablist, which axe-core's
    // aria-required-children flags even though ARIA 5.2.6 only requires "at
    // least one" tab. Keeping role="tab" + aria-selected is worth that
    // finding, because re-roling the bar to `toolbar` to silence it would
    // cost every AT user the tab role, the selected state and the
    // tab/tabpanel relationship. Pin the semantics so a future "fix the
    // linter" pass cannot quietly drop them.
    assert.ok(
      src.includes("btn.setAttribute('role', 'tab')"),
      'tab buttons must keep role="tab" so AT announces them as tabs',
    );
    assert.ok(
      src.includes("btn.setAttribute('aria-selected'"),
      'tab buttons must expose their selected state via aria-selected',
    );
  });
});

describe('table-list.ts — pin button is not nested inside the row link', () => {
  it('never appends the pin button into the <a>', async () => {
    const src = await readSrc('table-list.ts');
    assert.ok(
      !src.includes('a.appendChild(pinBtn)'),
      'an <a href> may not contain a <button>; the pin must be a sibling',
    );
  });

  it('appends the pin button to the <li> alongside the link', async () => {
    const src = await readSrc('table-list.ts');
    assert.ok(src.includes('li.appendChild(a)'), 'row link must be a child of the <li>');
    assert.ok(
      src.includes('li.appendChild(pinBtn)'),
      'pin button must be a sibling of the link inside the <li>',
    );
  });
});

describe('SCSS keeps the two controls looking unchanged', () => {
  it('_tab-bar.scss styles the .tab-item wrapper', async () => {
    const scss = await readSrc('_tab-bar.scss');
    assert.ok(scss.includes('.tab-bar .tab-item'), '_tab-bar.scss must style the new wrapper');
    // Hovering the close button no longer hovers the tab button by descent,
    // so the wrapper hover has to mirror it or the tab goes flat under the
    // cursor.
    assert.ok(
      scss.includes('.tab-bar .tab-item:hover .tab-btn:not(.active)'),
      '_tab-bar.scss must mirror the hover state from the wrapper',
    );
  });

  it('_sidebar.scss mirrors the row hover from the <li>', async () => {
    const scss = await readSrc('_sidebar.scss');
    assert.ok(
      scss.includes('.table-list li:hover > a:not(.active)'),
      '_sidebar.scss must mirror the row hover so the pin button still lights the row',
    );
  });
});
