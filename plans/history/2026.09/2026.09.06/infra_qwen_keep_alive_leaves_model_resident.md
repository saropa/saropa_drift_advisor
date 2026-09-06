# BUG: Qwen translation leaves the model resident for 30 minutes and never unloads

**Status: Fixed**

Created: 2026-09-05
Component: Translation tooling
File: `scripts/modules/l10n/qwen_engine.py`
Severity: Medium

---

## Summary

Every translation request sent `keep_alive: "30m"` (`qwen_engine.py:237`), and
nothing unloaded the model when a run finished. A translation pass therefore
left a multi-gigabyte model host resident for half an hour after the last
string was translated, on a machine that had already finished doing other work.

This is the mild form of a defect that was Critical in the sibling
`saropa_lints` project. **This copy does not have the critical form** — see the
scope note below, which was verified rather than assumed.

## Scope note (verified, do not re-investigate)

This engine does not start, stop, or kill an Ollama daemon. It requires one to
be already running and tells the operator to start it
(`qwen_engine.py:139-149`). Because it issues no kill of any kind, it cannot
strand a `llama-server.exe` child by force-killing its parent. The
`saropa_lints` copy grew daemon lifecycle management and acquired that defect;
this copy, at 314 lines against that one's 1144, never did.

The only shared defect is the `keep_alive` value and the missing unload.

## Impact

A model host holding 9-16 GB stays resident for 30 minutes after a run that no
longer needs it. On a developer machine already running an analyzer, a browser
and an editor, that is enough to push the system into paging. It is not a leak
— the host does eventually unload — but the memory is held for far longer than
the work required.

## Related cross-project hazard (now fixed on the other side)

Until 2026-09-05, the `saropa_lints` copy recovered from a port conflict by
running `taskkill /IM ollama.exe /F` — a machine-wide, force kill by image name,
with no process-tree flag. If that ran while this project's translation was
using a daemon the operator had started, it would kill that daemon and orphan
its `llama-server.exe` child permanently.

This is the most likely explanation for one of the three orphans found on the
development machine on 2026-09-05: it carried `-np 6`, which matches neither
this engine's expectations nor the other project's `OLLAMA_NUM_PARALLEL=1`,
implying a daemon started by hand or by a third tool and killed by something
else.

That machine-wide kill is now opt-in in `saropa_lints` and no longer runs as a
side effect of a normal translation. No change is required here for it; the
hazard is recorded so nobody re-introduces a global kill in this project.

## Suggested Fix

1. Reduce `keep_alive` to a few minutes, with an environment override for
   operators who run many locales back to back.
2. Unload explicitly when a run completes, rather than relying on the timeout.
   The run knows when it has finished translating; the daemon does not.
3. Never add a kill-by-image-name recovery path. If a port conflict needs
   handling, fail with a message instead. Killing a daemon another client is
   serving from is what caused the incident referenced above.

## Reference

The equivalent work in the sibling project, including the process-tree
termination, orphan sweep and preflight it needed and this copy does not:
`d:\src\saropa_lints\plans\history\2026.09\2026.09.05\infra_translation_engine_orphans_llama_server_processes.md`

## Finish Report (2026-09-06)

### Defect

The Qwen translation engine (`qwen_engine.py`) hardcoded `keep_alive: "30m"` in
every request payload, and no code path evicted the model when a translation run
completed. The Ollama daemon kept the model host-resident for 30 minutes after
the last string was translated — 9-16 GB of RAM held with no purpose.

### Changes

**`scripts/modules/l10n/qwen_engine.py`:**
- Default `keep_alive` reduced from `"30m"` to `"5m"` via new `_DEFAULT_KEEP_ALIVE`
  constant. Configurable at runtime via `SAROPA_QWEN_KEEP_ALIVE` env var.
- Hardcoded `"30m"` in the request payload replaced with `_keep_alive()` helper
  that reads the env var.
- New `unload()` function sends `keep_alive: 0` to Ollama's `/api/generate`
  endpoint, immediately evicting the model from memory. Errors are swallowed —
  safe to call when Ollama is not running or the model is not loaded.
- `_keep_alive()` validates the env var against Ollama's accepted formats
  (`\d+[smh]?`); invalid values fall back to the default with a warning.

**`scripts/modules/l10n/actions.py`:**
- `translate_pass()` now calls `qwen_engine.unload()` in its `finally` block, so
  the model is freed whether the run succeeds, is aborted by an engine failure,
  or is interrupted with CTRL-C. The unload only fires when Qwen was actually
  selected as the engine (tracked via `used_qwen` flag).
- New `_dry_run_translate()` helper reports per-locale key count, word count, and
  engine selection without loading models or making API calls.
- `run_translate_action()` accepts `dry_run=True`, which bypasses the confirmation
  gate (no translation happens) but still requires `--locales`.

**`scripts/modules/l10n/cli.py`:**
- `--dry-run` flag now accepted in translate mode (was sync-only).
- Docstring updated with the new usage line.

**`scripts/tests/test_l10n_toolchain.py`:**
- Added `TestQwenEngine` class with 6 tests: default keep-alive value, env
  override, blank-env-var fallback, invalid format rejection, integer seconds
  acceptance, and connection-error swallowing in `unload()`.

### What was NOT changed

Per the bug report's scope note, no daemon lifecycle management was added. This
engine does not start, stop, or kill Ollama — it only talks to an already-running
instance. The `unload()` call evicts the model from memory; it does not terminate
the Ollama process.

### Test results

All 6 new tests pass. 17/17 targeted tests pass (TestQwenEngine, TestEngines,
TestAuditSync). The 3 pre-existing failures in `TestProvenance` and `TestScopes`
are unrelated (NLLB quality classification, from prior uncommitted work).
