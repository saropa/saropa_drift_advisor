# BUG: 108 translated strings ship machine-translation placeholder residue (`_PH0__`, `ph0__`, `PH1`) instead of `{0}` — seven locales render literal garbage, and `web.zh-tw.json` is written in Simplified Chinese

**Status: Open**

<!-- Status values: Open → Investigating → Fix Ready → Closed -->

Created: 2026-09-02
Component: Server (web viewer localization, `assets/web/l10n/`)
File: `assets/web/l10n/web.de.json`, `web.es.json`, `web.fr.json`, `web.ja.json`, `web.ru.json`, `web.zh-cn.json`, `web.zh-tw.json`
Severity: UX — High (user-visible text is corrupt in 7 of 10 shipped locales; some strings are also semantically wrong, not merely malformed)

---

## Summary

The viewer's translation catalogs were produced by a machine-translation pass that masks
interpolation placeholders (`{0}`, `{1}`, …) into sentinel tokens before translating, then
restores them afterward. The restore step did not run, or ran partially. 108 strings across
seven locale files still carry the sentinel — in several mutually inconsistent spellings
(`_PH0__`, `__PH0`, `ph0__`, `PH0`, `_ PH2__`, `__ PH3__`) — where a runtime value belongs.

Because `vt()` only substitutes a literal `{0}`, none of these are replaced at runtime. The
user sees the sentinel verbatim. A German user reading the schema explorer gets
`3 von _PH1__ Tabellen · 412 Zeilen · __ PH3__`.

A second, independent defect surfaced in the same sweep: `web.zh-tw.json` (Traditional
Chinese) is written in **Simplified** Chinese — `关闭` / `标签页` rather than `關閉` / `標籤頁`.
It appears to be a copy of `web.zh-cn.json` that was never converted. A full audit
(2026-09-03) counts **86 of 768 values** carrying Simplified-only characters (`复制` not
`複製`, `加载` not `載入`, `类型` not `類型`, `数据` not `資料`, `代码` not `代碼`, etc.).

A third: some affected strings are not just malformed but hallucinated. The MT pass appended
invented clauses that are not in the English source at all — e.g.
`viewer.session.countdown.expiresInMinSec` (es) ends `"Se encuentra disponible desde el sitio
web de la compañía"`, and `viewer.settings.diagram.alt.tableOne` (es) ends `"En el caso del
cuerpo humano, la columna"`. These need review, not just placeholder repair.

---

## Attribution Evidence

Positive — the catalogs live in this repo and are the only source of viewer translations:

```bash
grep -rhc "_PH\|ph0__\|PH0\|PH1\|PH2\|PH3" assets/web/l10n/web.*.json
```

Per-locale counts:

```
web.de.json     28
web.es.json     31
web.fr.json     35
web.ja.json      4
web.ru.json      2
web.zh-cn.json   3
web.zh-tw.json   5
```

Clean: `web.it.json`, `web.ko.json`, `web.pt-br.json` (0 each).

Representative sample:

```
web.de.json:234  "viewer.schema.explorer.summary": "{0} von _PH1__ Tabellen · {2} Zeilen · __ PH3__"
web.de.json:445  "viewer.sql.narrate.sum": "Die Gesamt-PH0 über PH1 ist PH3 ."
web.es.json:80   "viewer.nav.tab.closeNamed": "Cerrar el _PH0__."
web.es.json:45   "viewer.heartbeat.statements.secondsAgo": "Hace PH0 años."
web.fr.json:80   "viewer.nav.tab.closeNamed": "Fermez le ph0__."
```

The English sources are TypeScript, not JSON (`assets/web/l10n/strings-web-*.ts`), so there is
no `web.en.json` to diff against — a parity script must read the `.ts` catalogs.

Simplified-in-Traditional evidence:

```bash
grep -n "closeNamed\|closeOthers" assets/web/l10n/web.zh-tw.json
```

```
80:  "viewer.nav.tab.closeNamed": "关闭 {0}",
81:  "viewer.nav.tab.closeOthers.many": "关闭其他标签页？",
```

`关`, `闭`, `标`, `签`, `页` are all Simplified forms.

Negative attribution — not a sibling package's catalog; no other repo supplies viewer strings:

```bash
grep -rn "viewer.nav.tab.closeNamed" ../saropa_lints/ ../saropa_dart_utils/
# Expected: 0 matches
```

**Emit site(s):** the seven JSON catalogs above. Single consumer: `vt()` in `assets/web/l10n/`.

---

## Environment

- OS: any
- Browser: any
- VS Code version: also reproduces in the extension panel (same catalogs)
- Extension version: 4.2.5
- Connection method: any
- Relevant non-default settings: viewer language set to any of the seven affected locales

---

## Steps to Reproduce

1. Start the viewer.
2. Set the viewer language to German (or Spanish, French, Japanese, Russian, or either Chinese).
3. Open the Schema Explorer, or hover a tab's close button.
4. Read the text.

Reproduces every time; the strings are static.

---

## Expected Behavior

`{0}` is replaced with the runtime value: `3 von 18 Tabellen · 412 Zeilen · 2.1 MB`.
Traditional Chinese renders in Traditional glyphs.

---

## Actual Behavior

The sentinel is rendered verbatim: `3 von _PH1__ Tabellen · 412 Zeilen · __ PH3__`.
The tab close button announces "Cerrar el _PH0__." to Spanish screen-reader users.
Traditional Chinese users read Simplified glyphs.

---

## Error Output

None — this is silent data corruption in content, not code. No console output, no exception,
no build failure. `vt()` cannot distinguish a sentinel from ordinary prose.

---

## Duplicate-Emission Check

One consumer (`vt()`), seven corrupt catalogs. Fixing the catalogs fixes both the browser
viewer and the VS Code panel, which share them.

---

## Minimal Reproducible Example

```bash
grep -rn "_PH\|ph0__" assets/web/l10n/web.es.json | head
```

---

## What I Already Tried

- [x] Swept all ten catalogs for sentinel spellings; counted 108 occurrences in seven files.
- [x] Confirmed three locales (it, ko, pt-br) are clean, so this is not a whole-pipeline failure —
      the restore step succeeded for some languages and not others.
- [x] Confirmed there is no `web.en.json`; the English source of truth is `strings-web-*.ts`,
      which is why no existing parity check caught this.
- [x] Confirmed `viewer.nav.tab.closeNamed` is present in all ten catalogs, so key *coverage*
      checks pass — only the *values* are corrupt. Any future gate must validate placeholder
      sets, not key presence.

---

## Root Cause

The machine-translation pipeline masks `{n}` placeholders to sentinel tokens before
translating and restores them afterward. The restore either did not run for these seven
locales or failed silently on strings where the MT engine altered the sentinel's surrounding
characters (note the inconsistent spellings — the engine mangled the sentinels themselves,
e.g. `_PH0__` → `ph0__` → `PH0`, which a naive exact-match restore would skip).

Nothing downstream validates that a translated string carries the same placeholder set as its
English source, so the corruption shipped.

---

## Changes Made

<!-- Fill in when a fix is written. -->

---

## Commits

<!-- Add commit hashes as fixes land. -->

---

## Impact

- **Who is affected:** every user of the viewer in German, Spanish, French, Japanese, Russian,
  or either Chinese variant — 7 of the 10 shipped locales.
- **What is blocked:** nothing functionally; the text is unreadable or misleading where it
  should carry a table name, a count, a size, or a countdown.
- **Data risk:** none.
- **Frequency:** every render of an affected string.

---

## Fix Requirements

1. **Do not re-run a machine-translation pass to fix this.** The hallucinated clauses (see
   Summary) indicate the MT output needs human review, not another automated round-trip.
2. Restore the correct `{n}` placeholders in all 108 strings, preserving each locale's word
   order (the placeholder index matters — `{0} von {1}` is not `{1} von {0}`).
3. Review the strings carrying invented trailing clauses and cut them back to the English
   source's meaning.
4. Convert `web.zh-tw.json` to Traditional Chinese, or regenerate it from the English source
   rather than from `web.zh-cn.json`.
5. **Add a gate** so this cannot recur: a script that parses the `strings-web-*.ts` English
   catalogs, extracts the `{n}` set per key, and asserts every locale's value carries exactly
   the same set. Wire it alongside the existing parity checks in `scripts/`. This is the
   durable fix — the corruption was invisible precisely because key-coverage checks pass.
   **Done:** `scripts/check_reference_parity.py --only l10n` implements this gate with a
   shrink-only baseline at `scripts/l10n_placeholder_baseline.json` (330 known-bad pairs
   frozen 2026-09-02). New damage fails; repaired entries demand baseline pruning.
6. **Correct the `confirmNavigateSub` wording** (bug 083 follow-up, line 281). The current
   English value (`'Show a browser confirmation dialog when navigating away or closing the
   tab'`) over-promises: the guard only fires when an inline cell edit is unsaved, not on
   every navigation. Proposed replacement:
   `'Prompt to save unsaved cell edits before navigating away or closing the tab'`
   This change must go through a localization pass — editing the English string alone desyncs
   all ten locale catalogs. Do NOT change the string in isolation.
