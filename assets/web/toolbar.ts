/**
 * Toolbar — wires the inline icon buttons in the tab bar row.
 *
 * Handles:
 * - Tool launcher icons (data-tool → openTool)
 * - Active tool highlighting (syncs with current tab)
 * - History panel selector (#tb-history-toggle, data-panel-btn="history")
 * - Mask PII toggle (#tb-mask-toggle + #tb-mask-checkbox)
 * - Theme flyout (#tb-theme-trigger + #tb-theme-flyout)
 * - Share button (#tb-share-btn)
 * - Density toggle: clicking bare toolbar whitespace (not an icon) switches
 *   between icon-only and icon+label ("labeled") modes.
 * - Icon-font availability probe: forces the labeled mode when the CDN-only
 *   Material Symbols face is unreachable (bug 081).
 */
import { openTool } from './tabs.ts';
import { applyTheme } from './theme.ts';
import * as S from './state.ts';

/**
 * Font probe string for the icon face. 24px matches the `opsz@24` axis the
 * shell requests, so the probe asks for the exact face the page uses.
 */
var ICON_FONT_PROBE = '24px "Material Symbols Outlined"';

/**
 * Pixel size used by the rendering probe below. Any size works — the probe is
 * a RATIO comparison, not an absolute measurement — but a large size makes the
 * width difference between "one collapsed glyph" and "four separate letters"
 * far bigger than any sub-pixel rounding noise.
 */
var ICON_PROBE_PX = 24;

/**
 * The ligature the rendering probe measures. "home" is a real Material Symbols
 * ligature that is also present in the legacy "Material Icons" family, and the
 * shell actually uses it, so if this one collapses every other icon will too.
 * It must be a word made of several letters: the whole test is that the icon
 * face fuses those letters into ONE glyph while any text font does not.
 */
var ICON_PROBE_LIGATURE = 'home';

/**
 * Family stack for the probe. Ends in `monospace` so that when NEITHER icon
 * family resolves, the probe measures exactly the same font as the baseline
 * below and the two widths come out identical — which is the signal for
 * "no icon font". Both icon family names are listed because the face can come
 * from the CDN @font-face ("Material Symbols Outlined") *or* from a locally
 * installed system font, including the older "Material Icons" release.
 */
var ICON_PROBE_FAMILY = '"Material Symbols Outlined", "Material Icons", monospace';

/**
 * Baseline family for the probe: a generic that is guaranteed to exist, can
 * never be an icon font, and is the last entry of ICON_PROBE_FAMILY.
 */
var ICON_PROBE_BASELINE = 'monospace';

/**
 * Width difference (in px) above which the two measurements are considered
 * genuinely different rather than rounding noise. A collapsed ligature is one
 * glyph (~24px here) against four monospace letters (~58px), so the real
 * signal is tens of pixels wide; 1px only filters hinting/sub-pixel jitter.
 */
var ICON_PROBE_MIN_DELTA_PX = 1;

/**
 * Measures `text` at ICON_PROBE_PX in `family` using a canvas 2D context.
 * Returns null when canvas is unavailable or the context/measure API throws,
 * so the caller can fall back rather than treat a failure as a verdict.
 *
 * Canvas is preferred over a DOM node because it needs no insertion into the
 * document and therefore forces no layout/reflow of the live page.
 */
function measureTextOnCanvas(text: string, family: string): number | null {
  try {
    if (typeof document.createElement !== 'function') return null;
    var canvas = document.createElement('canvas') as HTMLCanvasElement;
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    var ctx = canvas.getContext('2d');
    if (!ctx || typeof ctx.measureText !== 'function') return null;
    ctx.font = ICON_PROBE_PX + 'px ' + family;
    var metrics = ctx.measureText(text);
    if (!metrics || typeof metrics.width !== 'number') return null;
    return metrics.width;
  } catch (e) {
    // Tainted/blocked canvas, headless stub, or a webview with 2D disabled —
    // no verdict, not a negative verdict.
    return null;
  }
}

/**
 * Same measurement via an off-screen span. Used when canvas gives no answer,
 * and also as the CONFIRMING probe: canvas text shaping does not enable
 * discretionary/standard ligature substitution on every engine, so a canvas
 * "widths match" result can be a false negative. Real layout always applies
 * the `liga` feature the icon fonts rely on, so the span is the authority
 * before we degrade the UI.
 *
 * Returns null if the DOM is not ready enough to host the node.
 */
function measureTextInSpan(text: string, family: string): number | null {
  try {
    if (!document.body || typeof document.createElement !== 'function') return null;
    var span = document.createElement('span');
    if (!span || !span.style) return null;
    // Off-screen and out of flow so appending it cannot shift the real UI.
    span.style.cssText =
      'position:absolute;left:-9999px;top:-9999px;visibility:hidden;' +
      'white-space:nowrap;line-height:1;padding:0;margin:0;border:0;' +
      'font-size:' + ICON_PROBE_PX + 'px';
    span.style.fontFamily = family;
    span.textContent = text;
    document.body.appendChild(span);
    // getBoundingClientRect gives fractional width; offsetWidth is the integer
    // fallback for stubs/engines that do not implement the rect API.
    var width: number | null = null;
    if (typeof span.getBoundingClientRect === 'function') {
      var rect = span.getBoundingClientRect();
      if (rect && typeof rect.width === 'number') width = rect.width;
    }
    if (width === null && typeof span.offsetWidth === 'number') width = span.offsetWidth;
    if (span.parentNode) span.parentNode.removeChild(span);
    return width;
  } catch (e) {
    return null;
  }
}

/**
 * Rendering probe: is an icon face ACTUALLY painting the ligature?
 *
 * Returns true when the ligature collapses (icons work), false when it
 * demonstrably does not, and null when no measurement could be taken at all
 * (no canvas, no DOM) — null means "inconclusive" and must never degrade the
 * UI on its own.
 *
 * Why this exists (bug 081 review finding 1): `document.fonts.load()` only
 * ever resolves with faces declared by a CSS-connected `@font-face` rule. A
 * user who has "Material Symbols Outlined" (or the older "Material Icons")
 * installed as a SYSTEM font and is offline therefore gets an EMPTY array —
 * while every icon on screen renders perfectly. Treating empty as "missing"
 * erased working glyphs and made the "Material Icons" entry in the CSS
 * fallback stack unreachable. `document.fonts.check()` is no help either: it
 * returns true for a family with no matching face at all. Neither API alone is
 * a valid verdict, so we ask the renderer instead: measure the ligature in the
 * icon stack against the same string in a plain generic family. When an icon
 * face is active the four letters fuse into one glyph and the widths diverge
 * sharply; when it is not, both strings are drawn by the SAME fallback font
 * and the widths are identical.
 */
export function iconLigatureCollapses(): boolean | null {
  // Canvas first: cheap and layout-free.
  var iconWidth = measureTextOnCanvas(ICON_PROBE_LIGATURE, ICON_PROBE_FAMILY);
  var baseWidth = measureTextOnCanvas(ICON_PROBE_LIGATURE, ICON_PROBE_BASELINE);
  if (iconWidth !== null && baseWidth !== null) {
    if (Math.abs(iconWidth - baseWidth) > ICON_PROBE_MIN_DELTA_PX) return true;
    // Canvas says "same width". That is either a genuinely missing icon font
    // or an engine that skipped ligature shaping on the canvas — confirm in
    // real layout before we take icons away from the user.
  }

  var spanIcon = measureTextInSpan(ICON_PROBE_LIGATURE, ICON_PROBE_FAMILY);
  var spanBase = measureTextInSpan(ICON_PROBE_LIGATURE, ICON_PROBE_BASELINE);
  if (spanIcon !== null && spanBase !== null) {
    return Math.abs(spanIcon - spanBase) > ICON_PROBE_MIN_DELTA_PX;
  }

  // The span could not be measured. If canvas at least produced a pair of
  // equal widths we take that as the answer; otherwise nothing was measured
  // and the honest result is "inconclusive".
  if (iconWidth !== null && baseWidth !== null) return false;
  return null;
}

/**
 * How long to wait before declaring the icon font dead (bug 081). Matched to
 * the browser's `font-display: block` block period (~3s, set on the stylesheet
 * link in html_content.dart): that is precisely the moment the browser gives
 * up hiding the glyph slot and starts painting the ligature NAME, so the
 * fallback must be in place by then and not a moment later.
 */
var ICON_FONT_TIMEOUT_MS = 3000;

/**
 * Bug 081 — Material Symbols is loaded exclusively from fonts.googleapis.com.
 * On an air-gapped machine, behind a proxy that blocks Google, or on a
 * device-hosted server reached over `adb forward`, the stylesheet never
 * arrives and every icon button paints its ligature name ("home",
 * "table_chart") as clipped text. Nothing in the page noticed. This detects
 * the missing face and marks <html> with `icons-unavailable`, under which the
 * stylesheet hides the ligature text and shows each button's short
 * `data-label` word (or a neutral bullet) instead.
 */
export function initIconFontFallback(): void {
  var root = document.documentElement;
  var fonts = (document as any).fonts;

  // No CSS Font Loading API (older Safari/Edge, some embedded webviews): we
  // cannot probe, so assume the font is fine. A false "unavailable" would
  // replace WORKING glyphs with words, which is the worse of the two failures.
  if (!fonts || typeof fonts.load !== 'function') return;

  // Once the real answer arrives it always wins, including un-degrading a UI
  // the timeout below degraded early on a slow-but-working connection where
  // the probe could not measure anything.
  var settled = false;
  function apply(available: boolean): void {
    root.classList.toggle('icons-unavailable', !available);
  }

  // Safety net for a request that hangs instead of failing fast (a black-hole
  // proxy answers neither way, so the promise below may never settle). The
  // deadline matters — once `font-display: block` expires the browser starts
  // painting ligature NAMES — but "the request hung" is NOT evidence that the
  // face failed to load, exactly as "load() returned nothing" is not (bug 081
  // review finding 1). Inferring "the CDN is unreachable, so there are no
  // icons" is the very inference that finding proved invalid on its own: a
  // user with the family installed as a system font renders perfectly while
  // the CDN hangs. The probe is synchronous, so consulting it costs nothing at
  // the deadline. This branch therefore follows the EMPTY-LIST rule
  // (`!== false`, optimistic when inconclusive), not the rejection rule.
  var fallbackTimer = setTimeout(function () {
    if (settled) return;
    apply(iconLigatureCollapses() !== false);
  }, ICON_FONT_TIMEOUT_MS);

  // Neither Font Loading API call is a verdict on its own:
  // - check() returns TRUE for a family with no matching @font-face rule at
  //   all (the very case we are testing for), because the browser reports the
  //   implicit system fallback as "available".
  // - load() only ever matches faces declared by a CSS-CONNECTED @font-face
  //   rule. It resolves with a non-empty list when the CDN stylesheet loaded
  //   (icons definitely work), but an EMPTY list means only "no @font-face
  //   rule matched" — which is ALSO what a user sees when the icon family is
  //   installed as a system font and the CDN is simply unreachable. Their
  //   icons render fine; degrading there would erase working glyphs (bug 081
  //   review finding 1).
  // So: non-empty list -> trust it. Anything else -> ask the renderer.
  fonts.load(ICON_FONT_PROBE).then(
    function (faces: unknown[]) {
      settled = true;
      // Cancel the fallback timer — the promise resolved before the deadline.
      clearTimeout(fallbackTimer);
      if (!!faces && faces.length > 0) {
        apply(true);
        return;
      }
      // Empty list. Degrade only if the ligature is provably NOT collapsing;
      // null = nothing measurable (no canvas, no DOM) stays optimistic, same
      // reasoning as the missing-API branch above — an empty list is NOT
      // evidence of failure, only absence of a CSS-connected face.
      apply(iconLigatureCollapses() !== false);
    },
    function () {
      settled = true;
      clearTimeout(fallbackTimer);
      // Rejection = a face WAS declared (the CDN stylesheet arrived) but its
      // file could not be fetched. Same trap as the empty-list path though:
      // the CSS stack's next entry is "Material Icons", so a user with either
      // icon family installed locally still sees correct glyphs, and degrading
      // them to text labels is exactly the regression finding 1 removed. So
      // the renderer decides here too.
      //
      // ASYMMETRY — do NOT collapse the three branches into one shared helper.
      // All three ask the same probe; they differ ONLY in what an inconclusive
      // (null) probe means, because they differ in what the Font Loading API
      // has already proved:
      //
      //   outcome      | collapses | no collapse | inconclusive (null)
      //   -------------+-----------+-------------+--------------------
      //   non-empty    | (probe not run — icons are known good)
      //   empty list   | keep      | degrade     | KEEP     (!== false)
      //   timed out    | keep      | degrade     | KEEP     (!== false)
      //   rejected     | keep      | degrade     | DEGRADE  (=== true)
      //
      // An empty list is mere absence of a CSS-connected face, and a hang is
      // no answer at all — neither proves anything failed, so an unmeasurable
      // environment stays optimistic (a false "unavailable" replaces WORKING
      // glyphs with words). A REJECTION is positive evidence that the declared
      // face genuinely failed to load, so there pessimism is the right default
      // and only a positively collapsing ligature overrides it.
      apply(iconLigatureCollapses() === true);
    },
  );
}

/** Initializes toolbar icon buttons. Call once from app.js. */
export function initToolbar(): void {
  // Bug 081: decide up front whether the CDN icon font is usable, so the
  // toolbar's labeled fallback can take over before the browser would start
  // painting ligature names. Runs first because it is async and independent
  // of the wiring below.
  initIconFontFallback();

  // --- Density toggle: icon-only vs icon+label ---
  // Clicking the toolbar's bare whitespace (the strip itself, a divider, or
  // the flex spacer — anything that is NOT an icon button or the theme
  // flyout) flips between the default icon-only layout and a "labeled" layout
  // that shows each button's short title in a dim bounding box. We gate on
  // closest('.tb-icon-btn, .tb-flyout') so a real button click still runs its
  // own action without also toggling density.
  var toolbar = document.getElementById('toolbar-bar');
  if (toolbar) {
    // Restore the persisted density before wiring the toggle so the initial
    // paint matches the user's last choice. localStorage reads can throw in
    // private-mode / restricted webview contexts, so guard like sidebar.ts.
    try {
      var pref = localStorage.getItem(S.TOOLBAR_LABELS_KEY);
      if (pref === '1') {
        toolbar.classList.add('tb-labeled');
      } else if (pref === '0') {
        // Bug 081 review finding 2: the stored pref has THREE states, not two —
        // '1' (labeled), '0' (the user deliberately switched labels OFF), and
        // absent (never touched the control). Only the explicit '0' gets
        // `tb-density-user`, which _toolbar.scss uses to stop the
        // `.icons-unavailable` degraded mode from force-enabling labels. Without
        // it the density toggle became a dead control while degraded — the same
        // defect class as bug 083.
        toolbar.classList.add('tb-density-user');
      }
    } catch (e) {
      /* localStorage unavailable — fall back to default icon-only mode */
    }
    toolbar.addEventListener('click', function (e: Event) {
      var hitButton = (e.target as HTMLElement).closest('.tb-icon-btn, .tb-flyout');
      if (hitButton) return; // real control click — let its own handler run
      var labeled = toolbar!.classList.toggle('tb-labeled');
      // Any click here IS an explicit choice, so mark the icon-only direction
      // as user-chosen (and clear the marker when going back to labeled, where
      // it would be meaningless). This is what makes the toggle keep working
      // while the icon font is missing.
      toolbar!.classList.toggle('tb-density-user', !labeled);
      try {
        localStorage.setItem(S.TOOLBAR_LABELS_KEY, labeled ? '1' : '0');
      } catch (e) {
        /* localStorage unavailable — density still toggles for this session */
      }
    });
  }

  // --- Tool launcher icons ---
  document.querySelectorAll('.tb-icon-btn[data-tool]').forEach(function (btn) {
    var toolId = btn.getAttribute('data-tool');
    if (toolId) {
      btn.addEventListener('click', function () {
        openTool(toolId!);
      });
    }
  });

  // --- Active tool highlighting: sync toolbar icons with active tab.
  //     app.js wires window.onTabSwitch which calls this. ---
  (window as any)._toolbarSyncActiveTab = function (tabId: string) {
    document.querySelectorAll('.tb-icon-btn[data-tool]').forEach(function (btn) {
      var isActive = btn.getAttribute('data-tool') === tabId;
      btn.classList.toggle('active', isActive);
    });
  };

  // The sidebar panel selectors (Tables / Search / History data-panel-btn
  // icons) are wired in sidebar-panels.ts, the single owner of which panel is
  // visible. The sidebar is hidden/shown and resized via the drag bar
  // (#app-sidebar-resizer), wired in sidebar-resize.ts.

  // --- Mask PII toggle ---
  var maskBtn = document.getElementById('tb-mask-toggle');
  var maskCb = document.getElementById('tb-mask-checkbox') as HTMLInputElement | null;
  if (maskBtn && maskCb) {
    maskBtn.addEventListener('click', function () {
      // Toggle the hidden checkbox, then fire its change event
      // so the existing PII mask logic in table-view.ts picks it up.
      maskCb!.checked = !maskCb!.checked;
      maskCb!.dispatchEvent(new Event('change'));
      maskBtn!.setAttribute('aria-pressed', maskCb!.checked ? 'true' : 'false');
    });
  }

  // --- Theme flyout ---
  var themeTrigger = document.getElementById('tb-theme-trigger');
  var themeFlyout = document.getElementById('tb-theme-flyout');
  if (themeTrigger && themeFlyout) {
    // The flyout is position:fixed (so it escapes #toolbar-bar's overflow clip),
    // which means it has no automatic anchor — place it next to the trigger and
    // clamp it inside the viewport each time it opens.
    var positionThemeFlyout = function () {
      var r = themeTrigger!.getBoundingClientRect();
      // Default: open to the right of the trigger, a small gap clear of it.
      themeFlyout!.style.top = r.top + 'px';
      themeFlyout!.style.left = r.right + 6 + 'px';
      // Measure now that it's visible to decide whether it overflows an edge.
      var fr = themeFlyout!.getBoundingClientRect();
      // No room on the right (narrow / mobile horizontal strip): flip left.
      if (fr.right > window.innerWidth - 8) {
        themeFlyout!.style.left = Math.max(8, r.left - fr.width - 6) + 'px';
      }
      // The theme button sits low in the strip, so a downward menu can run past
      // the bottom edge — pull it up by the overflow, never above the top edge.
      if (fr.bottom > window.innerHeight - 8) {
        themeFlyout!.style.top = Math.max(8, window.innerHeight - 8 - fr.height) + 'px';
      }
    };

    // Toggle flyout on click.
    themeTrigger.addEventListener('click', function (e: Event) {
      e.stopPropagation();
      var isOpen = themeTrigger!.getAttribute('aria-expanded') === 'true';
      var next = isOpen ? 'false' : 'true';
      themeTrigger!.setAttribute('aria-expanded', next);
      // Position only after it's shown (CSS keys display off aria-expanded), so
      // getBoundingClientRect() measures the real, laid-out menu.
      if (next === 'true') positionThemeFlyout();
    });

    // Keep the fixed menu glued to the trigger if the viewport changes while
    // it's open (the trigger itself stays put — the toolbar is sticky).
    window.addEventListener('resize', function () {
      if (themeTrigger!.getAttribute('aria-expanded') === 'true') positionThemeFlyout();
    });

    // Wire theme option clicks.
    themeFlyout.querySelectorAll('.tb-theme-option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var chosen = (btn as HTMLElement).getAttribute('data-theme');
        if (chosen) {
          localStorage.setItem(S.THEME_KEY, chosen);
          applyTheme(chosen);
          // Close the flyout after selection.
          themeTrigger!.setAttribute('aria-expanded', 'false');
        }
      });
    });

    // Close flyout on outside click.
    document.addEventListener('click', function (e: Event) {
      if (themeTrigger!.getAttribute('aria-expanded') === 'true') {
        var wrap = document.getElementById('tb-theme-wrap');
        if (wrap && !wrap.contains(e.target as Node)) {
          themeTrigger!.setAttribute('aria-expanded', 'false');
        }
      }
    });

    // Close flyout on Escape.
    document.addEventListener('keydown', function (e: KeyboardEvent) {
      if (e.key === 'Escape' && themeTrigger!.getAttribute('aria-expanded') === 'true') {
        themeTrigger!.setAttribute('aria-expanded', 'false');
        themeTrigger!.focus();
      }
    });
  }

  // --- Share button ---
  // The share button's click handler is wired by session.ts
  // via the #tb-share-btn ID. No additional wiring needed here.

  // --- Sync initial active tool highlight ---
  // Highlight the toolbar button matching the initially active tab (if any).
  var activeTab = document.querySelector('.tab-btn.active');
  if (activeTab) {
    var activeToolId = activeTab.getAttribute('data-tab');
    document.querySelectorAll('.tb-icon-btn[data-tool]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tool') === activeToolId);
    });
  }
}
