# BUG-025: Dark mode toggle doesn't sync with OS or VS Code theme

## Status: RESOLVED

## Summary

All 4 requirements implemented in `lib/src/server/html_content.dart`:

1. **OS preference on first visit** — `prefers-color-scheme` media query used when no localStorage preference exists
2. **VS Code webview detection** — checks `vscode-dark`/`vscode-light` body classes and `data-vscode-theme-kind` attribute
3. **Manual override** — clicking the theme toggle saves to localStorage and takes priority over auto-detection
4. **Real-time sync** — `matchMedia('prefers-color-scheme: dark').addEventListener('change')` updates the theme live when the OS setting changes (only when no explicit override is saved)

## Files Changed

- `lib/src/server/html_content.dart` — `applyTheme()` extracted, `detectVscodeTheme()` added, `initTheme()` rewritten with cascading detection, OS change listener

## Original Report

The web UI had its own dark/light mode toggle stored in localStorage,
independent of the OS preference and VS Code theme, creating visual conflicts.
