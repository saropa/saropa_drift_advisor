# localStorage guard hardening and --budget flag

Seven `localStorage` call sites across the web viewer threw unhandled exceptions
in private-mode or restricted webview contexts, crashing initialization or
silently dropping user actions. The l10n parity gate lacked a graduated
enforcement mode between "ignore baseline" and "fail on any baseline entry."

## Finish Report (2026-09-03)

### What changed

**localStorage guards (7 sites across 5 files):**

- `theme.ts` — `initTheme()` and the `prefers-color-scheme` change listener both
  called `localStorage.getItem()` without a try/catch. On failure, `initTheme()`
  now falls through to the VS Code / OS-preference detection path (same as a
  fresh visit with no saved preference). The listener defaults to "no override,"
  which is the correct semantic when storage is unavailable.

- `session.ts` — `captureViewerState()` read the theme key inline in an object
  literal. Hoisted to a `var savedTheme` with try/catch, matching the pattern
  used in `theme.ts`.

- `persistence.ts` — `collectProjectStorageKeys()` enumerated `localStorage`
  via `.length` and `.key(i)` without a guard. On failure, returns an empty
  array — callers (`clearStaleProjectStorage`, `clearAllProjectData`) degrade
  to "nothing to clear."

- `settings.ts` — `clearAllProjectData()` called `removeItem` in a forEach
  without a guard. `resetAllPrefs()` used `.length`, `.key()`, and `removeItem`
  unguarded. Both now wrap the storage operations in try/catch; in-memory state
  clears still execute regardless.

- `toolbar.ts` — The theme-option click handler called `setItem` without a
  guard. The theme still applies visually via `applyTheme()` even when
  persistence fails.

**`--budget N` flag for `check_reference_parity.py`:**

Added a graduated enforcement mode for the l10n baseline. `--budget N` fails
the gate only when surviving baseline entries exceed N, enabling "fix N entries
per sprint" CI ratcheting without the all-or-nothing of `--strict` (which is
equivalent to `--budget 0`).

Conflict guards prevent contradictory combos: `--budget` + `--no-baseline`,
`--budget` + `--strict`, `--budget` + `--only tokens`, `--budget` +
`--update-baseline`.

The `still_bad` set intersection (`current_bad & known_bad`) is computed once
and shared by both `--strict` and `--budget` code paths.

### Verification

- 373 web tests pass (`npm run test:web`)
- TypeScript compiles clean (`npx tsc -p tsconfig.web.json --noEmit`)
- Build freshness gate passes after manifest update
- Reference parity gate passes (330 baseline, 0 new damage)
- `--strict` correctly exits 1 with 330 entries listed
- `--budget 400` correctly exits 0 (330 ≤ 400)
- `--budget 100` correctly exits 1 (330 > 100)
- All flag conflict guards produce exit 2 with explanatory messages

### Code review findings

- Session.ts IIFE style inconsistency → fixed (hoisted to var+try/catch)
- Duplicated `still_bad` set intersection → fixed (hoisted above both blocks)
- No shared `safeStorage` wrapper across 10 files → noted as future refactor,
  not in scope for a hardening pass (would touch all 10 files)
