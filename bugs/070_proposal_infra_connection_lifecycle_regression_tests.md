# PROPOSAL: Regression tests for the connection-lifecycle races the current suite cannot see

**Status: Open**

<!-- Status values: Open → Accepted → In Progress → Closed -->
<!-- Use "Declined" if rejected, with rationale in the Decision section -->

Created: 2026-09-02
Type: Tooling
Related diagnostics: n/a — test-coverage gap in `extension/src/test/`

---

## Summary

Four connection-lifecycle bugs filed on 2026-09-02 all survived a large,
otherwise healthy test suite for the same structural reason: every existing test
drives its subject through a *settled* state machine — start, resolve, assert —
and none drives a transition **while a request is in flight**. Add a small set of
in-flight-transition tests, plus assertions on request headers and non-OK
responses, so this class of bug fails in CI instead of in a user's session.

---

## Motivation

The suite is not thin. `server-discovery.test.ts` has 20 cases including the
flaky-link flap latch; `server-manager.test.ts` has 15; `panel.test.ts` has 22
including a `_loadSeq` race guard. Yet all four of the following passed CI:

| Bug | Why the suite missed it |
| --- | --- |
| `infra_generation_longpoll_timeout_shorter_than_server.md` (fixed, archived to `plans/history/2026.09/20260902/`) | `generation-watcher.test.ts` stubs `client.generation` to resolve immediately, so the 8 s-vs-30 s timeout mismatch is invisible. No test asserts the `timeoutMs` an endpoint sends. |
| `028_infra_generation_watcher_duplicate_poll_chain.md` | `generation-watcher.test.ts` has start/stop/backoff/dispose cases, but none calls `stop()` while a poll is awaiting. |
| `029_infra_discovery_resume_forks_second_scan_chain.md` | `server-discovery.test.ts` has `'should not run further scans while paused'` but never resumes mid-scan. |
| `030_infra_server_manager_stale_active_after_dismissed_quickpick.md` | `server-manager.test.ts` covers "active dies, 1 remains" but never "active dies, 2+ remain, user dismisses". |
| `027_infra_panel_webview_load_ignores_auth_and_http_status.md` | `panel.test.ts` stubs `fetch` to resolve OK; nothing asserts on request headers or a non-OK status. |

The common shape is a **superseding transition during an await**. The
`ServerDiscovery._pollId` and `DriftViewerPanel._loadSeq` guards exist precisely
because this class of bug has bitten before — but only `_loadSeq` has a test
(`'should discard stale fetch when server switches rapidly (race condition
guard)'`), and that one test is the template the rest of the suite should copy.

---

## Detection / Behavior

A deferred-promise helper is all the infrastructure needed: resolve the
subject's network call *after* the transition under test, then assert.

### Should flag (problematic)

Each case below must FAIL against the pre-fix code and pass after.

```ts
// extension/src/test/test-helpers/deferred.ts
export function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
```

**1. GenerationWatcher — stop/start during an in-flight poll must not fork a chain**

```ts
it('discards a poll from a retired session and does not fork a second chain', async () => {
  const d = deferred<number>();
  let calls = 0;
  const client = { generation: () => { calls++; return calls === 1 ? d.promise : Promise.resolve(1); } };
  const w = new GenerationWatcher(client as never);
  const fired: number[] = [];
  w.onDidChange(() => fired.push(Date.now()));

  w.start();                       // chain A begins, awaits d.promise
  w.stop(); w.reset(); w.start();  // the server-switch sequence
  d.resolve(47);                   // chain A's stale result lands
  await flushMicrotasks();

  assert.strictEqual(fired.length, 0, 'stale generation from the old server must not fire listeners');
  await advanceTimers(5000);
  assert.ok(calls <= 6, `one chain at 1s cadence, got ${calls} calls — chain forked`);
});
```

**2. ServerDiscovery — resume during an in-flight scan must not double the rate**

```ts
it('does not fork a second scan chain when resumed mid-scan', async () => {
  const d = deferred<number[]>();
  const scans: number[] = [];
  // stub scanPorts: first call hangs on d.promise, later calls resolve []
  discovery.start();
  discovery.pause();
  discovery.resume();              // before the first scan settles
  d.resolve([]);
  await advanceTimers(SEARCH_INTERVAL * 3);
  assert.strictEqual(scans.length, 3, `expected 3 scans in 3 intervals, got ${scans.length}`);
});
```

**3. ServerManager — a dismissed replacement QuickPick must not leave a dead active**

```ts
it('clears the active server when the replacement pick is dismissed', async () => {
  vscodeMock.window.showQuickPick = async () => undefined;   // user pressed Esc
  discovery.emitServers([{ port: 8642 }, { port: 8643 }, { port: 8644 }]);
  manager.selectServerForTest(8642);
  discovery.emitServers([{ port: 8643 }, { port: 8644 }]);   // 8642 dies
  await flushMicrotasks();
  assert.ok(
    manager.activeServer === undefined
      || manager.servers.some((s) => s.port === manager.activeServer!.port),
    'active server must never name a port discovery has removed',
  );
});
```

**4. Panel — auth header sent, non-OK status surfaced**

```ts
it('sends the Bearer header to a loopback server when a token is configured', async () => {
  cfgMock.set('authToken', 's3cret');
  let seen: Record<string, string> | undefined;
  fetchMock = (_url, init) => { seen = init?.headers; return okHtml(); };
  DriftViewerPanel.createOrShow('127.0.0.1', 8642);
  await flushMicrotasks();
  assert.strictEqual(seen?.Authorization, 'Bearer s3cret');
});

it('does NOT send the Bearer header to a non-loopback host (audit H4)', async () => { … });

it('renders the error page, not the response body, on a 401', async () => {
  fetchMock = () => new Response('{"error":"unauthorized"}', { status: 401 });
  DriftViewerPanel.createOrShow('127.0.0.1', 8642);
  await flushMicrotasks();
  assert.ok(panelMock.webview.html.includes('Cannot connect'));
  assert.ok(!panelMock.webview.html.includes('unauthorized'));
});
```

**5. Endpoint timeout contract — the class of bug that started this list**

```ts
it('gives every long-poll endpoint a timeout longer than the server window', async () => {
  // Assert on the init passed to fetchWithTimeout for /api/generation and
  // /api/mutations. Both must exceed ServerConstants.longPollTimeout (30s).
  for (const [name, call] of [['generation', httpGeneration], ['mutations', httpMutations]]) {
    const init = await captureInit(() => call(base, {}, 0));
    assert.ok((init.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS) > 30_000,
      `${name} long-poll would abort before the server answers`);
  }
});
```

### Should pass (correct)

The 57 existing cases across the three files must be untouched — these are
additive. In particular the flaky-link contracts in `server-discovery.test.ts`
(`'should warn at most once per session no matter how many times it flaps'`,
`'auto-recovery retry (resetNotifyLatch:false) must not re-announce on a flap'`)
must keep passing, since the `pause()` epoch fix touches the same class.

---

## Edge Cases

1. **Fake timers vs. real awaits** — needs discussion. The suite currently uses
   real short delays in places (`server-discovery.test.ts` advances via awaited
   sleeps). The in-flight tests need deterministic control of *both* the timer
   and the promise; a shared `advanceTimers` helper built on the existing mock
   is preferable to introducing a new fake-timer library (a new dev dependency
   is a blast-radius decision — see **drift-advisor-change-control**).
2. **`Response` availability in the mocha environment** — should flag. The panel
   tests stub `fetch` with plain objects today; case 4 needs `resp.ok` and
   `resp.status`, so the stub shape must gain those fields rather than switching
   to a real `Response`.
3. **Asserting on scan counts** — should pass with care. Assert on a *count over
   a window*, never on wall-clock timing, or the test is flaky in CI.
4. **`captureInit` for case 5** — should pass. Requires exporting a seam or
   spying on the `fetchWithTimeout` module; a module-level spy is enough and
   avoids changing production signatures.
5. **Mocha spec scoping** — the repo's testing skill notes that a careless run
   executes the whole suite. These files should be runnable individually
   (`--spec extension/out/test/generation-watcher.test.js`) so a fix agent can
   iterate without a full-suite run.

---

## Alternatives Considered

- **Integration test against a live Dart server.** Would have caught the
  long-poll timeout mismatch directly, and nothing else on this list. Slow,
  needs a Dart toolchain in CI, and cannot easily hold a request in flight at a
  chosen instant. Rejected as the primary approach; possibly worth one smoke
  test for the endpoint-timeout contract.
- **A lint rule for "async work started in a sync `dispose()`" and
  "discarded `Disposable`".** Cheap and would catch two of the sibling reports
  (`054_infra_host_manifest_survives_deactivation.md`,
  `055_infra_activation_event_subscriptions_discarded.md`) — but catches none of the
  in-flight races. Complementary, not a substitute; worth filing separately.
- **A shared `PollingSession` base class** encapsulating the `_pollId` epoch
  pattern, so `ServerDiscovery`, `GenerationWatcher` and any future poller get
  the guard by construction. Attractive, and arguably the real fix — but it is a
  refactor of live connection code and should follow the tests, not precede
  them. Worth a separate proposal once these tests exist to protect the change.

---

## Decision

<!-- Fill in when the proposal is accepted or declined -->

---

## Implementation Notes

<!-- Fill in when work begins -->

Suggested order (each step leaves the suite green):

1. Add `extension/src/test/test-helpers/deferred.ts` and an `advanceTimers`
   helper alongside the existing mocks.
2. Case 5 first — it is the cheapest and guards the endpoint-timeout contract
   for every future long-poll.
3. Cases 1 and 2 — they share the deferred-promise shape and both correspond to
   open bugs, so they double as the regression tests those fixes require under
   `ISSUE_REPORT_GUIDE.md` § Fix Requirements.
4. Cases 3 and 4 — plain behavioral tests, no timer control needed.

---

## Commits

<!-- Add commit hashes as implementation lands -->
