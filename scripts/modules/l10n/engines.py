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


class EngineUnavailableError(RuntimeError):
    """Raised when no translation engine library is installed/usable."""


# Catalog tag → Google Translate language code. Most match; the regional Chinese
# and Brazilian-Portuguese tags need Google's own spelling.
_GOOGLE_CODE = {
    "pt-br": "pt", "zh-cn": "zh-CN", "zh-tw": "zh-TW",
    "de": "de", "es": "es", "fr": "fr", "it": "it",
    "ja": "ja", "ko": "ko", "ru": "ru",
}


def _google_translate(text: str, target_locale: str) -> str:
    """Translate `text` en→`target_locale` via deep-translator (Google).

    Lazy import so audit/sync never load the library. Network-only — no GPU, so it
    cannot lock the machine the way an NLLB job once did (the reason NLLB stays
    off-by-default). Raises `EngineUnavailableError` if the library is missing.
    """
    try:
        from deep_translator import GoogleTranslator  # lazy
    except ImportError as exc:  # pragma: no cover - env-dependent
        raise EngineUnavailableError(
            "deep-translator is not installed. Run: pip install deep-translator"
        ) from exc
    code = _GOOGLE_CODE.get(target_locale, target_locale)
    return GoogleTranslator(source="en", target=code).translate(text) or text


def translate_one(
    text: str,
    target_locale: str,
    *,
    authorized: bool,
    breaker: CircuitBreaker,
    prefer_nllb: bool = True,
) -> str:
    """Translate one string en→`target_locale`. GATED — raises unless authorized.

    Brand tokens are shielded (`<B0>` placeholders) before the engine call and
    restored after, so the translator can never mangle a brand. NLLB is used only
    when its model is already cached AND not skipped (`SAROPA_SKIP_NLLB`); since the
    NLLB GPU path is what once locked the machine, the safe default is Google
    (network-only). A failed call records against the circuit breaker and re-raises;
    a success resets it.
    """
    if not authorized:
        raise TranslationNotAuthorizedError(
            "translate_one called without authorization — the translate pass is "
            "operator-gated (plan 75 §7). No machine translation was performed."
        )
    breaker.check()

    from modules.l10n.brands import shield_brands, unshield_brands

    shielded, replacements = shield_brands(text)
    try:
        # NLLB intentionally stays unwired unless explicitly built out (GPU risk);
        # the engine is Google. `prefer_nllb` is honored only when a cached model
        # exists, which this probe gates — today that is never, so Google is used.
        import os

        use_nllb = prefer_nllb and nllb_model_is_cached() and not os.environ.get("SAROPA_SKIP_NLLB")
        if use_nllb:  # pragma: no cover - no cached model in this repo
            raise EngineUnavailableError("NLLB path not wired; falling back to Google.")
        out = _google_translate(shielded, target_locale)
        breaker.record_success()
    except EngineUnavailableError:
        raise
    except Exception:
        breaker.record_failure()
        raise
    return unshield_brands(out, replacements)
