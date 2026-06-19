# Run SQL Screen — Issues & Enhancements

**Status: Fixed** — all 11 items implemented (see Finish Report below).

A mix of bugs and enhancements for the **Run SQL** screen (and, where noted, every screen that displays SQL such as **Schema**).

---

## 1. Run button shows label text instead of the icon

The Run button currently renders the literal text `play_arrow Run` rather than the play-arrow icon followed by the "Run" label. The icon glyph is not being resolved.

- **Expected:** ▶ icon + "Run" label.
- **Actual:** `play_arrow Run` (raw icon name shown as text).

---

## 2. Auto-format SQL on every screen that shows SQL

Automatically format SQL for readability using [`sql-formatter`](https://www.npmjs.com/package/sql-formatter).

- Apply everywhere SQL is displayed, not just the Run SQL screen — e.g. the **Schema** screen.

---

## 3. Put each section in a collapsible panel

The estimated-cost section and all other sections on the screen should be collapsible.

---

## 4. Disable pagination controls when there is only one page

If **Prev** / **Next** are pagination controls, disable them when the result set is a single page.

---

## 5. Result table styling is poor

The result tables are badly formatted — the rounded corners and the footer do not follow a clean table style. Restyle to a consistent, polished table treatment.

---

## 6. Copy / export buttons for the result table

Add a copy control on the result table that can copy the data as:

- Markdown
- CSV
- JSON

---

## 7. Toggle for natural-language axis labels on the chart

Add a toggle on the chart (**on by default**) that converts raw column names into human-readable axis labels.

- Example: `contacts_added` → "Contacts Added".

---

## 8. Y-axis must be labeled correctly

Ensure the Y-axis carries its own correct label (e.g. "Week") instead of duplicating the X-axis label.

**Reference query** (produces `week_start`, `contacts_added`):

```sql
WITH RECURSIVE calendar(week_start) AS (
    -- 1. Start with the Monday of the current week
    SELECT date('now', 'weekday 0', '-6 days')
    UNION ALL
    -- 2. Step backward 7 days at a time
    SELECT date(week_start, '-7 days')
    FROM calendar
    -- 3. Stop after generating 12 weeks (covering the April data)
    LIMIT 12
)
SELECT
    c.week_start,
    COUNT(m.created_at) AS contacts_added
FROM calendar c
LEFT JOIN "contacts" m
    ON date(m.created_at, 'unixepoch', 'localtime', 'weekday 0', '-6 days') = c.week_start
GROUP BY c.week_start
ORDER BY c.week_start DESC;
```

---

## 9. Improve fuzzy matching in natural-language processing

The NL-to-SQL processing should tolerate misspellings.

- **Input** (note the misspelled "activites"):

  ```
  how many activites were done this year and last month created this week
  ```

- **Currently maps to** (wrong table, ignores the intent):

  ```sql
  SELECT COUNT(*) FROM "country_states"
  ```

- **Expected:** recognize "activites" → "activities" and generate a query against the `activities` table.

---

## 10. Generate richer time-series queries from natural language

Natural-language requests that imply a series should generate a calendar-based series query.

- **Input:**

  ```
  how many activities were done this month by day
  ```

- **Expected output** (one row per day of the current month):

  ```sql
  WITH RECURSIVE calendar(day) AS (
      -- 1. Start at the first day of the current month
      SELECT date('now', 'start of month', 'localtime')
      UNION ALL
      -- 2. Add 1 day at a time
      SELECT date(day, '+1 day')
      FROM calendar
      -- 3. Stop when we hit today's date
      WHERE day < date('now', 'localtime')
  )
  SELECT
      c.day,
      COUNT(a.activity_date_time) AS activities_count
  FROM calendar c
  LEFT JOIN "activities" a
      ON date(a.activity_date_time, 'unixepoch', 'localtime') = c.day
  GROUP BY c.day
  ORDER BY c.day DESC;
  ```

---

## 11. Toggle to auto-configure the chart from the "Ask in English" bar

Add a toggle (**on by default**) in the "Ask in English" bar that, when the query makes sense as a series, automatically configures the chart — picking the series and setting the correct axes.

---

## Finish Report (2026-06-18)

All eleven items for the web viewer's Run SQL screen were implemented. Affected
surfaces: the SQL runner (`assets/web/sql-runner.ts`), the NL→SQL panel
(`nl-modal.ts`, `nl-to-sql.ts`), the chart renderer (`charts.ts`, `app.js`), the
schema view (`schema.ts`), shared button helper (`utils.ts`), styles
(`_sql-editor.scss`), the HTML shell (`lib/src/server/html_content.dart`), and
the SQL string catalog (`l10n/strings-web-sql.ts`). A new `sql-format.ts` wraps
the added `sql-formatter` dependency.

### Defects and changes

1. **Run button rendered the literal text "play_arrow Run".** `setButtonBusy`
   restored the button via `textContent`, discarding the Material-Symbols icon
   `<span>` after the first busy cycle. It now stashes the original `innerHTML`
   in a `data-busy-restore` attribute and restores that, so the icon survives.
2. **SQL was not auto-formatted.** Added `sql-formatter` (^15) behind
   `formatSqlSafe()` (SQLite dialect, uppercase keywords, fail-soft to the
   original on a parse error). Applied in the editor (new Format button + on
   run / template apply / deep-link), the NL preview + Use + narrative, and the
   Schema DDL (`formatAndHighlightSchema`).
3. **Sections were not collapsible.** The estimated-cost panel became a
   `<details>` (cost summary as `<summary>`); the result table was wrapped in the
   shared collapsible results expander.
4. **Pagination showed dead Prev/Next on a single page.** The pagination bar is
   emitted only when the row count exceeds one page.
5. **Result table styling was inconsistent.** The result grid now uses the shared
   `.drift-table` + `.data-table-scroll-wrap` + `.table-status-bar` structure; the
   SQL-specific table CSS that double-rounded the corners was removed.
6. **No way to copy results.** Added Markdown / CSV / JSON copy buttons over the
   table; `rowsToMarkdown` / `rowsToCsv` / `rowsToJson` (pure, exported) copy the
   full result set with delimiter/quote/newline escaping.
7. **Axis labels showed raw column names.** Added `humanizeColumnLabel()` and a
   chart-toolbar toggle (default on) that turns "contacts_added" into "Contacts
   Added"; the chart re-renders when the toggle flips.
8. **Y axis duplicated the X axis label.** Both selectors defaulted to the first
   column. The Y selector now defaults to the first numeric (else second) column,
   distinct from X.
9. **A misspelled subject mapped to an arbitrary hub table.** Added
   `editDistance()` + `fuzzyResolveTable()` as a typo-recovery fallback in
   `resolveTable` (stopword-gated, accepts only an unambiguous winner), so
   "activites" resolves to `activities`.
10. **Bucketed questions produced a bare GROUP BY.** The recursive-calendar series
    generator (`detectTimeBucket` + `timeBucketSeries`) was already present in the
    tree; it was verified and pinned with tests. "by day / per week / monthly"
    now build a `WITH RECURSIVE calendar(...)` + LEFT JOIN + GROUP BY that
    zero-fills empty buckets.
11. **Series answers did not auto-chart.** Added an Ask-panel toggle (default on);
    a grouped/series answer stashes a chart type on `window._nlAutoChart` and runs
    the query, and the runner picks line (calendar series) or bar and renders with
    the axes set by item 8.

### Verification

- `npm run typecheck:web` — clean.
- `npm run test:web` — 224 pass / 0 fail (6 new: fuzzy resolution + bucket series).
- `npm run build` — `bundle.js` and `style.css` regenerated.
- `dart analyze lib/src/server/html_content.dart` — no new errors (pre-existing
  documentation/style lints only).
