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
from pathlib import Path
from typing import Callable

from modules.l10n import audit, brands, bundles, engines, extract, provenance, scopes, sync
from modules.l10n.provenance import (
    ENGINE_GOOGLE, ENGINE_MANUAL, is_forced_identity, save_provenance,
)

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
            emit(
                f"  {loc['locale']:>6}: {loc['coverage_pct']:5.1f}%  "
                f"missing={loc['missing']} untranslated={loc['untranslated']} "
                f"translated={loc['translated']} "
                f"(hi={loc['high_quality']} lo={loc['low_quality']}) "
                f"orphans={loc['orphans']}"
            )
    emit(f"Report: {path}")

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
    translate_fn: Translator,
    text: str,
    locale: str,
    throttle: float,
    attempts: int = 2,
) -> str:
    """Call the translator with a small throttle and one backoff retry.

    `EngineUnavailableError` is fatal (no point retrying a missing library) and
    propagates immediately; transient/network errors get one backoff retry before
    the last exception is re-raised.
    """
    last: Exception | None = None
    for i in range(attempts):
        try:
            if throttle:
                time.sleep(throttle)
            return translate_fn(text, locale)
        except engines.EngineUnavailableError:
            raise
        except Exception as exc:  # network blip / rate limit / circuit
            last = exc
            time.sleep(0.5 * (i + 1))
    assert last is not None
    raise last


def run_translate_action(
    emit: Emit,
    locales: list[str],
    scope: str,
    confirmed: bool,
    translate_fn: Translator | None = None,
    throttle: float = 0.2,
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

    if translate_fn is None:
        breaker = engines.CircuitBreaker()

        def translate_fn(text: str, locale: str) -> str:  # noqa: ARG001
            return engines.translate_one(text, locale, authorized=True, breaker=breaker)

    grand_total = 0
    for locale in locales:
        web_bundle = bundles.load_json(bundles.web_locale_bundle_path(locale))
        host_bundle = bundles.load_json(bundles.host_locale_bundle_path(locale))
        existing = _translated_by_key(locale, source_host, source_web)
        prov_existing = provenance.load_provenance(locale)
        keys = sorted(scopes.select_keys(scope, source, existing, locale, prov_existing))
        emit(f"  {locale}: translating {len(keys)} keys (scope={scope})…")

        prov_updates: dict[str, str] = {}
        done = 0
        aborted = False
        try:
            for key in keys:
                english = source[key]
                if is_forced_identity(english, locale):
                    continue  # brand/acronym/symbol — correct value IS English
                value = _translate_with_retry(translate_fn, english, locale, throttle)
                if brands.validate_brands(english, value):
                    continue  # dropped a brand — keep English, don't ship mangled
                if key in web_keys:
                    web_bundle[key] = value
                else:
                    host_bundle[source_host[key]] = value
                prov_updates[key] = ENGINE_GOOGLE
                done += 1
        except engines.EngineUnavailableError as exc:
            emit(f"  Engine unavailable — {exc}")
            aborted = True
        except KeyboardInterrupt:
            emit("  Interrupted — saving progress so far (resumable on re-run).")
            aborted = True
        finally:
            # Persist whatever was translated, atomically, even on abort/CTRL-C.
            bundles.write_json_atomic(bundles.web_locale_bundle_path(locale), web_bundle)
            bundles.write_json_atomic(bundles.host_locale_bundle_path(locale), host_bundle)
            save_provenance(locale, prov_updates)

        grand_total += done
        emit(f"  {locale}: wrote {done} translations.")
        if aborted:
            emit("Translate pass stopped early; re-run to resume from where it left off.")
            return 1

    emit(f"Done — {grand_total} translations across {len(locales)} locale(s). "
         f"Run --run-mode audit to review coverage.")
    return 0
