# -*- coding: utf-8 -*-
"""Run-mode actions for the runtime l10n toolchain (plan 75 §4–§5).

Four modes, dispatched by the CLI:
  - `audit`   — classify + report. Pure read, never translates. (plan 75 §5.3)
  - `sync`    — build/align the English baselines. Mechanical, never translates.
  - `import`  — re-import a hand-filled gaps file as `manual` provenance.
  - `translate` — the deliberate, operator-gated MT pass. HARD-GATED here: it
    refuses without `--confirm-translate`, and even when confirmed it stops at the
    unwired engine binding rather than performing machine translation (plan 75 §7).

Each `run_*` returns a process exit code (0 = clean, 1 = gaps/blocked) and prints a
short human summary via the injected `emit` callable, so the module stays testable
and free of direct stdout coupling.
"""

import time
from datetime import datetime
from pathlib import Path
from typing import Callable

from modules.constants import C
from modules.display import ProgressMeter, coverage_color
from modules.l10n import audit, brands, bundles, engines, extract, provenance, scopes, sync
from modules.l10n.provenance import (
    ENGINE_GOOGLE, ENGINE_MANUAL, is_forced_identity, save_provenance,
)

# Repo root resolved from this file (scripts/modules/l10n/actions.py → repo root),
# matching cli.py — used to land the translate logs under reports/<date>/ when the
# caller does not supply an explicit reports directory.
REPO_ROOT = Path(__file__).resolve().parents[3]

Emit = Callable[[str], None]
# A pluggable translator: (english, locale) -> translated. Injected in tests so no
# network call is ever made; the default binding calls the real engine.
Translator = Callable[[str, str], str]


def run_audit_action(
    emit: Emit,
    reports_dir: Path,
    timestamp: str,
    locales: list[str] | None = None,
    fail_on_gaps: bool = False,
) -> int:
    """Audit + write a report. Returns 1 only when `fail_on_gaps` and gaps exist."""
    report = audit.run_audit(locales)
    path = audit.write_report(report, reports_dir, timestamp)

    emit(f"Runtime l10n audit — {report['source_keys']} source keys "
         f"({report['host_keys']} host + {report['web_keys']} web).")
    if report["english_only"]:
        emit("English-only — no locale bundles on disk; nothing to translate.")
    else:
        for loc in report["locales"]:  # type: ignore[union-attr]
            pct = loc["coverage_pct"]
            emit(
                f"  {C.BOLD}{loc['locale']:>6}{C.RESET}: "
                f"{coverage_color(pct)}{pct:5.1f}%{C.RESET}  "
                f"missing={loc['missing']} untranslated={loc['untranslated']} "
                f"translated={loc['translated']} "
                f"(hi={loc['high_quality']} lo={loc['low_quality']}) "
                f"orphans={loc['orphans']}"
            )
    emit(f"Report: {C.WHITE}{path}{C.RESET}")

    if fail_on_gaps and audit.has_gaps(report):
        emit("Gaps present (missing / untranslated / brand-mangled keys).")
        return 1
    return 0


def run_sync_action(emit: Emit, dry_run: bool = False) -> int:
    """Build the host base bundle + align locale bundles. Never translates."""
    report = sync.run_sync(dry_run=dry_run)
    base = report["base_bundle"]
    verb = "Would build" if dry_run else "Built"
    emit(f"{verb} host base bundle {base['path']} ({base['entries']} entries).")
    aligned = report["aligned"]  # type: ignore[index]
    if not aligned:
        emit("No locale bundles on disk to align (English-only).")
    for a in aligned:
        emit(
            f"  {a['surface']:>4} {a['locale']:>6}: present={a['present']} "
            f"missing={a['missing']} orphans_pruned={a['orphans_pruned']}"
        )
    return 0


def run_import_action(
    emit: Emit,
    import_file: Path,
    locale: str,
    is_web: bool,
) -> int:
    """Merge a hand-filled `{key/value: translation}` file into a locale bundle.

    Records `manual` provenance for every imported symbolic key. The import file
    must match the target bundle's keying (symbolic-key for web, English-value for
    host). Returns 1 when the file is missing or unparseable.
    """
    import json

    if not import_file.exists():
        emit(f"Import file not found: {import_file}")
        return 1
    try:
        incoming = json.loads(import_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        emit(f"Could not read import file: {exc}")
        return 1
    if not isinstance(incoming, dict) or not incoming:
        emit("Import file is empty or not a JSON object.")
        return 1

    path = (bundles.web_locale_bundle_path(locale) if is_web
            else bundles.host_locale_bundle_path(locale))
    merged = bundles.load_json(path)
    merged.update({k: str(v) for k, v in incoming.items() if str(v).strip()})
    bundles.write_json_atomic(path, merged)

    # Provenance is symbolic-key-keyed. For web the import keys ARE symbolic keys;
    # for host they are English values, which we cannot map back to keys here, so
    # provenance is recorded only for the web surface (host manual edits are still
    # written to the bundle, just not provenance-stamped).
    if is_web:
        save_provenance(locale, {k: ENGINE_MANUAL for k in incoming})
    emit(f"Imported {len(incoming)} entries into {path} (provenance: manual).")
    return 0


def _translated_by_key(
    locale: str,
    source_host: dict[str, str],
    source_web: dict[str, str],
) -> dict[str, str]:
    """Adapt both per-surface locale bundles into one symbolic-key → value map."""
    web = bundles.load_json(bundles.web_locale_bundle_path(locale))
    host = bundles.load_json(bundles.host_locale_bundle_path(locale))
    out: dict[str, str] = {k: web[k] for k in source_web if k in web}
    for key, english in source_host.items():
        if english in host:
            out[key] = host[english]
    return out


def _translate_with_retry(
    per_string_fn: Callable[[str], str],
    text: str,
    throttle: float,
    attempts: int = 2,
) -> str:
    """Call the locale-bound translator with a small throttle and one backoff retry.

    `EngineUnavailableError` is fatal (no point retrying a missing library) and
    propagates immediately; transient/network errors get one backoff retry before
    the last exception is re-raised.
    """
    last: Exception | None = None
    for i in range(attempts):
        try:
            if throttle:
                time.sleep(throttle)
            return per_string_fn(text)
        except engines.EngineUnavailableError:
            raise
        except Exception as exc:  # network blip / rate limit / circuit
            last = exc
            time.sleep(0.5 * (i + 1))
    assert last is not None
    raise last


class _TranslateLogger:
    """Paired human-readable logs for one translate pass: a success log and an
    error log, both under reports/<date>/.

    The success log records every shipped value; the error log records every key
    that was NOT shipped — a brand-mangled result that was dropped, or an engine
    failure that aborted a locale. Both files are created up front (with a header)
    so the reported paths always resolve: an empty error log is positive evidence of
    a clean run, not a missing file.
    """

    def __init__(self, log_path: Path, error_path: Path) -> None:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        self.log_path = log_path
        self.error_path = error_path
        self.error_count = 0
        self._log = open(log_path, "w", encoding="utf-8")  # noqa: SIM115
        self._err = open(error_path, "w", encoding="utf-8")  # noqa: SIM115
        self._log.write(
            "# Translation log — shipped values  (locale  key :: english -> translated)\n"
        )
        self._err.write(
            "# Translation error log — dropped or failed keys  (locale  key :: reason)\n"
        )

    def translated(self, locale: str, key: str, english: str, value: str) -> None:
        self._log.write(f"[{locale}] {key} :: {english!r} -> {value!r}\n")

    def dropped(self, locale: str, key: str, english: str, reason: str) -> None:
        self.error_count += 1
        self._err.write(f"[{locale}] {key} :: {english!r} -> {reason}\n")

    def close(self) -> None:
        for handle in (self._log, self._err):
            try:
                handle.close()
            except Exception:
                pass


def run_translate_action(
    emit: Emit,
    locales: list[str],
    scope: str,
    confirmed: bool,
    translate_fn: Translator | None = None,
    throttle: float = 0.2,
    reports_dir: Path | None = None,
    timestamp: str | None = None,
) -> int:
    """The deliberate translate pass — operator-gated (plan 75 §7).

    Refuses without explicit confirmation and a named locale set. When confirmed,
    translates the selected scope keys per locale through `translate_fn` (default:
    the real Google engine via `engines.translate_one`; tests inject a fake so no
    network call is made), writing BOTH the web (`web.<locale>.json`, key-keyed) and
    host (`bundle.l10n.<locale>.json`, English-value-keyed) bundles atomically after
    each locale — so a CTRL-C is a resumable pause, not a loss. Brand-mangled
    results are dropped (the key stays English) rather than shipped. Provenance is
    recorded so a later upgrade pass can find weak output.

    Each locale renders a live progress bar with a words-per-minute rate and ETA,
    and every key is journaled: shipped values to reports/<date>/<stamp>_translate.log
    and dropped/failed keys to the sibling ..._translate_errors.log, whose paths are
    printed at the end (even on an early abort).
    """
    if not confirmed or not locales:
        emit("REFUSED: the translate pass is operator-gated and never runs "
             "unattended (plan 75 §7).")
        emit("It requires BOTH explicit confirmation AND a named locale list, e.g.:")
        emit("  python scripts/translate_l10n.py --run-mode translate "
             "--locales de,fr --scope gaps --confirm-translate")
        return 1

    source_host = extract.extract_host()
    source_web = extract.extract_web()
    source = {**source_host, **source_web}
    web_keys = set(source_web)

    # Per-locale translator factory → (translate(text)->str, engine_label). The
    # default picks NLLB-200 when cached, else Google. A test-injected translate_fn
    # (english, locale)->str is wrapped as a Google-labelled factory so no engine
    # loads and no network call is made.
    if translate_fn is not None:
        def factory(loc: str):
            return (lambda text: translate_fn(text, loc)), ENGINE_GOOGLE
    else:
        breaker = engines.CircuitBreaker()

        def factory(loc: str):
            return engines.make_locale_translator(loc, authorized=True, breaker=breaker)

    # Resolve where the run's two logs land. The wall clock is read here (not in a
    # deterministic helper) only when the caller hasn't already supplied a dated
    # folder + stamp, so both the menu path and a direct --run-mode call get logs.
    if reports_dir is None or timestamp is None:
        now = datetime.now()
        reports_dir = reports_dir or (REPO_ROOT / "reports" / now.strftime("%Y%m%d"))
        timestamp = timestamp or now.strftime("%Y%m%d_%H%M%S")
    logger = _TranslateLogger(
        reports_dir / f"{timestamp}_translate.log",
        reports_dir / f"{timestamp}_translate_errors.log",
    )

    grand_total = 0
    try:
        for locale in locales:
            web_bundle = bundles.load_json(bundles.web_locale_bundle_path(locale))
            host_bundle = bundles.load_json(bundles.host_locale_bundle_path(locale))
            existing = _translated_by_key(locale, source_host, source_web)
            prov_existing = provenance.load_provenance(locale)
            keys = sorted(scopes.select_keys(scope, source, existing, locale, prov_existing))

            try:
                per_string_fn, engine_label = factory(locale)
            except engines.TranslationNotAuthorizedError:
                emit("REFUSED: translation is operator-gated (plan 75 §7).")
                return 1

            # Pre-filter to the keys whose correct value is genuinely a translation
            # (brands / acronyms / pure symbols keep their English form and are
            # skipped). The progress denominator AND the per-locale word total are
            # taken from THIS list, so the bar reaches 100% exactly when the real
            # work is done and the ETA is computed against translatable words only.
            translatable = [k for k in keys if not is_forced_identity(source[k], locale)]
            total_words = sum(len(source[k].split()) for k in translatable)
            emit(
                f"  {C.BOLD}{locale}{C.RESET}: translating "
                f"{C.CYAN}{len(translatable)}{C.RESET} keys "
                f"{C.DIM}({total_words} words){C.RESET} via "
                f"{C.MAGENTA}{engine_label}{C.RESET} (scope={scope})…"
            )

            meter = ProgressMeter(locale, len(translatable), total_words)
            prov_updates: dict[str, str] = {}
            done = 0
            processed = 0
            processed_words = 0  # drives the WPM rate / ETA (counts work, not just ships)
            aborted = False
            try:
                for key in translatable:
                    english = source[key]
                    value = _translate_with_retry(per_string_fn, english, throttle)
                    processed += 1
                    processed_words += len(english.split())
                    if brands.validate_brands(english, value):
                        # Dropped a brand — keep English, don't ship mangled; record it.
                        logger.dropped(locale, key, english, "DROPPED (brand mangled)")
                    else:
                        if key in web_keys:
                            web_bundle[key] = value
                        else:
                            host_bundle[source_host[key]] = value
                        prov_updates[key] = engine_label
                        logger.translated(locale, key, english, value)
                        done += 1
                    meter.update(processed, processed_words)
            except engines.EngineUnavailableError as exc:
                logger.dropped(locale, "—", "—", f"ENGINE UNAVAILABLE ({exc})")
                emit(f"  {C.RED}Engine unavailable{C.RESET} — {exc}")
                aborted = True
            except KeyboardInterrupt:
                emit(f"  {C.YELLOW}Interrupted{C.RESET} — saving progress so far "
                     f"(resumable on re-run).")
                aborted = True
            finally:
                meter.finish()
                # Persist whatever was translated, atomically, even on abort/CTRL-C.
                bundles.write_json_atomic(bundles.web_locale_bundle_path(locale), web_bundle)
                bundles.write_json_atomic(bundles.host_locale_bundle_path(locale), host_bundle)
                save_provenance(locale, prov_updates)

            grand_total += done
            emit(f"  {C.GREEN}{locale}{C.RESET}: wrote {C.BOLD}{done}{C.RESET} translations.")
            if aborted:
                emit("Translate pass stopped early; re-run to resume from where it left off.")
                return 1

        emit(f"{C.GREEN}Done{C.RESET} — {C.BOLD}{grand_total}{C.RESET} translations "
             f"across {len(locales)} locale(s). Run --run-mode audit to review coverage.")
        return 0
    finally:
        # Always close the logs and surface their locations — including on an early
        # abort/return — so the operator can open them straight from the terminal.
        logger.close()
        err_tail = (f"{C.RED}{logger.error_count} dropped/failed{C.RESET}"
                    if logger.error_count else f"{C.GREEN}0 dropped/failed{C.RESET}")
        emit(f"  Translation log:       {C.WHITE}{logger.log_path}{C.RESET}")
        emit(f"  Translation error log: {C.WHITE}{logger.error_path}{C.RESET} ({err_tail})")
