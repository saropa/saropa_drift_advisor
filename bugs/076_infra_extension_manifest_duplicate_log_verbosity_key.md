# BUG: `extension/package.json` declares `driftViewer.logVerbosity` twice; every gate silently drops the duplicate

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/package.json` (lines 1446 and 1770)
Severity: Low (latent config-divergence trap)

---

## Summary

`driftViewer.logVerbosity` is declared twice in `contributes.configuration.properties`. The two blocks are currently byte-identical so there is no behavioural difference today, but `JSON.parse` keeps only the last occurrence — meaning any future edit to the first block is silently discarded. No gate catches this: `verify-nls.mjs`, `nls-coverage.mjs` and `scripts/modules/ext_build.py` all read the manifest through `JSON.parse`, which collapses duplicates before they can be inspected.

---

## Attribution Evidence

Positive — the manifest is this repo's:

```bash
grep -n '"driftViewer.logVerbosity"' extension/package.json
```

```
1446:        "driftViewer.logVerbosity": {
1770:        "driftViewer.logVerbosity": {
```

Both blocks in full:

```bash
sed -n '1446,1455p' extension/package.json
```

```
        "driftViewer.logVerbosity": {
          "type": "string",
          "enum": [
            "quiet",
            "normal",
            "verbose"
          ],
          "default": "verbose",
          "description": "%config.logVerbosity.description%"
        },
```

```bash
sed -n '1770,1779p' extension/package.json
```

```
        "driftViewer.logVerbosity": {
          "type": "string",
          "enum": [
            "quiet",
            "normal",
            "verbose"
          ],
          "default": "verbose",
          "description": "%config.logVerbosity.description%"
        },
```

Detected by a JSON-aware parser that does not collapse duplicates (esbuild, while bundling the web viewer, which reaches `extension/src/query-builder/*` and therefore the extension tree):

```bash
node esbuild.config.mjs 2>&1 | head -5
```

```
▲ [WARNING] Duplicate key "driftViewer.logVerbosity" in object literal [duplicate-object-key]

    extension/package.json:1770:8:
      1770 │         "driftViewer.logVerbosity": {
           ╵         ~~~~~~~~~~~~~~~~~~~~~~~~~~
```

The gates cannot see it, because they parse first:

```bash
grep -n "JSON.parse" extension/scripts/verify-nls.mjs
```

```
const pkg = JSON.parse(readFileSync(join(extDir, 'package.json'), 'utf8'));
    const bundle = JSON.parse(readFileSync(join(extDir, file), 'utf8'));
```

```bash
grep -n "json.load" scripts/modules/ext_build.py
```

```
            pkg = json.load(fh)
```

Both `JSON.parse` and Python's `json.load` keep the **last** duplicate key and discard earlier ones without warning.

Negative attribution — the manifest belongs to this extension only:

```bash
grep -rn "driftViewer.logVerbosity" ../saropa_lints/ ../saropa_dart_utils/
# Expected: 0 matches
```

**Emit site(s):** `extension/package.json:1446`, `extension/package.json:1770`.

---

## Environment

- OS: Windows 11 / any
- VS Code version: `^1.115.0`
- Extension version: 4.2.5
- Dart SDK version: n/a
- Flutter SDK version: n/a
- Database type and version: n/a
- Connection method: n/a
- Relevant non-default settings: none
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Edit the **first** `driftViewer.logVerbosity` block at `extension/package.json:1446` — for example change `"default": "verbose"` to `"default": "normal"`.
2. Run `cd extension && npm run compile` (which runs `verify-nls` and `verify:nls-coverage`).
3. Install the resulting build and open Settings, filter on `driftViewer.logVerbosity`.

---

## Expected Behavior

Either the edit takes effect, or a gate fails telling the author the key is declared twice.

---

## Actual Behavior

`npm run compile` succeeds with no warning. The setting still shows `verbose`, because VS Code's manifest parser keeps the second (unedited) declaration. The author's change is silently lost, with a green build to reinforce the belief that it landed.

---

## Error Output

### Terminal / Command Output

`npm run compile` output contains no mention of the duplicate:

```
verify-nls: OK — 259 keys aligned across 1 bundle(s) [package.nls.json].
```

Only esbuild — which is not part of any gate — reports it, and only incidentally while bundling the web viewer.

### VS Code Developer Tools Console

Nothing.

### Extension Output Channel

Nothing.

### Stack Traces

None.

---

## Duplicate-Emission Check

One key, two declarations, both in the same file and both in the same `contributes.configuration.properties` object:

| Occurrence | Line | Neighbouring keys |
|---|---|---|
| First | 1446 | between `driftViewer.discovery.enabled` and `driftViewer.discovery.portRangeStart` |
| Second | 1770 | between `driftViewer.diagnostics.userDataTables` and `driftViewer.diagnostics.disabledRules` |

The second occurrence sits in the diagnostics block, where a log-verbosity setting does not belong — suggesting it was pasted during a diagnostics-settings addition and the original was never removed.

---

## Screenshots / Recordings

Not attached — the two `sed` excerpts above show both declarations verbatim.

---

## Minimal Reproducible Example

```bash
grep -c '"driftViewer.logVerbosity"' extension/package.json   # 2
python -c "import json;p=json.load(open('extension/package.json',encoding='utf8'));c=p['contributes']['configuration'];pr=c['properties'] if isinstance(c,dict) else {};print(sum(1 for k in pr if k=='driftViewer.logVerbosity'))"   # 1
```

Two in the file, one after parsing — the discrepancy is the bug.

---

## What I Already Tried

- [x] Diffed both blocks — currently byte-identical, so no user-visible symptom today.
- [x] Confirmed neither `verify-nls.mjs` nor `nls-coverage.mjs` nor `ext_build.py` can detect it, because all three parse before inspecting.
- [x] Confirmed VS Code's own manifest handling follows JSON last-wins, so the second declaration is the live one.

---

## Regression Info

- Last working version: unknown — the duplicate is present at 4.2.5.
- First broken version: whichever release added the diagnostics settings block containing line 1770.
- What changed: a settings block was added by copy; the copied `logVerbosity` entry was not removed.

---

## Root Cause

JSON has no duplicate-key error in any parser used by this project's toolchain, so a paste-duplicated key survives every gate. The manifest is 1800+ lines with settings grouped by feature, which makes a visual catch unlikely.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- **Who is affected:** contributors editing settings; no end-user symptom today.
- **What is blocked:** nothing right now. The risk is that the next edit to the setting at line 1446 — a default change, an added enum value, a corrected description — is discarded with a green build.
- **Data risk:** none.
- **Frequency:** latent; triggers on the next edit to the shadowed block.

---

## Fix Sketch

1. Delete the second declaration (`extension/package.json:1770-1779`) so the key lives with the other connection/logging settings at 1446, and leave a comment in the commit message explaining which copy was authoritative.
2. Add a duplicate-key guard to `scripts/modules/ext_build.py`, alongside the existing `check_engines_vscode_compat()`. Python can detect duplicates with an `object_pairs_hook` and needs no new dependency:

   ```python
   def _reject_duplicate_keys(pairs):
       """json.load silently keeps the last duplicate key, so a pasted setting
       block can shadow an earlier one and every gate stays green. Raise instead,
       so the manifest is checked for uniqueness rather than merely parseability."""
       seen = {}
       for key, value in pairs:
           if key in seen:
               raise ValueError(f"duplicate key in package.json: {key}")
           seen[key] = value
       return seen
   ```

   Load the manifest with `json.load(fh, object_pairs_hook=_reject_duplicate_keys)` in the quality phase.
3. Also apply the guard to `package.nls.json` and the `l10n/` bundles, where a duplicate key would silently drop a translation.
