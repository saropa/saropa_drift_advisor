# BUG: README documents a `/assets/web/app.js` route that does not exist, and four version markers are ~28 releases stale

**Status: Fixed**

Created: 2026-09-02
Component: Server / Documentation
File: `README.md` (lines 105, 237, 352, 369, 515, 533), `lib/src/server/router.dart` (line 346)
Severity: Wrong documentation — Medium

---

## Summary

`README.md` twice tells consumers the debug server serves `/assets/web/app.js`. That route does not exist — the served path is `/assets/web/bundle.js` (`ServerConstants.pathWebApp`), and a request for `app.js` gets the 404 path. Separately, the README carries four version markers frozen at the 2.x era while the package is at 4.2.5: a "last revised to match CHANGELOG version 2.10.0" banner, an install snippet pinning `^2.9.0`, and a release instruction using `git tag v2.x.x`. `doc/API.md` is version-synced automatically by `scripts/modules/target_config.py`; `README.md` is not covered by that or any other gate.

---

## Attribution Evidence

Positive — both the wrong doc text and the real route live in this repo.

The real route constant:

```bash
sed -n '265,272p' lib/src/server/server_constants.dart
```

```
  /// Local web UI stylesheet (served from package `assets/web/style.css`).
  static const String pathWebStyle = '/assets/web/style.css';
  static const String pathWebStyleAlt = 'assets/web/style.css';

  /// Local web UI script (served from package `assets/web/bundle.js`).
  static const String pathWebApp = '/assets/web/bundle.js';
  static const String pathWebAppAlt = 'assets/web/bundle.js';
```

The asset the handler actually reads and caches:

```bash
grep -n "assets/web/bundle.js\|assets/web/app.js" lib/src/server/generation_handler.dart
```

```
11:// The `/assets/web/style.css` and `/assets/web/bundle.js` routes are
34:// (style.css, bundle.js) are also cached in memory during resolution, so
356:      relativePath: 'assets/web/bundle.js',
389:      'assets/web/bundle.js' => _cachedBundleJs,
596:      final jsFile = File('$packageRoot/assets/web/bundle.js');
```

There is no `app.js` anywhere on the serving path:

```bash
grep -rn "'assets/web/app.js'\|/assets/web/app.js" lib/
```

```
lib/src/server/router.dart:346:    // GET /assets/web/style.css and /assets/web/app.js — local web UI assets.
```

— a stale comment only; the code beneath it dispatches on `pathWebStyle` / `pathWebApp`, and `pathWebApp` is `bundle.js`.

The two incorrect README claims:

```bash
sed -n '237p;369p' README.md
```

```
- **Web UI assets** — CSS and JS are inlined directly into the HTML response when the package root is resolved on disk (zero extra requests, works offline). When local files are unavailable (e.g. Flutter on Android/iOS emulators), the HTML references version-pinned jsDelivr CDN URLs directly. The `/assets/web/style.css` and `/assets/web/app.js` routes remain available for backward-compatible direct access (e.g. VS Code extension)
- **Assets:** The published package includes `assets/web/style.css` and `assets/web/app.js`. When the debug server resolves the package root on disk, these are inlined directly into the HTML response (works offline, no extra requests). When local files are unavailable, the HTML references version-pinned jsDelivr CDN URLs.
```

The stale version markers:

```bash
sed -n '105p;352p;533p' README.md && grep -n "^version:" pubspec.yaml
```

```
> **README ↔ changelog:** This file was last revised to match **[CHANGELOG.md](CHANGELOG.md) version 2.10.0**. For the full version history and older releases, see the changelog and [CHANGELOG_ARCHIVE.md](CHANGELOG_ARCHIVE.md).
  saropa_drift_advisor: ^2.9.0 # use the latest compatible release from pub.dev
**Manual:** Bump version in `pubspec.yaml`, then `git tag v2.x.x` and `git push origin v2.x.x`. GitHub Actions publishes to pub.dev.
5:version: 4.2.5
```

`doc/API.md` is version-synced by the pipeline; `README.md` has no such treatment:

```bash
grep -rn "sync_api_md_version\|README" scripts/modules/target_config.py
```

```
208:        sync_api_md_version(version)
365:def sync_api_md_version(
450:    if not sync_api_md_version(pub_ver):
```

Zero `README` matches — nothing syncs it.

Negative attribution — this README belongs to `saropa_drift_advisor`, not a sibling:

```bash
grep -rn "assets/web/app.js" ../saropa_lints/ ../saropa_dart_utils/
# Expected: 0 matches
```

**Emit site(s):** `README.md:237`, `README.md:369` (nonexistent route); `README.md:105`, `:352`, `:533` (stale version markers); `README.md:515` (names `app.js` as the typecheck target); `lib/src/server/router.dart:346` (stale comment).

---

## Environment

- OS: any
- VS Code version: n/a
- Extension version: 4.2.5
- Dart SDK version: as pinned by `pubspec.yaml`
- Flutter SDK version: any
- Database type and version: n/a
- Connection method: HTTP to `127.0.0.1:8642`
- Relevant non-default settings: none
- Other potentially conflicting extensions: none

---

## Steps to Reproduce

1. Read `README.md` line 237, which states `/assets/web/app.js` "remains available for backward-compatible direct access (e.g. VS Code extension)".
2. Start the example app so the debug server binds 8642.
3. Request the documented route.

---

## Expected Behavior

`GET /assets/web/app.js` returns the viewer JavaScript, as documented.

---

## Actual Behavior

The router matches neither `pathWebStyle` nor `pathWebApp` (which is `/assets/web/bundle.js`), so the request falls through to the not-found path. A consumer who follows the README — the README explicitly names the VS Code extension as such a consumer — gets nothing.

Separately, a new user copying the install snippet at line 352 pins `saropa_drift_advisor: ^2.9.0`, resolving to a two-major-versions-old release that predates the package rename recorded in the changelog.

---

## Error Output

### Terminal / Command Output

```
curl -i http://127.0.0.1:8642/assets/web/app.js
curl -i http://127.0.0.1:8642/assets/web/bundle.js
```

The first returns the server's not-found response; the second returns the bundle. No error is logged server-side for either — the mismatch is silent.

### VS Code Developer Tools Console

n/a.

### Extension Output Channel

n/a — the shipped extension reads the asset from disk (`readAsset('assets/web/bundle.js')` in its own tests), so it is not itself broken by this; only third parties following the README are.

### Stack Traces

None.

---

## Duplicate-Emission Check

The same wrong path appears in three places that must be fixed together, or the next reader will re-introduce it from whichever copy was missed:

| Location | Text |
|---|---|
| `README.md:237` | `/assets/web/app.js` route "remains available" |
| `README.md:369` | published package "includes … `assets/web/app.js`" |
| `lib/src/server/router.dart:346` | comment `GET /assets/web/style.css and /assets/web/app.js` |

`doc/api/index.html` carries generated copies of the README lines and will correct itself on the next `dart doc` run.

---

## Screenshots / Recordings

Not attached — the `curl` pair above is the evidence.

---

## Minimal Reproducible Example

```bash
grep -n "assets/web/app.js" README.md lib/ | cat
grep -n "pathWebApp = " lib/src/server/server_constants.dart
```

The first lists documentation claiming `app.js`; the second shows the constant resolves to `bundle.js`.

---

## What I Already Tried

- [x] Grepped `lib/` for any `app.js` route registration — only the stale comment at `router.dart:346`.
- [x] Confirmed `assets/web/app.js` exists as a **source** file (1045 lines) but is an esbuild input, never a served artifact — `esbuild.config.mjs` entry point is `assets/web/index.js`, outfile `assets/web/bundle.js`.
- [x] Confirmed `scripts/modules/target_config.py` syncs `doc/API.md` only, so the README markers have no automated owner.
- [x] Checked `README.md:515`, which describes `npm run typecheck:web` as running "over `assets/web/app.js`" — `tsconfig.web.json` in fact includes `assets/web/index.js`, `app.js`, `dom-globals.d.ts` and `assets/web/**/*.ts`, i.e. the whole viewer.

---

## Regression Info

- Last working version: ~2.10.0, when the README was last revised and `app.js` was still the served artifact.
- First broken version: whichever release replaced the hand-written `app.js` with the esbuild `bundle.js`.
- What changed: the build was migrated to esbuild and `ServerConstants.pathWebApp` was repointed to `bundle.js`; the README, the router comment, and the version markers were not updated.

---

## Root Cause

`doc/API.md` has an automated version-sync owner (`sync_api_md_version`) and `README.md` does not, so the README froze at the moment of its last manual revision. The `app.js` claim is a specific instance of that freeze: it was correct at 2.10.0 and became wrong when the bundler landed.

---

## Changes Made

- `README.md:237` — `/assets/web/app.js` → `/assets/web/bundle.js` in the "Web UI assets" bullet.
- `README.md:369` — `assets/web/app.js` → `assets/web/bundle.js` in the "Assets" bullet under app-size impact.
- `README.md:105` — version banner `2.10.0` → `4.2.5`.
- `README.md:352` — install snippet `saropa_drift_advisor: ^2.9.0` → `^4.2.5`.
- `README.md:515` — typecheck description rewritten to name `tsconfig.web.json`'s actual scope (`assets/web/index.js`, `assets/web/app.js`, and all `assets/web/**/*.ts`) instead of `app.js` alone.
- `README.md:533` — `git tag v2.x.x` / `git push origin v2.x.x` → `v4.x.x` (both occurrences).
- `lib/src/server/router.dart:371` (previously reported as line 346; line numbers shifted) — stale comment `GET /assets/web/style.css and /assets/web/app.js` corrected to `bundle.js`, with an added note clarifying `app.js` is only the pre-bundle source input and is never itself served.

Note: `scripts/modules/target_config.py` `sync_readme_version()` (Fix Sketch item 4) was not added — out of scope for this pass, which was a text-only correction. A follow-up bug/task should be filed if automated README version-sync is wanted.

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- **Who is affected:** anyone integrating against the HTTP surface from the README rather than from `doc/API.md`; every new user copying the install snippet.
- **What is blocked:** third-party direct asset access; correct first-install version selection.
- **Data risk:** none.
- **Frequency:** continuous until fixed.

---

## Fix Sketch

1. Replace `/assets/web/app.js` with `/assets/web/bundle.js` at `README.md:237` and `:369`, and correct the stale comment at `lib/src/server/router.dart:346`.
2. Update `README.md:515` to say the type-check covers `assets/web/index.js`, `app.js` and all `assets/web/**/*.ts` (per `tsconfig.web.json`), rather than `app.js` alone.
3. Refresh the version markers: line 105 to the current release, line 352 to `^4.2.5`, line 533 to `git tag v4.x.x`.
4. Extend `scripts/modules/target_config.py` with a `sync_readme_version()` alongside `sync_api_md_version()`, anchored to the specific marker strings (the "last revised to match … version X.Y.Z" banner and the `saropa_drift_advisor: ^X.Y.Z` snippet) so they cannot silently rot again. The existing `sync_api_md_version` hardening described in the 4.2.5 changelog — replacing only the *current* header version rather than any semver-shaped text — is the pattern to copy.
