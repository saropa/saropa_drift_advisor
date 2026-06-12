# -*- coding: utf-8 -*-
"""Offline NLLB-200-3.3B translation engine (Meta, via CTranslate2) — plan 75 §4.

The PRIMARY runtime translation engine. A single 3.3B model covers 200+ language
pairs offline, never rate-limits, and produces materially better output than the
Google fallback. Exposes `NllbTranslator`, whose `.translate(text)` matches the
`deep_translator.GoogleTranslator` shape so `engines.make_locale_translator` can
swap engines without touching brand-shielding / validation / bundle-merge logic.

Dependencies (install once):
    pip install ctranslate2 sentencepiece huggingface_hub
Model (~7 GB, one-time download — NOT performed by this module):
    JustFrederik/nllb-200-3.3B-ct2-float16

This module NEVER downloads the model. `is_available()` returns False until the
model is already cached on disk; downloading it is a deliberate, separate operator
action (see `cache_hint()`). The cache location honors `SAROPA_NLLB_MODEL_DIR` and
also probes the sibling Saropa pipelines' default `<drive>\\tools\\meta_nllb`, so a
model already downloaded there is reused without a second 7 GB fetch.

Environment overrides:
    SAROPA_SKIP_NLLB=1          disable NLLB entirely (always use Google)
    SAROPA_NLLB_MODEL_DIR=<dir> HF cache dir to look in (default: HF default)
    SAROPA_NLLB_DEVICE=cuda|cpu force device (default: auto-detect)
    SAROPA_NLLB_STRING_TIMEOUT  per-string wall-clock cap in seconds (default 10)
    SAROPA_NLLB_MAX_INPUT_TOKENS source-token gate; 0 disables (default 80)
"""

import os
import re
import sys
import threading
from pathlib import Path

_NLLB_MODEL_ID = "JustFrederik/nllb-200-3.3B-ct2-float16"

_DEFAULT_STRING_TIMEOUT_SEC = 10.0
_DEFAULT_MAX_SOURCE_TOKENS = 80

# Catalog locale code -> NLLB FLORES-200 language identifier (this project's set).
# `_flores_code` falls back to the base subtag for anything not listed exactly.
_FLORES_MAP: dict[str, str] = {
    "de": "deu_Latn",
    "es": "spa_Latn",
    "fr": "fra_Latn",
    "it": "ita_Latn",
    "ja": "jpn_Jpan",
    "ko": "kor_Hang",
    "pt": "por_Latn",
    "pt-br": "por_Latn",
    "ru": "rus_Cyrl",
    "zh": "zho_Hans",
    "zh-cn": "zho_Hans",
    "zh-tw": "zho_Hant",
}

# Masks {0} / {count} format placeholders. NLLB translates/transliterates the word
# inside braces and frequently drops the braces, corrupting runtime substitution.
_FORMAT_PH = re.compile(r"\{[^}]*\}")


class NllbUnavailable(RuntimeError):
    """Raised when the NLLB model cannot be loaded (deps/model/device missing).

    The caller treats this as "fall back to Google", so the message is for the
    operator log only — it never aborts the pipeline.
    """


_translator: object | None = None
_tokenizer: object | None = None
_load_lock = threading.Lock()
_load_failed = False


def _flores_code(locale: str) -> str | None:
    """Map a bundle locale code to its NLLB FLORES-200 identifier, or None."""
    exact = _FLORES_MAP.get(locale.lower())
    if exact:
        return exact
    base = locale.lower().split("-")[0].split("_")[0]
    return _FLORES_MAP.get(base)


def _candidate_cache_dirs() -> list[str | None]:
    """HF cache dirs to probe for the model, in priority order.

    1. `SAROPA_NLLB_MODEL_DIR` when set — explicit override.
    2. `None` — the Hugging Face default cache.
    3. `<drive>\\tools\\meta_nllb` — the sibling Saropa pipelines' default, so a
       model downloaded there (as on this machine) is reused without a 7 GB refetch.
    """
    candidates: list[str | None] = []
    env = os.environ.get("SAROPA_NLLB_MODEL_DIR", "").strip()
    if env:
        candidates.append(env)
    candidates.append(None)
    candidates.append(str(Path(Path(__file__).resolve().anchor) / "tools" / "meta_nllb"))
    return candidates


def _resolve_model_path() -> str | None:
    """Return the cached model snapshot path, or None if not downloaded anywhere.

    Probes each candidate cache dir with `local_files_only=True` so this NEVER
    triggers a 7 GB download — a miss everywhere returns None and the caller falls
    back to Google.
    """
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        return None
    for cache_dir in _candidate_cache_dirs():
        try:
            return snapshot_download(
                repo_id=_NLLB_MODEL_ID, cache_dir=cache_dir, local_files_only=True,
            )
        except Exception:  # a miss here means "try the next dir"
            continue
    return None


_cuda_dll_dirs_registered = False


def _register_cuda_dll_dirs() -> None:
    """Put pip-installed NVIDIA CUDA runtime DLLs on the Windows loader path.

    ctranslate2's CUDA build lazy-loads cuBLAS at the first `translate_batch`, but
    the wheel ships cuDNN only — cuBLAS comes from `nvidia-cublas-cu12`, which
    unpacks under `site-packages/nvidia/cublas/bin` without putting it on any
    search path. Since Python 3.8 Windows no longer loads dependent DLLs from PATH,
    so the CUDA device constructs fine but the first inference crashes unless that
    bin dir is registered via `os.add_dll_directory`. No-op off Windows / where the
    wheels are absent — a CPU-only install simply falls through the cascade.
    """
    global _cuda_dll_dirs_registered
    if _cuda_dll_dirs_registered or not hasattr(os, "add_dll_directory"):
        return
    _cuda_dll_dirs_registered = True

    roots: list[Path] = []
    try:
        import ctranslate2
        roots.append(Path(ctranslate2.__file__).resolve().parent.parent)
    except Exception:
        pass
    try:
        import site
        roots.extend(Path(p) for p in site.getsitepackages())
    except Exception:
        pass

    seen: set[str] = set()
    for root in roots:
        for bin_dir in (root / "nvidia").glob("*/bin"):
            key = str(bin_dir)
            if key in seen or not bin_dir.is_dir():
                continue
            seen.add(key)
            os.environ["PATH"] = key + os.pathsep + os.environ.get("PATH", "")
            try:
                os.add_dll_directory(key)
            except OSError:
                continue


def _device_attempts() -> list[tuple[str, str]]:
    """Build the (device, compute_type) cascade: best quality → most portable.

    CUDA float16 is fastest; CPU int8 needs ~4 GB RAM vs float16's ~14 GB so it is
    tried before CPU float16, which commonly OOMs on smaller machines.
    """
    try:
        import ctranslate2
    except ImportError:
        return []
    pref = os.environ.get("SAROPA_NLLB_DEVICE", "auto")
    has_cuda = (
        ctranslate2.get_cuda_device_count() > 0 if pref == "auto" else pref == "cuda"
    )
    attempts: list[tuple[str, str]] = []
    if has_cuda:
        attempts.append(("cuda", "default"))
    attempts.append(("cpu", "int8"))
    attempts.append(("cpu", "default"))
    return attempts


def _try_load_device(model_path: str, sp: object, device: str, compute: str) -> object | None:
    """Load + probe-translate on one device config. Returns translator or None.

    cuBLAS / MKL failures surface only at inference time, so a one-line probe here
    catches a broken device before the real loop. The probe uses a full sentence —
    single tokens trigger NLLB repetition degeneration that looks like a failure.
    """
    import ctranslate2
    try:
        translator = ctranslate2.Translator(
            model_path,
            device=device,
            compute_type=compute,
            inter_threads=min(4, os.cpu_count() or 1) if device == "cpu" else 1,
        )
        probe = sp.Encode("The quick brown fox jumps over the lazy dog.", out_type=str)  # type: ignore[union-attr]
        translator.translate_batch(
            [["eng_Latn"] + probe],
            target_prefix=[["deu_Latn"]],
            beam_size=1,
            max_decoding_length=10,
        )
        return translator
    except (RuntimeError, OSError, MemoryError) as err:
        sys.stderr.write(
            f"[nllb] {device}/{compute} unavailable, trying next fallback: {err}\n"
        )
        return None


def _ensure_model() -> tuple[object, object]:
    """Load the model once (thread-safe) and return (translator, tokenizer).

    Raises `NllbUnavailable` if deps are missing, the model is not cached, or every
    device configuration fails to load.
    """
    global _translator, _tokenizer
    if _translator is not None and _tokenizer is not None:
        return _translator, _tokenizer
    with _load_lock:
        if _translator is not None and _tokenizer is not None:
            return _translator, _tokenizer
        try:
            import sentencepiece
        except ImportError as exc:
            raise NllbUnavailable("ctranslate2 / sentencepiece not installed") from exc
        model_path = _resolve_model_path()
        if not model_path:
            raise NllbUnavailable("NLLB model not cached on disk")
        sp = sentencepiece.SentencePieceProcessor()
        sp.Load(str(os.path.join(model_path, "sentencepiece.bpe.model")))
        _register_cuda_dll_dirs()
        sys.stderr.write(
            "[nllb] Loading NLLB-200-3.3B model (one-time, may take a minute)…\n"
        )
        sys.stderr.flush()
        for device, compute in _device_attempts():
            translator = _try_load_device(model_path, sp, device, compute)
            if translator is not None:
                _translator, _tokenizer = translator, sp
                sys.stderr.write(f"[nllb] Model loaded ({device}/{compute}).\n")
                return _translator, _tokenizer
        global _load_failed
        _load_failed = True
        raise NllbUnavailable("no working device configuration")


def _mask_format_placeholders(text: str) -> tuple[str, dict[str, str]]:
    """Replace {0} / {count} placeholders with copy-through `__PHn__` tokens."""
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
    """Restore masked format placeholders by token replacement."""
    for token, original in tokens.items():
        text = text.replace(token, original)
    return text


def _read_clamped_timeout() -> float:
    """Per-string deadline from env, clamped to [5, 300] seconds."""
    raw = os.environ.get("SAROPA_NLLB_STRING_TIMEOUT", "").strip()
    try:
        value = float(raw) if raw else _DEFAULT_STRING_TIMEOUT_SEC
    except ValueError:
        value = _DEFAULT_STRING_TIMEOUT_SEC
    return max(5.0, min(value, 300.0))


def _read_max_source_tokens() -> int:
    """Source-token gate from env; 0 / negative disables it."""
    raw = os.environ.get("SAROPA_NLLB_MAX_INPUT_TOKENS", "").strip()
    try:
        return int(raw) if raw else _DEFAULT_MAX_SOURCE_TOKENS
    except ValueError:
        return _DEFAULT_MAX_SOURCE_TOKENS


def _translate_batch_with_deadline(
    translator: object,
    source_tokens: list[str],
    target_prefix: list[str],
    deadline_sec: float,
    max_out: int,
) -> object | None:
    """Run `translate_batch` in a daemon thread with a wall-clock cap.

    CTranslate2 has no cancel API; a degenerate input can saturate the decoder for
    minutes. Running in a daemon thread and joining with a deadline lets one bad
    string fall back to English instead of wedging the whole run.
    """
    box: list[object] = []

    def run() -> None:
        try:
            box.append(translator.translate_batch(  # type: ignore[union-attr]
                [source_tokens],
                target_prefix=[target_prefix],
                beam_size=1,
                max_decoding_length=max_out,
                repetition_penalty=1.2,
                no_repeat_ngram_size=3,
            ))
        except Exception as exc:  # surfaced via box on the main thread
            box.append(exc)

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    thread.join(timeout=deadline_sec)
    if thread.is_alive() or not box:
        return None
    item = box[0]
    if isinstance(item, Exception):
        raise item
    return item


def _translate_core(text: str, flores_target: str) -> str | None:
    """Tokenize, translate via CTranslate2, detokenize. None on any failure.

    Greedy decode (beam_size=1) with a repetition penalty and an input-scaled
    decode-length cap — the tuned parameters that avoid beam-search timeouts on
    long low-resource translations.
    """
    translator, tokenizer = _ensure_model()
    source_tokens = ["eng_Latn"] + tokenizer.Encode(text, out_type=str)  # type: ignore[union-attr]
    max_source = _read_max_source_tokens()
    if max_source > 0 and len(source_tokens) > max_source:
        return None
    max_out = max(20, min(len(source_tokens) * 3, 256))
    results = _translate_batch_with_deadline(
        translator, source_tokens, [flores_target], _read_clamped_timeout(), max_out,
    )
    if results is None:
        return None
    output_tokens = results[0].hypotheses[0]  # type: ignore[index]
    if output_tokens and output_tokens[0] == flores_target:
        output_tokens = output_tokens[1:]
    decoded = tokenizer.Decode(output_tokens)  # type: ignore[union-attr]
    cleaned = decoded.strip() if decoded else ""
    if cleaned and cleaned != text.strip():
        return cleaned
    return None


class NllbTranslator:
    """Google-compatible translator backed by offline NLLB-200-3.3B.

    Constructed per target locale (mirrors `GoogleTranslator(target=...)`). The
    constructor forces a model load so a missing model / device fails fast as
    `NllbUnavailable` and the caller can fall back to Google for the whole run.
    """

    def __init__(self, locale: str) -> None:
        flores = _flores_code(locale)
        if not flores:
            raise NllbUnavailable(f"no NLLB FLORES code for locale {locale!r}")
        self._flores = flores
        _ensure_model()

    def translate(self, text: str) -> str | None:
        """Translate one string. Returns the translation, or None on a miss.

        None covers timeout, over-length skip, and echoed-source — the caller maps
        a falsy result to "keep English", so NLLB misses degrade like a rejected
        Google result, never as a network failure.
        """
        plain = (text or "").strip()
        if not plain:
            return None
        masked, tokens = _mask_format_placeholders(plain)
        result = _translate_core(masked, self._flores)
        return _unmask(result, tokens) if result else None


def is_available() -> bool:
    """True when NLLB can be used: not disabled, deps importable, model cached.

    Cheap enough to call before each run. Does NOT load the model or download
    anything — only checks importability and on-disk cache presence.
    """
    if _load_failed or os.environ.get("SAROPA_SKIP_NLLB", "").strip() == "1":
        return False
    try:
        import ctranslate2  # noqa: F401
        import sentencepiece  # noqa: F401
    except ImportError:
        return False
    return _resolve_model_path() is not None


def cache_hint() -> str:
    """Operator-facing one-liner explaining how to enable NLLB when it's off."""
    if os.environ.get("SAROPA_SKIP_NLLB", "").strip() == "1":
        return "NLLB disabled via SAROPA_SKIP_NLLB=1 — using Google Translate."
    try:
        import ctranslate2  # noqa: F401
        import sentencepiece  # noqa: F401
    except ImportError:
        return (
            "NLLB deps missing — using Google. Enable offline translation with: "
            "pip install ctranslate2 sentencepiece huggingface_hub"
        )
    return (
        "NLLB model not cached (~7 GB) — using Google. Download once: "
        f"huggingface-cli download {_NLLB_MODEL_ID}"
    )
