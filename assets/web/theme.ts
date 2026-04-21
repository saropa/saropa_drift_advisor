/**
 * Theme management: apply, cycle, detect, and initialise the UI colour theme.
 * Extracted from app.js — all shared state accessed via S.*.
 */
import * as S from './state.ts';

export function applyTheme(theme) {
      // Normalise legacy boolean calls: true → 'dark', false → 'light'.
      if (theme === true) theme = 'dark';
      if (theme === false) theme = 'light';

      // Remove all theme classes first, then add the active one.
      document.body.classList.remove('theme-dark', 'theme-light', 'theme-showcase', 'theme-midnight');
      document.body.classList.add('theme-' + theme);

      // Update the theme submenu: mark the active option with a CSS class.
      var themeOptions = document.querySelectorAll('.tb-theme-option');
      for (var i = 0; i < themeOptions.length; i++) {
        var opt = themeOptions[i] as HTMLElement;
        var isActive = opt.getAttribute('data-theme') === theme;
        opt.classList.toggle('active', isActive);
        opt.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      }
    }

    // All four themes are fully supported via inline CSS.
    // Four-way cycle: light -> showcase -> dark -> midnight -> light
export function nextTheme(current) {
      var cycle = ['light', 'showcase', 'dark', 'midnight'];
      var idx = cycle.indexOf(current);
      return cycle[(idx + 1) % cycle.length];
    }

    // Return the current theme name by inspecting body classes.
export function currentTheme() {
      if (document.body.classList.contains('theme-showcase')) return 'showcase';
      if (document.body.classList.contains('theme-midnight')) return 'midnight';
      if (document.body.classList.contains('theme-light')) return 'light';
      return 'dark';
    }

    // Detect whether we are running inside a VS Code webview by checking
    // for the vscode-dark / vscode-light body classes that VS Code injects,
    // or the data-vscode-theme-kind attribute on <html>.
export function detectVscodeTheme() {
      // VS Code adds 'vscode-dark' or 'vscode-light' to <body>
      if (document.body.classList.contains('vscode-dark')) return 'dark';
      if (document.body.classList.contains('vscode-light')) return 'light';
      // Newer VS Code versions set a data attribute on <html>
      var kind = document.documentElement.getAttribute('data-vscode-theme-kind');
      if (kind === 'vscode-dark' || kind === 'vscode-high-contrast') return 'dark';
      if (kind === 'vscode-light' || kind === 'vscode-high-contrast-light') return 'light';
      return null;
    }

export function initTheme() {
      var saved = localStorage.getItem(S.THEME_KEY);
      if (saved) {
        // User has an explicit override. All four themes
        // (dark, light, showcase, midnight) are fully supported inline.
        applyTheme(saved);
        return;
      }
      // No saved preference: try VS Code webview context first, then
      // fall back to the OS-level prefers-color-scheme media query.
      var vscodeTheme = detectVscodeTheme();
      if (vscodeTheme) {
        applyTheme(vscodeTheme);
        return;
      }
      // Respect operating-system dark-mode preference (defaults to light
      // when the browser doesn't support matchMedia).
      var prefersDark = window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false;
      applyTheme(prefersDark ? 'dark' : 'light');
    }

/**
 * Wires up the OS-level prefers-color-scheme change listener. Call once at
 * startup.
 *
 * Theme-option click wiring lives in `toolbar.ts::initToolbar` — doing it
 * there as well would register a *second* click handler on each
 * `.tb-theme-option`, which caused the theme flyout to apply the theme twice
 * and could desync `aria-expanded` (flyout appearing "locked" after the
 * first selection).
 */
export function initThemeListeners() {
    // Listen for real-time OS theme changes (e.g. the user toggles system
    // dark mode while the page is open). Only react if the user hasn't
    // set an explicit override in localStorage.
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        if (!localStorage.getItem(S.THEME_KEY)) {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
}
