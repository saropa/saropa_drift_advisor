# BUG: Every toolbar icon renders as ligature text ("table_chart", "home") when Google Fonts is unreachable — no offline fallback for Material Symbols

**Status: Fixed**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Server (web viewer shell + `assets/web/`)
File: `lib/src/server/html_content.dart` (lines 139-140); `assets/web/_cards.scss` (lines 81-91)
Severity: UX — High (the shell is deliberately built to work offline, and offline every icon in the UI is broken)

---

## Summary

The viewer inlines its CSS and JS into the page specifically so it works with no network ("zero extra requests, works offline", `html_content.dart:70-73`). But every icon in the toolbar, tab bar, sidebar, SQL toolbar, and tool panels is a Material Symbols ligature loaded exclusively from `fonts.googleapis.com`. With no internet — an air-gapped dev machine, a phone-hosted server reached over `adb forward`, a corporate proxy that blocks Google — the font never arrives and the browser paints the ligature names as plain text. The toolbar becomes a row of words like `home`, `table_chart`, `smart_toy`, `monitor_heart`, each clipped inside a 2.4rem square button. The Material Symbols `<link>` also omits `display=swap`, so even online there is a blank-icon period during font load.

---

## Attribution Evidence

Positive — the shell, the icon CSS, and every icon emitter live in this repo:

```bash
grep -n "fonts.googleapis" lib/src/server/html_content.dart
```

```
lib/src/server/html_content.dart:137:  <link rel="preconnect" href="https://fonts.googleapis.com">
lib/src/server/html_content.dart:139:  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;500;700&display=swap">
lib/src/server/html_content.dart:140:  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0">
```

The icon class has no fallback family and no `font-display`:

```bash
sed -n '81,91p' assets/web/_cards.scss
```

```
/* Material Symbols (Phase 4.1): icon font from Google Fonts CDN. */
.material-symbols-outlined {
  font-family: "Material Symbols Outlined";
  font-weight: 400;
  ...
```

No self-hosted font file, no `@font-face`, and no runtime detection exist:

```bash
grep -rn "@font-face\|document.fonts\|\.woff" assets/web/*.scss assets/web/*.ts lib/src/server/
# Expected: 0 matches
```

Icon usage is pervasive — the shell alone carries 34 icon-only buttons:

```bash
grep -c "material-symbols-outlined" lib/src/server/html_content.dart
```

The VS Code panel has the same dependency (its CSP allows the Google host, which is the only reason icons show there):

```bash
grep -n "fonts.googleapis" extension/src/panel.ts
```

```
extension/src/panel.ts:209:        `style-src 'unsafe-inline' ${baseUrl} https://cdn.jsdelivr.net https://fonts.googleapis.com`,
```

Negative attribution — not supplied by a sibling package:

```bash
grep -rn "Material Symbols" ../saropa_lints/ ../saropa_dart_utils/
# Expected: 0 matches
```

**Emit site(s):** `lib/src/server/html_content.dart:140` (the only load path); `assets/web/_cards.scss:82` (the only face declaration).

---

## Environment

- OS: any
- Browser: any
- VS Code version: also reproduces in the panel when offline
- Extension version: 4.2.5
- Dart SDK version: as pinned by `pubspec.yaml`
- Flutter SDK version: any
- Database type and version: n/a
- Connection method: browser at `http://127.0.0.1:8642`, or `adb forward` to a device-hosted server
- Relevant non-default settings: none
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Start the example app so the server binds 8642.
2. Disconnect the machine from the internet (or block `fonts.gstatic.com` and `fonts.googleapis.com` in DevTools → Network → Request blocking).
3. Open `http://127.0.0.1:8642` in a browser.
4. Look at the toolbar under the masthead.

Reproduces on every attempt while the host is blocked.

---

## Expected Behavior

Icons render, or degrade to something readable — the short `data-label` word each button already carries, or an inline SVG.

---

## Actual Behavior

Each icon button shows its ligature name as clipped text (`home`, `table_c…`, `smart_…`). The loading overlay reports `✓ stylesheet (local)` and `✓ bundle.js (local)`, so the app believes it has loaded cleanly. Tab icons, the pin buttons in the table list, the SQL Run/Format buttons, and the history sidebar's refresh/delete buttons are all affected.

---

## Error Output

### VS Code Developer Tools Console

```
GET https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:... net::ERR_INTERNET_DISCONNECTED
```

### Extension Output Channel

Nothing.

### Terminal / Command Output

n/a.

### Stack Traces

None.

---

## Duplicate-Emission Check

One load site, one face declaration. The VS Code panel shares the bundle and the shell, so a fix in the shell fixes both surfaces.

---

## Screenshots / Recordings

Not attached — step 4 is self-evident.

---

## Minimal Reproducible Example

In DevTools → Network, add a request-blocking pattern `*fonts.g*` and reload.

---

## What I Already Tried

- [x] Grepped for any `@font-face`, self-hosted `.woff2`, or `document.fonts` check — none.
- [x] Confirmed the text fonts (DM Sans, JetBrains Mono) degrade gracefully: their `font-family` stacks list system fallbacks and the `<link>` has `display=swap`. Only the icon face has no fallback.
- [x] Confirmed the toolbar already has a labeled-density mode (`toolbar.ts`, `.tb-labeled` — `_toolbar.scss:124-140`) that renders each button's `data-label`, so a text fallback for the toolbar is nearly free.

---

## Regression Info

- Last working version: never — the icon font was introduced in "Phase 4.1" (per the SCSS comment) with the CDN dependency from day one.
- First broken version: that release.
- What changed: the previous text/emoji glyphs were replaced by a font that only exists on Google's CDN.

---

## Root Cause

The icon face is declared with a single family name and no fallback, loaded from one external host, and nothing in the page detects a failed load. The shell's offline design (inlined CSS/JS) was never extended to the font it depends on.

---

## Changes Made

Fix sketch **(b)** was implemented — detect the failure and fall back to labels. No font
file, asset, or dependency was added, and the Google Fonts link was kept.

**`lib/src/server/html_content.dart`** (icon stylesheet link)
- Added `&display=block` to the Material Symbols `<link>`. `block` rather than the `swap`
  used for the text fonts: with a ligature icon font, `swap` paints the *fallback*
  immediately, and the fallback is the raw ligature NAME. `block` keeps the glyph slot
  invisible for the browser's block period (~3 s) and then paints real glyphs, so a normal
  online load shows a brief blank instead of a flash of garbage words. Rationale recorded
  in an HTML comment above the link.

**`assets/web/_cards.scss`** (`.material-symbols-outlined`)
- Gave the face a real fallback chain
  (`"Material Symbols Outlined", "Material Icons", ui-sans-serif, system-ui, sans-serif`)
  plus `display: inline-block`, `vertical-align: middle`, `white-space: nowrap` on top of
  the existing fixed `font-size: 1.25rem` / `line-height: 1`, so a fallback string can be
  clipped/hidden but can never re-flow the row it sits in.
- Added an `.icons-unavailable` block: `font-size: 0 !important` collapses the ligature
  text everywhere (the `!important` is load-bearing — a dozen partials set a more specific
  size on this class, e.g. `.sql-runner .sql-toolbar button .material-symbols-outlined` and
  `#toolbar-bar .tb-icon-btn .material-symbols-outlined`, and all of them outrank a plain
  descendant selector), and a `::after` U+25CF bullet (sized in `rem`, since the parent is
  `font-size: 0`) gives icon-only controls with no `data-label` a visible mark instead of an
  empty box. The bullet is suppressed on controls that already render a `data-label` word.

**`assets/web/_toolbar.scss`** (labeled density mode)
- Re-used the existing `.tb-labeled` mechanism instead of inventing a second one: each of
  the five `#toolbar-bar.tb-labeled …` rules now also matches
  `.icons-unavailable #toolbar-bar …`, so a missing icon font forces the labeled layout and
  every toolbar button renders its short `data-label` word.

**`assets/web/toolbar.ts`** (`initToolbar`)
- Added `initIconFontFallback()`, called first from `initToolbar()` (no change to `app.js`,
  which already calls `initToolbar` via `tabs.ts`). It probes with
  `document.fonts.load('24px "Material Symbols Outlined"')` and sets `icons-unavailable` on
  `<html>` when the promise resolves with an empty face list (stylesheet never loaded) or
  rejects (face declared but `fonts.gstatic.com` unreachable). `document.fonts.check()` is
  deliberately *not* used as the verdict: it returns `true` for a family with no matching
  `@font-face` rule at all, which is precisely the case being tested. A 3 s timeout
  (matched to the `display: block` block period) covers a proxy that hangs instead of
  failing; a later successful resolve un-degrades the UI. Browsers without the CSS Font
  Loading API are left alone, since a false "unavailable" would replace working glyphs
  with words.

**`extension/src/panel.ts`** — unchanged and not weakened. The fix adds no new host and no
new request type; `style-src`/`font-src` already permit `fonts.googleapis.com` /
`fonts.gstatic.com`, and `document.fonts` is a DOM API that CSP does not gate.

Generated `assets/web/style.css` and `assets/web/bundle.js` are rebuilt separately — only
the SCSS/TS sources were edited here.

### Verification

- `npx tsc -p tsconfig.web.json --noEmit` — exit 0, no output.
- `npx sass assets/web/style.scss <temp>` — compiles clean; all nine `.icons-unavailable`
  rules present in the output, including the five reused toolbar selectors.
- Probe logic replayed against stub `document.fonts` implementations covering: face
  present (no degrade), empty face list (degrade), `load()` rejection (degrade), a request
  that never settles (degrade via timeout), a slow-but-successful load (degrades at the
  timeout, then un-degrades), and a browser with no `document.fonts` (no degrade). All six
  behaved as intended.
- Not verified in a real browser: the visual result of the offline path (blocking
  `*fonts.g*` in DevTools and reloading) still needs a manual pass once `style.css` and
  `bundle.js` are regenerated.

### Follow-up corrections (code review of the fix above)

A review of the landed fix raised three findings. All three are corrected; the
descriptions above still hold except where contradicted here.

**Finding 1 — the probe degraded a UI whose icons were rendering fine**
(`assets/web/toolbar.ts`). `document.fonts.load()` only ever matches faces
declared by a CSS-connected `@font-face` rule. A user with "Material Symbols
Outlined" (or the older "Material Icons") installed as a SYSTEM font, offline,
therefore got an EMPTY face array — and the code read that as "no icons",
setting `icons-unavailable` and `font-size: 0 !important` over glyphs that were
painting correctly. It also made the `"Material Icons"` entry the same fix added
to the CSS fallback stack unreachable by construction. An empty `load()` result
is now treated as INCONCLUSIVE and handed to a real rendering probe
(`iconLigatureCollapses()`), which degrades only when the ligature is provably
not collapsing:

- The probe measures the ligature `"home"` at 24px in
  `"Material Symbols Outlined", "Material Icons", monospace` against the same
  string in plain `monospace`. When an icon face is active the four letters fuse
  into one glyph and the widths diverge by tens of pixels; when it is not, both
  strings are drawn by the SAME fallback font and the widths are identical. The
  generic `monospace` is deliberately the last entry of the icon stack so the
  "no icon font" case measures literally the same font twice.
- Canvas 2D `measureText` is tried first (cheap, forces no layout). Because not
  every engine applies `liga` shaping to canvas text, a canvas "widths match"
  result is only a suspicion: it is confirmed in real layout with an off-screen,
  `visibility: hidden`, absolutely-positioned span before anything is degraded.
  The span is also the sole path when canvas is unavailable.
- Every API touched is guarded and wrapped in try/catch. When nothing at all can
  be measured the probe returns `null` = inconclusive, and the UI is left alone —
  the same optimistic stance as the no-`document.fonts` branch, since a false
  "unavailable" replaces WORKING glyphs with words.
- The `load()` REJECTION branch and the 3 s TIMEOUT branch are both routed
  through the same probe — see "Every branch asks the renderer" below. No
  `document.fonts` still leaves the UI alone, and a slow-but-successful `load()`
  still un-degrades. `check()` is still never used as a verdict (it returns true
  for a family with no matching face at all).

**Finding 2 — degraded mode silently killed the toolbar density toggle**
(`assets/web/_toolbar.scss`, `assets/web/toolbar.ts`). The five
`.icons-unavailable #toolbar-bar …` rules forced the labeled layout
unconditionally, so for the whole degraded session the density control did
nothing — the same dead-control defect bug 083 fixes elsewhere in this
changeset. The forced layout is now a DEFAULT that an explicit user choice
overrides: `TOOLBAR_LABELS_KEY` already has three states ('1' labeled, '0'
explicitly icon-only, absent = never chosen), so `toolbar.ts` adds
`tb-density-user` to `#toolbar-bar` exactly on the explicit '0' (and keeps it in
sync on every toggle click), and all five rules are now guarded with
`:not(.tb-density-user)`. Trade-off, recorded in the SCSS comment: a user who
insists on icon-only while the font is missing gets the `.icons-unavailable`
bullet marker instead of a word, which keeps the buttons visible and clickable
with their `title`/`aria-label` intact, rather than having their choice ignored.
The bullet suppressor in `_cards.scss` was retargeted to match, since it keyed
on a bare `[data-label]` and would otherwise have left those buttons with
neither a label nor a bullet — an empty box, i.e. the original bug. Its two new
selectors mirror exactly the two conditions under which `_toolbar.scss` paints
`content: attr(data-label)`; `data-label` is only ever emitted on
`#toolbar-bar .tb-icon-btn`, so scoping to the toolbar loses no call site.

**Finding 3 — an app-wide alignment change guarding a degraded-only state**
(`assets/web/_cards.scss`). `display: inline-block`, `vertical-align: middle`
and `white-space: nowrap` had been added unconditionally to the base
`.material-symbols-outlined` rule, changing inline alignment for every icon in
the app in the normal (font loaded) case, purely to stop a fallback STRING from
re-flowing a row. All three moved into the `.icons-unavailable` block; NONE was
judged to belong on the base rule. Evidence that they were not correcting a
pre-existing alignment bug: the call sites that want a specific alignment
(`.feature-icon`, `.header-icon`) already set `vertical-align: middle`
themselves and did so before this bug, and the base rule's fixed
`font-size: 1.25rem` / `line-height: 1` was already what kept a loaded glyph
from stretching the line box.

**Every branch asks the renderer — residual closed.** The first pass left two
branches inferring "no icons" from a network symptom, which is precisely the
inference finding 1 proved invalid on its own. Both now consult
`iconLigatureCollapses()`:

- **Rejection.** `load()` rejects when a face WAS declared (the CDN stylesheet
  arrived) but its file could not be fetched from `fonts.gstatic.com`. The CSS
  stack's next entry is `"Material Icons"`, so a user with either icon family
  installed locally still sees correct glyphs.
- **Timeout.** The 3 s deadline fires when the request neither succeeds nor
  fails (a proxy that black-holes it). The deadline itself still matters — once
  `font-display: block` expires the browser starts painting ligature NAMES — but
  a hang is *no answer*, not a negative one, and the probe is synchronous so
  consulting it costs nothing at that instant.

All three branches ask the same question and differ ONLY in what an
inconclusive (`null`) probe means, because they differ in what the Font Loading
API has already proved. The code comment carries this table so a later reader
does not "simplify" them into one helper:

| `load()` outcome | probe collapses | probe says no | probe inconclusive |
| --- | --- | --- | --- |
| non-empty list | (probe not run — icons known good) | — | — |
| empty list | no degrade | degrade | **no degrade** (`!== false`) |
| timed out | no degrade | degrade | **no degrade** (`!== false`) |
| rejected | no degrade | degrade | **degrade** (`=== true`) |

An empty list is mere absence of a CSS-connected face and a hang is no answer at
all — neither is evidence of failure, so an unmeasurable environment stays
optimistic, since a false "unavailable" replaces WORKING glyphs with words. A
rejection is positive evidence that the declared face genuinely failed to load,
so there pessimism is the right default and only a positively collapsing
ligature overrides it. A later successful `load()` still un-degrades whatever
the timeout decided.

### Follow-up verification

- `npx tsc -p tsconfig.web.json --noEmit` — exit 0, no output.
- `npx sass --no-source-map assets/web/style.scss <temp>` — compiles clean.
- New regression suite `assets/web/test/icon-font-fallback.test.mjs` (18 tests,
  esbuilds the real `toolbar.ts` and drives it against stub `document`
  implementations; also compiles `style.scss` and asserts on emitted selectors).
  Covers: canvas widths diverge -> icons OK; canvas equal but span diverges
  (system-installed font that canvas did not shape) -> icons OK; both equal ->
  degrade; nothing measurable -> inconclusive, no degrade; `load()` non-empty ->
  no degrade; `load()` EMPTY + ligature collapses -> NO degrade (the finding-1
  regression); `load()` empty + no collapse -> degrade; `load()` empty +
  inconclusive -> no degrade; `load()` REJECTS + ligature collapses -> no
  degrade; rejects + no collapse -> degrade; rejects + inconclusive -> degrade;
  3 s TIMEOUT (a `load()` that never settles, driven by node:test fake timers)
  + collapses -> no degrade, + no collapse -> degrade, + inconclusive -> no
  degrade — the last two pin the asymmetry, since the rejection and timeout
  inconclusive cases use an identical stub environment and must diverge; no
  `document.fonts` -> untouched; plus selector contracts for findings 2 and 3.
- `npm run test:web` — 338 tests, 338 pass, 0 fail.
- Still not verified in a real browser: the three real-world font states
  (CDN reachable / system-installed font offline / genuinely missing) have been
  proven only against stubbed measurement APIs. Confirming that a real engine's
  `measureText` and span layout produce the assumed width split — and that
  canvas ligature shaping behaves as assumed on Chrome/Firefox/WebKit — needs a
  manual pass once `style.css` and `bundle.js` are regenerated.
- Both residuals noted in earlier passes (the `load()` rejection branch and the
  3 s timeout branch degrading on a network symptom alone) are CLOSED — see
  "Every branch asks the renderer" above. No known false-degrade path remains:
  the UI is now only degraded when a measurement positively says the ligature is
  not collapsing, or when a declared face positively failed to load and nothing
  could be measured.

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- **Who is affected:** anyone offline, on a device-hosted server without internet, or behind a proxy that blocks Google Fonts. Also every online user for the duration of the font download (no `display=swap`).
- **What is blocked:** nothing functionally, but the entire toolbar is unreadable and the product looks broken.
- **Data risk:** none.
- **Frequency:** every page load in the affected environments.

---

## Fix Sketch

Choose one; (a) is the complete fix, (b) is the cheap mitigation and can ship first.

**(a) Self-host a subset of the icon font.** The shell uses a fixed set of roughly 40 glyph names (grep `material-symbols-outlined">[a-z_]*<` across `html_content.dart`, `state.ts` `TOOL_ICONS`, and the TS emitters). Subset Material Symbols Outlined to those codepoints (fonttools `pyftsubset` with `--text` of the ligature names, output woff2, typically under 10 KB), embed it as a base64 `@font-face` in `_base.scss` alongside the existing tokens, and drop the Google `<link>` at `html_content.dart:140`. This also removes a third-party request from a debug tool that may be pointed at production-shaped data. New asset → blast-radius gate: get approval before adding the file.

**(b) Detect the failure and fall back to labels.** Keep the CDN link but add `&display=swap` (so the ligature text does not flash during a normal load either), and in `toolbar.ts` init:

```ts
// The icon face is CDN-only. If it never arrives (offline, blocked host),
// the ligature names would paint as clipped text in every icon button, so
// switch the toolbar to its labeled mode and hide the glyph spans.
document.fonts.load('1rem "Material Symbols Outlined"').then(faces => {
  if (!faces.length) document.body.classList.add('icons-unavailable');
});
```

with `_cards.scss` hiding `.icons-unavailable .material-symbols-outlined` and forcing `.tb-labeled` behavior. Tab icons, pin buttons, and SQL toolbar buttons that have no text label need an `aria-label`/`data-label` to show in that mode — see plan `plans/83-web-viewer-accessibility-and-i18n.md` task C2, which adds those labels for accessibility anyway.

Either way: rebuild `style.css` (`npm run build:style`) and `bundle.js` (`npm run build:js`), commit both generated files, and add a Dart test in `test/html_content_test.dart` asserting the shell no longer references `fonts.googleapis.com/css2?family=Material+Symbols` (option a) or contains `display=swap` on that link (option b).


---

## Finish Report (2026-09-02)

Closed as part of a five-bug web-viewer batch (080-084). Consolidated record, including the
cross-cutting verification and the code-review round that followed the first pass:
`plans/history/2026.09/20260902/080-084-web-viewer-batch-report.md`.

### Verification applied to this fix

- `npm run build` — `bundle.js` and `style.css` regenerated from source; no generated file was
  hand-edited at any point.
- `npm run typecheck:web` — exit 0.
- `npm run test:web` — 338 tests, 338 pass, 0 fail.
- Extension mocha, full suite — 3151 passing, 0 failing. An earlier revision of this report
  described this run as "scoped to the 14 specs that assert on the changed sources". It was not
  scoped. `extension/.mocharc.yml` sets `spec: out/test/**/*.test.js`, and mocha *merges* CLI file
  arguments (and `--spec`) with that key rather than overriding it, so naming files on the command
  line ran the whole suite. The full suite passing is a stronger result than a scoped run, only a
  differently-described one.
- Extension mocha, genuinely scoped to the 15 specs that reference the changed web sources
  (`--no-config --no-package --require test/register-mock.js --timeout 5000`) — 303 passing,
  0 failing.
- `dart test test/html_content_test.dart test/web_viewer_nl_modal_contract_test.dart` — 41 passing.

### Defect and resolution

Every icon was a Material Symbols ligature loaded solely from `fonts.googleapis.com`, in a shell
otherwise built to run with no network. Offline, the font never arrived and the browser painted
the ligature names as clipped text.

Resolved without adding a font asset: `display=block` on the stylesheet link (chosen over `swap`,
because for a ligature font the swap fallback *is* the glyph name), a real fallback chain, and a
runtime probe that degrades to each button's existing `data-label` text via the pre-existing
`.tb-labeled` mechanism.

The probe is the load-bearing part and went through three corrections. `document.fonts.check()`
is not a valid verdict (it returns true for a family with no matching `@font-face` at all), and
neither is an empty `document.fonts.load()` result, which is what a system-installed icon font
produces. Every branch now confirms with a real rendering measurement — a ligature-collapse width
comparison, canvas first and confirmed in layout — before degrading. The three branches carry
deliberately different treatment of an inconclusive probe: absence of evidence (empty list,
timeout) stays optimistic; a rejection is positive evidence the declared face failed and degrades.
That asymmetry is pinned by paired tests using identical stub environments with opposite
expectations, so collapsing the branches into one helper fails the suite.
