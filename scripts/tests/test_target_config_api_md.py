# -*- coding: utf-8 -*-
"""Unit tests for ``doc/API.md`` version sync in ``modules.target_config``.

The publish pipeline runs ``ensure_api_md_version_sync`` during Dart analysis
before ``dart test``, so ``version_sync_test`` sees aligned sources. These tests
exercise the sync, read, and dry-run paths against temp files to verify:

* **Old-to-new replacement:** only the *current* header version is replaced,
  so unrelated semver text (example payloads, dependency versions) survives.
* **Pattern scoping:** standalone ``"version"`` JSON fields update but nested
  ``"version"`` inside inline objects (e.g. ``"producer": {...}``) does not.
* **jsDelivr anchoring:** ``@vX.Y.Z`` is replaced only inside a
  ``cdn.jsdelivr.net`` URL, not in arbitrary ``@v`` prefixes.
* **IP address safety:** dotted quads like ``127.0.0.1`` are never matched.
* **Dry-run mode:** reports what would change without writing.
* **Ensure guard rails:** invalid pubspec, missing header, matching versions.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules import target_config as tc

# ── Fixtures ──────────────────────────────────────────────────

# Minimal doc/API.md that exercises every pattern category.
_SAMPLE_API_MD = """\
# Saropa Drift Advisor — REST API Reference

**API version:** 1.0.0 (synced with `ServerConstants.packageVersion`)
**Base URL:** `http://localhost:{port}` (default port: **8642**)

```json
{
  "host": "127.0.0.1",
  "port": 8642,
  "version": "1.0.0",
  "schemaVersion": 1
}
```

| `host` | string | Loopback host (`127.0.0.1`) |

```json
{
  "name": "Saropa Drift Advisor",
  "version": "1.0.0",
  "docs": "https://cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@v1.0.0/doc/API.md"
}
```

```json
{
  "version": "1.0.0"
}
```

Example sidecar:
```json
{
  "producer": { "name": "saropa_drift_advisor", "version": "0.5.0" }
}
```

Some prose mentioning v2.3.4 of another tool and @v9.9.9 in a git tag.
"""


def _write_temp(content: str) -> str:
    """Write *content* to a temp file and return its path."""
    f = tempfile.NamedTemporaryFile(
        mode="w", suffix=".md", delete=False, encoding="utf-8",
    )
    f.write(content)
    f.close()
    return f.name


# ── Tests ─────────────────────────────────────────────────────


class TestSyncApiMdVersion(unittest.TestCase):
    """End-to-end sync against a temp file."""

    def setUp(self) -> None:
        self.path = _write_temp(_SAMPLE_API_MD)
        self._patch = patch.object(tc, "API_MD_PATH", self.path)
        self._patch.start()

    def tearDown(self) -> None:
        self._patch.stop()
        Path(self.path).unlink(missing_ok=True)

    def _read(self) -> str:
        return Path(self.path).read_text(encoding="utf-8")

    @patch.object(tc, "ok")
    def test_updates_header_json_and_cdn(self, _ok: MagicMock) -> None:
        result = tc.sync_api_md_version("2.0.0")
        self.assertTrue(result)
        content = self._read()
        self.assertIn("**API version:** 2.0.0", content)
        self.assertIn('"version": "2.0.0"', content)
        self.assertIn("@v2.0.0/doc/API.md", content)

    @patch.object(tc, "ok")
    def test_preserves_example_producer_version(self, _ok: MagicMock) -> None:
        tc.sync_api_md_version("2.0.0")
        content = self._read()
        self.assertIn('"version": "0.5.0"', content)

    @patch.object(tc, "ok")
    def test_preserves_ip_addresses(self, _ok: MagicMock) -> None:
        tc.sync_api_md_version("2.0.0")
        content = self._read()
        self.assertEqual(content.count("127.0.0.1"), 2)

    @patch.object(tc, "ok")
    def test_preserves_unrelated_semver_in_prose(self, _ok: MagicMock) -> None:
        tc.sync_api_md_version("2.0.0")
        content = self._read()
        self.assertIn("v2.3.4", content)

    @patch.object(tc, "ok")
    def test_preserves_unanchored_at_v_tag(self, _ok: MagicMock) -> None:
        tc.sync_api_md_version("2.0.0")
        content = self._read()
        self.assertIn("@v9.9.9", content)

    @patch.object(tc, "ok")
    def test_updates_all_three_standalone_version_fields(
        self, _ok: MagicMock,
    ) -> None:
        tc.sync_api_md_version("2.0.0")
        content = self._read()
        # 3 standalone + 1 producer (unchanged) = 4 total "version" keys
        import re
        standalone = re.findall(r'^\s*"version"\s*:\s*"2\.0\.0"', content, re.MULTILINE)
        self.assertEqual(len(standalone), 3)

    @patch.object(tc, "ok")
    def test_noop_when_already_current(self, mock_ok: MagicMock) -> None:
        result = tc.sync_api_md_version("1.0.0")
        self.assertTrue(result)
        mock_ok.assert_called()
        self.assertEqual(self._read(), _SAMPLE_API_MD)

    @patch.object(tc, "ok")
    def test_round_trip(self, _ok: MagicMock) -> None:
        tc.sync_api_md_version("5.5.5")
        tc.sync_api_md_version("1.0.0")
        self.assertEqual(self._read(), _SAMPLE_API_MD)


class TestSyncApiMdDryRun(unittest.TestCase):
    """Dry-run mode returns a report without writing."""

    def setUp(self) -> None:
        self.path = _write_temp(_SAMPLE_API_MD)
        self._patch = patch.object(tc, "API_MD_PATH", self.path)
        self._patch.start()

    def tearDown(self) -> None:
        self._patch.stop()
        Path(self.path).unlink(missing_ok=True)

    def test_dry_run_reports_changes(self) -> None:
        result = tc.sync_api_md_version("2.0.0", dry_run=True)
        self.assertIsInstance(result, dict)
        self.assertTrue(result["changed"])
        self.assertEqual(result["old"], "1.0.0")
        self.assertEqual(result["new"], "2.0.0")
        self.assertGreater(result["diff_count"], 0)

    def test_dry_run_does_not_write(self) -> None:
        tc.sync_api_md_version("2.0.0", dry_run=True)
        self.assertEqual(Path(self.path).read_text(encoding="utf-8"), _SAMPLE_API_MD)

    def test_dry_run_noop(self) -> None:
        result = tc.sync_api_md_version("1.0.0", dry_run=True)
        self.assertIsInstance(result, dict)
        self.assertFalse(result["changed"])
        self.assertEqual(result["diff_count"], 0)


class TestEnsureApiMdVersionSync(unittest.TestCase):
    """Branch coverage for ``ensure_api_md_version_sync``."""

    def setUp(self) -> None:
        self.path = _write_temp(_SAMPLE_API_MD)
        self._patch_path = patch.object(tc, "API_MD_PATH", self.path)
        self._patch_path.start()

    def tearDown(self) -> None:
        self._patch_path.stop()
        Path(self.path).unlink(missing_ok=True)

    @patch.object(tc, "ok")
    @patch.object(tc, "read_version", return_value="1.0.0")
    def test_matching_versions_skip_sync(
        self, _rv: MagicMock, mock_ok: MagicMock,
    ) -> None:
        self.assertTrue(tc.ensure_api_md_version_sync())
        mock_ok.assert_called()

    @patch.object(tc, "ok")
    @patch.object(tc, "info")
    @patch.object(tc, "read_version", return_value="2.0.0")
    def test_mismatch_updates_file(
        self, _rv: MagicMock, _info: MagicMock, _ok: MagicMock,
    ) -> None:
        self.assertTrue(tc.ensure_api_md_version_sync())
        content = Path(self.path).read_text(encoding="utf-8")
        self.assertIn("**API version:** 2.0.0", content)

    @patch.object(tc, "fail")
    @patch.object(tc, "read_version", return_value="unknown")
    def test_invalid_pubspec_version_fails(
        self, _rv: MagicMock, mock_fail: MagicMock,
    ) -> None:
        self.assertFalse(tc.ensure_api_md_version_sync())
        mock_fail.assert_called()

    @patch.object(tc, "fail")
    @patch.object(tc, "read_version", return_value="2.0.0")
    def test_missing_header_fails(
        self, _rv: MagicMock, mock_fail: MagicMock,
    ) -> None:
        Path(self.path).write_text("No header here.", encoding="utf-8")
        self.assertFalse(tc.ensure_api_md_version_sync())

    @patch.object(tc, "info")
    @patch.object(tc, "read_version", return_value="2.0.0")
    def test_dry_run_reports_without_writing(
        self, _rv: MagicMock, _info: MagicMock,
    ) -> None:
        self.assertFalse(tc.ensure_api_md_version_sync(dry_run=True))
        content = Path(self.path).read_text(encoding="utf-8")
        self.assertIn("**API version:** 1.0.0", content)

    @patch.object(tc, "ok")
    @patch.object(tc, "read_version", return_value="1.0.0")
    def test_dry_run_match_returns_true(
        self, _rv: MagicMock, _ok: MagicMock,
    ) -> None:
        self.assertTrue(tc.ensure_api_md_version_sync(dry_run=True))


class TestReadApiMdHeaderVersion(unittest.TestCase):
    """Regex extraction from the **API version:** header."""

    def test_extracts_version_from_fixture(self) -> None:
        self.assertEqual(tc._read_api_md_header_version(_SAMPLE_API_MD), "1.0.0")

    def test_returns_none_on_missing_header(self) -> None:
        self.assertIsNone(tc._read_api_md_header_version("# No version here"))

    def test_returns_none_on_none_input(self) -> None:
        with patch.object(tc, "_read_api_md_content", return_value=None):
            self.assertIsNone(tc._read_api_md_header_version())


if __name__ == "__main__":
    unittest.main()
