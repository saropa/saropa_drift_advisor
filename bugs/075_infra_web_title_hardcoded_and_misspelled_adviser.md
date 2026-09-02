# BUG: Browser tab title is hardcoded "Saropa Drift Adviser" — misspelled and bypassing `ServerConstants.appDisplayName`

**Status: Open**

Created: 2026-09-02
Component: Server (web viewer shell)
File: `lib/src/server/html_content.dart` (line 136)
Severity: Low (cosmetic + single-source-of-truth violation)

---

## Summary

The viewer's `<title>` is the literal string `Saropa Drift Adviser`. The product is spelled **Advisor** everywhere else — the package name, the pub.dev listing, the changelog, and `ServerConstants.appDisplayName` — which the very same file uses for the masthead pill three lines earlier. So the browser tab, the bookmark label and the browser-history entry all carry a misspelled product name that no rename or rebrand will ever catch, because the string is not sourced from the constant that exists for exactly this purpose.

---

## Attribution Evidence

Positive — the hardcoded title and the constant it should use are in the same repo, and in adjacent code:

```bash
grep -rn "Adviser" --include=*.dart --include=*.ts --include=*.md --include=*.json --include=*.yaml . | grep -v node_modules | grep -v bundle.js
```

```
./CHANGELOG_ARCHIVE.md:921:- **App logo in tab bar** — Replaced the "Saropa Drift Adviser" text header with the app logo, positioned inline with the tab buttons
./CHANGELOG_ARCHIVE.md:1745:• **Web UI branding** — Browser tab and page heading now show "Saropa Drift Adviser" instead of "Drift tables" / "Drift DB".
./lib/src/server/html_content.dart:136:  <title>Saropa Drift Adviser</title>
```

Only one live code site; the two changelog hits are historical entries recording when the misspelling was introduced.

The canonical constant, and the doc comment stating it is meant to be the single source:

```bash
grep -n -B4 "appDisplayName = " lib/src/server/server_constants.dart
```

```
  /// Human-readable product name shown in the web-UI masthead and loading
  /// overlay. Centralised here so every display site stays in sync.
  static const String appDisplayName = 'Saropa Drift Advisor';
```

The same file already uses it correctly, twice, within 40 lines of the hardcoded title:

```bash
grep -n "appDisplayName" lib/src/server/html_content.dart
```

```
      <span class="masthead-name">${ServerConstants.appDisplayName}</span>
      <div style="color:#89b4fa;font-weight:bold;margin-bottom:0.5em">${ServerConstants.appDisplayName} v${ServerConstants.packageVersion}</div>
```

So the loading overlay and the masthead read "Saropa Drift Advisor" while the tab beside them reads "Saropa Drift Adviser".

The correct spelling is the package identity:

```bash
grep -n "^name:" pubspec.yaml
```

```
name: saropa_drift_advisor
```

Negative attribution — the string is not supplied by a sibling package:

```bash
grep -rn "Drift Adviser" ../saropa_lints/ ../saropa_dart_utils/
# Expected: 0 matches
```

**Emit site(s):** `lib/src/server/html_content.dart:136`.

---

## Environment

- OS: any
- Browser: any
- VS Code version: n/a (browser surface; the VS Code panel sets its own title)
- Extension version: 4.2.5
- Dart SDK version: as pinned by `pubspec.yaml`
- Flutter SDK version: any
- Database type and version: n/a
- Connection method: browser at `http://127.0.0.1:8642`
- Relevant non-default settings: none
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Start the example app so the debug server binds 8642.
2. Open `http://127.0.0.1:8642` in a browser.
3. Read the browser tab label, then read the masthead pill and the loading overlay on the same page.
4. Bookmark the page (Ctrl+D) and read the suggested bookmark name.

---

## Expected Behavior

Tab, bookmark, history entry, masthead and loading overlay all read **Saropa Drift Advisor**, sourced from `ServerConstants.appDisplayName`.

---

## Actual Behavior

The tab, bookmark and history entry read **Saropa Drift Adviser**; the masthead and loading overlay on the same page read **Saropa Drift Advisor**. The two spellings are visible simultaneously.

---

## Error Output

### VS Code Developer Tools Console

Nothing.

### Extension Output Channel

Nothing.

### Terminal / Command Output

```
curl -s http://127.0.0.1:8642/ | grep -o "<title>[^<]*</title>"
```

```
<title>Saropa Drift Adviser</title>
```

### Stack Traces

None.

---

## Duplicate-Emission Check

One live emit site, plus two historical changelog references that should be left alone (they record what shipped at the time):

| Site | Text | Action |
|---|---|---|
| `lib/src/server/html_content.dart:136` | `<title>Saropa Drift Adviser</title>` | Fix |
| `CHANGELOG_ARCHIVE.md:921` | historical entry | Leave |
| `CHANGELOG_ARCHIVE.md:1745` | historical entry | Leave |

---

## Screenshots / Recordings

Not attached — the `curl` output above shows the served markup verbatim.

---

## Minimal Reproducible Example

```bash
sed -n '136p' lib/src/server/html_content.dart
grep -n "appDisplayName = " lib/src/server/server_constants.dart
```

The literal and the constant disagree by one letter.

---

## What I Already Tried

- [x] Grepped the whole tree for `Adviser` — exactly one live code site.
- [x] Confirmed `ServerConstants.appDisplayName` is already imported and used twice in the same file, so the fix needs no new import.
- [x] Confirmed the string is not interpolated anywhere else (no `<title>` construction outside line 136).

---

## Regression Info

- Last working version: never correct — `CHANGELOG_ARCHIVE.md:1745` records the misspelling being introduced with the original "Web UI branding" change.
- First broken version: that release.
- What changed: the title was typed by hand rather than sourced from a constant, and the constant was added later for the masthead without the title being migrated.

---

## Root Cause

The `<title>` was written as a literal before `ServerConstants.appDisplayName` existed. When the constant was introduced ("Centralised here so every display site stays in sync"), the masthead and loading overlay were migrated to it and the title was missed — so the misspelling survives in the one place a centralised rename cannot reach.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- **Who is affected:** every browser user of the viewer — the tab label is the most persistent piece of product branding in the tool.
- **What is blocked:** nothing functional. It undermines the stated purpose of `appDisplayName` and would survive a future rename.
- **Data risk:** none.
- **Frequency:** every page load.

---

## Fix Sketch

Replace the literal with the constant, so the tab participates in the centralisation the constant was created for:

```dart
  // Sourced from ServerConstants.appDisplayName rather than a literal: the
  // hand-typed title read "Adviser" while the masthead beside it (which already
  // used the constant) read "Advisor", and a literal would survive any rename.
  <title>${ServerConstants.appDisplayName}</title>
```

Optionally append the version, matching the loading overlay's `${ServerConstants.appDisplayName} v${ServerConstants.packageVersion}` format, so a bookmarked tab records which server version it came from.

Add a test asserting `HtmlContent.buildIndexHtml()` contains `<title>${ServerConstants.appDisplayName}</title>` — the existing Dart suite already covers `buildIndexHtml` output and runs in CI (`flutter test`), so this gate is real rather than aspirational.
