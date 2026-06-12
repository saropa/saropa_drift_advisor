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

from pathlib import Path
from typing import Callable

from modules.l10n import audit, bundles, scopes, sync
from modules.l10n.provenance import ENGINE_MANUAL, save_provenance

Emit = Callable[[str], None]


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


def run_translate_action(
    emit: Emit,
    locales: list[str],
    scope: str,
    confirmed: bool,
) -> int:
    """The deliberate translate pass — HARD-GATED (plan 75 §7).

    Refuses without explicit confirmation and a named locale set. Even when
    confirmed, it stops at the unwired engine binding (engines.translate_one) so no
    machine translation is performed from this repo. Always returns 1 (blocked).
    """
    if not confirmed or not locales:
        emit("REFUSED: the translate pass is operator-gated and never runs "
             "unattended (plan 75 §7).")
        emit("It requires BOTH an explicit --confirm-translate flag AND a named "
             "--locales list, e.g.:")
        emit("  python scripts/translate_l10n.py --run-mode translate "
             "--locales de,fr --scope gaps --confirm-translate")
        return 1

    # Confirmed + named: report what WOULD be sent, then stop at the unwired engine.
    source = audit.extract.extract_all()
    for locale in locales:
        translated_web = bundles.load_json(bundles.web_locale_bundle_path(locale))
        keys = scopes.select_keys(scope, source, translated_web, locale)
        emit(f"  {locale}: scope={scope} would process {len(keys)} keys.")
    emit("STOP: no engine binding is wired in this repo — machine translation was "
         "NOT performed. Wire NLLB/Google in the operator action to run a real pass.")
    return 1
