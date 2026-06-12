# Feature 79: "Hey Saropa" Wake Phrase + Narrative Answer

**Status: SPEC.** Net-new feature layered on the **already-shipped** heuristic
converter ([nl-to-sql.ts](../assets/web/nl-to-sql.ts)) and Ask panel
([nl-modal.ts](../assets/web/nl-modal.ts)) — no wake-phrase code exists yet; the
plumbing it hooks into (live preview, `/api/sql`, `NlResult`) does.

Lets a user prefix a question with a conversational wake phrase — "hey saropa,
how many contacts were added last week" — and get a **narrative, chat-style
answer** in the Ask panel's output area: *"Your database added 45 contacts last
week."* The wake phrase is **stripped before SQL interpretation** (it never
affects table/column resolution) and is otherwise **noted and ignored**; its
only effect is to switch the output presentation from a raw result table to a
spoken-style sentence.

Extends the heuristic converter ([assets/web/nl-to-sql.ts](../assets/web/nl-to-sql.ts))
and the Ask panel ([assets/web/nl-modal.ts](../assets/web/nl-modal.ts)). No LLM,
no network beyond the existing `/api/sql` preview call.

---

## 1. Motivation & exact behavior

Two requirements from the request:

1. **The wake phrase must not block the flow.** It is detected, stripped, and
   ignored for the purpose of building SQL. "hey saropa, show contacts" must
   produce the same SQL as "show contacts" — the phrase cannot leak into table
   resolution (today an un-stripped "saropa" could even match a column/table
   name) or value matching.
2. **If the question is answerable, reply narratively in the output window.**
   When the wake phrase is present, the panel renders a sentence, e.g.:
   - "hey saropa, how many contacts were added last week"
     → **"Your database added 45 contacts last week."**

The wake phrase is the *opt-in* to narration. The same question without it keeps
today's behavior (SQL + result-table preview). Narration is **added alongside**
the existing preview table, not a replacement (the table still renders below the
sentence) — consistent with "add, don't downsize."

### Non-goals

- No LLM / no generative phrasing. Narration is deterministic template fill.
- No voice *output* (TTS). This is text in the output area. (Dictation *input*
  already exists via the mic button; a "speak the answer" follow-up is out of
  scope.)
- The wake phrase does not trigger any action other than narration — no
  commands, no navigation.

---

## 2. Catching the wake phrase (broad, pronunciation-tolerant)

The phrase arrives by typing *or* by speech-to-text (the mic), so spellings and
mis-hearings vary widely. A single exported, unit-tested helper owns the match:

```ts
/**
 * Strips a leading conversational wake phrase ("hey saropa", and a wide net of
 * spellings / speech-to-text mishearings) from the question. Returns the
 * cleaned question and whether a wake phrase was present. The phrase is matched
 * ONLY at the start (optionally after filler like "ok"/"hey"/"please") and a
 * trailing comma/space, so it can't strip a real "saropa" appearing mid-question
 * as a value. Pure + exported so the catch-list is tested directly.
 */
export function stripWakePhrase(question: string): { question: string; wake: boolean }
```

Match shape (anchored at string start, case-insensitive):

```
^\s*
(?:ok(?:ay)?|hey|hi|hello|yo|hey there|um|uh|please)?[\s,]*   // optional greeting
(?:
  hey|hi|hello|ok(?:ay)?|yo                                    // greeting glued to name
)?[\s,]*
<NAME>                                                          // the name net (below)
[\s,.:!-]*                                                      // trailing punctuation/space
```

`<NAME>` net — Saropa plus common STT/typo variants (extend freely; this is the
"catch many" list):

```
sa?ropa | saropa | seropa | siropa | soropa | saroper | sarropa | saropah |
sarope | saroppa | zaropa | saraopa | sara opa | sa ropa | sar opa |
"sara pa" | "say ropa" | "sa rope a" | sarppa | sropa
```

Rules that keep it safe:

- **Start-anchored only.** "find the saropa account" is NOT stripped — "saropa"
  there is a value, not a wake word. (If real schemas legitimately contain the
  token "saropa" as data even at the start, the trailing-separator requirement —
  the phrase must be followed by a comma or by more words forming a question —
  still distinguishes "saropa, how many…" from "saropa accounts".)
- **Greeting alone does not count.** "hey, how many contacts" (no name) → not a
  wake phrase; narration off. The *name* is the trigger.
- The stripped remainder is what every downstream function
  (`resolveTable`, `temporalWhere`, `valueWhere`, …) sees.

The catch-list lives in one place so adding a newly-observed mishearing is a
one-line edit with a matching test case.

---

## 3. Wiring into the converter

`nlToSql` runs `stripWakePhrase` **first**, before lowercasing/trimming for
interpretation, and records the flag on the result:

```ts
export function nlToSql(question, meta, opts?) {
  const stripped = stripWakePhrase(question);
  const q = stripped.question.toLowerCase().trim();
  // ... existing pipeline runs on the cleaned text ...
  return { sql, table, confidence, candidates, wake: stripped.wake, answerKind };
}
```

`NlResult` ([nl-to-sql.ts:40](../assets/web/nl-to-sql.ts)) grows two fields:

- `wake?: boolean` — was a wake phrase present.
- `answerKind?: 'count' | 'sum' | 'avg' | 'max' | 'min' | 'distinct' | 'rows' | 'group' | 'duplicate' | 'latest' | 'oldest'`
  — which branch built the SQL. The big `if/else` in `nlToSql`
  ([nl-to-sql.ts:892](../assets/web/nl-to-sql.ts)) already knows this; it just
  needs to *record* the branch it took. This lets the narrator format the
  sentence **without re-parsing SQL**.

Stripping happens unconditionally (so the wake phrase never pollutes SQL even
when narration is off); `wake` only gates the *presentation*.

---

## 4. Narrating the answer

A new renderer in [nl-modal.ts](../assets/web/nl-modal.ts), called from the
preview path ([previewNlResults / live preview]). When `result.wake` is true and
the query produced a usable answer, it renders a sentence **above** the existing
result table (`#nl-modal-results`).

### 4.1 Scalar answers (precise sentence)

`answerKind` ∈ {count, sum, avg, max, min} → the result is a single cell. Read it
from the `/api/sql` rows (the one row, first column) and fill a template:

| answerKind | Template | Example |
|---|---|---|
| count | `Your database {verb} {N} {table}{qualifier}.` | "Your database added 45 contacts last week." |
| sum | `The total {col} across {table}{qualifier} is {N}.` | "The total balance across accounts is 12,400." |
| avg | `The average {col} {forTable}{qualifier} is {N}.` | "The average age for contacts is 41." |
| max | `The highest {col} {forTable}{qualifier} is {N}.` | "The highest balance for accounts is 9,800." |
| min | `The lowest {col} {forTable}{qualifier} is {N}.` | "The lowest balance for accounts is 0." |

Template parts, all derived from data the converter already has (no new parsing):

- **`{N}`** — the scalar cell, locale-grouped (`Intl.NumberFormat`).
- **`{table}`** — `result.table`, pluralized as-is (table names are already
  plural in this schema).
- **`{verb}`** (count only) — from the temporal verb family the converter
  detected: born-family → "added", edit-family → "changed", none → "has". This
  needs `temporalWhere` (or `nlToSql`) to expose which family fired; surface it
  as part of `answerKind`'s metadata (e.g. `answerVerb?: 'added'|'changed'|'has'`)
  rather than re-deriving in the UI.
- **`{qualifier}`** — the user's own temporal phrase, echoed verbatim ("last
  week", "today", "in 2025"). Robust: echo the matched substring rather than
  re-synthesizing English from the SQL window. Empty when no temporal phrase.
- **`{col}`** — the aggregated column's display name (underscores → spaces).

> Exact wording is best-effort; the **templates above are the spec**. Getting
> "added … last week" verbatim depends on (a) the born-verb→"added" mapping and
> (b) echoing the raw temporal phrase — both available without an LLM. If a part
> is missing (no verb, no qualifier), the sentence degrades gracefully ("Your
> database has 45 contacts.").

### 4.2 Row / group answers (summary sentence)

`answerKind` ∈ {rows, latest, oldest, distinct, duplicate, group} → not a single
scalar. Narrate a count summary instead of inventing prose:

- rows/latest/oldest: `Found {N} {table}{qualifier}.` where `{N}` is the
  returned row count (the preview already caps at 10; for an accurate total,
  either say "showing the first {N}" or issue the COUNT form — see Open decision
  3).
- group: `{table} broken down by {col} — {K} groups (largest: {topValue}, {topN}).`
- distinct/duplicate: `Found {N} distinct {col} values.` / `Found {N} {col}
  values that repeat.`

### 4.3 Not answerable

- Wake phrase present but the remainder is empty or yields no SQL →
  *"I heard you, but I didn't catch a question — try 'how many contacts were
  added last week?'"* (No SQL run.)
- `/api/sql` errors → fall back to the existing error line; no narrative.

### 4.4 Presentation

- The sentence renders in a distinct **chat-reply bubble** at the top of
  `#nl-modal-results` (a `.nl-narrative` block — styled in
  [_sql-editor.scss](../assets/web/_sql-editor.scss)), with the result table
  beneath it unchanged.
- Per the UX rules: the answer **names the entity and the value** (the count, the
  table, the qualifier) — never a bare "45". Second/third person only ("Your
  database…"), never first person.

---

## 5. Files touched

- **[nl-to-sql.ts](../assets/web/nl-to-sql.ts)** — `stripWakePhrase` (exported),
  call it first in `nlToSql`, add `wake` + `answerKind` (+ `answerVerb`) to
  `NlResult`, record the branch/verb taken.
- **[nl-modal.ts](../assets/web/nl-modal.ts)** — a `narrateResult(result, rows)`
  renderer invoked from the preview path; render the `.nl-narrative` bubble above
  `#nl-modal-results`; the not-answerable + error fallbacks.
- **[_sql-editor.scss](../assets/web/_sql-editor.scss)** — `.nl-narrative` bubble
  styling (reuse existing tokens; no new design-system primitives).
- **bundle** — rebuilt via esbuild (existing `npm run build:web`).
- Strings are developer-tool UI copy in the web viewer (not the ARB pipeline);
  keep them in the TS module as the viewer's other strings already are.

No Dart changes — this is entirely web-side.

---

## 6. Test plan

- **`stripWakePhrase` unit table** (the core of the feature):
  - every spelling in the §2 net at string start → `wake:true`, name removed,
    remainder intact;
  - greeting-only ("hey, how many…") → `wake:false`;
  - mid-question "saropa" ("find the saropa account") → **not** stripped,
    `wake:false`;
  - "hey saropa, " + a known question → cleaned text equals the same question
    without the prefix (so the generated SQL is byte-identical to the no-wake
    case — assert that equality directly).
- **`nlToSql` answerKind/verb** — each branch sets the right `answerKind`; count
  with a born-verb sets `answerVerb:'added'`, edit-verb → `'changed'`.
- **Narration unit** (pure formatter, given `result` + canned rows): scalar
  templates fill correctly; locale grouping; row/group summaries; empty-question
  and error fallbacks. Format the formatter as a pure function so it's testable
  without the DOM.
- **No-regression** — a non-wake question's SQL and preview are unchanged
  (the existing nl-to-sql suite already covers the SQL; add an explicit
  "wake-stripped == plain" case).
- **Changelog** updated at implementation time.

---

## 7. Phasing & gates

- **Phase 1 — strip + flag.** `stripWakePhrase` + `wake`/`answerKind` on
  `NlResult`; wake phrase no longer affects SQL. Gate: strip table green;
  wake-stripped SQL byte-identical to plain.
- **Phase 2 — scalar narration.** `narrateResult` for count/sum/avg/max/min in
  the panel. Gate: the request's worked example renders "Your database added
  {N} contacts last week."
- **Phase 3 — row/group summaries + fallbacks.** Gate: non-scalar answers narrate
  a sensible summary; empty/error cases handled.

---

## 8. Decisions (resolved 2026-06-11)

1. **Name required to trigger narration.** The *name* is the trigger; a bare
   greeting ("hey, show me…") stays on the normal path. Avoids false narration.
2. **Verb comes from the converter (`answerVerb`).** The detected temporal verb
   family is surfaced on `NlResult` rather than re-derived in the UI, so the
   sentence and the SQL agree on which timestamp was meant.
3. **Row answers narrate an exact count.** When `wake` and `answerKind:'rows'`,
   issue the `COUNT(*)` form for the narration number (one extra cheap query) and
   still show the 10-row sample below — never the undercounted preview length.
4. **Echo the user's raw temporal phrase.** Use the matched substring ("last
   week") for the qualifier; do not reconstruct English from the SQL window
   expression.
5. **Name net — start with the §2 list, extend on observed mishearings.** The
   single-helper design makes each addition a one-line + one-test change.

---

## Finish Report (2026-06-11)

**Status: IMPLEMENTED — all three phases shipped.** Web-only feature; no Dart
changes.

### Scope
(B-adjacent) Web viewer assets only — TypeScript (`assets/web/`) + SCSS + the
generated bundle/CSS + CHANGELOG + a new web test. No Flutter/Dart app code, no
VS Code extension code.

### What landed
- **[nl-to-sql.ts](../../assets/web/nl-to-sql.ts)**
  - `stripWakePhrase(question)` — exported, start-anchored regex (`WAKE_RE` +
    `WAKE_NAME` net). The NAME is the trigger; a bare greeting never fires; a
    trailing separator-or-end stops `saropaccounts` from matching. Runs first in
    `nlToSql`, so the phrase never reaches table/column/value matching.
  - `NlResult` gained `wake`, `answerKind` (new `AnswerKind` union), `answerVerb`
    (`added`/`changed`/`has`), `qualifier` (echoed temporal phrase), `aggColumn`.
  - Verb families hoisted to module scope (`BORN_VERB` / `EDIT_VERB`) — single
    source of truth for both `temporalWhere`'s column choice AND the narrated
    verb (a mismatch would say "added" while filtering the modified column).
  - `temporalWhere` now returns `{ sql, phrase }`; `phrase` is the matched user
    text (`m[0]`) echoed back as the qualifier.
  - `nlToSql` records `answerKind`/`aggColumn` in each dispatch branch; returns
    the narration metadata. Wake-with-empty-remainder returns `sql:null,
    wake:true` (not an error).
  - `narrateAnswer(r, value, totalCount)` — pure, exported sentence formatter
    (scalar templates + row/group summaries; `toLocaleString` grouping; verb
    falls back to "has" without a time window; second/third person only).
- **[nl-modal.ts](../../assets/web/nl-modal.ts)** — on a wake question the panel
  auto-runs the query and prepends a `.nl-narrative` bubble: **sentence →
  divider → full SQL** (per the user's request to always show the derived SQL).
  Scalar kinds read the single returned cell; non-scalar kinds run one extra
  `COUNT(*)` with the trailing `LIMIT` stripped (`nlExactCount`) so the total is
  exact, not the 10-row preview cap. Wake-with-no-question → friendly nudge;
  query error → existing error line, no bubble.
- **[_sql-editor.scss](../../assets/web/_sql-editor.scss)** — `.nl-narrative`
  bubble (accent left border, sentence, divider, wrapped-mono SQL).
- Rebuilt `bundle.js` + `style.css`; CHANGELOG entry under Unreleased → Added.

### Tests
- **New: [assets/web/test/nl-wake.test.mjs](../../assets/web/test/nl-wake.test.mjs)** —
  catch-net table (27 spellings), over-strip guards, "wake-stripped SQL is
  byte-identical to plain" (4 pairs), `answerKind`/`answerVerb`/`qualifier`/
  `aggColumn`, `narrateAnswer` templates, and 3 end-to-end cases against real
  `node:sqlite` proving the `LIMIT`-strip → `COUNT(*)` → narrate path returns the
  true total.
- **Audit of existing tests:** changed `temporalWhere` (not exported, untested
  directly) and hoisted the verb regexes (behavior identical). `nlToSql` /
  `isDateColumn` signatures unchanged. Full suite confirms no regression.
- **Result:** `npm run test:web` → **172/172 pass**; `npm run typecheck:web`
  clean. (Whole-tree validation: `dart analyze` clean, `dart test` → 597 pass.)

### Notes / out of scope
- The pure `narrateAnswer` formatter lives in `nl-to-sql.ts` (not `nl-modal.ts`
  as the original §5 suggested) so it's testable in the existing esbuild harness
  with no DOM. Deliberate refinement of the plan.
- The in-dialog "What can I ask?" help sheet does NOT yet list the wake phrase —
  a discoverability follow-up, not built (would touch `html_content.dart`).

Finish report appended: plans/79-hey-saropa-wake-phrase.md (archived to
plans/history/2026.06/2026.06.11/ in the same commit).
