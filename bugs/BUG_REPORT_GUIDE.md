# Bug Report Guide

How to write a bug report that actually gets fixed.

---

## 1. Title

A single sentence that names the broken behavior and where it happens.

- Bad: "It doesn't work"
- Bad: "Table bug"
- Good: "SQL editor loses unsaved query when switching tabs"
- Good: "Export to CSV silently drops rows containing NULL values"

---

## 2. Environment

Capture everything about where the bug occurred. Missing environment info is the #1 reason bug reports get bounced back.

| Field | What to include |
|---|---|
| **OS** | Name, version, architecture (e.g., Windows 11 Pro 10.0.22631 x64, macOS 14.3 arm64) |
| **VS Code version** | From Help > About (e.g., 1.96.2) |
| **Extension version** | From the Extensions panel (e.g., saropa_drift_advisor ext-v3.1.1) |
| **Dart SDK version** | Output of `dart --version` |
| **Flutter SDK version** | Output of `flutter --version` (if applicable) |
| **Database type and version** | e.g., PostgreSQL 16.1, SQLite 3.44.0 |
| **Connection method** | e.g., local socket, TCP with SSH tunnel, Docker container |
| **Relevant settings** | Any non-default extension or VS Code settings that might interact with the bug |
| **Other extensions** | List extensions that might conflict (other database tools, formatters, theme extensions if it is a visual bug) |

---

## 3. Steps to Reproduce

Numbered steps, starting from a clean state. Every step must be an observable action -- no assumptions, no shortcuts.

```
1. Open VS Code with an empty workspace.
2. Connect to a PostgreSQL 16.1 database using TCP (host: localhost, port: 5432).
3. Open the SQL editor panel.
4. Type: SELECT * FROM users WHERE email IS NULL;
5. Click the "Run" button (do NOT use the keyboard shortcut).
6. While results are loading, click the "Tables" tab in the sidebar.
7. Click back on the "SQL Editor" tab.
```

Rules:
- Specify exact input values, not "type some SQL."
- Specify which UI element was clicked, not "click the button."
- Specify whether you used keyboard shortcut, context menu, command palette, or mouse click -- they can trigger different code paths.
- If the bug only happens with specific data, provide that data (or a minimal version of it).
- If the bug is intermittent, say so and estimate how often it occurs (e.g., "~3 out of 10 attempts").

---

## 4. Expected Behavior

What should have happened after those steps. Be specific.

- Bad: "It should work correctly."
- Good: "The SQL editor tab should still contain the query `SELECT * FROM users WHERE email IS NULL;` with the cursor at the original position."

---

## 5. Actual Behavior

What actually happened. Be specific.

- Bad: "It broke."
- Good: "The SQL editor tab is blank. The query is gone. No error message is shown. The results panel still shows the previous query's results."

---

## 6. Error Output

Include ALL of the following that exist. Do not summarize or truncate.

### 6a. VS Code Developer Tools Console

1. Open with: Help > Toggle Developer Tools (or Ctrl+Shift+I / Cmd+Option+I)
2. Click the Console tab
3. Reproduce the bug
4. Copy everything logged during reproduction (right-click > Save as...)

### 6b. Extension Output Channel

1. Open the Output panel (View > Output)
2. Select "Saropa Drift Advisor" from the dropdown
3. Copy the full content

### 6c. Terminal / Command Output

If the bug involves CLI commands or background processes, paste the full terminal output including the command you ran.

### 6d. Stack Traces

If there is an error dialog, notification, or stack trace -- copy the full text. Screenshot alone is not enough for stack traces because they need to be searchable.

### 6e. Emitter Attribution

**Required for diagnostic / linter / analyzer bugs.** The `owner`, `code`, and `source` fields in a VS Code diagnostic are labels the emitter chose -- they are **not** attribution. Attribution is the file:line where the diagnostic is constructed and surfaced, proven by grep. Do not infer attribution from labels. If you skip this section, a downstream fix agent can look at a label like `drift-advisor` or `saropa-lints` and guess the bug "belongs to the other repo" -- then punt. This section exists specifically to kill that guess.

#### What to include

For **every** distinct `(owner, code)` pair that appears in the diagnostic payload:

| Field | Example |
|---|---|
| `owner` | `drift-advisor` |
| `code` | `anomaly` |
| `source` | `Drift Advisor` |
| Code registered at | `extension/src/diagnostics/codes/schema-codes.ts:101` |
| Emit site(s) -- list ALL | `extension/src/diagnostics/checkers/anomaly-checker.ts:31` |
| Grep command used | `` grep -rn "'anomaly'" extension/src/ `` |
| Sibling-repo negative grep | `` grep -rn "'anomaly'" ../saropa_lints/lib/ `` -> 0 matches |

"Emitter not yet located -- needs investigation" is an acceptable honest answer. "Likely lives in repo X" without a grep is **not** -- if you had time to write the sentence, you had time to run the grep.

#### Duplicate-emission bugs

If two diagnostics in the report carry different `(owner, code)` pairs, enumerate **every** emit site for each one. "Two labels, one repo" is a valid finding, but only if you have pasted the grep that proves both emit sites live in the same tree. Otherwise a fix agent will ship a fix for one path and claim the other is somebody else's problem.

#### Mixed-language repos (this one)

`saropa_drift_advisor` is **both** a Dart analyzer (under `lib/src/`) and a TypeScript VS Code extension (under `extension/src/`). Many diagnostics have a Dart emit path **and** a TypeScript emit path that flag the same underlying condition. When filing a diagnostic bug:

- Grep **both** trees (`lib/src/` **and** `extension/src/`) for the code name.
- List every match from each tree. A fix that only touches one language path will leave the other emitting the same diagnostic forever.
- For a duplicate-emission report, assume both language paths are involved until the grep proves otherwise. Do not pick one as "canonical" until you have read both.

#### Cross-repo attribution (only when proven)

If you believe an emitter lives in a sibling Saropa repo (`saropa_lints`, `saropa_dart_utils`, `saropa_kykto`, etc.):

1. Grep the suspected sibling repo for the code name and any related identifiers.
2. Paste the exact command and the matching `file:line` result.
3. **Only then** cross-file the bug in that repo.

A sentence like "cross-filed because the rule source lives in `<repo>`" is a factual claim. It requires a grep result to back it up. If you cannot produce one, write "emitter not yet located" instead. Never use repo-name similarity, label similarity, or "sounds like" as a basis for cross-filing.

---

## 7. Screenshots and Screen Recordings

Screenshots support text descriptions -- they do not replace them.

- **Annotate screenshots.** Circle or arrow the relevant area. A full-screen screenshot with no annotation is almost useless.
- **Screen recordings** are ideal for timing-dependent bugs, UI glitches, flickering, or multi-step interactions. Use VS Code's built-in screen recorder, OBS, or any tool that captures at reasonable quality.
- **Before and after.** If the bug is visual, show what it looks like now AND what it should look like (from a working version or from the docs).
- **Capture the full window** when layout or positioning is relevant. Cropped screenshots hide context.

---

## 8. Minimal Reproducible Example

Strip down the scenario to the absolute minimum that still triggers the bug.

- If it happens with a specific SQL query, find the shortest query that still fails.
- If it happens with specific data, provide the smallest dataset that reproduces it.
- If it happens with a specific schema, provide the CREATE TABLE statement(s).
- If it depends on extension settings, provide the exact JSON from settings.json.

The goal: someone else can copy-paste your example and see the bug within 60 seconds.

---

## 9. What You Already Tried

List every workaround, fix attempt, or diagnostic step you already took. This prevents duplicate work and gives clues about the root cause.

Examples:
- "Restarting VS Code does NOT fix it."
- "Disabling all other extensions does NOT fix it."
- "Downgrading to ext-v3.0.0 DOES fix it -- so it regressed between v3.0.0 and v3.1.0."
- "Happens on PostgreSQL but NOT on SQLite."
- "Happens only when the result set exceeds ~500 rows."

---

## 10. Regression Info

If you know when it last worked:

- **Last working version:** Extension version, VS Code version, or commit hash where the bug did not exist.
- **First broken version:** If you bisected, the earliest version where the bug appears.
- **What changed:** If you can identify a specific update, setting change, or OS update that coincided with the bug appearing.

---

<!-- cspell:disable journalctl -->

## 11. Logs and Diagnostics

Attach full log files when available. Do not paste multi-hundred-line logs inline -- attach them as files.

- VS Code logs: Help > Open Logs Folder
- Extension-specific logs: check the Output panel dropdown
- System logs: Event Viewer (Windows), Console.app (macOS), journalctl (Linux) if the bug involves crashes or system-level behavior
- Network logs: if the bug involves connections, use VS Code's Developer Tools > Network tab to capture request/response pairs (redact credentials)

---

## 12. Impact and Severity

Help prioritize by describing the real-world impact:

- **Who is affected?** Just you, your team, likely all users?
- **What is blocked?** Can you work around it, or does it stop your workflow entirely?
- **Data risk?** Could this bug cause data loss, corruption, or incorrect results?
- **Frequency?** Every time, intermittently, only under specific conditions?

---

## 13. System Resource State (if relevant)

For performance bugs, hangs, or crashes:

- CPU and memory usage during the bug (Task Manager / Activity Monitor)
- Disk space available
- Number of open files / tabs / database connections
- Size of the database or result set involved

---

## Template

Copy this and fill it in:

```markdown
## Title
[One sentence: what is broken and where]

## Environment
- OS:
- VS Code version:
- Extension version:
- Dart SDK version:
- Database type and version:
- Connection method:
- Relevant non-default settings:
- Other potentially conflicting extensions:

## Steps to Reproduce
1.
2.
3.

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Error Output
[Console errors, output channel content, stack traces -- full text, not truncated]

## Emitter Attribution (diagnostic / linter / analyzer bugs only)
For EACH distinct (owner, code) pair in the diagnostic payload -- duplicate this block as needed:
- owner:
- code:
- source:
- Registered at (file:line):
- Emit site(s) (file:line -- list ALL):
- Grep command used:
- Sibling-repo negative grep (command + result, e.g. `grep -rn '<code>' ../saropa_lints/lib/` -> 0 matches):

For mixed-language repos, grep BOTH `lib/src/` and `extension/src/` and list matches from each.
If emitter not yet located, write "emitter not yet located -- needs investigation" rather than guessing.

## Screenshots / Recordings
[Annotated screenshots or screen recordings]

## Minimal Reproducible Example
[Shortest possible input/config that triggers the bug]

## What I Already Tried
- [ ] Restarted VS Code
- [ ] Disabled other extensions
- [ ] Tested on a different database
- [ ] Tested on a previous extension version
- [Other attempts and their results]

## Regression Info
- Last working version:
- First broken version:
- What changed:

## Impact
- Who is affected:
- What is blocked:
- Data risk:
- Frequency:
```

---

## Checklist Before Submitting

- [ ] Title names the specific broken behavior, not a vague category
- [ ] Environment section is fully filled in -- no blanks
- [ ] Steps to reproduce start from a clean state and are numbered
- [ ] Expected vs. actual behavior are both stated explicitly
- [ ] Error output is full text, not truncated or paraphrased
- [ ] **Emitter Attribution filled in for every (owner, code) pair** -- file:line for registration AND every emit site, proven by grep commands pasted in the report
- [ ] **Duplicate-emission bugs enumerate ALL emit sites** in this repo, not just one "canonical" one
- [ ] **Mixed-language trees grep'd on both sides** -- `lib/src/` AND `extension/src/` -- with matches from each listed
- [ ] **No cross-repo attribution without a positive grep result pasted** -- no "likely", "probably", "sounds like"
- [ ] **No sibling-repo deferral without a negative grep result pasted** -- "not in saropa_lints" requires the zero-match grep to prove it
- [ ] Screenshots are annotated if included
- [ ] Minimal reproducible example is actually minimal
- [ ] Checked for existing bug reports covering the same issue
- [ ] Sensitive data (passwords, API keys, personal info) is redacted from all attachments
