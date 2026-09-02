# BUG: No `package.nls.<locale>.json` files exist — all 259 manifest strings are English-only, and `verify-nls` reports "OK" for the empty set

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/package.nls.json` (only bundle), `extension/scripts/verify-nls.mjs` (line 45)
Severity: UX (untranslated surface) / False-confidence gate — Medium

---

## Summary

`extension/package.json` routes 259 manifest strings — every command title, view name, setting description and walkthrough label — through `%key%` NLS placeholders. Only the English base bundle `package.nls.json` exists; there is no `package.nls.de.json` or any other locale. So the entire manifest surface renders in English in all ten locales the project otherwise translates. Worse, `extension/scripts/verify-nls.mjs` reports `OK` in this state, because it iterates the discovered bundle files and there is exactly one — the gate cannot distinguish "aligned across all locales" from "there are no locales".

---

## Attribution Evidence

Positive — the manifest, the single bundle, and the gate all live in this repo:

```bash
ls extension/package.nls*.json
```

```
extension/package.nls.json
```

```bash
python -c "import json;n=json.load(open('extension/package.nls.json',encoding='utf8'));print('package.nls.json keys:',len(n))"
```

```
package.nls.json keys: 259
```

The gate passes on the degenerate set:

```bash
cd extension && node scripts/verify-nls.mjs; echo "exit=$?"
```

```
verify-nls: OK — 259 keys aligned across 1 bundle(s) [package.nls.json].
exit=0
```

The bundle-discovery line that makes this possible:

```bash
grep -n "nlsFiles" extension/scripts/verify-nls.mjs
```

```
45:const nlsFiles = readdirSync(extDir).filter((f) => /^package\.nls(\.[\w-]+)?\.json$/.test(f));
47:  console.error('verify-nls: FAIL — package.nls.json (English base) is missing.');
57:for (const file of nlsFiles) {
```

The script guards against a missing **base** bundle (line 46-49) but has no floor on the number of **locale** bundles, so the `for` loop at line 57 runs exactly once and finds no drift.

Contrast: the project does ship ten locales on both of its other surfaces:

```bash
ls l10n/bundle.l10n.*.json | wc -l && ls assets/web/l10n/web.*.json | wc -l
```

```
10
10
```

Negative attribution — manifest NLS is a VS Code extension mechanism and cannot originate in a sibling Dart package:

```bash
grep -rn "package.nls" ../saropa_lints/ ../saropa_dart_utils/
# Expected: 0 matches
```

**Emit site(s):** `extension/package.nls.json` (sole bundle), `extension/scripts/verify-nls.mjs:45` (discovery with no minimum-locale assertion).

---

## Environment

- OS: any
- VS Code version: `^1.115.0`
- Extension version: 4.2.5
- Dart SDK version: n/a
- Flutter SDK version: n/a
- Database type and version: n/a
- Connection method: n/a
- Relevant non-default settings: VS Code display language set to any non-English locale
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Start from a clean profile with `drift-viewer-4.2.5.vsix` installed.
2. Run **Configure Display Language** from the command palette, select **Deutsch**, restart.
3. Open **Settings** and filter on `driftViewer`.
4. Open the command palette and type `Drift`.

---

## Expected Behavior

Setting descriptions and command titles render in German, consistent with the ten locales the project translates for the web viewer and (once packaged) the host runtime.

---

## Actual Behavior

All 259 manifest strings render in English, because VS Code finds no `package.nls.de.json` and falls back to `package.nls.json`.

---

## Error Output

### VS Code Developer Tools Console

Nothing — NLS fallback is silent by design.

### Extension Output Channel

Nothing.

### Terminal / Command Output

`npm run compile` runs `verify-nls` and prints a green `OK` line, which actively reinforces the false belief that manifest localization is in a good state:

```
verify-nls: OK — 259 keys aligned across 1 bundle(s) [package.nls.json].
```

### Stack Traces

None.

---

## Duplicate-Emission Check

Three localization surfaces; the manifest is the only one with no locale files at all:

| Surface | Locale files | Count |
|---|---|---|
| Web viewer | `assets/web/l10n/web.<locale>.json` | 10 |
| Extension host runtime | `l10n/bundle.l10n.<locale>.json` | 10 (not packaged — see `bugs/014_infra_extension_l10n_bundles_not_packaged.md`) |
| Extension manifest | `extension/package.nls.<locale>.json` | **0** |

---

## Screenshots / Recordings

Not attached — the `ls` and `verify-nls` output above is the evidence.

---

## Minimal Reproducible Example

```bash
ls extension/package.nls*.json && cd extension && node scripts/verify-nls.mjs
```

One file listed, `OK` printed. Both facts together are the bug.

---

## What I Already Tried

- [x] Read `extension/scripts/verify-nls.mjs` in full — confirmed it checks key parity in both directions but has no locale-count floor.
- [x] Confirmed `extension/.vscodeignore` does not exclude `package.nls*.json` (the base bundle is present in the VSIX listing), so this is absence, not exclusion.
- [x] Confirmed the l10n Python pipeline under `scripts/modules/l10n/` targets `l10n/bundle.l10n.*` and `assets/web/l10n/web.*` only — no generator emits `package.nls.<locale>.json`.

---

## Regression Info

- Last working version: none.
- First broken version: whenever `%key%` placeholders were introduced into `extension/package.json`.
- What changed: the manifest was made translatable and the parity gate was written, but no locale bundles were ever generated.

---

## Root Cause

Two independent gaps compound:

1. No generator in `scripts/modules/l10n/` targets the manifest NLS format, so no locale bundles are produced.
2. `verify-nls.mjs` was written to detect *drift between existing bundles*. With zero locale bundles there is nothing to drift, so the gate is vacuously satisfied and reports success — hiding gap (1) behind a green check.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- **Who is affected:** every non-English user, on the first surface they see (the settings list and command palette).
- **What is blocked:** manifest localization entirely. Because `verify-nls` reports OK, the gap is invisible to anyone reading CI output.
- **Data risk:** none.
- **Frequency:** 100% of non-English sessions.

---

## Fix Sketch

1. Give `verify-nls.mjs` an expected-locale list rather than "whatever is on disk". Derive it from the locales the project already ships (`l10n/bundle.l10n.*.json`) and fail when a `package.nls.<locale>.json` is missing:

   ```js
   // The discovery-only check passed vacuously when zero locale bundles existed:
   // one file means nothing can disagree with anything. Assert the expected set
   // so a missing locale is a failure, not an empty loop.
   const EXPECTED_LOCALES = ['de','es','fr','it','ja','ko','pt-br','ru','zh-cn','zh-tw'];
   for (const loc of EXPECTED_LOCALES) {
     if (!nlsFiles.includes(`package.nls.${loc}.json`)) {
       problems.push(`package.nls.${loc}.json: MISSING locale bundle`);
     }
   }
   ```

2. Add a manifest-NLS target to the l10n pipeline (`scripts/modules/l10n/bundles.py`) that emits `extension/package.nls.<locale>.json` for the same ten locales, keyed by the `package.nls.json` key (not by English value, unlike the host bundle).
3. Do this together with `bugs/014_infra_extension_l10n_bundles_not_packaged.md` — a user who sees translated settings but English notifications is worse off than one who sees consistent English.
