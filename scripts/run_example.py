#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Launch the example Flutter app with a real Drift database.

Starts the example app on a connected device so you can test the VS Code
extension (Database Explorer, Schema Search, Troubleshooting, etc.)
against a live Drift debug server at http://127.0.0.1:8642.

Usage:
    python scripts/run_example.py                  # Pick from connected devices
    python scripts/run_example.py windows           # Device by name/ID
    python scripts/run_example.py emulator-5554     # Device by exact Flutter ID
    python scripts/run_example.py --health-only     # Just check server health
    python scripts/run_example.py --no-logo         # Suppress Saropa ASCII logo
    python scripts/run_example.py --no-pub-get      # Skip flutter pub get

Steps performed:
    1. Verify Flutter SDK is installed and on PATH
    2. Verify the example/ directory exists and has pubspec.yaml
    3. Query connected devices via `flutter devices --machine`
    4. Run `flutter pub get` to fetch dependencies
    5. Run `flutter run -d <device-id>` to launch the example app

The example app seeds a multi-table schema (users, posts, comments, tags,
post_tags) with realistic data on first launch. The debug server starts
automatically in debug builds (kDebugMode).

Exit codes match the ExitCode enum in modules/constants.py.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

# On Windows, shell=True is needed so that .BAT/.CMD scripts (flutter.BAT,
# npm.cmd, etc.) resolve via PATH through cmd.exe. On macOS/Linux, shell=False
# is safer. Matches the pattern in modules/utils.py.
_SHELL = sys.platform == "win32"

# Ensure the scripts/ directory is on sys.path so `from modules ...` works
# regardless of which directory the script is invoked from.
sys.path.insert(0, str(Path(__file__).resolve().parent))

# Ensure colorama is available so modules.constants can init it on Windows.
try:
    import colorama  # noqa: F401
except ImportError:
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "colorama", "-q"],
        check=False,
        capture_output=True,
    )

from modules.constants import C, ExitCode, REPO_ROOT
from modules.display import ask_yn, dim, fail, heading, info, ok, show_logo, warn


# ── Paths ────────────────────────────────────────────────────

EXAMPLE_DIR = os.path.join(REPO_ROOT, "example")
EXAMPLE_PUBSPEC = os.path.join(EXAMPLE_DIR, "pubspec.yaml")

# Default Drift debug server address (matches the example app's default port).
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8642

# How long to wait for the server to become reachable after flutter run.
HEALTH_POLL_TIMEOUT_SEC = 60
HEALTH_POLL_INTERVAL_SEC = 2


# ── Device Discovery ────────────────────────────────────────

# Platforms that can run the example app (native dart:io, not web).
_SUPPORTED_PLATFORMS = {"android", "ios", "macos", "linux", "windows"}


def _query_devices() -> list[dict]:
    """Run `flutter devices --machine` and return the parsed JSON list.

    Each device dict has keys: name, id, isSupported, targetPlatform, sdk, etc.
    Returns an empty list if the command fails or produces invalid JSON.
    """
    try:
        result = subprocess.run(
            ["flutter", "devices", "--machine"],
            capture_output=True,
            text=True,
            shell=_SHELL,
            timeout=30,
        )
        if result.returncode != 0:
            return []
        # flutter devices --machine outputs a JSON array.
        devices = json.loads(result.stdout)
        if not isinstance(devices, list):
            return []
        return devices
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError):
        return []


def _filter_supported(devices: list[dict]) -> list[dict]:
    """Keep only devices on native platforms (no web — example uses dart:io)."""
    supported = []
    for d in devices:
        platform = d.get("targetPlatform", "")
        # targetPlatform values: android-arm, android-arm64, android-x64,
        # android-x86, darwin, linux-x64, windows-x64, web-javascript, etc.
        platform_family = platform.split("-")[0] if platform else ""
        # Map "darwin" to "macos" for the supported check.
        if platform_family == "darwin":
            platform_family = "macos"
        if platform_family in _SUPPORTED_PLATFORMS:
            # Attach the resolved family for display purposes.
            d["_platform_family"] = platform_family
            supported.append(d)
    return supported


def _device_label(d: dict) -> str:
    """Build a human-readable label for a device entry."""
    name = d.get("name", "Unknown")
    dev_id = d.get("id", "?")
    sdk = d.get("sdk", "")
    # e.g. "sdk gphone64 x86 64 (emulator-5554) -- Android 16 (API 36)"
    parts = [name]
    if dev_id != name:
        parts.append(f"({dev_id})")
    if sdk:
        parts.append(f"-- {sdk}")
    return " ".join(parts)


def _prompt_device(devices: list[dict]) -> str:
    """Interactively ask the user to pick a connected device. Returns device ID."""
    print(f"\n  {C.BOLD}Connected devices:{C.RESET}\n")
    for i, d in enumerate(devices, 1):
        label = _device_label(d)
        family = d.get("_platform_family", "")
        print(f"    {C.CYAN}{i}{C.RESET}) {C.WHITE}{label}{C.RESET}  {dim(family)}")
    print()
    while True:
        try:
            choice = input(
                f"  {C.YELLOW}Enter choice (1-{len(devices)}): {C.RESET}",
            ).strip()
        except (EOFError, KeyboardInterrupt):
            print()
            sys.exit(ExitCode.USER_CANCELLED)
        if choice in {str(i) for i in range(1, len(devices) + 1)}:
            selected = devices[int(choice) - 1]
            return selected["id"]
        # Also accept a device ID or name typed directly.
        for d in devices:
            if choice.lower() in (d.get("id", "").lower(), d.get("name", "").lower()):
                return d["id"]
        print(
            f"  {C.RED}Invalid choice. "
            f"Please enter 1-{len(devices)} or a device ID.{C.RESET}",
        )


def _resolve_device(hint: str, devices: list[dict]) -> str | None:
    """Resolve a CLI device hint (name, ID, or platform) to an actual device ID.

    Tries exact ID match, then name substring match, then platform family match.
    Returns None if no match is found.
    """
    lower = hint.lower()
    # Exact ID match.
    for d in devices:
        if d.get("id", "").lower() == lower:
            return d["id"]
    # Name substring match.
    for d in devices:
        if lower in d.get("name", "").lower():
            return d["id"]
    # Platform family match (e.g. "android", "windows").
    for d in devices:
        if d.get("_platform_family", "").lower() == lower:
            return d["id"]
    return None


# ── CLI ──────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments.

    The device positional argument accepts any string — it is resolved against
    connected devices after Flutter prerequisite checks pass.
    """
    parser = argparse.ArgumentParser(
        description="Saropa Drift Advisor -- Run Example App",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "device",
        nargs="?",
        default=None,
        help="Device name, ID, or platform (e.g. 'windows', 'emulator-5554'). "
             "Prompted if omitted.",
    )
    parser.add_argument(
        "--health-only",
        action="store_true",
        help="Skip launching the app; just check if the server is reachable.",
    )
    parser.add_argument(
        "--no-logo",
        action="store_true",
        help="Suppress the Saropa ASCII art logo.",
    )
    parser.add_argument(
        "--no-pub-get",
        action="store_true",
        help="Skip `flutter pub get` (use when dependencies are already fetched).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help=f"Expected server port (default: {DEFAULT_PORT}).",
    )
    return parser.parse_args()


# ── Prerequisite Checks ──────────────────────────────────────


def _check_flutter() -> bool:
    """Verify Flutter SDK is installed and on PATH."""
    flutter = shutil.which("flutter")
    if not flutter:
        fail("Flutter SDK not found on PATH.")
        info("Install from https://docs.flutter.dev/get-started/install")
        return False
    ok(f"Flutter SDK: {dim(flutter)}")

    # Print Flutter version for diagnostics.
    result = subprocess.run(
        ["flutter", "--version"],
        capture_output=True,
        text=True,
        shell=_SHELL,
        timeout=30,
    )
    if result.returncode == 0:
        # First line is the version summary.
        version_line = result.stdout.strip().split("\n")[0]
        ok(f"Version: {dim(version_line)}")
    else:
        warn("Could not determine Flutter version.")

    return True


def _check_example_dir() -> bool:
    """Verify the example/ directory exists with pubspec.yaml."""
    if not os.path.isdir(EXAMPLE_DIR):
        fail(f"Example directory not found: {EXAMPLE_DIR}")
        return False
    ok(f"Example dir: {dim(EXAMPLE_DIR)}")

    if not os.path.isfile(EXAMPLE_PUBSPEC):
        fail(f"pubspec.yaml not found: {EXAMPLE_PUBSPEC}")
        return False
    ok(f"pubspec.yaml: {dim(EXAMPLE_PUBSPEC)}")

    return True


# ── Dependency Fetch ─────────────────────────────────────────


def _run_pub_get() -> bool:
    """Run `flutter pub get` in the example directory."""
    heading("Dependencies")
    info("Running `flutter pub get` in example/...")

    result = subprocess.run(
        ["flutter", "pub", "get"],
        cwd=EXAMPLE_DIR,
        capture_output=True,
        text=True,
        shell=_SHELL,
        timeout=120,
    )
    if result.returncode != 0:
        fail("`flutter pub get` failed.")
        if result.stderr:
            print(result.stderr)
        return False

    ok("Dependencies resolved.")
    return True


# ── Health Check ─────────────────────────────────────────────


def _verify_schema(port: int) -> bool:
    """Query /api/schema/metadata and display table names and row counts.

    Gives the user immediate proof that the server has data, not just a
    health OK. Returns True if at least one table was found.
    """
    url = f"http://{DEFAULT_HOST}:{port}/api/schema/metadata?includeForeignKeys=1"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            data = json.loads(body)
            tables = data.get("tables", [])
            if not tables:
                warn("Server returned no tables.")
                return False
            ok(f"Schema loaded: {len(tables)} table(s)")
            print()
            # Print table summary with row counts and column counts.
            max_name = max(len(t.get("name", "")) for t in tables)
            for t in tables:
                name = t.get("name", "?")
                rows = t.get("rowCount", 0)
                cols = t.get("columns", [])
                fks = t.get("foreignKeys", [])
                col_count = len(cols)
                fk_count = len(fks)
                # Highlight primary key columns.
                pk_names = [c["name"] for c in cols if c.get("pk")]
                pk_label = f"  PK: {', '.join(pk_names)}" if pk_names else ""
                fk_label = f"  FK: {fk_count}" if fk_count > 0 else ""
                print(
                    f"    {C.WHITE}{name:<{max_name}}{C.RESET}"
                    f"  {rows:>4} rows"
                    f"  {col_count} cols"
                    f"{dim(pk_label)}"
                    f"{dim(fk_label)}"
                )
            print()
            return True
    except urllib.error.URLError as e:
        fail(f"Schema endpoint not reachable: {e.reason}")
        return False
    except (json.JSONDecodeError, KeyError) as e:
        fail(f"Invalid schema response: {e}")
        return False
    except Exception as e:
        fail(f"Schema verification error: {e}")
        return False


def _check_health(port: int) -> bool:
    """Check if the Drift debug server is reachable at the given port.

    Returns True if /api/health returns ok=true, False otherwise.
    """
    url = f"http://{DEFAULT_HOST}:{port}/api/health"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode("utf-8")
            if '"ok":true' in body or '"ok": true' in body:
                ok(f"Server healthy: {dim(url)}")
                # Print the full response for diagnostics.
                info(f"Response: {dim(body.strip())}")
                return True
            else:
                warn(f"Server responded but health check failed: {body.strip()}")
                return False
    except urllib.error.URLError as e:
        fail(f"Server not reachable at {url}: {e.reason}")
        return False
    except Exception as e:
        fail(f"Health check error: {e}")
        return False


def _wait_for_health(port: int) -> bool:
    """Poll the health endpoint until the server is reachable or timeout.

    Prints a progress line for each attempt so the user knows what's happening.
    """
    heading("Health Check")
    info(
        f"Waiting up to {HEALTH_POLL_TIMEOUT_SEC}s for Drift server "
        f"on port {port}...",
    )

    url = f"http://{DEFAULT_HOST}:{port}/api/health"
    start = time.monotonic()
    attempt = 0

    while time.monotonic() - start < HEALTH_POLL_TIMEOUT_SEC:
        attempt += 1
        elapsed = int(time.monotonic() - start)
        try:
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=5) as resp:
                body = resp.read().decode("utf-8")
                if '"ok":true' in body or '"ok": true' in body:
                    ok(
                        f"Server healthy after {elapsed}s "
                        f"(attempt #{attempt}): {dim(url)}",
                    )
                    info(f"Response: {dim(body.strip())}")
                    return True
                else:
                    warn(f"Attempt #{attempt} ({elapsed}s): unexpected response: {body.strip()}")
        except (urllib.error.URLError, OSError):
            # Server not up yet — expected during app startup.
            info(f"Attempt #{attempt} ({elapsed}s): not reachable yet...")
        except Exception as e:
            warn(f"Attempt #{attempt} ({elapsed}s): {e}")

        time.sleep(HEALTH_POLL_INTERVAL_SEC)

    fail(
        f"Server did not become reachable within {HEALTH_POLL_TIMEOUT_SEC}s. "
        f"Check the Flutter app's console output.",
    )
    return False


# ── Launch App ───────────────────────────────────────────────


def _run_flutter_app(device_id: str, port: int) -> int:
    """Launch the example app with `flutter run -d <device-id>`.

    This runs in the foreground so the user sees Flutter's output (hot reload
    prompts, log messages, etc.). Returns the process exit code.
    """
    heading("Launch Example App")

    cmd = ["flutter", "run", "-d", device_id]
    info(f"Running: {dim(' '.join(cmd))}")
    info(f"Working dir: {dim(EXAMPLE_DIR)}")
    print()

    # Use simple ASCII characters for bullet points — avoid encoding issues
    # on Windows terminals that may not render Unicode bullets correctly.
    separator = f"  {C.CYAN}{'=' * 56}{C.RESET}"
    print(separator)
    print(f"  {C.BOLD}The example app will start below.{C.RESET}")
    print(f"  {C.WHITE}Once the app is running:{C.RESET}")
    print( "    * Open VS Code with the extension/ folder")
    print( "    * Press F5 to launch the Extension Development Host")
    print( "    * The Database Explorer auto-discovers the server")
    print(f"    * Or open {C.WHITE}http://{DEFAULT_HOST}:{port}{C.RESET} in a browser")
    print(separator)
    print()

    # Run flutter in the foreground — user interacts with hot reload, etc.
    # We don't capture output so it streams directly to the terminal.
    try:
        result = subprocess.run(
            cmd,
            cwd=EXAMPLE_DIR,
            shell=_SHELL,
            timeout=None,  # No timeout — runs until user quits.
        )
        return result.returncode
    except KeyboardInterrupt:
        # User pressed Ctrl+C — normal exit.
        print()
        info("App terminated by user (Ctrl+C).")
        return 0


# ── Summary ──────────────────────────────────────────────────


def _print_info(device_hint: str | None, port: int) -> None:
    """Print target info after the logo."""
    print(f"\n  {C.BOLD}Run Example App{C.RESET}")
    print(f"  Project root: {dim(REPO_ROOT)}")
    print(f"  Example dir:  {dim(EXAMPLE_DIR)}")
    if device_hint:
        print(f"  Device hint:  {dim(device_hint)}")
    print(f"  Server:       {dim(f'http://{DEFAULT_HOST}:{port}')}")


# ── Main ─────────────────────────────────────────────────────


def main() -> int:
    """Entry point: logo -> checks -> detect devices -> pub get -> flutter run."""
    args = parse_args()

    if not args.no_logo:
        show_logo()

    _print_info(args.device, args.port)

    # ── Health-only mode: just check if the server is up ─────
    if args.health_only:
        heading("Health Check")
        if not _check_health(args.port):
            return ExitCode.PREREQUISITE_FAILED
        heading("Schema Verification")
        _verify_schema(args.port)
        return ExitCode.SUCCESS

    # ── Full launch pipeline ─────────────────────────────────

    # 1. Prerequisites
    heading("Prerequisites")
    if not _check_flutter():
        return ExitCode.PREREQUISITE_FAILED

    if not _check_example_dir():
        return ExitCode.PREREQUISITE_FAILED

    # 2. Detect connected devices
    heading("Devices")
    info("Querying connected devices...")
    all_devices = _query_devices()
    devices = _filter_supported(all_devices)

    if not devices:
        fail("No supported devices found.")
        if all_devices:
            # Show what was found but filtered out (e.g. web browsers).
            info("Devices detected but not supported (example uses dart:io):")
            for d in all_devices:
                print(f"    {dim(_device_label(d))}")
        else:
            info("Run `flutter devices` to troubleshoot.")
        return ExitCode.PREREQUISITE_FAILED

    ok(f"Found {len(devices)} supported device(s):")
    for d in devices:
        print(f"    {dim(_device_label(d))}")

    # 3. Resolve or prompt for device
    if args.device:
        # User specified a device on the CLI — resolve it against detected devices.
        device_id = _resolve_device(args.device, devices)
        if not device_id:
            fail(f"No connected device matches '{args.device}'.")
            info("Available devices:")
            for d in devices:
                print(f"    {d['id']:20} {dim(_device_label(d))}")
            return ExitCode.PREREQUISITE_FAILED
        ok(f"Resolved '{args.device}' -> {dim(device_id)}")
    else:
        # No device specified — let the user pick interactively.
        if len(devices) == 1:
            # Only one device — use it automatically.
            device_id = devices[0]["id"]
            ok(f"Auto-selected only device: {dim(device_id)}")
        else:
            device_id = _prompt_device(devices)
            ok(f"Selected: {dim(device_id)}")

    # 4. Check platform folder exists — offer to enable if missing
    #    flutter devices can report a connected Android emulator even when
    #    the example project has no android/ folder (only windows/ ships by default).
    selected_device = next((d for d in devices if d["id"] == device_id), None)
    if selected_device:
        platform_family = selected_device.get("_platform_family", "")
        # Map platform families to the folder name flutter expects.
        platform_folder_map = {
            "android": "android",
            "ios": "ios",
            "macos": "macos",
            "linux": "linux",
            "windows": "windows",
        }
        folder_name = platform_folder_map.get(platform_family)
        if folder_name:
            platform_dir = os.path.join(EXAMPLE_DIR, folder_name)
            if not os.path.isdir(platform_dir):
                warn(
                    f"Platform folder missing: {dim(f'example/{folder_name}/')}"
                )
                info(
                    f"The example project only has windows/. "
                    f"Flutter needs platform scaffolding to build for {platform_family}."
                )
                if ask_yn(
                    f"Run `flutter create --platforms={platform_family} .` "
                    f"to enable {platform_family}?",
                    default=True,
                ):
                    result = subprocess.run(
                        ["flutter", "create", f"--platforms={platform_family}", "."],
                        cwd=EXAMPLE_DIR,
                        capture_output=True,
                        text=True,
                        shell=_SHELL,
                        timeout=120,
                    )
                    if result.returncode != 0:
                        fail(f"Failed to enable {platform_family} platform.")
                        if result.stderr:
                            print(result.stderr)
                        return ExitCode.PREREQUISITE_FAILED
                    ok(f"Enabled {platform_family} platform.")
                else:
                    fail(f"Cannot run on {platform_family} without platform folder.")
                    return ExitCode.USER_CANCELLED

    # 5. Dependencies
    if not args.no_pub_get:
        if not _run_pub_get():
            return ExitCode.DEPENDENCY_FAILED
    else:
        info("Skipping `flutter pub get` (--no-pub-get).")

    # 6. Launch the app (foreground — blocks until user quits)
    exit_code = _run_flutter_app(device_id, args.port)

    if exit_code != 0:
        fail(f"Flutter exited with code {exit_code}.")
        return ExitCode.COMPILE_FAILED

    heading("Done")
    ok("Example app exited cleanly.")
    return ExitCode.SUCCESS


if __name__ == "__main__":
    sys.exit(main())
