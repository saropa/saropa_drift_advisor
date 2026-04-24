# PROBABLE: Open VSX not updated when VS Code Marketplace publish fails in unified publish flow

**Status:** Probable (code-path review + parallel fix in `saropa_lints`; not yet reproduced end-to-end in this repo)

**Area:** `scripts/publish.py` → `modules/ext_publish.py` (extension release pipeline, `stores == "both"`)

---

## Title

When “both” stores are selected, a failed VS Code Marketplace publish returns before the Open VSX step runs, so [open-vsx.org/extension/saropa/drift-viewer](https://open-vsx.org/extension/saropa/drift-viewer) may stay stale even with a valid `OVSX_PAT`.

---

## Environment

| Field | Value |
| --- | --- |
| **OS** | N/A (release tooling); observed pattern consistent with any host |
| **Component** | `saropa_drift_advisor` publish script, `scripts/modules/ext_publish.py` |
| **Relevant code** | `_run_publish_steps()` — Step 13 (Marketplace) then Step 14 (Open VSX) |

This is not a runtime VS Code / extension bug; environment table in `BUG_REPORT_GUIDE.md` is N/A for normal app repro. Filed against the **publish pipeline** so the fix owner knows where to look.

---

## Steps to Reproduce (expected — not yet run as a full release)

1. Clone `saropa_drift_advisor` and ensure extension publish prerequisites (Node, `npx @vscode/vsce`, `npx ovsx`, etc.).
2. Set a **valid** `OVSX_PAT` (or plan to paste at prompt).
3. Intentionally use an **invalid or missing** VS Code Marketplace / `vsce` credential so `npx @vscode/vsce publish` exits non-zero (e.g. expired Azure DevOps PAT for Marketplace).
4. Run `python scripts/publish.py` and complete the full extension publish path with **both** stores selected: choose `3` when `ask_publish_stores()` runs, *or* rely on `_determine_stores()` returning `"both"` when a local install is detected (see `ext_publish._determine_stores()`).
5. After the packaged `.vsix` is produced: Step 13 runs and fails (bad Marketplace credentials). **Observe** that the flow stops there — **Step 14 (Open VSX) is never reached**, even with a valid `OVSX_PAT` in the environment.

---

## Expected Behavior

- Step 14 **Open VSX** is attempted after Step 13, so Cursor / VSCodium users can receive the new version from Open VSX when Marketplace auth fails but `OVSX_PAT` is good.

- This matches the stated summary in the publish flow (“Publish to VS Code Marketplace” and “Publish to Open VSX” as separate steps) and the existence of a dedicated Open VSX republish mode (workaround) documented near `scripts/publish.py` (republish without full pipeline).

---

## Actual Behavior (from code)

In `_run_publish_steps()` in `modules/ext_publish.py`, when `stores` is not `"openvsx_only"`, a failed `Marketplace publish` `run_step` causes an **immediate `return False`** (lines 302–304), so the function **never reaches** the Step 14 `heading` for Open VSX.

```302:310:scripts/modules/ext_publish.py
        elif not run_step("Marketplace publish",
                          lambda: publish_marketplace(vsix_path), results):
            return False

    heading("Step 14 · Publish to Open VSX")
    if stores == "vscode_only":
        info("Skipping (publish to VS Code Marketplace only).")
    else:
        _publish_openvsx_step(vsix_path, results)
```

(If `_commit_and_tag` fails first, the function also returns at `291:293:scripts/modules/ext_publish.py`; that is a separate path.)

**Cross-reference (fixed elsewhere):** The same class of issue existed in `saropa_lints` in `scripts/modules/_extension_publish.py` (`publish_extension` returned before Open VSX when Marketplace failed). There it was changed so Marketplace and Open VSX are both attempted. *This note is from code review; re-verify in that repo if the behavior diverges.*

---

## Error Output

- No single stack trace: the pipeline exits at the failed Marketplace step; Open VSX is not invoked, so `ovsx` produces no new output for that run.

From the repository root, the Marketplace short-circuit is easy to find next to `Step 13` / `Step 14`:

```bash
rg -n "Step 13" scripts/modules/ext_publish.py
rg -n "Marketplace publish" scripts/modules/ext_publish.py
```

(There are other `return False` sites in the same file; the one after the `"Marketplace publish"` `run_step` is the relevant path. See the code block under **Actual Behavior** above.)

---

## Emitter Attribution (diagnostic / linter / analyzer bugs only)

**N/A** — this report is about the **publish script orchestration**, not VS Code diagnostics. No `owner` / `code` / `source` payload applies.

---

## Workaround (existing)

- Use the **Open VSX republish** path in `scripts/publish.py` (`openvsx` command) to upload an existing `.vsix` when Marketplace already failed or was skipped, **after** packaging the `.vsix` by other means.

- That workaround does not fix the “single run with both stores” story: users who expect one pass to update both registries can still end up with Open VSX never attempted.

---

## What We Already Tried

- **Code review** and comparison with `saropa_lints` `publish_extension` behavior (decouple attempts; do not return before Open VSX).
- **Grep** / read of `ext_publish.py` confirmed `return False` at lines 302–304 immediately when `run_step("Marketplace publish", ...)` fails, before the Step 14 heading.

---

## Suggested Fix Direction (for implementer)

- In `_run_publish_steps`, **do not** return immediately when Step 13 fails; emit a clear warning, then run Step 14 when `stores` includes Open VSX.
- Define overall success for the “both” case: e.g. require both to succeed, or return partial success with explicit messaging (align with `saropa_lints` semantics after their fix).
- Re-run or extend **Step 16** store propagation / verification so it reflects which stores were actually published.

---

## Impact

- **Who:** Release maintainer; **users** of Drift Advisor on **Cursor / Open VSX** if Marketplace auth breaks.
- **What is blocked:** Open VSX may lag **even when** OVSX credentials and network are fine.
- **Data risk:** None.
- **Frequency:** Every time Marketplace publish fails in a “both” run, until worked around via republish.

---

## Checklist (from BUG_REPORT_GUIDE.md)

- [x] Title names specific behavior and location (publish pipeline, not generic “stores broken”)
- [x] Steps are numbered; noted where full repro was not run (probable)
- [x] Expected vs actual stated; actual tied to `file:line` logic
- [x] Cross-repo note: `saropa_lints` had analogous pattern (fixed in `_extension_publish.py`); drift advisor should be aligned
- [x] No unproven cross-repo “emitter” claims — this is script orchestration, not `saropa_lints` diagnostics
