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
- [ ] Screenshots are annotated if included
- [ ] Minimal reproducible example is actually minimal
- [ ] Checked for existing bug reports covering the same issue
- [ ] Sensitive data (passwords, API keys, personal info) is redacted from all attachments
