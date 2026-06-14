# C2b phase 2 — nonce CSP for the Dart-served SPA + the data-grid webview

**Status:** deferred (active, not started). Parent: `plans/full-codebase-audit-2026.06.12.md` finding **C2b**.

**Phase 1 (done, shipped):** all 47 VS Code extension webview panels render through
the shared `secureWebviewHtml` post-processor (per-render nonce CSP, `'unsafe-inline'`
removed, inline `on*` handlers converted to delegated `data-*` dispatch). See
`extension/src/webview-csp.ts` and commit `d581501`.

**Phase 2 (this doc):** extend the same nonce-CSP backstop to the **browser-served
single-page app** and to the **data-grid webview** that wraps that same HTML inside
VS Code. This was split out because it is materially riskier than phase 1: it touches
the viewer's boot path (CDN fallback + dynamic script loading + inline error handlers)
and a strict nonce CSP breaks all three of those, so it cannot be done by the same
mechanical post-processor pass.

---

## Why this is its own phase — the two obstacles

### Obstacle 1: the served SPA is a dual-consumer artifact

`DriftHtmlContent.build(...)` in `lib/src/server/html_content.dart` produces ONE HTML
document that is consumed two different ways:

1. **Browser** — the developer opens `http://127.0.0.1:8642` directly. The Dart server
   is the only thing that can set a CSP here (a `<meta http-equiv>` in the emitted
   HTML, or a `Content-Security-Policy` response header).
2. **VS Code webview** — `DriftViewerPanel` in `extension/src/panel.ts` fetches that
   same HTML over HTTP (`panel.ts:198 await resp.text()`), rewrites it, and assigns it
   to `this._panel.webview.html`. The webview needs a DIFFERENT CSP (it must allow the
   `baseUrl` origin + CDN fallbacks + the vscode-webview origin) and a DIFFERENT nonce.

A nonce is per-document and per-consumer: a `<script nonce="X">` only runs if the
active CSP names nonce `X`. So the browser path and the webview path need their own
nonces, and `panel.ts` must **replace** the Dart-emitted CSP (not add a second
`<meta>` — multiple CSP metas intersect to the most restrictive, which would silently
break scripts) and **re-stamp** every script tag with the webview's nonce.

### Obstacle 2: the boot path uses exactly what a nonce CSP forbids

`html_content.dart` boots the viewer with three patterns a strict
`script-src 'nonce-…'` policy blocks outright:

1. **Inline `onerror=` handlers** (CSP blocks all inline event handlers, nonce or not):
   - `html_content.dart:83` — the CDN stylesheet fallback:
     `<link … onerror="this.onerror=null;this.href='…@main/…/style.css'">`
     (only emitted when `inlineCss == null`, i.e. package assets unavailable).
   - `html_content.dart:101` — `s.onerror=tryNext` inside the dynamic bundle loader
     (this one is a property assignment in JS, NOT an HTML attribute, so it is
     actually fine under CSP — see note below).
2. **A dynamic `document.createElement('script')` loader** (`html_content.dart:95-105`,
   emitted when `inlineBundleJs == null`): it creates `<script>` elements at runtime
   and appends them. Under a nonce CSP, a dynamically-created script must have its
   `.nonce` property set or it is blocked. (The DOM `script.nonce` property is the
   supported way; the attribute is hidden for security.)
3. **External origins** the policy must allow: `https://fonts.googleapis.com` +
   `https://fonts.gstatic.com` (font CSS + files, `html_content.dart:135-138`), and
   `${ServerConstants.cdnBaseUrl}` (jsDelivr) for the style.css / bundle.js CDN
   fallback.

Note on the normal (published) path: when package assets ARE available, `inlineCss`
and `inlineBundleJs` are non-null, so the CDN `<link onerror>` and the dynamic loader
are **not emitted** — only the inline `<style>`, the inline `<script>` bundle, the
inline l10n script (`:116`), and the inline asset-failed listener (`:159`). That path
is fully testable. The `onerror`/dynamic-loader complexity only exists in the degraded
CDN-fallback mode (package root unreachable), which cannot be covered by the test
suite and needs manual verification.

---

## Current state — exact inventory

### Served SPA — `lib/src/server/html_content.dart`

Scripts and inline handlers in the emitted document:

| Site | What | CSP impact |
| --- | --- | --- |
| `:94` | inline `<script>` bundle (normal path) | needs nonce |
| `:95-105` | dynamic CDN bundle loader (`createElement('script')`, fallback path) | needs nonce + `.nonce` on created scripts + jsDelivr in `script-src` |
| `:116-117` | inline `<script>window.__SDA_L10N=…` | needs nonce |
| `:159` | inline `<script>` asset-failed listener | needs nonce |
| `:83` | `<link … onerror="…">` CSS CDN fallback (fallback path) | inline handler — convert to an attached listener |
| `:135-138` | Google Fonts `<link rel=preconnect/stylesheet>` | needs `style-src`/`font-src` to allow fonts.googleapis.com + fonts.gstatic.com |
| `:140` | favicon `data:` URI | needs `img-src data:` |
| `:148`,`:163-170` | inline `style=` attributes on the loading overlay / banner | `style-src 'unsafe-inline'` (kept, as in phase 1) |

There is currently **no CSP** emitted by the Dart server for this document.

### Data-grid webview — `extension/src/panel.ts`

- `:206-217` — builds and injects its own CSP `<meta>`:
  `default-src 'none'; connect-src ${baseUrl}; style-src 'unsafe-inline' ${baseUrl} cdn fonts; script-src 'unsafe-inline' ${baseUrl} cdn; img-src ${baseUrl} data:; font-src ${baseUrl} data: fonts`.
  This is the `'unsafe-inline'` that phase 2 must remove.
- `:201` — injects `<base href="${baseUrl}/">`.
- `:220-235` — injects three more `<script>` blocks: `EditingBridge.injectedScript()`,
  `FkNavigator.injectedScript()`, `FilterBridge.injectedScript()` (each as
  `<script>…</script>` before `</body>`). All need the webview nonce.
- `:242-244` — `focusTableHashScript(this._focusTable)` injected into `<head>`
  (`panel.ts:290` emits `<script>…</script>`). Needs the webview nonce.
- `:249-258` — the connection-error fallback HTML has an inline
  `onclick="(function(){…vscode.postMessage({command:'retry'})…})()"` on the Retry
  button. Inline handler — convert to a nonced script + `addEventListener`.
- The fetched SPA's own scripts (bundle, l10n, asset-failed) also need the webview
  nonce stamped on them after fetch.

The injected-script sources live in `extension/src/editing/editing-bridge.ts`,
`extension/src/navigation/fk-navigator-script.ts`, and the filter bridge — these were
deliberately excluded from phase 1's placeholdering.

---

## Implementation plan

Order: do the served SPA (browser) first, then the webview wrapper, so each is
independently verifiable.

### Step 1 — Dart server emits a nonce CSP for the browser

1. Generate a per-response nonce in the request handler that calls
   `DriftHtmlContent.build` (a `Random.secure()` base64 string; reuse one nonce per
   response). Thread it into `build(...)` as a parameter.
2. Stamp every inline `<script>` the builder emits with `nonce="$nonce"`
   (`:94`, `:95`, `:116`, `:159`).
3. In the dynamic bundle loader (`:100`), set `s.nonce = ${jsonEncode(nonce)}` (or
   read it from the current script: `document.currentScript.nonce`) on each created
   element so the fallback scripts pass the policy.
4. Convert the CSS `<link onerror>` (`:83`) to a nonced bootstrap: render the link
   without `onerror`, then a small nonced `<script>` that does
   `link.addEventListener('error', …)` to swap the href to the `@main` CDN.
5. Emit the CSP. Prefer a response header (`Content-Security-Policy`) over a `<meta>`
   so it also covers the document before parse; a `<meta>` is acceptable if the header
   path is awkward. Policy:
   ```
   default-src 'none';
   script-src 'nonce-<n>' <cdnBaseUrl>;
   style-src 'unsafe-inline' <cdnBaseUrl> https://fonts.googleapis.com;
   font-src https://fonts.gstatic.com data:;
   img-src data:;
   connect-src 'self';
   ```
   (`connect-src 'self'` so the SPA's `fetch('/api/…')` calls work; add the CDN to
   `script-src`/`style-src` only because the fallback loads from there.)
6. `style-src` keeps `'unsafe-inline'` — same rationale as phase 1 (inline `style=` on
   the loading overlay/banner can't carry a nonce; style injection isn't execution).

### Step 2 — data-grid webview re-stamps for its own consumer

In `extension/src/panel.ts`:

1. Generate a webview nonce (reuse `getNonce()` from `webview-csp.ts`).
2. After `await resp.text()`, **strip** any CSP `<meta>` the served HTML now carries
   (from Step 1) and **re-stamp** every `<script ` in the fetched HTML with the webview
   nonce (the served scripts were stamped with the Dart nonce, which the webview CSP
   won't honor — replace it).
3. Stamp the injected bridge scripts (`:222`,`:228`,`:234`) and
   `focusTableHashScript` with the webview nonce. `focusTableHashScript` should take a
   nonce parameter (or use the `__CSP_NONCE__` placeholder + `secureWebviewHtml`).
4. Replace the `'unsafe-inline'` CSP (`:206-217`) with a nonce policy:
   `script-src 'nonce-<n>' ${baseUrl} ${cdn}` (the webview also needs `${baseUrl}` and
   the CDN in `script-src` because the served bundle may be an external `<script src>`).
5. Convert the connection-error Retry button (`:254`) from inline `onclick` to a nonced
   `<script>` + `addEventListener('click', …)`.
6. Consider routing the whole thing through a `secureWebviewHtml` variant that accepts
   the extra `scriptSrc`/`connectSrc` origins (the options bag already exists).

### Step 3 — tests + manual verification

- Dart: a test asserting `DriftHtmlContent.build` emits the CSP with a nonce, that the
  emitted inline scripts carry that nonce, and that no `script-src 'unsafe-inline'`
  appears. A test that a different `build` call gets a different nonce.
- Extension: extend `panel.test.ts` (which already asserts the injected CSP at
  `:56-92`) to assert the new nonce policy and the absence of `'unsafe-inline'`.
- **Manual (cannot be automated):**
  1. Normal path — run a Flutter app with `DriftDebugServer.start()` (assets inlined),
     open `http://127.0.0.1:8642`, confirm the viewer loads, tables render, the
     toolbar/masthead work, fonts load, and the browser console shows no CSP violations.
  2. Webview path — open the data-grid panel in VS Code, confirm the same.
  3. CDN-fallback path — force `inlineCss`/`inlineBundleJs` to null (or run with the
     package root unavailable) and confirm the CDN fallback still loads the bundle and
     stylesheet, and the asset-failed overlay still appears when the CDN is also
     unreachable. This is the path the test suite cannot cover.

---

## Risks

- **Boot-path regression (high impact):** a wrong CSP silently blocks the bundle and
  the viewer shows only the loading overlay. The browser console names the blocked
  directive, so diagnosis is quick — but the CDN-fallback mode is only reachable by
  simulating an asset 404, so a regression there can ship unnoticed. The manual CDN
  step above is mandatory before this is called done.
- **Dual-nonce mismatch:** if `panel.ts` forgets to re-stamp a served script, that
  script is blocked in the webview only (works in the browser). Easy to miss; the
  webview devtools (`Developer: Open Webview Developer Tools`) show the violation.
- **External origins drift:** if Google Fonts or the jsDelivr base URL changes, the
  allowlist must change with it. Keep the origins sourced from `ServerConstants` where
  possible rather than hardcoding.

## Value vs. cost

Defense-in-depth on a surface whose exploitable sinks are already fixed (C2a) and
which is loopback-only by default (C1). The marginal security gain is real but smaller
than phase 1's (which covered the always-active editor webviews). Worth doing as a
focused pass with the manual verification above; not worth rushing into the boot path
without it.
