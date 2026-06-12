# -*- coding: utf-8 -*-
"""English-baseline build + locale alignment (plan 75 §5.1/§5.5). NEVER translates.

Two mechanical, English-only operations the publish pipeline and the workflow both
rely on:

  1. **Build the host base bundle** `l10n/bundle.l10n.json` — the identity
     (English→English) template, value-keyed, that documents every translatable
     host string and seeds `vscode-l10n` tooling. Regenerated from the registries.
  2. **Align discovered locale bundles** — prune ORPHAN keys (present in a locale
     bundle but gone from the source) and REPORT missing keys per locale. Missing
     keys are deliberately left ABSENT, not filled with English copies: an absent
     key falls back to English at runtime, whereas an English-copy value would read
     as "present but untranslated" and inflate the gap report. The deliberate,
     gated translate run is what fills them — sync only keeps the shape honest.

Adding source-language keys / pruning orphans is NOT translation (plan 75 §7) and
is always safe to run.
"""

from modules.l10n import bundles, extract


def build_host_base_bundle(dry_run: bool = False) -> dict[str, object]:
    """Regenerate `l10n/bundle.l10n.json` as the English identity map.

    Value-keyed (English→English), deduped — multiple symbolic keys with the same
    English text collapse to one entry, matching how `vscode.l10n.t(englishValue)`
    keys its lookups. Returns `{path, entries}`.
    """
    source = extract.extract_host()
    identity = {english: english for english in source.values()}
    path = bundles.host_base_bundle_path()
    if not dry_run:
        bundles.write_json_atomic(path, identity)
    return {"path": str(path), "entries": len(identity)}


def base_bundle_is_current() -> dict[str, object]:
    """Check whether the committed `bundle.l10n.json` matches the current source.

    Used by the publish pipeline as a staleness gate (like `verify:nls-coverage
    --check`) — it REPORTS drift without rewriting, so a publish never dirties the
    working tree mid-run. Returns `{current, expected, on_disk}`.
    """
    source = extract.extract_host()
    identity = {english: english for english in source.values()}
    on_disk = bundles.load_json(bundles.host_base_bundle_path())
    return {
        "current": on_disk == identity,
        "expected": len(identity),
        "on_disk": len(on_disk),
    }


def align_locale_bundle(
    locale: str,
    is_web: bool,
    dry_run: bool = False,
) -> dict[str, object]:
    """Prune orphans from one locale bundle and count missing keys.

    For web (`web.<locale>.json`), the bundle is keyed by symbolic key, compared
    against the source keys. For host (`bundle.l10n.<locale>.json`), it is keyed by
    English value, compared against the set of source English values. Returns
    `{locale, surface, missing, orphans_pruned, present}`.
    """
    if is_web:
        source_keys = set(extract.extract_web().keys())
        path = bundles.web_locale_bundle_path(locale)
    else:
        source_keys = set(extract.extract_host().values())
        path = bundles.host_locale_bundle_path(locale)

    existing = bundles.load_json(path)
    kept = {k: v for k, v in existing.items() if k in source_keys}
    orphans = len(existing) - len(kept)
    missing = len(source_keys) - len(kept)

    if orphans and not dry_run:
        bundles.write_json_atomic(path, kept)

    return {
        "locale": locale,
        "surface": "web" if is_web else "host",
        "present": len(kept),
        "missing": missing,
        "orphans_pruned": orphans,
        "total_source": len(source_keys),
    }


def run_sync(dry_run: bool = False) -> dict[str, object]:
    """Build the host base bundle and align every discovered locale bundle.

    Returns a report dict with the base-bundle result and a per-locale alignment
    list. Never translates; safe in the publish pipeline.
    """
    base = build_host_base_bundle(dry_run=dry_run)
    aligned: list[dict[str, object]] = []
    for locale in sorted(bundles.discover_host_locales()):
        aligned.append(align_locale_bundle(locale, is_web=False, dry_run=dry_run))
    for locale in sorted(bundles.discover_web_locales()):
        aligned.append(align_locale_bundle(locale, is_web=True, dry_run=dry_run))
    return {"base_bundle": base, "aligned": aligned, "dry_run": dry_run}
