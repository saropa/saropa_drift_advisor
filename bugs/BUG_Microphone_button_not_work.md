# BUG: Ask-in-English (NL) panel — mic button dead + panel polish

**Surface:** Web viewer → sidebar → **Ask in English** panel.

## Reported issues

1. **Dictation mic does nothing and shows in Firefox.** The mic button renders
   (with a `hidden` attribute in the markup) but is still visible in Firefox —
   which has no Web Speech API — and clicking it does nothing. No console errors.

2. **Generated SQL is too small** to read comfortably.

3. **The Preview / Use buttons don't follow the app's button standard** —
   "Preview results" rendered as a bare browser-default button.

4. **No Clear button** next to the microphone.

5. **No keywords toggle (user pref, on by default).** Wanted spoken/typed
   command words in the question box, e.g.:
   - "clear" / "start again" (and similar) → empty the box
   - "run again" → re-run the current query
   - "last year" / "what about last year" → re-ask the previous question over a
     new window (detect that the prior query said e.g. "last month" and swap it)

6. **Natural language for multiple windows in one count.** e.g.
   *"how many contacts were added this year and last month"* should produce one
   row with a conditional count per window:

   ```sql
   SELECT
     SUM(CASE WHEN date("created_at",'unixepoch','localtime') >= date('now','start of month','-1 month','localtime') THEN 1 ELSE 0 END) AS contacts_since_last_month,
     SUM(CASE WHEN date("created_at",'unixepoch','localtime') <  date('now','start of month','localtime') THEN 1 ELSE 0 END) AS contacts_before_this_month
   FROM "contacts";
   ```

7. **Natural language for `WITH` / `GROUP BY` time buckets.** e.g.
   *"show me the weekly contacts added"* / *"show me contacts added weekly"*
   should build a recursive calendar CTE, LEFT JOIN the table, and count per
   bucket so empty buckets still report 0:

   ```sql
   WITH RECURSIVE calendar(week_start) AS (
       SELECT date('now', 'weekday 0', '-6 days')
       UNION ALL
       SELECT date(week_start, '-7 days') FROM calendar LIMIT 12
   )
   SELECT c.week_start, COUNT(m.created_at) AS contacts_added
   FROM calendar c
   LEFT JOIN "contacts" m
       ON date(m.created_at, 'unixepoch', 'localtime', 'weekday 0', '-6 days') = c.week_start
   GROUP BY c.week_start
   ORDER BY c.week_start DESC;
   ```

---

## Finish Report (2026-06-18)

All seven items fixed. Web bundle + styles rebuilt; typecheck clean; 218 web
tests + 31 new tests pass; NL-modal Dart contract test passes.

### Root cause of the headline mic bug (item 1)

`.nl-icon-btn { display: inline-flex }` (an author style) overrode the user-agent
`[hidden] { display: none }` rule, so the mic stayed visible regardless of the
`hidden` attribute. On Firefox the reveal/wire JS correctly leaves the button
hidden (no Web Speech API), but CSS showed it anyway → a visible button with no
click handler ("does nothing"). Fix: re-assert `display: none` at class
specificity for the hidden state.

### Changes by item

| # | Item | Fix |
|---|------|-----|
| 1 | Mic visible/dead in Firefox | `.nl-icon-btn[hidden]{display:none}` in `_sql-editor.scss` |
| 2 | SQL preview too small | `.nl-modal-sql-preview`: taller (8rem), `--text-sm`, full `--fg` color |
| 3 | Preview/Use button standard | "Preview results" added to the shared secondary-button selector in `_buttons.scss` |
| 4 | Clear button | `#nl-clear` markup + `clearNlQuestion()` wiring in `nl-modal.ts` |
| 5 | Keywords toggle + commands | `PREF_NL_KEYWORDS` (default on) + settings toggle; `detectNlKeyword`/`applyTemporalSwap` in `nl-to-sql.ts`, consumed by `interpretNlKeyword()` in the mic `onresult` path |
| 6 | Multi-window counts | `multiWindowCount()` → one `SUM(CASE WHEN … THEN 1 ELSE 0 END)` per window |
| 7 | Time-bucket series | `detectTimeBucket()` + `timeBucketSeries()` → recursive calendar CTE + LEFT JOIN + GROUP BY (day/week/month/year) |

### Files touched

- `assets/web/_sql-editor.scss` — hidden-state fix; bigger SQL preview.
- `assets/web/_buttons.scss` — secondary-button styling for the Ask actions.
- `lib/src/server/html_content.dart` — `#nl-clear` button markup.
- `assets/web/nl-modal.ts` — Clear handler; voice-command interpreter + mic hook.
- `assets/web/nl-to-sql.ts` — `detectNlKeyword`, `applyTemporalSwap`,
  `multiWindowCount`, `detectTimeBucket`, `timeBucketSeries`; extracted
  `resolveDateColumn` + `dayExpr` from `temporalWhere` (now takes an optional
  forced column) so window/bucket builders share its column choice.
- `assets/web/settings.ts` — `PREF_NL_KEYWORDS` pref + toggle.
- `assets/web/l10n/strings-web-settings.ts` — `viewer.settings.group.ask` +
  `viewer.settings.ask.keywords` / `.keywordsSub`.
- `assets/web/test/nl-keywords-buckets.test.mjs` — new (31 cases).
- `assets/web/bundle.js`, `assets/web/style.css` — rebuilt artifacts.
- `CHANGELOG.md` — Unreleased entries + Maintenance detail.

### Notes / follow-ups

- Voice commands are interpreted on the **dictation** path (the stated use case).
  Typed command phrases are still parsed as queries; the temporal-swap helper is
  pure and exported, so wiring it onto a typed-submit path later is a small add.
- Bucket windows are fixed-size (day 30, week 12, month 12, year 5). A future
  enhancement could read an explicit count ("last 8 weeks") into the CTE `LIMIT`.
