# Web viewer: home-screen polish and theme-flyout clip fix

The web viewer's home screen lacked bottom spacing and its feature-search box rendered
its text under the search glyph, while the left activity bar's theme menu was cropped
by the icon strip. Four targeted SCSS/TypeScript changes address layout spacing,
input indentation, strip width, and the flyout clipping.

## Finish Report (2026-06-26)

### Scope
Web viewer assets only (`assets/web/`): two SCSS partials and one TypeScript module,
recompiled to `style.css` and `bundle.js`. No Dart, extension, or ARB changes.

### Defects / requests addressed

1. **Home screen had no bottom padding.** The launcher grid sat flush against the
   main content's lower edge. `.home-screen` now carries `padding-bottom: 2rem`
   (`_home-screen.scss`), stacking with the existing `2rem` on `.app-main-content`.

2. **Feature-search text collided with the search icon.** `.home-feature-search`
   left padding was `2.4rem`; the absolutely-positioned glyph (`left: 0.7rem`,
   `font-size: 1.2rem`) ends near `1.9rem`, leaving the typed value and placeholder
   visually touching it. Left padding raised to `3rem` so both clear the icon.

3. **Left activity bar (`#toolbar-bar`) too narrow.** Horizontal padding raised
   `0.35rem -> 0.49rem` per side. The strip is shrink-to-fit (content `2rem` icon
   plus padding), so total width moves `2.7rem -> ~2.98rem`, ~10% wider, widening
   both the icon-only and labeled layouts.

4. **Theme flyout cropped by the strip.** Root cause: `#toolbar-bar` sets
   `overflow-y: auto`; per the CSS overflow spec, a `visible` value on the other
   axis computes to `auto` when its companion is non-visible, so `overflow-x`
   clipped too. The flyout opened to the right (`position: absolute; left: 100%`)
   and was cropped by the narrow strip.
   Fix: `.tb-flyout` switched to `position: fixed` to escape the clip, with the
   stale absolute offsets (`top`, `left`, `margin-left`, `margin-top`) and the
   mobile-breakpoint positioning override removed. `toolbar.ts` gains
   `positionThemeFlyout()`, invoked after the menu is shown (CSS keys `display`
   off `aria-expanded`, so the element must be laid out before measuring): it
   anchors the menu to the trigger's rect, flips it left if it would overflow the
   right edge, and shifts it up if it would overflow the bottom (the theme button
   sits low in the strip). A `resize` listener repositions while the menu is open.

### Verification
- `npm run typecheck:web` — clean (the `extension/package.json` warning is
  pre-existing and unrelated).
- `npm run build:js` and `npm run build:style` — succeeded; all four changes
  confirmed present in `bundle.js` and `style.css`.
- `node --test assets/web/test/home-search.test.mjs` — 14 pass, 0 fail.

### Not covered by automated tests
`positionThemeFlyout()` depends on live browser layout geometry; the web test
suite has no DOM/jsdom harness for the toolbar, so the positioning is verified by
inspection and manual browser check rather than a unit test.
