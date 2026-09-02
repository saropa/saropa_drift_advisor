# BUG: The extension's 11 translated `bundle.l10n.*.json` catalogs are never packaged — `vscode.l10n.t()` always returns English

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/package.json` (missing `l10n` field), `l10n/bundle.l10n.*.json` (outside the packaged tree)
Severity: Correctness (shipped feature is inert) — High

---

## Summary

The repo maintains 11 host translation bundles (`l10n/bundle.l10n.<locale>.json`, 863 keys each) plus an entire Python translation pipeline to keep them current. None of them reach users: `extension/package.json` declares no `"l10n"` field, and the bundles live at the repo root — outside the directory `vsce` packages. The shipped `drift-viewer-4.2.5.vsix` contains zero `bundle.l10n.*` files, so every `vscode.l10n.t()` call falls through to the English default in every locale.

---

## Attribution Evidence

Positive — the bundles, the runtime that consumes them, and the manifest that fails to declare them all live in this repo:

```bash
ls l10n/
```

```
bundle.l10n.de.json      bundle.l10n.ko.json
bundle.l10n.es.json      bundle.l10n.pt-br.json
bundle.l10n.fr.json      bundle.l10n.ru.json
bundle.l10n.it.json      bundle.l10n.zh-cn.json
bundle.l10n.ja.json      bundle.l10n.zh-tw.json
bundle.l10n.json         provenance/
```

The bundles are populated, not stubs:

```bash
python -c "import json;b=json.load(open('l10n/bundle.l10n.de.json',encoding='utf8'));print(len(b));print(ascii(list(b.items())[3]))"
```

```
863
("'(current)'", "'(aktuell)'")
```

The runtime that would consume them:

```bash
grep -rn "vscode.l10n.t" extension/src/l10n.ts
```

```
extension/src/l10n.ts:5: * `strings-*.ts` registries) and passes it through `vscode.l10n.t()`, which
extension/src/l10n.ts:63: * `vscode.l10n.t()` for translation + positional `{0}` substitution. A missing key
extension/src/l10n.ts:68:  return vscode.l10n.t(english, ...args);
```

The manifest declares no `l10n` folder:

```bash
python -c "import json;p=json.load(open('extension/package.json',encoding='utf8'));print('l10n field =',p.get('l10n'))"
```

```
l10n field = None
```

And `extension/` contains no `l10n` directory for `vsce` to pick up:

```bash
ls extension/
```

```
ABOUT_SAROPA.md  drift-viewer-4.2.5.vsix  media/         package.nls.json   src/
CHANGELOG.md     icon.png                 node_modules/  package-lock.json  test/
LICENSE          icon.svg                 out/           schemas/           tsconfig.json
README.md        icon_1024.png            package.json   scripts/
```

The bundles resolve against the repo root, not the extension dir:

```bash
grep -rn "HOST_L10N_DIR *=" scripts/modules/
```

```
scripts/modules/l10n/bundles.py:27:HOST_L10N_DIR = PROJECT_ROOT / "l10n"
```

Nothing copies them into `extension/` at build or publish time:

```bash
grep -rn "l10n" scripts/modules/ext_build.py scripts/modules/ext_publish.py
# Expected: 0 matches
```

**Emit site(s):** `extension/package.json` (missing `"l10n": "./l10n"`), `scripts/modules/ext_build.py` and `scripts/modules/ext_publish.py` (no copy step), `scripts/modules/l10n/bundles.py:27` (root-relative output directory).

---

## Environment

- OS: any
- VS Code version: `^1.115.0` (`engines.vscode`)
- Extension version: 4.2.5 (Marketplace id `saropa.drift-viewer`)
- Dart SDK version: n/a
- Flutter SDK version: n/a
- Database type and version: n/a
- Connection method: n/a
- Relevant non-default settings: VS Code display language set to any of de / es / fr / it / ja / ko / pt-br / ru / zh-cn / zh-tw
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Start from a clean profile. Install `extension/drift-viewer-4.2.5.vsix`.
2. Run **Configure Display Language** from the command palette (not the settings UI) and select **Deutsch**; restart VS Code when prompted.
3. Open the Drift Advisor sidebar and trigger any host string that goes through `t()` in `extension/src/l10n.ts` — for example connect to a running server so a status message is emitted.

Not intermittent — reproduces on every launch.

---

## Expected Behavior

Host strings render in German, using the values in `l10n/bundle.l10n.de.json`. That is the purpose of the 863-key catalog and of the `scripts/l10n.py` / `scripts/translate_l10n.py` pipeline.

---

## Actual Behavior

Every string renders in English. `vscode.l10n.t(english, ...)` has no bundle to consult, so it returns its own first argument unchanged.

---

## Error Output

### VS Code Developer Tools Console

Nothing. `vscode.l10n.t()` is fail-soft by design.

### Extension Output Channel

Nothing — a missing bundle is indistinguishable from an untranslated string, so no warning is emitted anywhere.

### Terminal / Command Output

`vsce package` succeeds without comment; it does not warn about an absent `l10n` field.

### Stack Traces

None.

---

## Duplicate-Emission Check

Two localization systems exist in this repo and only one of them ships:

| System | Catalogs | Shipped? | Evidence |
|---|---|---|---|
| Web viewer (System B) | `assets/web/l10n/web.<locale>.json` — 10 locales, 768 keys | Yes — read from disk and injected as `window.__SDA_L10N` | `lib/src/server/generation_handler.dart:292-312`, `lib/src/server/html_content.dart:112-120` |
| Extension host (System A) | `l10n/bundle.l10n.<locale>.json` — 10 locales + base, 863 keys | **No** | VSIX listing below |

---

## Screenshots / Recordings

Not attached — the VSIX listing below is stronger evidence than a screenshot of English text.

---

## Minimal Reproducible Example

Inspect the committed VSIX directly; no install required:

```bash
cd extension && python -c "import zipfile;z=zipfile.ZipFile('drift-viewer-4.2.5.vsix');n=z.namelist();print(len(n),'entries');print('bundle.l10n entries:',[x for x in n if 'bundle.l10n' in x]);print([x for x in n if x.count('/')<2])"
```

```
1220 entries
bundle.l10n entries: []
['extension.vsixmanifest', '[Content_Types].xml', 'extension/readme.md', 'extension/package.nls.json', 'extension/package.json', 'extension/LICENSE.txt', 'extension/icon_1024.png', 'extension/icon.svg', 'extension/icon.png', 'extension/changelog.md', 'extension/ABOUT_SAROPA.md']
```

Zero `bundle.l10n` entries. The only `l10n`-named entries in the archive are compiled English source registries (`extension/out/l10n/strings-panel-*.js`), which are the fallback text — not translations.

---

## What I Already Tried

- [x] Checked `extension/.vscodeignore` — it excludes `src/`, `test/`, `node_modules/`, `*.md`; it does **not** exclude an `l10n/` directory, so the cause is absence, not exclusion.
- [x] Grepped `scripts/modules/ext_build.py` and `ext_publish.py` for a copy step — none exists.
- [x] Confirmed `extension/scripts/verify-nls.mjs` cannot catch this: its own header says it validates `package.json` `%key%` references against `package.nls*.json`, and it never inspects `bundle.l10n.*`.
- [ ] Tested on a previous extension version — not needed; the manifest has never had an `l10n` field.

---

## Regression Info

- Last working version: none — the bundles have never been packaged.
- First broken version: whichever release first added `l10n/bundle.l10n.*.json`.
- What changed: the translation pipeline was built and wired to `PROJECT_ROOT / "l10n"`, but the packaging side (`"l10n"` manifest field plus a copy into the packaged tree) was never added.

---

## Root Cause

`vscode.l10n` loads translations only from the directory named by the `"l10n"` field in the extension manifest, resolved relative to the extension root **inside the VSIX**. The manifest has no such field, and the catalogs live outside the packaged tree, so the loader has nothing to load. The failure is silent because `vscode.l10n.t()` returns its English argument when no bundle is present.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- **Who is affected:** every non-English VS Code user of `saropa.drift-viewer` — ten locales' worth of shipped-but-dead work.
- **What is blocked:** the entire host localization feature, plus every downstream maintenance task on it. `scripts/translate_l10n.py`, the `l10n_audit` module, the cognate-candidate reports and the `l10n/provenance/` tree are all being maintained against an artifact that never reaches a user. The 4.2.5 changelog's Maintenance block describes a translate-gaps fix to these same bundles.
- **Data risk:** none.
- **Frequency:** 100% of non-English sessions.

---

## Fix Sketch

1. Add `"l10n": "./l10n"` to `extension/package.json`.
2. Make `l10n/` a packaged location. Either move the bundles to `extension/l10n/` and repoint `HOST_L10N_DIR` in `scripts/modules/l10n/bundles.py:27`, or add a copy step to `scripts/modules/ext_build.py` that mirrors `l10n/bundle.l10n*.json` into `extension/l10n/` before `vsce package` and gitignores the copy, so there is exactly one source of truth.
3. Extend the VSIX content verification in `scripts/modules/ext_publish.py` — it already asserts `extension/package.json` and the compiled entry point are present (`ext_publish.py:81-111`) — to also require at least one `extension/l10n/bundle.l10n.<locale>.json` entry. That converts a silent no-op into a publish-time failure.
4. Add a mocha smoke test that stubs the display language to `de` and asserts a known string resolves to its German value.
5. Manifest strings (command titles, setting descriptions) remain English-only for a separate reason — see `bugs/078_infra_package_nls_locale_files_missing.md`.
