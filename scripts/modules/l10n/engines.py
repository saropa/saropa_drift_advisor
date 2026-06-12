# -*- coding: utf-8 -*-
"""Translation engines — NLLB (offline) + Google fallback (plan 75 §4 "Engines").

GATED. Nothing here runs during `audit` or `sync`. `translate_one` refuses unless
the caller passes `authorized=True`, which only the deliberate, operator-run
`translate` action sets after an explicit confirmation (plan 75 §7: never translate
unattended). Engine model imports are lazy so importing this module — which the CLI
always does — never pulls in `deep_translator` or a multi-GB NLLB model.

Network safeguards live in [CircuitBreaker]: after N consecutive failures the
breaker opens and further calls fail fast instead of hammering a dead endpoint. The
breaker is pure (no I/O) and unit-tested; the actual MT calls are not exercised in
this repo's tests (and never run here).
"""

ENGINE_NLLB = "nllb"
ENGINE_GOOGLE = "google"


class TranslationNotAuthorizedError(RuntimeError):
    """Raised when a translate call is attempted without explicit authorization."""


class CircuitOpenError(RuntimeError):
    """Raised when the circuit breaker is open after too many consecutive failures."""


class CircuitBreaker:
    """Fail-fast guard around a flaky network engine.

    Counts CONSECUTIVE failures; at `threshold` it opens and every subsequent
    `check()` raises `CircuitOpenError` until a success resets it. A single success
    anywhere clears the streak — transient blips never trip it, a sustained outage
    does. Pure in-memory state, so it is deterministic and unit-testable.
    """

    def __init__(self, threshold: int = 5) -> None:
        if threshold < 1:
            raise ValueError("threshold must be >= 1")
        self.threshold = threshold
        self.consecutive_failures = 0
        self.opened = False

    def check(self) -> None:
        """Raise `CircuitOpenError` if the breaker has tripped."""
        if self.opened:
            raise CircuitOpenError(
                f"circuit open after {self.consecutive_failures} consecutive failures"
            )

    def record_success(self) -> None:
        """Reset the failure streak (and re-close the breaker)."""
        self.consecutive_failures = 0
        self.opened = False

    def record_failure(self) -> None:
        """Count a failure; open the breaker once the threshold is reached."""
        self.consecutive_failures += 1
        if self.consecutive_failures >= self.threshold:
            self.opened = True


def nllb_model_is_cached() -> bool:
    """True only if an NLLB model is already on disk — never triggers a download.

    Lazy + defensive: any import or lookup error means "not cached", so the caller
    silently falls back to Google rather than risk a multi-GB surprise download
    (plan 75 §4). This is a probe, not a load.
    """
    try:  # pragma: no cover - environment-dependent, not exercised in tests
        from pathlib import Path
        import os

        hub = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface"))
        if not hub.exists():
            return False
        return any("nllb" in p.name.lower() for p in hub.rglob("*") if p.is_dir())
    except Exception:
        return False


def translate_one(
    text: str,
    target_locale: str,
    *,
    authorized: bool,
    breaker: CircuitBreaker,
    prefer_nllb: bool = True,
) -> str:
    """Translate one string. GATED — raises unless `authorized=True`.

    This is the only entry that performs machine translation, and it is never
    called by `audit`/`sync` nor by this repo's tests. The deliberate `translate`
    action sets `authorized=True` after an explicit operator confirmation. The
    engine itself (NLLB when cached, else Google) is imported lazily inside the
    branch so an unauthorized or audit-only run never loads it.
    """
    if not authorized:
        raise TranslationNotAuthorizedError(
            "translate_one called without authorization — the translate pass is "
            "operator-gated (plan 75 §7). No machine translation was performed."
        )
    breaker.check()
    # The concrete engine call (deep_translator / NLLB) is intentionally not wired
    # here: this repo never runs MT. The deliberate translate action supplies the
    # engine binding at call time. Reaching this point unbound is a programming
    # error, surfaced loudly rather than silently returning English.
    raise NotImplementedError(  # pragma: no cover - never run in this repo
        "engine binding not provided — wire the NLLB/Google call in the operator "
        "translate action before running a real translation pass."
    )
