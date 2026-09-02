# BUG: `typecheck:web` and the 13 web-viewer test suites run in no gate

**Status: Open**

Created: 2026-09-02
Component: CLI (build/test pipeline)
File: `package.json`, `.husky/pre-commit`, `.github/workflows/main.yaml`, `.github/workflows/publish.yml`, `scripts/publish.py`
Severity: Correctness (untested code ships) — High

---

## Summary

The workspace `package.json` defines `typecheck:web` (TypeScript over the whole web viewer) and `test:web` (13 `node:test` suites under `assets/web/test/`). Neither script is invoked by the pre-commit hook, by CI, by the publish workflow, or by `scripts/publish.py`. The web viewer — ~916 KB of source across ~60 modules, the surface every browser user touches — has zero automated verification in any gate.

---

## Attribution Evidence

Positive — the scripts and the suites exist in this repo, and nothing calls them:

```bash
grep -n "typecheck:web\|test:web\|build:js" package.json
```

```
    "typecheck:web": "tsc -p tsconfig.web.json --noEmit",
    "build:js": "node esbuild.config.mjs",
    "build:js:watch": "node esbuild.config.mjs --watch",
    "test:web": "node --test \"assets/web/test/**/*.test.mjs\""
```

```bash
ls assets/web/test/
```

```
fixtures.mjs
heartbeat-capture-logic.test.mjs
heartbeat-heat.test.mjs
helpers.mjs
history-filter.test.mjs
home-search.test.mjs
nl-keywords-buckets.test.mjs
nl-refine.test.mjs
nl-to-sql.test.mjs
nl-wake.test.mjs
schema-divergence.test.mjs
schema-explorer-logic.test.mjs
table-view-bools.test.mjs
```

No caller anywhere in the pipeline:

```bash
grep -rn "typecheck:web\|test:web" scripts/ .github/ .husky/
# Expected: 0 matches
```

CI runs Dart only — there is no Node step at all:

```bash
grep -n "run:" .github/workflows/main.yaml
```

```
        run: flutter pub get
        run: flutter analyze --fatal-warnings
        run: dart format --set-exit-if-changed .
        run: flutter test
```

The publish workflow's only Node step builds CSS:

```bash
grep -n "npm" .github/workflows/publish.yml
```

```
        run: npm ci && npm run build:style
```

`scripts/publish.py` runs `npm run compile` and `npm run test` — but both are `cd extension`-scoped (`cwd=EXTENSION_DIR`), i.e. the VS Code extension's mocha suite, not the viewer's:

```bash
grep -n "npm run" scripts/modules/ext_build.py
```

```
119:    """Run the TypeScript compiler (``npm run compile``).
127:    info("Running npm run compile...")
148:    """Run the test suite via ``npm run test``."""
149:    info("Running npm run test...")
```

The pre-commit hook's staged-file patterns exclude `assets/web/` entirely:

```bash
grep -n "has_staged" .husky/pre-commit
```

```
if has_staged '\.dart$'; then
if has_staged '^extension/.*\.tsx?$'; then
```

**Emit site(s):** absence of invocation — `package.json` (scripts defined), `.husky/pre-commit`, `.github/workflows/main.yaml`, `.github/workflows/publish.yml`, `scripts/modules/ext_build.py`.

---

## Environment

- OS: Windows 11 / ubuntu-latest CI
- Node version: 22
- TypeScript: `^7.0` (workspace devDependency)
- Package version: 4.2.5

---

## Steps to Reproduce

1. Introduce a deliberate type error in `assets/web/table-view.ts` (e.g. `const n: number = 'x';`).
2. Break an assertion covered by `assets/web/test/table-view-bools.test.mjs`.
3. `git add assets/web/table-view.ts && git commit -m "test"`.
4. Push, open a PR against `main`, and let CI run.

---

## Expected Behavior

At least one gate fails, naming the type error and the failing suite.

---

## Actual Behavior

The pre-commit hook prints `No staged extension .ts files — skipping TypeScript and build checks` and accepts the commit. CI passes green (it never runs Node). `publish.yml` passes green. `scripts/publish.py` passes green. The broken code ships.

---

## Error Output

None from any gate — the failure is total silence.

---

## Duplicate-Emission Check

n/a — infrastructure gap.

---

## Minimal Reproducible Example

The gap is provable without touching source, purely from the pipeline definitions: the three greps above return zero matches for `typecheck:web` and `test:web` across `scripts/`, `.github/` and `.husky/`.

---

## What I Already Tried

- [x] Read `.husky/pre-commit` end to end — only two `has_staged` branches, neither matches `assets/web/`.
- [x] Read both workflows — `main.yaml` has no Node setup step; `publish.yml`'s only npm invocation is `build:style`.
- [x] Read `scripts/modules/ext_build.py` — `npm run compile` / `npm run test` both run with `cwd=EXTENSION_DIR`.

---

## Regression Info

- Last working version: never gated.
- First broken version: whenever `assets/web/test/` and `tsconfig.web.json` were added.
- What changed: the suites were written; the wiring was not.

---

## Root Cause

The three gate surfaces (husky, CI, publish) were each built around one tree — Dart for CI, `extension/` for husky and `publish.py` — and the web viewer, which is a third independent toolchain living under `assets/web/`, was never added to any of them.

---

## Impact

- **Who is affected:** every web-viewer user; every contributor, who gets no signal on viewer regressions.
- **What is blocked:** any regression test written for a viewer bug is inert — it can pass locally, then rot silently. This directly undercuts the "Tests — test covers the exact reproduction case" requirement in `bugs/ISSUE_REPORT_GUIDE.md`, because there is no place a viewer test can be enforced.
- **Data risk:** none directly; indirect via unverified fixes to the data-rendering path.
- **Frequency:** continuous.

---

## Fix Sketch

1. Add a Node job (or steps in the existing job) to `.github/workflows/main.yaml`:

   ```yaml
   - uses: actions/setup-node@v7
     with: { node-version: "22", cache: "npm" }
   - run: npm ci
   - run: npm run typecheck:web
   - run: npm run test:web
   ```

2. Add a `has_staged '^assets/web/.*\.(ts|js|mjs)$'` branch to `.husky/pre-commit` that runs `npm run typecheck:web` and `npm run test:web`, mirroring the existing extension branch's structure and error messaging.
3. Add both to `scripts/publish.py`'s quality phase (a `web_build.py` module beside `ext_build.py`), so a release cannot be cut on a red viewer.
4. Pair with `bugs/015_infra_bundle_js_has_no_staleness_gate.md` — the same steps should also verify the committed bundle, so one Node job covers all three web gates.
