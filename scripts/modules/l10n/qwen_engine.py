# -*- coding: utf-8 -*-
"""Offline Qwen 2.5 7B translation engine via Ollama (local HTTP API).

The PRIMARY runtime translation engine, replacing NLLB. Qwen runs locally via
Ollama's OpenAI-compatible chat completions endpoint (`/v1/chat/completions`),
producing materially better output than NLLB-200 while still being fully offline
(no cloud API key, no spend). NLLB remains as a fallback when Ollama is not
running or the model is not pulled.

Prerequisites (one-time):
    1. Install Ollama: https://ollama.com/download
    2. Pull the model: ollama pull qwen2.5:7b

Environment overrides:
    SAROPA_QWEN_TIMEOUT       per-string wall-clock cap in seconds (default 90,
                              clamped [15, 600])
    SAROPA_SKIP_QWEN=1        disable Qwen entirely (fall back to NLLB/Google)
    OLLAMA_HOST               Ollama base URL (default http://localhost:11434)
"""

import json
import os
import re
import sys
import threading
import urllib.error
import urllib.request

_MODEL = "qwen2.5:7b"
_DEFAULT_TIMEOUT_SEC = 90.0

# Tokens that must survive translation intact — masked to __PHn__ before the model
# sees the text, then restored after. Two families:
#   {0}, {count}, {name}  — runtime format placeholders
#   <B0>, <B1>, …         — brand-shield placeholders injected by brands.shield_brands()
# Without masking <Bn>, the model drops or translates the angle-bracket token and
# validate_brands() rejects the result ("brand mangled" → wrote 0 translations).
_FORMAT_PH = re.compile(r"\{[^}]*\}|<B\d+>")

# Circuit breaker: after this many consecutive hard failures (connection refused,
# timeouts), Qwen is paused for _COOLDOWN_KEYS translations. A single successful
# round-trip resets the streak.
_FAILURE_THRESHOLD = 6
_COOLDOWN_KEYS = 40

_state_lock = threading.Lock()
_consecutive_failures = 0
_cooldown_remaining = 0
_cooldown_active = False


class QwenUnavailable(RuntimeError):
    """Raised when Qwen/Ollama cannot be reached or the model is not pulled."""


def _ollama_base() -> str:
    """Ollama HTTP base URL, honoring the standard OLLAMA_HOST env var."""
    return os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")


def _read_timeout() -> float:
    """Per-string deadline from env, clamped to [15, 600] seconds."""
    raw = os.environ.get("SAROPA_QWEN_TIMEOUT", "").strip()
    try:
        value = float(raw) if raw else _DEFAULT_TIMEOUT_SEC
    except ValueError:
        value = _DEFAULT_TIMEOUT_SEC
    return max(15.0, min(value, 600.0))


def _check_circuit_breaker() -> bool:
    """Return True if Qwen is available (breaker closed or cooldown expired).

    When the breaker trips after _FAILURE_THRESHOLD consecutive failures, Qwen
    is paused for _COOLDOWN_KEYS calls. Each call during cooldown decrements the
    counter; when it reaches zero the breaker resets and one probe call is
    allowed through to test recovery.
    """
    global _cooldown_remaining, _cooldown_active
    with _state_lock:
        if not _cooldown_active:
            return True
        _cooldown_remaining -= 1
        if _cooldown_remaining <= 0:
            _cooldown_active = False
            _cooldown_remaining = 0
            return True
        return False


def _record_success() -> None:
    """Reset the failure streak and close the breaker."""
    global _consecutive_failures, _cooldown_active, _cooldown_remaining
    with _state_lock:
        _consecutive_failures = 0
        _cooldown_active = False
        _cooldown_remaining = 0


def _record_failure() -> None:
    """Count a failure; trip the breaker at threshold."""
    global _consecutive_failures, _cooldown_active, _cooldown_remaining
    with _state_lock:
        _consecutive_failures += 1
        if _consecutive_failures >= _FAILURE_THRESHOLD and not _cooldown_active:
            _cooldown_active = True
            _cooldown_remaining = _COOLDOWN_KEYS
            sys.stderr.write(
                f"[qwen] Circuit breaker tripped after {_consecutive_failures} "
                f"consecutive failures — pausing for {_COOLDOWN_KEYS} keys.\n"
            )
            sys.stderr.flush()


def diagnose() -> tuple[str, str, str]:
    """Check Qwen prerequisites and return (status, summary, fix).

    The three-tuple gives the CLI everything it needs for actionable feedback:
      status  — one of "ready", "disabled", "no_server", "no_model"
      summary — one-line human description of the current state
      fix     — copy-paste-ready instruction to resolve (empty when ready)
    """
    if os.environ.get("SAROPA_SKIP_QWEN", "").strip() == "1":
        return (
            "disabled",
            "Qwen disabled via SAROPA_SKIP_QWEN=1 environment variable.",
            "Unset the SAROPA_SKIP_QWEN environment variable to re-enable.",
        )

    base = _ollama_base()
    url = f"{base}/api/tags"
    req = urllib.request.Request(url, method="GET")

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
    except urllib.error.URLError:
        return (
            "no_server",
            f"Ollama is not running (no response from {base}).",
            "Install Ollama from https://ollama.com/download, then start it.\n"
            "  On Windows: the Ollama app runs as a system tray icon after install.\n"
            "  Verify with: ollama list",
        )
    except Exception:
        return (
            "no_server",
            f"Ollama is not reachable at {base}.",
            "Install Ollama from https://ollama.com/download, then start it.\n"
            "  If Ollama is on a non-default host, set OLLAMA_HOST=http://host:port",
        )

    models = [m.get("name", "") for m in data.get("models", [])]
    model_family = _MODEL.split(":")[0]
    if not any(model_family in m for m in models):
        # Ollama is running but the model is not pulled. List what IS available
        # so the operator can see whether it's a typo or a missing pull.
        available = ", ".join(models) if models else "(none)"
        return (
            "no_model",
            f"Ollama is running but {_MODEL} is not pulled.",
            f"Pull the model: ollama pull {_MODEL}\n"
            f"  Currently available models: {available}",
        )

    return ("ready", f"Qwen 2.5 7B ready via Ollama ({base}).", "")


def is_available() -> bool:
    """True when Qwen can be used: not disabled, Ollama running, model pulled.

    Delegates to diagnose() — use diagnose() directly when you need the reason.
    """
    status, _, _ = diagnose()
    return status == "ready"


def _mask_placeholders(text: str) -> tuple[str, dict[str, str]]:
    """Replace {0}/{count} placeholders with __PHn__ tokens for safe round-trip."""
    tokens: dict[str, str] = {}
    counter = 0

    def repl(match: re.Match[str]) -> str:
        nonlocal counter
        token = f"__PH{counter}__"
        tokens[token] = match.group(0)
        counter += 1
        return token

    return _FORMAT_PH.sub(repl, text), tokens


def _unmask(text: str, tokens: dict[str, str]) -> str:
    """Restore masked format placeholders."""
    for token, original in tokens.items():
        text = text.replace(token, original)
    return text


def _strip_wrapper_quotes(text: str) -> str:
    """Strip one matched pair of surrounding quotes the model sometimes adds."""
    if len(text) >= 2:
        if (text[0] == '"' and text[-1] == '"') or (text[0] == "'" and text[-1] == "'"):
            return text[1:-1]
    return text


def _translate_via_ollama(text: str, target_locale: str) -> str | None:
    """Send one string to Ollama's OpenAI-compatible chat endpoint.

    Returns the translated string, or None on any failure (timeout, connection
    refused, echo, empty response). Never raises — the caller decides whether
    to fall back to NLLB/Google.
    """
    # The prompt mirrors the contacts project's proven template: context about the
    # app domain, strict output rules, placeholder preservation.
    prompt = (
        "Context: A developer tool extension for analyzing SQLite database drift "
        "in Flutter projects. The extension helps developers compare schema versions, "
        "identify migration issues, and maintain database consistency. "
        "Tone should be professional and technical.\n\n"
        "Task: Translate the following English UI text string into the language "
        f"code '{target_locale}'.\n\n"
        "Strict Rules:\n"
        "1. Return ONLY the translated string output.\n"
        "2. Do NOT include explanations, introduction, markdown notation, "
        "or surrounding quotes.\n"
        "3. Preserve all message placeholder tokens like {name} or {count} exactly.\n\n"
        f"Text: {text}"
    )

    payload = json.dumps({
        "model": _MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "stream": False,
        "keep_alive": "30m",
    }).encode("utf-8")

    url = f"{_ollama_base()}/v1/chat/completions"
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    timeout = _read_timeout()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read())
        choices = body.get("choices", [])
        if not choices:
            return None
        content = choices[0].get("message", {}).get("content", "").strip()
        if not content:
            return None
        content = _strip_wrapper_quotes(content)
        # Reject echo — the model returned the input unchanged.
        if content.strip() == text.strip():
            return None
        return content
    except Exception:
        return None


class QwenTranslator:
    """Per-locale translator backed by Qwen 2.5 7B via Ollama.

    Constructed per target locale (mirrors `NllbTranslator(locale)`). The
    constructor probes Ollama availability; raises `QwenUnavailable` if the
    service is not reachable so the caller can fall back to NLLB/Google.
    """

    def __init__(self, locale: str) -> None:
        status, summary, _ = diagnose()
        if status != "ready":
            raise QwenUnavailable(summary)
        self._locale = locale

    def translate(self, text: str) -> str | None:
        """Translate one string. Returns the translation, or None on a miss.

        None covers timeout, connection error, echo, and empty response. The
        caller maps a None result to "try NLLB fallback" or "keep English",
        matching the NllbTranslator contract.
        """
        plain = (text or "").strip()
        if not plain:
            return None
        if not _check_circuit_breaker():
            return None
        masked, tokens = _mask_placeholders(plain)
        result = _translate_via_ollama(masked, self._locale)
        if result is None:
            _record_failure()
            return None
        _record_success()
        return _unmask(result, tokens)


def cache_hint() -> str:
    """Operator-facing one-liner explaining how to enable Qwen when it's off.

    Thin wrapper around diagnose() — use diagnose() directly when you need the
    structured (status, summary, fix) tuple for richer CLI output.
    """
    status, summary, fix = diagnose()
    if status == "ready":
        return summary
    # Collapse the multi-line fix into a single-line hint for contexts that
    # only have room for one line (e.g. log messages).
    one_line_fix = fix.split("\n")[0].strip() if fix else ""
    return f"{summary} {one_line_fix}".strip()
