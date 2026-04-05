# -*- coding: utf-8 -*-
"""Poll store APIs until a newly published version is visible.

After publishing to pub.dev, VS Code Marketplace, and/or Open VSX the
new version may not be immediately visible due to CDN propagation and
backend indexing delays.  This module polls the relevant APIs at a
fixed interval until the expected version appears — or a timeout is
reached.

Supported stores:
  - **pub.dev** — Dart package registry
  - **VS Code Marketplace** — extension registry
  - **Open VSX** — alternative extension registry (Cursor / VSCodium)
"""

import json
import time
import urllib.error
import urllib.request
from typing import TYPE_CHECKING

from modules.constants import C, ExitCode
from modules.display import fail, heading, info, ok, warn

if TYPE_CHECKING:
    from collections.abc import Callable

# ── Polling configuration ───────────────────────────────────
# 30 seconds keeps us well under any rate-limit on both registries.
_POLL_INTERVAL_SECS = 30
# 10 minutes is enough for typical CDN propagation on all three stores.
_POLL_TIMEOUT_MINS = 10

# ── Dart package name (matches pubspec.yaml) ────────────────
_DART_PACKAGE_NAME = "saropa_drift_advisor"


# ── Individual store checkers ───────────────────────────────


def _get_pubdev_version() -> str | None:
    """Fetch the latest version of the Dart package from the pub.dev API.

    Returns the version string (e.g. "2.17.2") or None on any error.
    The pub.dev JSON API returns ``{"latest": {"version": "x.y.z"}, ...}``.
    """
    url = f"https://pub.dev/api/packages/{_DART_PACKAGE_NAME}"
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "saropa_drift_advisor_publish/1.0"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            # The "latest" key holds the most recent stable version info.
            return data.get("latest", {}).get("version")
    except (urllib.error.URLError, json.JSONDecodeError, OSError, KeyError):
        return None


def _get_openvsx_version() -> str | None:
    """Fetch the latest version from the Open VSX API.

    The Open VSX REST API returns ``{"version": "x.y.z", ...}`` for a
    given namespace/extension pair.
    """
    url = "https://open-vsx.org/api/saropa/drift-viewer"
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "saropa_drift_advisor_publish/1.0"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("version")
    except (urllib.error.URLError, json.JSONDecodeError, OSError, KeyError):
        return None


def _get_marketplace_version() -> str | None:
    """Fetch the latest version from the VS Code Marketplace API.

    Delegates to the existing helper in ext_publish which shells out to
    ``npx @vscode/vsce show ... --json``.  This keeps the marketplace
    query logic in one place.
    """
    from modules.ext_publish import get_marketplace_published_version
    return get_marketplace_published_version()


# ── Polling engine ──────────────────────────────────────────


# Each store is a (label, checker_fn) pair.  The label is used in log
# output and the checker returns the live version string (or None).
_STORE_REGISTRY: dict[str, tuple[str, "Callable[[], str | None]"]] = {
    "pubdev": ("pub.dev", _get_pubdev_version),
    "marketplace": ("VS Code Marketplace", _get_marketplace_version),
    "openvsx": ("Open VSX", _get_openvsx_version),
}


def _poll_stores(
    expected_version: str,
    store_keys: list[str],
    interval_secs: int = _POLL_INTERVAL_SECS,
    timeout_mins: int = _POLL_TIMEOUT_MINS,
) -> bool:
    """Poll the given stores until *expected_version* is visible on all of them.

    Parameters
    ----------
    expected_version : str
        The version string we expect to see (e.g. "2.17.2").
    store_keys : list[str]
        Which stores to check — subset of ``_STORE_REGISTRY`` keys.
    interval_secs : int
        Seconds between polling attempts.
    timeout_mins : int
        Total minutes before giving up.

    Returns True when all stores report the expected version, False on timeout.
    """
    max_attempts = (timeout_mins * 60) // interval_secs + 1
    # Track which stores have confirmed the expected version so we can
    # stop polling them individually (and give clearer status output).
    confirmed: set[str] = set()

    for attempt in range(1, max_attempts + 1):
        # Check each store that hasn't yet confirmed.
        for key in store_keys:
            if key in confirmed:
                continue
            label, checker = _STORE_REGISTRY[key]
            live_version = checker()

            if live_version == expected_version:
                ok(f"{label}: v{live_version} ✓")
                confirmed.add(key)
            else:
                # Show what the store currently reports so the user can
                # see propagation progress (or spot stale caches).
                display = live_version or "unavailable"
                info(
                    f"{label}: v{display} "
                    f"(waiting for v{expected_version}) "
                    f"[{attempt}/{max_attempts}]"
                )

        # All stores confirmed — success.
        if confirmed == set(store_keys):
            return True

        # Wait before the next attempt (skip sleep on the final iteration
        # so we don't waste time after the last check).
        if attempt < max_attempts:
            time.sleep(interval_secs)

    return False


# ── Public API ──────────────────────────────────────────────


def run_store_propagation_wait(
    expected_version: str,
    stores: str,
    target: str = "extension",
) -> int:
    """Poll store APIs until the published version is visible.

    Parameters
    ----------
    expected_version : str
        Version that was just published.
    stores : str
        Which extension stores were published to — one of
        ``"vscode_only"``, ``"openvsx_only"``, or ``"both"``.
        Ignored when *target* is ``"dart"`` (only pub.dev is checked).
    target : str
        ``"dart"``, ``"extension"``, or ``"all"``.

    Returns ExitCode.SUCCESS or ExitCode.STORE_VERSION_MISMATCH.
    """
    # Build the list of store keys to poll based on what was published.
    store_keys: list[str] = []

    if target in ("dart", "all"):
        store_keys.append("pubdev")

    if target in ("extension", "all"):
        if stores in ("both", "vscode_only"):
            store_keys.append("marketplace")
        if stores in ("both", "openvsx_only"):
            store_keys.append("openvsx")

    if not store_keys:
        # Nothing to poll (shouldn't happen, but guard against it).
        info("No stores to verify.")
        return ExitCode.SUCCESS

    # Pretty-print which stores we're about to poll.
    labels = [_STORE_REGISTRY[k][0] for k in store_keys]
    info(
        f"Polling {', '.join(labels)} until v{expected_version} is visible "
        f"({_POLL_INTERVAL_SECS}s interval, {_POLL_TIMEOUT_MINS} min max)."
    )

    if _poll_stores(expected_version, store_keys):
        ok(f"v{expected_version} confirmed on all stores.")
        return ExitCode.SUCCESS

    # Timeout — at least one store didn't show the expected version.
    fail(
        f"v{expected_version} not visible on all stores after "
        f"{_POLL_TIMEOUT_MINS} minutes."
    )
    warn("The publish itself may have succeeded — CDN propagation can be slow.")
    warn("Check the store pages manually to confirm.")
    return ExitCode.STORE_VERSION_MISMATCH
