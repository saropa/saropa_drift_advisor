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

      // Human-readable labels and Material icon names for each theme.
      var labels = { dark: 'Dark', light: 'Light', showcase: 'Showcase', midnight: 'Midnight' };
      var icons  = { dark: 'dark_mode', light: 'light_mode', showcase: 'auto_awesome', midnight: 'bedtime' };

      // Update FAB theme label and icon to reflect the active theme.
      var themeLabel = document.getElementById('fab-theme-label');
      if (themeLabel) themeLabel.textContent = labels[theme] || theme;

      // Swap the Material Symbols icon to match the active theme.
      var themeBtn = document.getElementById('fab-theme-toggle');
      if (themeBtn) {
        var icon = themeBtn.querySelector('.material-symbols-outlined');
        if (icon) icon.textContent = icons[theme] || 'dark_mode';
        // Tooltip names the next theme in the cycle.
        var next = nextTheme(theme);
        themeBtn.title = labels[next] + ' theme — click to switch from ' + labels[theme];
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
 * Wires up the FAB theme-toggle click handler and the OS-level
 * prefers-color-scheme change listener.  Call once at startup.
 */
export function initThemeListeners() {
    // Toggle button: cycle through all four themes.
    // Theme cycle button lives in the super FAB menu.
    var fabThemeBtn = document.getElementById('fab-theme-toggle');
    if (fabThemeBtn) {
      fabThemeBtn.addEventListener('click', function() {
        var next = nextTheme(currentTheme());
        localStorage.setItem(S.THEME_KEY, next);
        applyTheme(next);
      });
    }

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
