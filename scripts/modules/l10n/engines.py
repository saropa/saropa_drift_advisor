# -*- coding: utf-8 -*-
"""Translation engines — Qwen (primary) + NLLB fallback + Google last resort.

Engine cascade: Qwen 2.5 7B via Ollama (best quality, local, no spend) → NLLB-200
3.3B via CTranslate2 (offline fallback when Ollama is not running) → Google via
deep-translator (network fallback when neither local engine is available).

GATED. Nothing here runs during `audit` or `sync`. `translate_one` refuses unless
the caller passes `authorized=True`, which only the deliberate, operator-run
`translate` action sets after an explicit confirmation (plan 75 §7: never translate
unattended). Engine model imports are lazy so importing this module — which the CLI
always does — never pulls in `deep_translator` or loads a multi-GB model.

Network safeguards live in [CircuitBreaker]: after N consecutive failures the
breaker opens and further calls fail fast instead of hammering a dead endpoint. The
breaker is pure (no I/O) and unit-tested; the actual MT calls are not exercised in
this repo's tests (and never run here).
"""

ENGINE_QWEN = "qwen_2.5_7b_local"
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


def qwen_is_available() -> bool:
    """True when Qwen 2.5 7B is reachable via Ollama — never loads the model.

    Probes Ollama's /api/tags with a 5s timeout to check the model is pulled.
    """
    try:
        from modules.l10n import qwen_engine
        return qwen_engine.is_available()
    except Exception:
        return False


def nllb_model_is_cached() -> bool:
    """True only if the NLLB model is already on disk — never triggers a download.

    Delegates to `nllb_engine.is_available()`, which probes the HF cache (incl. the
    `SAROPA_NLLB_MODEL_DIR` override and the shared `<drive>\\tools\\meta_nllb`
    location) with `local_files_only=True`. A probe, not a load.
    """
    try:
        from modules.l10n import nllb_engine
        return nllb_engine.is_available()
    except Exception:
        return False


# Engine labels stamped into provenance (mirror modules.l10n.provenance).
ENGINE_LABEL_QWEN = "qwen_2.5_7b_local"
ENGINE_LABEL_NLLB = "nllb"
ENGINE_LABEL_GOOGLE = "google"


def make_locale_translator(
    locale: str,
    *,
    authorized: bool,
    breaker: CircuitBreaker,
    prefer_nllb: bool = True,
):
    """Build a per-string translator for `locale` + the engine label it uses.

    GATED — raises `TranslationNotAuthorizedError` unless `authorized=True`.

    Engine cascade (best to worst):
      1. Qwen 2.5 7B via Ollama — best quality, local, no spend.
      2. NLLB-200 3.3B via CTranslate2 — offline fallback when Ollama is down.
      3. Google via deep-translator — network fallback when no local engine works.

    Returns `(translate(text) -> str, engine_label)`. The returned callable
    brand-shields (`<B0>` placeholders) before the engine and restores after,
    records the circuit breaker, and on a Qwen/NLLB miss (None) falls through
    to the next engine rather than returning blank.
    """
    if not authorized:
        raise TranslationNotAuthorizedError(
            "make_locale_translator called without authorization — the translate "
            "pass is operator-gated (plan 75 §7)."
        )

    from modules.l10n.brands import shield_brands, unshield_brands

    qwen = None
    nllb = None
    label = ENGINE_LABEL_GOOGLE

    # Qwen is the primary engine — try it first.
    try:
        from modules.l10n import qwen_engine
        if qwen_engine.is_available():
            qwen = qwen_engine.QwenTranslator(locale)
            label = ENGINE_LABEL_QWEN
    except Exception:
        qwen = None

    # NLLB is the fallback — only load the 3.3B model when Qwen is NOT available.
    # Constructing NllbTranslator loads the full model into GPU memory, so doing it
    # eagerly when Qwen is already handling translation wastes ~2GB VRAM + startup.
    if prefer_nllb and qwen is None:
        try:
            from modules.l10n import nllb_engine
            if nllb_engine.is_available():
                nllb = nllb_engine.NllbTranslator(locale)
                label = ENGINE_LABEL_NLLB
        except Exception:
            nllb = None

    def translate(text: str) -> str:
        breaker.check()
        shielded, replacements = shield_brands(text)
        try:
            # Qwen primary — its circuit breaker is internal (qwen_engine manages
            # its own cooldown), so a None here means "try next engine" not "abort".
            if qwen is not None:
                out = qwen.translate(shielded)
                if out is not None:
                    breaker.record_success()
                    return unshield_brands(out, replacements)

            # NLLB fallback — None means timeout/echo/over-length, not a crash.
            if nllb is not None:
                out = nllb.translate(shielded)
                if out is not None:
                    breaker.record_success()
                    return unshield_brands(out, replacements)
                # NLLB miss → keep English rather than hitting Google.
                breaker.record_success()
                return text

            # Google last resort.
            out = _google_translate(shielded, locale)
            breaker.record_success()
            return unshield_brands(out, replacements)
        except EngineUnavailableError:
            raise
        except Exception:
            breaker.record_failure()
            raise

    return translate, label


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

    Delegates to `make_locale_translator` for the full Qwen → NLLB → Google
    cascade. Brand tokens are shielded before the engine and restored after.
    """
    fn, _ = make_locale_translator(
        target_locale, authorized=authorized, breaker=breaker, prefer_nllb=prefer_nllb,
    )
    return fn(text)
