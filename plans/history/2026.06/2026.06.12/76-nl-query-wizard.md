# Feature 76: Guided NL Query Wizard (web viewer)

**Status: IMPLEMENTED.** Shipped across commits `1340c38` (activity-bar shell, §12 L1), `abde88a` (NL wizard core — `resolveTable` + FK `relationshipWhere`, Parts A + C), and `6cc388e` (Ask panel UI — table clarifier + refinement chips, §12 L2 + Part B). This doc is retained as the design record.

This evolves the **web viewer's** "Ask in English" box ([assets/web/nl-to-sql.ts](../assets/web/nl-to-sql.ts) + [assets/web/nl-modal.ts](../assets/web/nl-modal.ts)), which is a **local heuristic converter** — distinct from Feature [18](../../2026.04/2026.04.30/18-natural-language-sql.md) (the VS Code extension's **LLM-based** NL-SQL). No LLM, no network round-trip; everything runs in the browser against schema metadata.

Related: [21 Visual Query Builder](./history/2026.06/2026.06.11/21-visual-query-builder.md), [59 AI Schema Reviewer](./59-ai-schema-reviewer.md).

---

## 1. Motivation

Three gaps in today's converter:

1. **Dead-ends on ambiguity.** "search for alice" with no table named returns `Could not identify a table from your question.` — no SQL, no guidance. A debug tool should never hand back nothing.
2. **No discovery / progressive construction.** The user has to know the phrasing up front. There's a static help cheat-sheet, but nothing that proposes the *next* refinement based on the actual schema.
3. **Single-table only.** The converter cannot express relationships ("contacts with more than one phone"), even though the FK graph is right there in the metadata.

Goal: turn the box into a **guided, schema-aware query builder** — always produce a best guess, surface the assumptions as editable controls, and offer one-click refinements derived from the schema (including FK relationships).

### Non-goals

- No LLM. This stays a deterministic, inspectable heuristic engine.
- No multi-table JOIN result shapes (column explosion). Relationships are expressed as row-preserving `EXISTS` / correlated-count predicates on the base table.
- No write/DDL generation. Read-only `SELECT`.

---

## 2. Data model available (verified)

`/api/schema/metadata` already returns, per table:

```jsonc
{ "tables": [ {
  "name": "contacts",
  "rowCount": 1234,                 // present in getSchemaMetadataList path
  "columns": [
    { "name": "id",   "type": "INTEGER", "pk": true,  "notnull": true },
    { "name": "name", "type": "TEXT",    "pk": false, "notnull": false }
  ]
} ] }
```

- **`pk` and `notnull` are already present on every column.**
- **`rowCount` is present** per table.
- **FK edges are NOT loaded today** but are one query-param away:
  `GET /api/schema/metadata?includeForeignKeys=1` adds, per table, a `foreignKeys` list; the schema-diagram path emits a top-level edge list of
  `{ fromTable, fromColumn, toTable, toColumn }` (source: `PRAGMA foreign_key_list`, [schema_handler.dart](../lib/src/server/schema_handler.dart)).

**Action:** `loadSchemaMeta()` ([assets/web/schema-meta.ts](../assets/web/schema-meta.ts)) gains `?includeForeignKeys=1`, and the `SchemaMeta` / `SchemaColumn` / `SchemaTable` interfaces in [nl-to-sql.ts](../assets/web/nl-to-sql.ts) grow `pk`, `notnull`, `rowCount`, and `foreignKeys`. This is the only data-layer change.

---

## 3. Part A — Best-guess table + clarifier

### A.1 Table resolution

Replace the hard error with a ranked resolver returning `{ table, confidence, candidates }`:

```
resolveTable(q, meta):
  exact   = tables whose name OR singular appears as a word in q
  if exact.length == 1 -> { table: exact[0], confidence: 'named', candidates: exact }
  if exact.length  > 1 -> { table: pickHub(exact), confidence: 'ambiguous', candidates: exact }
  // none named:
  if tables.length == 1 -> { table: tables[0], confidence: 'only', candidates: tables }
  return { table: pickHub(tables), confidence: 'guess', candidates: tables }

pickHub(cands):
  // The "main entity" is usually the most-referenced table (contacts is
  // pointed at by phones/emails/addresses). Tiebreak by rowCount, then name.
  rank by (# inbound FK references) desc, then rowCount desc, then name asc
```

`confidence` drives how loud the clarifier is.

### A.2 Clarifier UI

A bar directly above the SQL preview:

```
Querying  [ contacts ▾ ]            (named: quiet · guess: highlighted + hint)
```

- A `<select>` listing every table; changing it re-previews.
- When `confidence` is `guess`/`ambiguous`, add a one-line hint ("Guessed the table — pick another if this isn't it") and a subtle highlight.
- Implementation: `nlToSql` gains an optional explicit table — `nlToSql(question, meta, { table })` — so the dropdown sets structural context **decoupled from the text**. (Refinement chips in Part B still mutate the text; the table is the one structural control.)

This means the "search for alice" example becomes: best-guess hub table chosen, SQL shown, and a visible `Querying [<table> ▾]` the user can correct in one click — never a dead-end.

---

## 4. Part B — Refinement chips (the wizard)

### B.1 Click model — append-to-text

Clicking a chip **appends its natural-language phrase to the question box** and re-previews. The text box stays the single source of truth:

- every refinement is visible, hand-editable, and removable;
- the existing converter remains the single brain (no parallel structured state to keep in sync);
- it composes for free with everything the converter already understands.

Trade-off accepted: a chip can only express what the converter can parse — so each chip's phrase must round-trip through the converter. Part C adds the relationship phrases the relationship chips depend on.

### B.2 Suggestion catalog (generated from the resolved table)

| Condition on table | Chip label | Appended phrase | Resulting SQL shape |
|---|---|---|---|
| always | "as a total" | `as a total` | `COUNT(*)` |
| always | "newest first" | `newest first` | `ORDER BY <date> DESC` |
| always | "just 10" | `top 10` | `LIMIT 10` |
| has date col | "added this week" | `created this week` | temporal `>=` |
| has date col | "changed today" | `changed today` | temporal `=` |
| has date col | "stale (90+ days)" | `not updated in 90 days` | temporal `<` |
| each bool flag col | "only active" | `active` | `flag = 1` |
| top numeric col | "highest balance" | `highest balance` | `MAX(...)` / `ORDER BY ... DESC` |
| **FK child C** | "with more than one phone" | `with more than one phone` | correlated `COUNT > 1` |
| **FK child C** | "with at least one phone" | `with a phone` | `EXISTS` |
| **FK child C** | "without any phones" | `without any phones` | `NOT EXISTS` |
| **FK parent P** | "that belongs to a company" | `linked to a company` | `fk IS NOT NULL` |

- Chips are generated, prioritized (**relationships → date → bool → numeric → total/sort/limit**), and **capped at ~8** with a "more…" toggle. `log()` what's hidden — never silently drop.
- A chip whose phrase is already present in the box is rendered "applied" (checkmark) and toggling it **removes** that phrase. Round-trip must be exact-string for clean removal.

### B.3 New converter need surfaced by B.2

`as a total` currently collides with the SUM branch (`total\b`). Spec: count branch gains `as a total|total count|just the count|the count`, and the SUM branch keeps its existing `!/total number/` guard plus a new `!/as a total/`.

---

## 5. Part C — FK/PK relationship engine (the real work)

### C.1 FK graph

From `meta.foreignKeys` build, per table T:

- **children(T)** = edges where `toTable == T` → `{ table: fromTable, fkCol: fromColumn, pkCol: toColumn }`
- **parents(T)**  = edges where `fromTable == T` → `{ table: toTable, fkCol: fromColumn, pkCol: toColumn }`

### C.2 Base PK resolution

Need `B.<pk>` for correlated predicates:

1. columns with `pk == true`; single → use it;
2. composite PK → correlate on all PK columns (`AND`-joined);
3. no declared PK → fall back to `rowid` **with a comment**; skip for `WITHOUT ROWID` tables (can't detect from metadata — accept as a known limitation, documented).

### C.3 SQL shapes (row-preserving — no JOIN)

Base `B`, child `C` (`C.cfk → B.bpk`):

```sql
-- with a / at least one C
EXISTS (SELECT 1 FROM "C" WHERE "C"."cfk" = "B"."bpk")
-- without any C
NOT EXISTS (SELECT 1 FROM "C" WHERE "C"."cfk" = "B"."bpk")
-- with more than one / multiple / several C
(SELECT COUNT(*) FROM "C" WHERE "C"."cfk" = "B"."bpk") > 1
-- with at least N / exactly N C
(SELECT COUNT(*) FROM "C" WHERE "C"."cfk" = "B"."bpk") >= N   -- or = N
```

Parent `P` (`B.bfk → P.ppk`):

```sql
-- linked to a P / has a P
"B"."bfk" IS NOT NULL
-- with no P / missing P
"B"."bfk" IS NULL
-- orphaned P reference (QA tie-in with anomaly_detector orphan check)
"B"."bfk" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "P" WHERE "P"."ppk" = "B"."bfk")
```

These AND-compose into the existing shared WHERE alongside temporal + value predicates.

### C.4 NL phrase grammar (new `relationshipWhere(q, target, meta)`)

For each related table R (children first), match its name or singular with a quantifier:

```
with|having  more than|over          N  R   -> COUNT > N
with|having  at least                N  R   -> COUNT >= N
with|having  exactly                 N  R   -> COUNT = N
with|having  a|an|any|one or more       R   -> EXISTS
without (any)| with no | having no      R   -> NOT EXISTS
```

`N` reuses the existing fuzzy `count()` (digits + spelled-out + "one/two…").

**Generic "relationship(s)"** (the word, not a table name): if exactly one child table exists, apply to it; if several, the chip path always names a concrete table, and free-text generic resolves to "any child" via `EXISTS (child1) OR EXISTS (child2) …` **only** when the user typed the generic word — otherwise surface a clarify chip ("which? phones / emails / addresses").

### C.5 Worked example

Schema: `contacts(id pk, name)`, `phones(id pk, contact_id → contacts.id, number)`, `companies(id pk, name)`, `contacts.company_id → companies.id`.

```
"contacts with more than one phone, added this week, sorted by name"
->
SELECT "name" FROM "contacts"
WHERE date("created_at",'unixepoch','localtime') >= date('now','weekday 0','-6 days','localtime')
  AND (SELECT COUNT(*) FROM "phones" WHERE "phones"."contact_id" = "contacts"."id") > 1
ORDER BY "name" ASC
LIMIT 50
```

Chips offered for `contacts`: *with more than one phone · without any phones · that belongs to a company · added this week · changed today · only \<flag\> · as a total · newest first*.

---

## 6. UI / markup / wiring

> **Home change:** the wizard no longer lives in the table modal. It moves into a
> dedicated **"Ask" sidebar panel** under the new activity-bar layout — see
> [§12](#12-layout-restructure-vs-code-activity-bar). The clarifier bar, chips,
> question box, and SQL preview below render inside that panel, not `#nl-modal-panel`.

- **[html_content.dart](../lib/src/server/html_content.dart)** — clarifier bar (`#nl-table-select`) above the preview, and a chips strip (`#nl-refine`) between the question box and the preview, inside the **Ask sidebar panel** (§12).
- **[nl-modal.ts](../assets/web/nl-modal.ts)** — populate the table `<select>` from meta; render chips from a `suggestRefinements(table, meta)` helper; chip click appends/removes its phrase + re-previews; table change re-previews with `{ table }`.
- **[nl-to-sql.ts](../assets/web/nl-to-sql.ts)** — interface growth (pk/notnull/rowCount/foreignKeys), `resolveTable`, `relationshipWhere`, `as a total` fix, optional `opts.table`.
- **[schema-meta.ts](../assets/web/schema-meta.ts)** — `?includeForeignKeys=1`.
- **[_sql-editor.scss](../assets/web/_sql-editor.scss)** — clarifier bar + chip styling (reuse `nl-icon-btn` / chip tokens).
- **suggestRefinements** also feeds the existing help panel a "for this table" preview (optional, later).

---

## 7. Safety & correctness

- Identifiers (`"table"`, `"col"`) always double-quoted; values quote-escaped; LIKE wildcards escaped (already done).
- Correlated subqueries reference `"B"."bpk"` by quoted identifier — never string-built from user text.
- Composite-PK and missing-PK paths covered (C.2); `WITHOUT ROWID` no-PK is a documented limitation.
- Self-referential FKs (a table pointing at itself, e.g. `contacts.manager_id → contacts.id`) must alias the subquery table (`FROM "contacts" AS rel WHERE rel."manager_id" = "contacts"."id"`) — spec the alias for self-joins specifically.

---

## 8. Test plan

- **Node + `node:sqlite` harness** (as used for the current converter): every chip phrase and relationship shape executes against a fixture schema with FKs (`contacts`/`phones`/`companies`, incl. a self-FK case) and returns sane counts.
- **Resolver unit cases**: named / ambiguous / single-table / guess, hub ranking.
- **Dart contract test** ([web_viewer_nl_modal_contract_test.dart](../test/web_viewer_nl_modal_contract_test.dart)): new ids (`nl-table-select`, `nl-refine`), chip + select wiring present, SCSS hooks.
- **Changelog** updated.

---

## 9. Phasing & gates

- **Phase A — best-guess table + clarifier.** Gate: no question ever returns the dead-end error when ≥1 table exists; dropdown re-previews; resolver unit cases green.
- **Phase B — refinement chips (single-table facets).** Gate: each chip round-trips (apply then remove restores the prior SQL); `as a total` → COUNT; all chip phrases execute in the harness.
- **Phase C — FK relationship engine.** Gate: `includeForeignKeys=1` loaded; EXISTS / NOT EXISTS / correlated-count predicates execute against the FK fixture incl. self-FK and composite-PK; relationship chips appear only when FK edges exist.

Each phase ships independently and is independently revertible.

---

## 10. Open decisions (recommendations inline)

1. **Hub-table heuristic for `pickHub`** — inbound-FK-count first vs rowCount first. *Rec: inbound FK count first* (the entity others point at is usually the subject), rowCount as tiebreak. Needs the FK load (Part C) to be fully effective; until then `pickHub` degrades to rowCount.
2. **Chip cap & ordering** — *Rec: cap 8, relationships first.* Confirm the cap.
3. **Generic "relationship" with multiple children** — *Rec: chips name concrete tables; free-text generic → OR-of-EXISTS across children, or a clarify chip when >3 children.*
4. **No-PK base table** — *Rec: `rowid` fallback + documented `WITHOUT ROWID` limitation.* Acceptable?

---

## 11. Risks

- **Relationship phrase ambiguity** (R name collides with a column name, or plural/singular clashes). Mitigation: prefer longest match, require a quantifier/`with|without` trigger so bare table-name mentions don't accidentally add EXISTS.
- **Metadata size** with `includeForeignKeys=1` on wide schemas — one extra PRAGMA per table, already paid by the diagram feature; cached once by `loadSchemaMeta`.
- **Chip round-trip removal** depends on exact-string match of the appended phrase; editing the text by hand can desync the "applied" state. Mitigation: recompute applied-state by substring scan on every preview, not by remembered clicks.

---

## 12. Layout restructure: VS Code activity bar

The NL tool is too central to bury in a per-table modal. It becomes a first-class **sidebar panel**, which requires moving the viewer from its current "top toolbar + stacked sidebar" shell to a **VS Code-style three-zone layout**. This is a deliberate structural change; one sidebar panel is visible at a time, and that is acceptable.

### 12.1 Current shell (as built)

- `#toolbar-bar` — a **horizontal** strip of `data-tool` icon launchers (home, tables, search, sql, snapshot, compare, index, schema, declared, diagram, size, perf, anomaly, import, export, settings) plus toggles (sidebar, mask, theme, share, history).
- `#app-layout` → left `#app-sidebar` holding **always-present stacked sections** (`#sidebar-search-wrap`, `#sidebar-tables-wrap`), a main content/grid area, and a right **History** sidebar.
- NL = a modal overlay (`#nl-modal`).

### 12.2 Target shell (three zones)

```
┌──┬────────────────┬──────────────────────────────────┐
│A │  SIDEBAR        │  MAIN (editor / data grid)       │
│c │  (one panel)    │                                  │
│t │  ┌───────────┐  │  results grid · SQL runner ·     │
│i │  │ Tables    │  │  diagram · size · perf · compare │
│v │  │ Search    │  │  · snapshot · schema · …         │
│i │  │ Ask (NL)  │  │                                  │
│t │  │ History   │  │                                  │
│y │  └───────────┘  │                                  │
└──┴────────────────┴──────────────────────────────────┘
 ^ vertical icon strip (the activity bar) selects the sidebar panel
```

- **Activity bar** — a **vertical** icon strip on the far left (the rotated `#toolbar-bar`). Icons fall into two kinds (see mapping): *panel selectors* and *main-view launchers*.
- **Sidebar** — a single region showing **exactly one panel** at a time, chosen by the active panel-selector icon. Panels: **Tables**, **Search**, **Ask (NL wizard)**, **History**. Clicking the active panel's icon again collapses the sidebar (VS Code behavior).
- **Main** — the data grid and the heavy full-page tools stay here, unchanged in content.

### 12.3 The mapping decision (icons → panel vs main view)

The current icons are a mix. Proposed split:

| Activity-bar icon | Kind | Behavior |
|---|---|---|
| Tables | panel | shows Tables sidebar panel |
| Search | panel | shows Search sidebar panel |
| **Ask** (new) | panel | shows the **NL wizard** sidebar panel |
| History | panel | shows History sidebar panel (was right sidebar) |
| SQL, Diagram, Size, Perf, Compare, Snapshot, Schema, Code, Index, Health, Import, Export | main-view | open in the main area as today |
| Home, Settings, Mask, Theme, Share | action | unchanged (global actions; live at the bottom of the strip) |

Rationale: panels are *navigational / iterative* (you keep them open while working in the grid); main-views are *destinations*. History moves from a right sidebar into the left panel set so there's a single sidebar region (simpler, matches VS Code). **This split is the main thing to confirm** — esp. whether History should remain a separate right panel rather than join the left set.

### 12.4 NL modal → Ask panel migration

- Move the markup from `#nl-modal` into a `#sidebar-ask` panel; drop the backdrop, `aria-modal`, and Escape-to-close (a panel isn't a modal).
- [nl-modal.ts](../assets/web/nl-modal.ts) → rename concerns to panel show/hide; keep dictation, copy, preview-results, help-search, and the new clarifier/chips. `openNlModal`/`closeNlModal` become `showAskPanel`/`hideAskPanel` driven by the activity bar.
- "Use" now writes into the main SQL runner and **switches the main view to SQL** (instead of closing a modal).
- The `#nl-open` toolbar button becomes the **Ask** activity-bar icon.

### 12.5 Persistence & responsive

- Persist `{ activePanel, sidebarCollapsed }` in `localStorage` (mirrors existing `saropa_app_sidebar_collapsed` / toolbar-labels keys). Default panel = Tables.
- Narrow widths: the sidebar overlays the main area instead of squeezing it (one breakpoint), so the grid never collapses to nothing.
- Keep the existing label-density toggle — it now styles the vertical strip.

### 12.6 Blast radius (be honest)

This is large and touches shared shell:

- **[html_content.dart](../lib/src/server/html_content.dart)** — restructure `#toolbar-bar` → vertical activity bar; wrap sidebars in a single swappable `#app-sidebar` panel host; relocate History; move NL markup in.
- **[style.scss](../assets/web/style.scss) + partials** — the layout grid flips (activity bar column + sidebar column + main column); toolbar rules re-orient vertical; sidebar panel show/hide; this is the heaviest CSS change.
- **bundle JS** (app.js / modules) — panel switching + persistence replaces the current sidebar-toggle / history-toggle / tab logic; the `data-tool` dispatch stays for main-views.
- **Contract tests** — several assert the *horizontal* toolbar, `#app-sidebar` stacked sections, `tb-sidebar-toggle`, `tb-history-toggle`, `data-label`. These will need updates, not just additions. Enumerate and update deliberately (they're the regression guard for exactly this shell).

### 12.7 Phasing (layout is its own track, gated before the wizard moves in)

- **L1 — activity bar shell.** Rotate the toolbar to a vertical strip; introduce the single swappable sidebar host with the **existing** panels (Tables, Search) + History moved in. No NL yet. Gate: every current tool still reachable; panel switch + collapse persist; contract tests updated and green.
- **L2 — Ask panel.** Migrate the NL modal into the Ask panel (§12.4). Gate: dictation/copy/preview/help all work in-panel; "Use" writes to SQL runner and shows it.
- **L3 — wizard features** (Parts A/B/C of this doc) land inside the Ask panel.

Layout L1–L2 should precede wizard Phase A/B/C, since the wizard's home must exist first.

### 12.8 Decisions (resolved 2026-06-11)

- **Panel set & History placement** — ✅ History **folds into the single left panel set** (Tables / Search / Ask / History). One sidebar region; the old right History sidebar is removed.
- **Collapse-on-reclick** — ✅ on (clicking the active panel icon hides the sidebar, VS Code style).
- **Panels vs main-views** — ✅ §12.3 split stands: Tables / Search / Ask / History are panels; SQL, Diagram, Size, Perf, Compare, Snapshot, Schema, Code, Index, Health, Import, Export stay main-area views; Home / Settings / Mask / Theme / Share are bottom-pinned global actions.
- **"Use" action** — ✅ writes to the SQL runner and switches the main view to SQL.

---

## Finish Report (2026-06-12)

The web viewer's "Ask in English" box evolved from a single-table heuristic converter that dead-ended on ambiguity into a guided, schema-aware query builder. All three design parts and the layout restructure described above shipped; the plan's status header had remained `SPEC / NOT STARTED` long after the code landed, so a reader scanning the active `plans/` tree would wrongly conclude the feature was unbuilt. The header was corrected to `IMPLEMENTED` and the completed plan archived to `plans/history/`.

### What shipped (verified against code, not the header)

- **Part A — best-guess table + clarifier.** `resolveTable(q, meta)` ([assets/web/nl-to-sql.ts:833](../../../assets/web/nl-to-sql.ts#L833)) returns a ranked `{ table, confidence, candidates }` instead of the old hard error; `nlToSql(question, meta, opts?: { table?: string })` ([nl-to-sql.ts:946](../../../assets/web/nl-to-sql.ts#L946)) accepts an explicit table so the `#nl-table-select` dropdown ([lib/src/server/html_content.dart:416](../../../lib/src/server/html_content.dart#L416)) sets structural context decoupled from the text.
- **Part B — refinement chips.** Rendered into `#nl-refine` ([html_content.dart:509](../../../lib/src/server/html_content.dart#L509)); chips append/remove their natural-language phrase so the text box stays the single source of truth.
- **Part C — FK/PK relationship engine.** `relationshipWhere(q, target, meta)` ([nl-to-sql.ts:614](../../../assets/web/nl-to-sql.ts#L614)) emits row-preserving `EXISTS` / `NOT EXISTS` / correlated-count predicates from `?includeForeignKeys=1` metadata.
- **§12 — activity-bar layout restructure.** The toolbar re-oriented into a vertical VS Code-style activity bar; the NL modal became the `#sidebar-ask` panel ([html_content.dart:404](../../../lib/src/server/html_content.dart#L404)).

Delivered across commits `1340c38` (activity-bar shell), `abde88a` (NL wizard core), and `6cc388e` (Ask panel UI). A later commit `e455d53` ("Hey Saropa" wake phrase) built narrative answers on top of the Ask panel.

### Scope of this finish pass

Documentation only. No `lib/`, `assets/`, `test/`, or `extension/` code was touched — the feature code already shipped and was changelogged when built. The change set is the plan-file status correction plus the archival move to `plans/history/2026.06/2026.06.12/` and the repointed reference from [plans/77-soft-relationship-advisory.md](../../../plans/77-soft-relationship-advisory.md).

`Finish report appended: plans/history/2026.06/2026.06.12/76-nl-query-wizard.md`
`Plan archived: plans/76-nl-query-wizard.md → plans/history/2026.06/2026.06.12/76-nl-query-wizard.md`
`No bug archive — task did not close a bugs/*.md file`
