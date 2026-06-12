## Title

`/finish` skill persisted finish-report files in AI-session-narration voice instead of durable third-person engineering records.

## Environment

- Affects: the shared global skill `~/.claude/skills/finish/SKILL.md` (used by this repo's `/finish` runs)
- Repo: saropa_drift_advisor (both Dart `lib/src/` and TS `extension/src/` trees consume `/finish`)
- Scope: documentation/process artifacts only — no extension runtime, Dart analyzer, or database code involved
- Date filed: 2026-06-11

## Steps to Reproduce

1. Run `/finish` after any task in this repo.
2. Open the persisted report under the history root (`plans/history/<yyyy.mm>/<yyyy.mm.dd>/<slug>.md`).
3. Observe the opening `Trigger` section and the line "This work will be reviewed by another AI."

## Expected Behavior

The persisted finish report reads as a third-person engineering record: what the change does, why it was needed, how it was verified — standing on its own without access to the chat conversation. The intro states the problem objectively (the symptom or defect), not the chat prompt.

## Actual Behavior

Reports read as first-person AI session transcripts:
- open with a `Trigger` section quoting the chat prompts back ("the user asked to…", "don't wait for any more feedback");
- carry the line "This work will be reviewed by another AI.";
- use session-relative deixis: "mine", "this commit", "this finish pass", "the explicit mandate", "when challenged".

A later maintainer has no access to that conversation, so the recap framing is noise.

## Error Output

Not a runtime error. Detection via grep:

```bash
git grep -lE 'reviewed by another AI|^\*\*Trigger' -- '*.md'   # ~23 files in this repo
```

## Emitter Attribution (diagnostic / linter / analyzer bugs only)

N/A — this is a documentation-generation defect in the shared `/finish` skill, not a diagnostic emitter.

**Commit-attribution check (clean here):** unlike the sibling `saropa_dart_utils`, this repo's history carries **no** AI attribution:

```bash
git log --all --pretty=format:'%b' | grep -ciE 'co-authored-by|generated with|🤖'   # -> 0
```

(The single `claude` hit in history — "exclude tooling, and .claude/ from the published pub.dev package" — is a packaging commit, not attribution.)

## Minimal Reproducible Example

Any persisted report in `plans/history/**` written by `/finish` before 2026-06-11 exhibits the voice. Example markers: a `**Trigger.**` line, "This work will be reviewed by another AI."

## Root Cause

`~/.claude/skills/finish/SKILL.md`:
- Section 1 instructs stating "This work will be reviewed by another AI." (a chat-time note that leaked into the persisted file).
- Section 7B instructed the persisted intro be "the user's request verbatim", producing the chat-quoting `Trigger` openers.
- Nothing in Section 7 barred session-deixis or chat-quoting in the durable file.

## Fix Applied (generator)

Section 7 of `SKILL.md` (both DEFAULT and LINTER variants) now carries a **Voice** block requiring third-person record voice, leading with what the artifact does, barring chat-quoting and session-deixis, and keeping the "reviewed by another AI" note out of the file. Section 7B's intro instruction changed from "the user's request verbatim" to "the problem objectively stated … NOT the chat request quoted." This corrects all future `/finish` runs.

## What I Already Tried

- [x] Audited all three Saropa repos' commit history for AI attribution — this repo and saropa_lints are clean; saropa_dart_utils had ~22 attributed commits (in a local backup ref only; now purged).
- [x] Fixed the generator (`SKILL.md`).

## Regression Info

- Pre-existing: every `/finish` run prior to the 2026-06-11 generator fix produced narration-voice reports.

## Impact

- Who is affected: maintainers reading historical finish reports.
- What is blocked: nothing functional; readability/provenance hygiene only.
- Data risk: none.
- Frequency: every pre-fix `/finish` report (~23 working `.md` files here).

## Remediation status — this repo

- Commit attribution: clean (0). No action needed.
- Working report files (~23 `.md` with narration voice): rewrite into record voice — the remaining local cleanup.
- Published-history content scrub: NOT recommended — the narration text is internal-doc content, not commit attribution; rewriting `origin/main` to scrub old snapshots means a force-push that changes every hash and breaks clones/PRs/CI. Fix working files and commit; leave history immutable.
