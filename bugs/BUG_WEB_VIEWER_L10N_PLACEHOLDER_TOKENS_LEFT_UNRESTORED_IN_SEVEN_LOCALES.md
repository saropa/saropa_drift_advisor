# BUG: 330 translated strings have broken placeholders — 86 carry MT sentinel residue, 232 lost `{0}` entirely, 12 contain hallucinated content — all ten locales affected, and `web.zh-tw.json` is Simplified Chinese

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
restores them afterward. The full parity analysis (2026-09-03, `check_reference_parity.py
--only l10n --no-baseline`) reveals **330 damaged strings across all ten locales** — far
wider than the original 108-string sentinel grep. Three distinct damage classes:

- **86 sentinel-residue strings** (de, es, fr worst): the restore step failed or the MT
  engine mangled the sentinel spelling (`_PH0__`, `__PH0`, `ph0__`, `PH0`, `_ PH2__`,
  `__ PH3__`). Mechanically fixable by regex (see Repair Roadmap).
- **232 placeholder-dropped strings** (it, ko, pt-br worst — zero sentinels, all drops):
  the MT pipeline stripped `{n}` outright rather than masking. The translated text reads
  grammatically but is missing runtime values. Requires human review to re-insert `{n}`
  at the correct grammatical position.
- **12 hallucinated strings** (es and fr only): the MT invented entire clauses not in the
  English source. These require complete re-translation.

Because `vt()` only substitutes a literal `{0}`, none of the damaged values are replaced at
runtime. The user sees the sentinel or a sentence missing the count/name. A German user
reading the schema explorer gets `3 von _PH1__ Tabellen · 412 Zeilen · __ PH3__`.

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

Per-locale damage (from `check_reference_parity.py --only l10n`, 2026-09-03):

```
locale     total bad  sentinel  dropped  hallucinated  MT residue grep
de              28       24        3          1              29
es              29       17        7          5              31
fr              55       35       15          5              37
it              45        0       44          1               0
ja              32        3       29          0               4
ko              30        0       30          0               0
pt-br           45        0       45          0               0
ru              28        2       26          0               2
zh-cn           23        2       21          0               3
zh-tw           35        3       32          0               6
TOTAL          350       86      252         12             112
```

Note: "total bad" includes 20 strings where the locale *added* a `{n}` not in the English
source. The baseline count of 330 excludes these "extra placeholder" cases.

Three damage profiles emerged:
- **de, es, fr**: heavy sentinel residue — the restore step ran partially or not at all
- **it, ko, pt-br**: zero sentinels, all drops — translated through a different (or
  no-masking) pipeline path
- **ja, ru, zh-cn, zh-tw**: mostly drops with 2-3 sentinels each — partial pipeline

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
- [x] Confirmed three locales (it, ko, pt-br) are clean of sentinels — but NOT clean overall.
      Full parity analysis (2026-09-03) found 45/30/45 placeholder-dropped strings respectively.
      These three went through a different (or no-masking) pipeline that stripped `{n}` outright.
- [x] Confirmed there is no `web.en.json`; the English source of truth is `strings-web-*.ts`,
      which is why no existing parity check caught this.
- [x] Confirmed `viewer.nav.tab.closeNamed` is present in all ten catalogs, so key *coverage*
      checks pass — only the *values* are corrupt. Any future gate must validate placeholder
      sets, not key presence.
- [x] Full parity analysis completed (2026-09-03): 330 bad strings, 3 damage classes, 26
      sentinel spelling variants cataloged, 12 hallucinated strings identified, per-locale
      breakdown and repair strategies documented (see Repair Roadmap below).
- [x] Detection gate implemented: `scripts/check_reference_parity.py --only l10n` with
      shrink-only baseline at `scripts/l10n_placeholder_baseline.json` (330 frozen). Passes
      green. New damage fails; repaired entries demand baseline pruning.

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

- **Who is affected:** every user of the viewer in any non-English locale — all 10 shipped
  locales have placeholder damage (it, ko, pt-br were originally thought clean but have
  232 placeholder-dropped strings between them).
- **What is blocked:** nothing functionally; the text is unreadable or misleading where it
  should carry a table name, a count, a size, or a countdown.
- **Data risk:** none.
- **Frequency:** every render of an affected string.

---

## Repair Roadmap

Three phases, ordered by automation level and risk. Each phase shrinks the baseline; run
`python scripts/check_reference_parity.py --only l10n --update-baseline` after each batch
to lock in progress.

### Phase 1 — Sentinel regex replacement (86 strings, mechanical)

The 86 sentinel-residue strings can be fixed by regex. All 26 observed sentinel spellings
are covered by one pattern:

```regex
(?:_{1,3}\s?)?[Pp][Hh]\s?(\d+)(?:\s?_{1,4})?
```

Replacement: `{$1}` (captured digit becomes the placeholder index).

**Affected locales:** de (24), es (17), fr (35), ja (3), ru (2), zh-cn (2), zh-tw (3),
fr (35 — heaviest).

**Edge cases requiring manual review after regex:**
- `_PH1____` (4 trailing underscores) may be a merged `{1}{2}` — verify against EN source.
- `Ph0m` in `'Vor m vor Ph0m.'` — regex must not eat the trailing `m`.
- Bare `PH0` without underscores (e.g. `'Die Gesamt-PH0 über PH1 ist PH3 .'`) — low
  false-positive risk in these locales but verify.
- Some strings have sentinel AND hallucinated text — phase 1 fixes the sentinel, phase 3
  reviews the content.

**Process:** Write a repair script that reads each baseline entry, applies the regex, then
asserts the result carries the same `{n}` set as English. Output a diff for human review
before writing. Do NOT auto-write — the regex may under-replace merged sentinels.

### Phase 2 — Placeholder re-insertion (232 strings, human review)

These strings lost `{n}` entirely — no sentinel trace remains. The translated text is often
grammatically correct but missing runtime values (counts, names, sizes).

**Approach per string:**
1. Read the English source and its `{n}` set.
2. Read the locale translation.
3. Determine where each `{n}` belongs based on the locale's grammar and the English source's
   structure.
4. Insert `{n}` at the correct position.

**Highest-volume locales:** fr (15), it (44), ja (29), ko (30), pt-br (45), zh-tw (32).

**it, ko, pt-br** (120 strings combined) have zero sentinels — these three locales appear to
have been translated through a pipeline that never masked placeholders at all.

### Phase 3 — Hallucinated content (12 strings, complete re-translation)

The MT invented entire clauses not in the English source. The translated text is unreliable
and must be re-translated from scratch, not patched.

**All 12 strings (es and fr only):**

| Locale | Key | Hallucinated clause |
|--------|-----|---------------------|
| de | `viewer.tools.chart.stacked.segment` | (minor restructuring) |
| es | `viewer.session.countdown.expiresInMinSec` | "Se encuentra disponible desde el sitio web de la compañía" |
| es | `viewer.settings.diagram.alt.tableOne` | "En el caso del cuerpo humano, la columna" |
| es | `viewer.settings.diagram.alt.tableMany` | "En el caso del número de columnas, se puede decir que la" |
| es | `viewer.settings.diagram.aria.tableOne` | "y el número de PH2__" (adds "and the number of") |
| es | `viewer.sql.narrate.group.many` | "de los que se encuentran en el grupo" |
| fr | `viewer.tools.chart.stacked.segment` | "le segment de la cellule qui est à l'intérieur du cerveau" |
| fr | `viewer.sql.narrate.found` | "J'ai trouvé le numéro de téléphone" |
| fr | `viewer.settings.diagram.aria.tableOne` | restructured with sentinels used as nouns |
| fr | `viewer.sql.narrate.count.added` | (minor restructuring) |
| fr | `viewer.sql.narrate.duplicate.one` | (minor restructuring) |
| it | `viewer.tools.anomaly.findings` | (minor restructuring) |

**The hallucinations are not random** — the MT model confabulated when the source string was
short and the sentinel tokens confused the context window. The model generated
plausible-sounding filler to reach a "natural" sentence length.

### Phase 4 — zh-tw Simplified→Traditional conversion (separate from placeholder repair)

`web.zh-tw.json` is written in Simplified Chinese (86 of 768 values confirmed). This is
independent of the placeholder damage and should be a separate commit. Options:
- OpenCC (`s2twp` profile) for mechanical conversion, then human review of Taiwan-specific
  terminology.
- Full re-translation from English (more expensive, higher quality).

---

## Fix Requirements

1. **Do not re-run a machine-translation pass to fix this.** The hallucinated clauses (see
   Repair Roadmap Phase 3) prove the MT output needs human review, not another automated
   round-trip.
2. Restore the correct `{n}` placeholders in all 330 strings, preserving each locale's word
   order (the placeholder index matters — `{0} von {1}` is not `{1} von {0}`). Phase 1
   (86 sentinel strings) is regex-assisted; Phase 2 (232 dropped strings) requires human
   review per string.
3. Review and re-translate the 12 strings carrying invented trailing clauses (Phase 3).
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
