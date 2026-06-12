# 75 — Localization (l10n) — Saropa Drift Advisor

A plan to localize every user-facing string in this project. Adapted from the
proven Saropa Log Capture localization architecture
(`D:\src\saropa-log-capture\plans\guides\localization.md`), but reshaped for this
project's surfaces — which differ from Log Capture in one decisive way (see §1.1).

> **Hard rule first (carried verbatim from the source design):** the
> machine-translation pipeline (NLLB / Google) is **never** run unattended and
> **never** runs at publish time. An unattended NLLB GPU job once locked a
> developer's machine mid-release. Translation is a deliberate, operator-run step.
> See [Never translate unattended](#7-never-translate-unattended). Adding
> source-language (English) keys and syncing the English baseline is **not**
> translation and is always fine.

---

## 0. Current state (verified, 2026-06-11)

This project has **zero localization infrastructure today**:

- No `.arb`, no `package.nls*.json`, no `l10n/` / `i18n/` / `locales/` directory.
- Every extension command title, setting description, walkthrough step, and
  `viewsWelcome` block in [extension/package.json](../extension/package.json) is
  hardcoded English.
- Every host-built panel (`extension/src/**/*-html.ts`) hardcodes English and
  `<html lang="en">`.
- The standalone web viewer (`assets/web/*.ts` → `bundle.js`) hardcodes English.
- The only `navigator.language` use today is unrelated to UI translation: it sets
  the **speech-recognition dictation** locale in the "Ask in English" modal
  ([assets/web/nl-modal.ts:55](../assets/web/nl-modal.ts#L55), and the same in the
  compiled `bundle.js`). That picks the language the mic transcribes the user's
  voice in — it does not translate any UI.

So a German or Japanese user gets a fully-English interface. This plan introduces
the scaffolding from scratch; nothing here is "verify what exists" — it is all net-new.

---

## 1. Surfaces and the pipeline model

### 1.1 The decisive difference from Saropa Log Capture

Log Capture's runtime UI is a **VS Code webview**, so its runtime pipeline leans on
`vscode.l10n.t()` (a host API the webview reaches via an injected `__VT` map).

**This project's primary runtime UI is a standalone browser app.** The web viewer
in `assets/web/` is served by the Dart debug server and opened with
`driftViewer.openInBrowser`; it also runs inside a VS Code panel via
`driftViewer.openInPanel`, but it is the **same `bundle.js` in both cases**. In a
plain browser there is no `vscode` object and no `vscode.l10n`. Therefore the
runtime pipeline here **cannot depend on `vscode.l10n.t()`** the way the source
design does — it needs a self-contained, browser-native catalog lookup keyed off
`navigator.language` (with the VS Code display language passed in as an override
when the same bundle is hosted in a panel).

This is the one place we deviate from the source spec's mechanism. Everything else
— symbolic keys, a single source-of-truth registry, the Python translation
toolchain, brand shielding, provenance, scopes, audit gates, the notify-don't-gate
UX, and the never-translate-unattended rule — is carried over intact.

### 1.2 The three surfaces, mapped to two systems

| | **System A — Manifest NLS** | **System B — Runtime l10n** |
|---|---|---|
| Renders | Command palette titles, settings, menus, `viewsWelcome`, walkthrough — VS Code **chrome** | (B1) host-built panels `extension/src/**/*-html.ts`; (B2) the standalone web viewer `assets/web/` |
| Selected by | VS Code itself, from the editor display language | B1: `vscode.env.language` (host) → injected map; B2: `navigator.language`, with an optional host-passed override |
| Source of truth | `extension/package.nls.json` (flat `key: value`) | host: `extension/src/l10n/strings-*.ts`; web: `assets/web/l10n/strings-web-*.ts` — symbolic key → English |
| Translated files | `extension/package.nls.<locale>.json` | `l10n/bundle.l10n.<locale>.json` (host) **and** `assets/web/l10n/web.<locale>.json` (browser) |
| Referenced as | `%key%` inside `package.json` | `t('key')` (host/panel HTML), `vt('key')` (browser viewer) |
| Approx. key count (to scaffold) | ~300 (≈190 command titles + ~70 setting descriptions + walkthrough + welcome + view names) | unknown until extraction sweep; large (the viewer is the bulk of the UI) |
| Translation tool | none — hand-edited + a key-sync helper | `scripts/translate_l10n.py` (NLLB → Google), shared by B1 and B2 |
| Guards | `verify-nls` (key parity) + `verify:nls-coverage` (value coverage) + activation notice | publish-time audit + the deliberate translate run |

The locale set matches the rest of the Saropa product family — **10 translated
locales plus the English source**:

```
de  es  fr  it  ja  ko  pt-br  ru  zh-cn  zh-tw      (en = source, always 100%)
```

### 1.3 What is explicitly out of scope

The **Dart package** (`lib/`) is the debug server. It emits JSON API payloads and
developer-facing log lines (Output channel, `dart:developer` logs) — not end-user
chrome. Server-originated text that a user can actually see (e.g. an error surfaced
in a table view) reaches the screen **through the web viewer**, which localizes it
client-side via a key, not by translating the Dart string. So `lib/` gets **no
l10n pipeline**. If a future audit finds a Dart string that genuinely renders to an
end user verbatim, that is a separate, tracked item — not part of this plan.

---

## 2. System A — Manifest NLS (VS Code chrome)

Identical in mechanism to the source design.

### Files
- `extension/package.nls.json` — English source, flat `{ "command.openInBrowser.title": "Open in Browser" }`.
- `extension/package.nls.<locale>.json` — one per locale, **same keys**, translated values.
- `extension/package.json` — every string referenced as `%key%`
  (`"title": "%command.openInBrowser.title%"`).

VS Code reads `package.nls.<displayLanguage>.json` automatically; the extension
never chooses, and there is no language picker. Gating is only over *which* `.json`
files ship.

### Strings to externalize (from the current [package.json](../extension/package.json))
- ~190 `commands[].title` (the `category` "Saropa Drift Advisor" is a brand — see §4, force English in every locale).
- ~70 `configuration.properties.*.description` + the `configuration.title`.
- `views[].name` ("Database", "Pending Changes", "Drift Tools", "Drift Queries").
- `viewsContainers[].title`.
- All `viewsWelcome[].contents` blocks (these embed `command:` links — keep the
  link targets literal; translate only the prose).
- The single `walkthroughs[]` entry: `title`, `description`, and each step's
  `title` / `description` / `media.altText`.
- `taskDefinitions[].properties.check.description`.

### Maintenance & guards (port from source)
1. A **key-sync helper** (analog of Log Capture's `sync-nls-title-keys.js`) that
   copies any missing key from the English base into every locale file — key
   alignment only, never translation.
2. **`verify-nls`** — asserts key parity: every `%key%` in `package.json` exists in
   every `package.nls*.json`, no orphans. Wire into `npm run compile`. **Proves
   keys exist, not that values are translated.**
3. **`verify:nls-coverage`** — measures how many values actually differ from
   English per locale; regenerates a coverage data file and prints a table.
   Report, do not gate on low coverage; `--check` fails only on staleness.

### UX — the honest-coverage notice (port from source)
Because VS Code auto-selects the locale and the manifest chrome will lag the
viewer, show a **one-time, per-display-language** notice when the user's menus are
mostly untranslated (below a ~90% threshold). Silent for English, untracked
locales, and complete locales. The notice names the language + percent and
reassures that the viewer itself is localized. The notice string is itself a
**runtime** string so it appears in the user's language.

> Policy: **notify, do not gate.** Keep shipping every locale file; never remove a
> locale below a threshold. The notice is the entire user-facing mechanism.

---

## 3. System B — Runtime l10n (panels + web viewer)

### 3.1 Source of truth: `strings-*.ts` registries
Host and web are separate build trees (the extension compiles with `tsc`; the web
viewer bundles with esbuild and cannot import `extension/src`), so the registries
live in two locations — host strings under `extension/src/l10n/strings-*.ts`, web
strings under `assets/web/l10n/strings-web-*.ts`. "Single source of truth" is
**per string** (each string declared once, in whichever registry owns its surface),
not one physical file — the same split-by-surface model the source design uses. The
Python extractor globs **both** trees for `strings-*.ts`.

Every runtime string declared once as a `Record<string, string>` mapping a
**symbolic key** → its **English text**:

```ts
export const stringsViewerToolbar: Record<string, string> = {
  'viewer.toolbar.search.label': 'Toggle search',
  'viewer.toolbar.copySql.label': 'Copy SQL',
  'msg.errorCopied': 'Error copied to clipboard',
};
```

Registries globbed as `strings-*.ts` so new splits are auto-discovered. Keep each
file under the 300-line limit; when one grows, extract a cohesive slice into the
next `strings-*-<letter>.ts`. Suggested initial split by surface:

| File(s) | Surface |
|---|---|
| `strings-host.ts` | Extension-host strings: command handlers, `showInformationMessage`/`showErrorMessage`, QuickPick titles, dialogs |
| `strings-panel-*.ts` | Host-built panel HTML — one registry slice per panel family (`dashboard`, `health`, `er-diagram`, `dvr`, `query-builder`, …) under `extension/src/**/*-html.ts` |
| `strings-web-*.ts` | The standalone web viewer (`assets/web/`) — toolbar, table view, tabs, settings, search, NL modal, history sidebar, etc. |

Keys namespaced by surface so collisions are not expected.

### 3.2 Translation storage
Two consumers draw from the **same English source registries** and the **same
translation pipeline**, but the runtime lookups read different generated files:

- **Host / panels (B1):** `l10n/bundle.l10n.json` (English baseline) +
  `l10n/bundle.l10n.<locale>.json`. Because host code can use the VS Code l10n API,
  these are keyed by the **English string value** (`{ "Toggle search": "搜索切换" }`),
  exactly as the source design, and `package.json` declares `"l10n": "./l10n"`.
- **Browser viewer (B2):** `assets/web/l10n/web.<locale>.json`, keyed by the
  **symbolic key** (`{ "viewer.toolbar.search.label": "搜索切换" }`). The browser has
  no English-value-keyed l10n runtime, so symbolic keys are simpler and avoid
  shipping the full English text twice. This file is bundled/served alongside
  `bundle.js`.
- **Provenance sidecars:** `l10n/provenance/<locale>.json` — `{ <english-or-key>: engine }`
  recording which engine produced each translation. Kept out of the bundle glob.

A single translate run writes **both** the host bundle and the web JSON for each
locale from one English source, so the two never drift.

### 3.3 Runtime utilities
- **Host (`extension/src/l10n.ts`):** `t(key, ...args)` resolves the symbolic key to
  its English string from the merged registries, then passes it through
  `vscode.l10n.t()` for translation + `{0}`/`{1}` substitution. Unknown key → the
  key itself (fail-soft). A `getWebviewL10nMap()` resolves only the keys a given
  host-built panel needs, for injection into that panel's client scripts (the
  `__VT` bridge, as in the source design).
- **Browser (`assets/web/l10n.ts`, new):** a tiny self-contained module —
  1. On boot, pick the locale: a host-passed override (when hosted in a VS Code
     panel) first, else `navigator.language` normalized to a catalog key (full tag
     `pt-br` / `zh-cn` first, then primary subtag `de` from `de-at`), else `en`.
  2. `fetch`/import `assets/web/l10n/web.<locale>.json` into an in-memory map.
  3. `t(key, ...args)` / `vt(key, ...args)` — map lookup + positional `{0}`
     substitution, fail-soft to the key. **No `vscode` dependency.** This is the
     concrete replacement for the source design's `vscode.l10n.t()` on the viewer.

So: **host code and panel HTML call `t()`; browser viewer code calls `vt()` (or its
local `t()`).** Adding a viewer string means it must live in a `strings-web-*.ts`
registry, or `vt()` emits the raw key.

### 3.4 Data flow
```
strings-*.ts ─glob─► extract English baseline
  (symbolic              │
   key → English)        ├─ translate_l10n.py ─► l10n/bundle.l10n.<locale>.json   (host, value-keyed)
                         │                       assets/web/l10n/web.<locale>.json (browser, key-keyed)
                         │                       + l10n/provenance/<locale>.json
host:    t('key')  ─► English ─► vscode.l10n.t() ─► reads bundle.l10n.<lang>.json
panel:   t('key') in HTML ─► getWebviewL10nMap() ─► __VT ─► panel client vt('key')
browser: vt('key') ─► web.<locale>.json map ─► substitution
```

---

## 4. The translation toolchain (port from source)

Entry point `scripts/translate_l10n.py` — a thin launcher; pipeline in
`scripts/modules/.../l10n_*.py`. Carry over the full module set: CLI/menu, bundle
audit + English-sync + gap export, translator engine loop, NLLB engine wrapper,
**brand shielding**, **provenance**, audit display, and the run-mode actions.

> NOTE: this project's existing scripts are Python under [scripts/](../scripts)
> (e.g. `publish.py`). Reuse that layout. Use full absolute interpreter + script
> paths whenever handing a run command to the user.

### Audit (`run_audit`)
Source of truth = extract-all-source-strings (globs `strings-*.ts`). Classifies per
locale: **MISSING** (source string absent from baseline — hard fail), **ORPHAN**
(baseline key with no source — pruned on sync), **untranslated** (value == English,
unless brand/acronym/symbol/verified-cognate), **brand-mangled**, **translated**
(further split by engine via provenance).

### Brand shielding
Brand names must appear verbatim in every locale. Before translation, swap brand
tokens for `<B0>`/`<B1>` placeholders, translate, restore, validate; reject + retry
a translation that drops a brand. Categories to seed for this project:
- **Forced English in every locale:** `Saropa`, `Saropa Drift Advisor`, `Drift`,
  `SQLite`, `Dart`, `Flutter`, `Isar`, `Moor`, `VM Service`, `DVR`,
  `Saropa Log Capture`, `.drift-rules.json`, command/category labels that are brand.
- **Acronyms:** `SQL`, `DB`, `PII`, `FK`, `PK`, `ER`, `TTL`, `LLM`, `API`, `URL`,
  `OK`, `ID`, `NL`.
- **Verified-identical (per-locale):** add a cognate **only after** confirming the
  word is genuinely identical in that locale; a wrong entry silences a real gap.

### Quality & provenance
Each translation records its engine in `l10n/provenance/<locale>.json`.
- **High quality** (never re-translated): `nllb`, `manual`, `gemini`,
  `translation_memory`, `identity`.
- **Low quality** (upgrade candidates): `google`, `mymemory`, `libretranslate`,
  `lingva`, `argos`, and `untracked` (a translated key with no provenance record).
  `untracked` = low is what lets an "upgrade low-quality" pass sweep old Google
  output into NLLB later.

### Engines
- **NLLB-200-3.3B (offline)** — used automatically **only when its model is already
  cached** (no 7 GB surprise download); else fall back silently to Google. Announce
  the chosen engine once.
- **Google Translate** (`deep-translator`) — fallback, wrapped in network
  safeguards: socket timeout, throttle, one retry with backoff, and a circuit
  breaker after N consecutive network failures. Write bundles atomically; a CTRL-C
  mid-run saves everything translated so far (resumable — cancellation = pause).

### Scopes
| Scope | Touches | Used by |
|---|---|---|
| `missing` | only keys absent from the baseline | publish pipeline (never re-sends en-copies) |
| `gaps` | absent keys **and** en-copies (value == English) | the deliberate translate run |
| `low_quality` | existing translations whose provenance is weak/untracked | the Google → NLLB upgrade pass |

Existing real translations are never overwritten by a gap fill; a failed
low-quality upgrade keeps the existing value rather than regressing to English.

---

## 5. Workflows

### 5.1 Add a runtime string (panel or web viewer)
1. Add the symbolic key + English text to the right `strings-*.ts`
   (`strings-host.ts` / `strings-panel-*.ts` / `strings-web-*.ts`).
2. Use it: `t('your.key')` in host/panel HTML; `vt('your.key', arg0)` in browser
   viewer code.
3. Run the English-sync step so the baseline + `web.json` gain the new English
   entry (mechanical key alignment, **not** translation).
4. The string ships **in English in every locale** until a deliberate translate
   pass fills it. Acceptable and expected — do **not** run NLLB as part of the
   feature change.
5. Update [CHANGELOG.md](../CHANGELOG.md).

> Adding the source-language key is normal write-time work — never a blocker, never
> a reason to drop UI. Translating it is a separate, scheduled, operator-run step.

### 5.2 Add a manifest string (command title, setting, menu, welcome, walkthrough)
1. Add `%key%` in `extension/package.json` and the English value to
   `package.nls.json`.
2. Add the **same key** to every `package.nls.<locale>.json` (English for now); the
   key-sync helper does this for bulk title keys. `verify-nls` fails the build if a
   locale is missing the key.
3. Run `generate:nls-coverage` to refresh the coverage data.

### 5.3 Audit coverage (read-only, standalone)
Run the manifest l10n audit on its own, outside publish:
```
python scripts/l10n.py            # report + per-locale coverage table (exit 0)
python scripts/l10n.py check      # pre-publish / CI gate: exit 1 when any locale has gaps
```
It writes a JSON report to `reports/<YYYYMMDD>/<ts>_l10n_manifest_audit.json` and
prints a per-locale missing/untranslated/translated summary. It **never translates**.
(The same audit runs as Step 11 of the publish extension leg — §5.5.) A future
runtime audit (`translate_l10n.py --run-mode audit`, Phase 4) covers the host/web
bundles + a quality split; today's entry covers the manifest, which is what ships.

### 5.4 Translate (deliberate, operator-run only)
```
python scripts/translate_l10n.py --run-mode translate --locales de,fr --scope gaps
python scripts/translate_l10n.py --run-mode translate --scope low_quality   # all locales
python scripts/translate_l10n.py --run-mode translate --dry-run             # preview only
```
Manual/external path: fill the empty `translation` field in the exported gaps JSON
and reimport (`--import <file>`), recorded as `manual` provenance.

### 5.5 Publish-time behavior
The extension leg of `scripts/publish.py` runs a **manifest l10n audit** as Step 11
(module `scripts/modules/l10n_audit.py`, before the version/CHANGELOG step). It:
- measures the manifest NLS bundles (`extension/package.nls*.json`) — per locale,
  how many keys are missing vs present-but-untranslated (value == English);
- **always writes a report** to `reports/<YYYYMMDD>/<ts>_l10n_manifest_audit.json`
  (the same date folder as the publish summary) and prints its path;
- **never translates.**

When gaps exist (missing or untranslated keys in a shipped locale), the maintainer
is prompted **[I]gnore / [R]etry / [A]bort** (default **ignore** — English-first
release, and Enter/EOF/CI proceeds rather than hanging):
- **ignore** → ship as-is; untranslated strings appear in English;
- **retry** → re-run the audit after updating `package.nls.<locale>.json` in another
  terminal;
- **abort** → stop the publish to close the gaps first.

With no locale bundles (today's English-only state) there are no gaps, so the step
writes the report and proceeds silently — no prompt. The runtime-l10n baseline sync
(host + `web.json`) is added when that toolchain lands (Phase 4); this step covers
the manifest, which is what ships today.

---

## 6. Coverage & quality gates (summary)

| Gate | System | What it proves | When | Status |
|---|---|---|---|---|
| `verify-nls` | Manifest | key parity (no missing/orphan `%key%`) | `compile`, CI | ✅ |
| `verify:nls-coverage` | Manifest | `nls-coverage-data.ts` is current (staleness only; does NOT gate on low coverage) | `compile`, CI | ✅ |
| publish l10n audit | Manifest | per-locale missing/untranslated counts; ignore/retry/abort on gaps; writes report | publish (ext leg) | ✅ |
| activation notice | Manifest | tells the user once when chrome < ~90% | runtime | ⬜ |
| `translate_l10n.py --run-mode audit` | Runtime | per-locale coverage + quality split | manual / publish | ⬜ |
| publish sync step | Runtime | baselines (host + web) aligned; gaps reported | publish | ⬜ |

**Key-parity and value-coverage are different claims.** `verify-nls` passing does
**not** mean the manifest is translated — `verify:nls-coverage` measures that,
separately. Never report one as if it were the other. Same for the runtime: a
synced baseline is not a translated one.

---

## 7. Never translate unattended

A hard prohibition, not a preference:
- **Never** run NLLB, a Google/`deep-translator` pass, or any
  `--scope`/`--run-mode translate` job without an explicit, in-the-moment
  instruction that names that specific run.
- **The publish pipeline never translates.** Approving a feature, a string, or
  "fix the locales" authorizes code changes only — never a translation run.
- Adding **source-language** (English) keys and running the **English sync** is
  *not* translation and is always fine. Only the MT step is gated.

Reason: an unattended NLLB GPU job locked a developer's machine mid-release and
caused repeated session timeouts. When translation looks necessary, **stop, state
the exact command, and wait.**

---

## 8. Adding a new locale
1. Manifest: add `package.nls.<locale>.json` with all keys (English to start);
   `verify-nls` enforces completeness.
2. Runtime: create `l10n/bundle.l10n.<locale>.json` and
   `assets/web/l10n/web.<locale>.json` (even `{}` — the audit/translator discover
   them from disk), and add the locale → ISO mapping if its code differs from the
   catalog tag (e.g. `pt-br` → `pt`).
3. Run an audit, then a deliberate translate pass for the new locale.
4. Refresh coverage data and update the README locale count.

> Corrections from users go to language@saropa.com (add a **Translations** section
> to the README when the first locale ships).

---

## 9. Implementation phases (greenfield — verifiable gates)

Unlike the source guide (which documents a built system), this is net-new. Land it
in phases, each at a check that must pass before the next:

> **STATUS (2026-06-11).** Phase 1 nearly complete: 231 manifest strings
> externalized to `package.nls.json` + `%key%`; the `verify-nls` parity guard AND
> the `verify:nls-coverage` staleness guard are both wired into `compile` (green);
> and the publish extension leg runs a manifest l10n audit (Step 11) with an
> ignore/retry/abort prompt and a written report (§5.5). NOT yet done in Phase 1:
> only the runtime activation coverage notice (consumes `nls-coverage-data.ts`).
> Phase 2 partially
> landed: the host `t()`/`getWebviewL10nMap()` runtime (`extension/src/l10n.ts` +
> `strings-host.ts`) and the browser `vt()` runtime (`assets/web/l10n.ts` +
> `strings-web.ts`) are stood up, build-verified, and unit-tested for the host side;
> `initWebL10n()` is wired into the web entry. NOT yet done in Phase 2: (a) migrating
> an actual panel + web-viewer call-site as a vertical slice (registries carry only
> ~30 seed keys, so no real string flows through `t()`/`vt()` yet); and (b) the
> **server-injection gap** — `initWebL10n()` *consumes* `window.__SDA_L10N` but
> nothing *produces* it (the Dart server in `lib/` does not emit the inline catalog
> script), so the browser overlay path has never rendered a non-English string
> end-to-end. Phases 3–5 not started. See the Finish Report appended below.
>
> **NEXT (recommended order).** (1) Phase 2 vertical slice — migrate one panel + one
> web module to keys AND wire the Dart `window.__SDA_L10N` injection, proving the
> overlay path end-to-end; (2) Phase 3 sweep; (3) build the **English baselines**
> (`bundle.l10n.json` + `web.json`) — this is the first real "build the bundles"
> step and is mechanical/English-only; (4) Phase 4 toolchain; (5) Phase 5 translate
> run → the translated `.<locale>.json` bundles (gated, never automatic). Building
> any locale bundle before the sweep is premature — the registries hold only seed
> keys, so there is almost nothing to translate. The activation coverage notice
> (Phase 1 tail) can slot in anytime but adds little value until locales exist.

- **Phase 1 — Manifest NLS (System A).** Externalize `package.json` strings to
  `package.nls.json`, rewrite values as `%key%`, add the key-sync helper +
  `verify-nls` + `verify:nls-coverage`, ship empty (English-only) locale files.
  *Gate:* extension activates, all chrome reads correctly, `verify-nls` green.
  *(verify-nls ✅, verify:nls-coverage ✅, publish l10n audit ✅ done; activation notice ⬜ pending.)*
- **Phase 2 — Runtime source-of-truth.** Stand up `extension/src/l10n/` registries
  and the host `t()` / browser `l10n.ts` utilities. Migrate ONE panel and ONE web
  viewer module as a vertical slice. *Gate:* the slice renders via `t()`/`vt()`
  with the English baseline; fail-soft to key verified.
  *(utilities + registries ✅ done; vertical-slice migration ⬜ pending; Dart
  `window.__SDA_L10N` injection ⬜ pending — without it the browser overlay path is
  inert and only the bundled English registry renders.)*
- **Phase 3 — Sweep.** Convert remaining `*-html.ts` panels and `assets/web/*.ts`
  modules to keys. *Gate:* a lint/grep finds no hardcoded user-facing literals in
  converted files; English baseline syncs clean.
- **Phase 4 — Toolchain + gates.** Port `translate_l10n.py` + modules (audit,
  brand shielding, provenance, scopes), wire the publish sync step and the
  activation coverage notice. *Gate:* `--run-mode audit` produces a coverage report;
  publish sync aligns both baselines without translating.
- **Phase 5 — First deliberate translate run.** Operator-run, explicitly
  authorized, for the agreed locale set. *Gate:* audit shows the target locales
  above the chosen coverage floor; provenance recorded.

> Phases 1–4 add only source-language keys + tooling — all routine write-time work,
> no translation. Phase 5 is the only step that runs MT, and only on explicit
> per-run authorization (§7).

---

## 10. Quick reference

| Concept | Lives in |
|---|---|
| Runtime source strings (host) | `extension/src/l10n/strings-*.ts` |
| Runtime source strings (web) | `assets/web/l10n/strings-web-*.ts` |
| Host translations | `l10n/bundle.l10n.<locale>.json` |
| Browser-viewer translations | `assets/web/l10n/web.<locale>.json` |
| Runtime provenance | `l10n/provenance/<locale>.json` |
| Host lookup | `t()` — `extension/src/l10n.ts` |
| Browser lookup | `vt()` / `t()` — `assets/web/l10n.ts` |
| Manifest source | `extension/package.nls.json` |
| Manifest translations | `extension/package.nls.<locale>.json` |
| Standalone manifest audit | `scripts/l10n.py` (`audit` / `check`) → `scripts/modules/l10n_audit.py` |
| Translation toolchain (future) | `scripts/translate_l10n.py` + `scripts/modules/.../l10n_*.py` |
| Publish l10n step | `scripts/publish.py` (extension leg, Step 11) → `scripts/modules/l10n_audit.py` |

---

## Finish Report (2026-06-11)

**Objective.** The project was English-only with no l10n scaffolding. This report covers the framework scaffolding + System A (manifest NLS), which partially land Phases 1–2 of §9.

### Scope
(B) VS Code extension (TypeScript) + the web-viewer assets (`assets/web`, TypeScript bundled by esbuild), plus (C) docs (this plan, CHANGELOG). NOT (A) Flutter/Dart app code — `lib/` was untouched.

### What changed (this task's files)
- **Created** `assets/web/l10n.ts` — browser l10n runtime: `vt()`/`t()` (overlay → bundled English registry → raw key, fail-soft), `normalizeLocale` (handles `pt-br`/`zh-cn`/`zh-tw` + script tags), `detectLocale` (host override → `navigator.language`), `installCatalog`, `initWebL10n` (consumes injected `window.__SDA_L10N`, sync). No `vscode` dependency — the viewer is a standalone browser app.
- **Created** `assets/web/l10n/strings-web.ts` — web English source registry (seed keys).
- **Edited** `assets/web/index.js` — `initWebL10n()` called first, before any module renders.
- **Created** `extension/src/l10n.ts` — host runtime: `t()` (symbolic key → English → `vscode.l10n.t()`), `englishOf()`, `getWebviewL10nMap(prefixes?)` for panel injection.
- **Created** `extension/src/l10n/strings-host.ts` — host English source registry (seed keys).
- **Created** `extension/package.nls.json` — 231 externalized manifest strings (English source).
- **Edited** `extension/package.json` — 231 user-facing strings → `%key%`; brands left literal; added `verify-nls` script + chained it into `compile`.
- **Created** `extension/scripts/verify-nls.mjs` — bidirectional key-parity guard (missing + orphan), discovers per-locale bundles.
- **Edited** `extension/src/test/extension-manifest-validation.test.ts` — resolves `%key%` from `package.nls.json` before scanning `viewsWelcome` for `command:` links (externalization had moved the links into the catalog, which would have made that assertion pass vacuously).
- **Edited** `extension/src/test/vscode-mock.ts` — added a faithful `l10n.t` mock (`{0}` substitution, English verbatim with no bundle) so host l10n code runs under the harness.
- **Created** `extension/src/test/l10n.test.ts` — 6 cases pinning host `t()` resolution, arg substitution, fail-soft, `englishOf`, and `getWebviewL10nMap` prefix filtering.
- **Edited** `CHANGELOG.md` — two Maintenance bullets under `[Unreleased]`.

### Verification (commands run)
- `npm run typecheck:web` → clean.
- `npm run build:js` → `bundle.js` rebuilt (453 kb).
- `cd extension && npm run compile` → `tsc` clean + `verify-nls: OK — 231 keys aligned`.
- `npm run verify-nls` → OK (231 keys, 1 bundle).
- Full extension mocha suite → **2705 passing, 0 failing** (was 2699; +6 new l10n tests).
- Manifest-validation suite (7) + new host-l10n suite (6) → green individually.

### Test audit (Section 4A)
Grepped `extension/src/test` and `test/` for every touched symbol (`l10n`, `package.nls`, `verify-nls`, `initWebL10n`, `getWebviewL10nMap`, `vt(`, command/view titles). Only files reading the manifest `package.json` were candidates: `extension-manifest-validation.test.ts` (fixed — see above) and `drift-tree-provider-actions.test.ts` (reads command **IDs**, not titles, and hardcodes its viewsWelcome ID list — unaffected). All other `.title` matches were unrelated fixtures/properties. The Dart `anomaly_detector_test.dart` matched a generic word only.

### Design notes for the reviewer
- The decisive divergence from the source spec: the runtime UI is a standalone browser app, so the web pipeline uses a self-contained catalog lookup (`assets/web/l10n.ts`), NOT `vscode.l10n`. Host panels still use `vscode.l10n` via `t()`/`getWebviewL10nMap()`.
- Brand strings (`displayName`, activity-bar title, per-command `category`, configuration `title` — all "Saropa Drift Advisor") were deliberately left literal so they never diverge across locales; externalizing them would only add no-op keys.
- The 231-string externalization was performed by a throwaway script in `d:\tmp\extract-nls.mjs` (not committed); the durable record is the edited files.

### Outstanding (not done — tracked in §9 STATUS)
- Phase 1: `verify:nls-coverage` value-coverage script + the activation coverage notice.
- Phase 2: migrate a real panel + web-viewer call-site as a vertical slice (registries hold only seed keys; no rendered string flows through `t()`/`vt()` yet).
- Phases 3–5: the string sweep, the Python translation toolchain, and any translate run.
- No `package.nls.<locale>.json` / web overlay files yet — added only on a deliberate, authorized translate pass.

Plan stays ACTIVE in `plans/` — only 2 of 5 phases are partially done; the remaining phases are the documented bulk, so neither archival (case 1) nor split (case 2) applies. Status annotated in §9.

---

## Finish Report (2026-06-11) — verify:nls-coverage + publish l10n audit

**Objective.** Add (1) `verify:nls-coverage` — the value-coverage measure + its generated data file — and (2) a publish-time l10n audit for maintainers with an `[i]gnore / [r]etry / [a]bort` prompt, clear prompt text, and a pointer to the audit report. Continues plan 75 System A (§2/§5.5/§6).

### Scope
(B) VS Code extension (`extension/scripts/nls-coverage.mjs`, generated `extension/src/l10n/nls-coverage-data.ts`, `extension/package.json` scripts) + (C) publish scripts (`scripts/modules/l10n_audit.py`, `scripts/modules/pipeline.py`, `scripts/tests/test_l10n_audit.py`) + docs (this plan, CHANGELOG). NOT (A) Flutter/Dart.

### What changed
- **Created** `extension/scripts/nls-coverage.mjs` — measures per-locale how many manifest values differ from English; default mode regenerates the snapshot + prints a table; `--check` fails ONLY on staleness (never on low coverage) with line-ending-normalized comparison.
- **Created (generated)** `extension/src/l10n/nls-coverage-data.ts` — `NLS_TOTAL_KEYS = 231`, `NLS_COVERAGE = {}` (English-only today); deterministic, no timestamp (so `--check` is stable).
- **Edited** `extension/package.json` — added `generate:nls-coverage` / `verify:nls-coverage` scripts; chained `verify:nls-coverage` into `compile`.
- **Created** `scripts/modules/l10n_audit.py` — `audit_manifest_nls()` (missing/untranslated/translated/pct per locale), `write_audit_report()` (writes `reports/<YYYYMMDD>/<ts>_l10n_manifest_audit.json`, carries the floor-not-a-guarantee note), `step_l10n_audit()` (writes report, prompts `[I]gnore/[R]etry/[A]bort` default ignore on gaps, returns proceed/abort).
- **Edited** `scripts/modules/pipeline.py` — wired the audit as Step 11 of the extension leg; bumped Version/CHANGELOG to Step 12.
- **Created** `scripts/tests/test_l10n_audit.py` — 5 unittest cases (no-locale, partial gap math + pct, fully-translated, base-not-a-locale regex guard, report writer).
- **Edited** `CHANGELOG.md` (Maintenance bullet) and this plan (§5.5, §6 gate table, §9 STATUS).

### Verification (commands run)
- `cd extension && node scripts/nls-coverage.mjs --check` → OK (current). Confirmed it FAILS (exit 1) when a synthetic `package.nls.de.json` is added without regenerating, then OK again after cleanup.
- Extension `compile` chain (`tsc && verify-nls && verify:nls-coverage`) → green; the pre-commit hook re-ran it on commit (`Compiled output verified`).
- `python -m unittest discover -s scripts/tests` → **37 passing** (incl. the 5 new). Gap math confirmed on a synthetic `de` (2 translated / 228 missing / 1 untranslated → `has_gaps`).

### Test audit (Section 4A)
Grepped `extension/src/test` and `scripts/tests` for every changed symbol (`nls-coverage`, `NLS_COVERAGE`, `NLS_TOTAL_KEYS`, `l10n_audit`, `audit_manifest`, `Step 11/12`, `verify:nls-coverage`) — no existing test referenced them, so nothing broke. The committed `nls-coverage-data.ts` has its own regression guard: `verify:nls-coverage --check` in the compile chain.

### Notes for the reviewer
- The coverage measure exists in JS (the dev/CI gate + the generated TS snapshot the future activation notice reads) and the audit reimplements the same simple value-differs-English count in Python (the publish report). The duplication is deliberate: separate consumers, separate languages, no shared runtime, and a subprocess+stdout-parse bridge would be more brittle than a 10-line re-read. Both name the same limitation (a legitimate cognate identical to English reads as untranslated → the percent is a floor).
- Default `ignore` (not the plan's original `retry`) so Enter/EOF/CI proceeds rather than hanging, and because English-for-untranslated is the expected English-first outcome. Plan §5.5 updated to match.

### Outstanding (unchanged from the framework/System-A report above)
- Phase 1: only the runtime activation coverage notice remains (consumes `nls-coverage-data.ts`).
- Phases 2–5: vertical-slice migration, the string sweep, the Python translation toolchain, and any translate run.
- This task added the audit MECHANISM; with no locale bundles there are no gaps yet, so the maintainer prompt is dormant until locale files exist.

Commit `1245a5f` carries the code; this finish commit adds `scripts/tests/test_l10n_audit.py` and this appended report. Plan stays ACTIVE (System A all but the activation notice done; Phases 2–5 pending).

---

## Finish Report (2026-06-11) — standalone scripts/l10n.py entry point + plan ordering

**Objective.** Provide a standalone way to run the localization audit step, modeled on Saropa Log Capture's `& python …\scripts\translate_l10n.py`, runnable separately from publish. This report covers the standalone entry point (commit `52ca442`), the plan-ordering/injection-gap update (commit `10b1f16`), and the `main()` exit-code tests.

### Scope
(C) scripts/docs only — `scripts/l10n.py` (new launcher), `scripts/modules/l10n_audit.py` (added `main()` + `ok`/`heading` imports), `scripts/tests/test_l10n_audit.py` (added `main()` tests), `plans/75-localization.md`, `CHANGELOG.md`. NOT (A) Flutter/Dart, NOT (B) extension TypeScript.

### What changed
- **Created** `scripts/l10n.py` — thin top-level launcher (puts `scripts/` on `sys.path`, calls `modules.l10n_audit.main`). Usage: `python scripts/l10n.py` (audit: report + table, exit 0), `python scripts/l10n.py check` (exit 1 on gaps). Docstring states plainly it audits and NEVER translates.
- **Edited** `scripts/modules/l10n_audit.py` — added `main(argv)` (argparse `audit`/`check` modes; reuses `audit_manifest_nls` + `write_audit_report` + `_print_summary`; no ignore/retry/abort prompt standalone since there is nothing to gate); added `ok`/`heading` to the display import.
- **Edited** `scripts/tests/test_l10n_audit.py` — added `TestMainCli` (4 cases: audit→0 no-locale, check→0 complete, check→1 on gaps, audit→0 even with gaps), patching `EXTENSION_DIR` + `REPO_ROOT` to a temp dir.
- **Edited** `plans/75-localization.md` — §5.3 now documents the real `scripts/l10n.py` command; §10 lists it; §9 STATUS records (a) the server-injection gap (`initWebL10n()` consumes `window.__SDA_L10N` but nothing in `lib/` produces it, so the browser overlay path is inert) and (b) the NEXT ordering: vertical slice → sweep → English baselines (the first real "build the bundles") → toolchain → gated translate run.
- **Edited** `CHANGELOG.md` — Maintenance bullet for the standalone entry.

### Verification (commands run)
- `python scripts/l10n.py` → exit 0, "English-only — nothing to translate", report written.
- `python scripts/l10n.py check` (clean) → exit 0; with a synthetic incomplete `package.nls.de.json` → exit 1 printing the gap; cleaned up after.
- `python -m unittest scripts.tests.test_l10n_audit` → 9 passing (5 prior + 4 new `main()` cases).
- `python -m unittest discover -s scripts/tests` → **41 passing**.

### Test audit (Section 4A)
Grepped the test tree for the changed symbols (`l10n.py`, `main`, `l10n_audit`). Only `test_l10n_audit.py` references them; `audit_manifest_nls`/`write_audit_report` were unchanged, so the 5 existing cases stayed valid (re-run green). Added `main()` coverage rather than leave the new exit-code contract untested.

### Notes for the reviewer
- Named the entry `l10n.py`, NOT `translate_l10n.py` — it audits and must not be mistaken for the (future, gated) translate pipeline, which reserves the `translate_l10n.py` name (§4/§10).
- Standalone deliberately has no ignore/retry/abort prompt: that prompt exists to gate a publish (`step_l10n_audit`); run on its own there is nothing to abort, so `main()` just reports and (in `check`) sets an exit code.

### Outstanding (unchanged)
- Phase 1 tail: the runtime activation coverage notice.
- Phases 2–5: the vertical slice (incl. the Dart `window.__SDA_L10N` injection), the sweep, the English baselines, the translation toolchain, and any gated translate run.

`Finish report appended: plans/75-localization.md`. Plan stays ACTIVE — this task closed a sub-feature (standalone entry) and a docs update; the plan as a whole still has Phases 2–5 and the activation notice open (case 3: closed partial scope, plan still active, so no archive/split).
