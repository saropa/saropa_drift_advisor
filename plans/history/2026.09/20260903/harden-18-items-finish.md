# Harden 18 Items — Finish Report

The web viewer hardening batch added three pre-commit gate scripts, an a11y
regression test suite, and a localization placeholder baseline, completing the
final items from the bug 080–084 fix cycle and the bug 085 l10n damage
containment effort.

## Finish Report (2026-09-03)

### What changed

**New files:**

- `scripts/check_web_build_freshness.py` — SHA-256 manifest gate (Gate 5).
  Hashes every `.ts`/`.js`/`.scss` source and both build artifacts
  (`bundle.js`, `style.css`). Compares against
  `scripts/web_build_manifest.json` on every pre-commit. `--update` rewrites
  the manifest after a build; `--force` skips the mtime sanity check.
  `--list` shows tracked sources.

- `scripts/check_reference_parity.py` — dual-domain gate (Gate 6). Token half
  resolves every `var(--token)` in SCSS to a declaration or an allowlisted
  gap (7 entries: 1 runtime-set, 6 design-system gaps tracked by plan 82).
  L10n half compares `{n}` placeholder sets across 10 locales against the
  English catalogs. Uses a shrink-only baseline
  (`scripts/l10n_placeholder_baseline.json`, 330 known-bad pairs from bug
  085) so new damage fails the gate while existing debt is tracked.

- `assets/web/test/a11y-tab-close-pin.test.mjs` — 15 a11y regression tests
  for bug 084 structural fixes. Covers tab close button `role`/`aria-label`,
  tab button `aria-selected`, pin button `role`/`aria-pressed`/accessible
  name, pin icon `aria-hidden`, sibling structure, and the accepted
  `aria-required-children` violation (tablist ownership).

- `scripts/l10n_placeholder_baseline.json` — frozen baseline for the 330
  known-bad placeholder pairs. `_meta` block records the bug reference,
  freeze date, count, and rationale.

- `bugs/085_web_viewer_l10n_placeholder_tokens_left_unrestored_in_seven_locales.md`
  — bug report documenting the 330 l10n placeholder mismatches across 7
  locales, with per-locale breakdown and MT residue counts.

**Modified files:**

- `.husky/pre-commit` — Gates 5 (build freshness) and 6 (reference parity)
  wired in. ERE regex bug fixed: `\.\(ts\|js\|scss\)` → `\.(ts|js|scss)`
  because `has_staged` uses `grep -qE` (ERE mode).

- `CHANGELOG.md` — added Maintenance entries for the three new gate scripts
  and the a11y test suite.

### Code review fixes applied

- Removed dead `import re` from `check_web_build_freshness.py`.
- Wrapped `globalThis.window` stub/restore in `buildTableList()` test helper
  with `try/finally` to prevent leaked stub on `renderTableList` throw.
- Added `main()` docstrings to both Python scripts.
- Added dispatch-order comment to `check_web_build_freshness.py` flag handling.
- Added rationale comment to `check_reference_parity.py`
  `--update-baseline`/`--only tokens` rejection guard.

### Lane-A icon-probe design concerns (2–5) — analysis only

All four design concerns analyzed; none require code changes:

1. **Concern 2 (monospace baseline):** Not a real concern — probe uses CSS
   font-family cascading, not array indexing of `@font-face` rules.
2. **Concern 3 (canvas `liga` shaping):** Already handled — span probe is
   the confirming authority; canvas false-negative never causes degradation.
3. **Concern 4 (three-branch asymmetry):** Intentional, documented with a
   truth table at `toolbar.ts:292-309`. Asymmetry reflects different
   evidence strength across API outcomes.
4. **Concern 5 (`display=block` ~3s window):** Handled by localStorage
   seed. First-visit gap on iconless machine is an accepted trade-off vs.
   flash-of-text on healthy connections.

### Hardening pass (reflection items)

Applied after initial code review, in response to Section 8 reflection:

- `TS_STRING` regex extended to match both single- and double-quoted TypeScript
  string literals. Prevents silently skipping l10n entries that use `"..."`.
  Backward-compatible: still parses exactly 768 keys.
- `MT_RESIDUE` regex anchored with `(?<!\w)` / `(?!\w)` word boundaries to
  prevent false positives on ordinary words containing "ph" + digit (e.g.
  "paragraph1"). MT residue count dropped from 112 → 95 (17 false positives
  eliminated).
- Guarded `--no-baseline` + `--update-baseline` combination with an explicit
  `parser.error` — previously produced a confusing "refuses to ADD 330"
  failure with no explanation.
- Extended `scan_runtime_set_tokens` to scan both `*.ts` and `*.js` files,
  closing a blind spot where a `setProperty` call in `app.js` would go
  undetected.
- Changed `stale_sources_by_mtime` comparison from `>` to `>=` so edits
  landing in the same filesystem-clock tick as the build are flagged.
- Added `--strict` flag to `check_reference_parity.py` that fails the gate
  on baseline entries too (not just new damage). Enables CI enforcement of
  "fix N entries per sprint" policy. Guarded against conflicting flag
  combinations (`--strict` + `--no-baseline`, `--strict` + `--update-baseline`).

### Verification

- 373 web tests pass (`npm run test:web`)
- `check_web_build_freshness.py` exits 0 (102 sources, 2 artifacts match)
- `check_reference_parity.py` exits 0 (50 tokens resolved, 330 baseline
  pairs, no new damage)
- `check_reference_parity.py --only l10n --strict` exits 1 (correctly fails
  on 330 baseline entries)
- Flag guard combinations (`--strict`+`--no-baseline`, `--no-baseline`+
  `--update-baseline`) correctly rejected with `parser.error`
