# Feature 18: Natural Language to SQL

**Status: COMPLETE** (2026-04-30). Phases 1–2 shipped in the VS Code extension (`extension/src/nl-sql/`).

The full specification, architecture, integration tables, and known limitations are archived (frozen copy):

- [18-natural-language-sql.md (archive)](./history/2026.04/2026.04.30/18-natural-language-sql.md)

User-facing behavior for NL-SQL is under `## [3.5.0]` in [CHANGELOG.md](../CHANGELOG.md).

---

## Implementation Plan (as built)

Delivered as two phases under `extension/src/nl-sql/`. Detail lives in the archive; this is the shipped shape.

- **Phase 1 — NL→SQL translation.** Prompt builder feeds schema context to the LLM; response parsed into a candidate SQL string with confidence. Gate met: parser unit tests green, generated SQL executes against `/api/sql`.
- **Phase 2 — Integration handoffs.** "Edit Visually" bridge into the Visual Query Builder ([21](./21-visual-query-builder.md)) and query recording. Gate met: command registered, handoff round-trips SQL.

No further phases planned here; enhancements track in [21](./21-visual-query-builder.md) and [59](./59-ai-schema-reviewer.md).
