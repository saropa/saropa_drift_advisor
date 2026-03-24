# -*- coding: utf-8 -*-
"""Unit tests for ``server_constants`` ↔ ``pubspec`` sync in ``modules.target_config``.

The publish pipeline runs ``ensure_server_constants_version_sync`` during Dart analysis
before ``dart test``, so ``version_sync_test`` sees aligned sources. These tests mock
version reads and ``sync_server_constants_version`` to verify:

* **No false-positive writes:** when ``read_version(DART)`` equals the parsed
  ``packageVersion``, we succeed without calling ``sync_server_constants_version``.
* **Drift correction:** when they differ, sync is invoked exactly once with the
  pubspec semver.
* **Failure isolation:** invalid pubspec semver, or an unparseable Dart file,
  fails without claiming success; sync is not called when the guard rails trip.

Real filesystem parsing for ``read_server_constants_package_version`` is covered with
a temporary file and a patched ``SERVER_CONSTANTS_PATH``.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules import target_config as tc


class TestEnsureServerConstantsVersionSync(unittest.TestCase):
    """Branch coverage for ``ensure_server_constants_version_sync``."""

    @patch.object(tc, "sync_server_constants_version")
    @patch.object(tc, "ok")
    @patch.object(tc, "read_server_constants_package_version", return_value="2.8.0")
    @patch.object(tc, "read_version", return_value="2.8.0")
    def test_matching_versions_skip_sync_avoids_false_positive_write(
        self,
        mock_read_version: MagicMock,
        mock_read_sc: MagicMock,
        mock_ok: MagicMock,
        mock_sync: MagicMock,
    ) -> None:
        self.assertTrue(tc.ensure_server_constants_version_sync())
        mock_sync.assert_not_called()
        mock_ok.assert_called()

    @patch.object(tc, "sync_server_constants_version", return_value=True)
    @patch.object(tc, "ok")
    @patch.object(tc, "info")
    @patch.object(tc, "read_server_constants_package_version", return_value="2.7.1")
    @patch.object(tc, "read_version", return_value="2.8.0")
    def test_mismatch_calls_sync_with_pubspec_version(
        self,
        mock_read_version: MagicMock,
        mock_read_sc: MagicMock,
        mock_info: MagicMock,
        mock_ok: MagicMock,
        mock_sync: MagicMock,
    ) -> None:
        self.assertTrue(tc.ensure_server_constants_version_sync())
        mock_sync.assert_called_once_with("2.8.0")

    @patch.object(tc, "fail")
    @patch.object(tc, "read_server_constants_package_version", return_value="2.8.0")
    @patch.object(tc, "read_version", return_value="unknown")
    def test_invalid_pubspec_version_fails_without_sync(
        self,
        mock_read_version: MagicMock,
        mock_read_sc: MagicMock,
        mock_fail: MagicMock,
    ) -> None:
        with patch.object(tc, "sync_server_constants_version") as mock_sync:
            self.assertFalse(tc.ensure_server_constants_version_sync())
            mock_sync.assert_not_called()

    @patch.object(tc, "fail")
    @patch.object(tc, "read_server_constants_package_version", return_value=None)
    @patch.object(tc, "read_version", return_value="2.8.0")
    def test_unparseable_server_constants_fails_without_sync(
        self,
        mock_read_version: MagicMock,
        mock_read_sc: MagicMock,
        mock_fail: MagicMock,
    ) -> None:
        with patch.object(tc, "sync_server_constants_version") as mock_sync:
            self.assertFalse(tc.ensure_server_constants_version_sync())
            mock_sync.assert_not_called()

    @patch.object(tc, "info")
    @patch.object(tc, "sync_server_constants_version", return_value=False)
    @patch.object(tc, "read_server_constants_package_version", return_value="2.0.0")
    @patch.object(tc, "read_version", return_value="2.8.0")
    def test_sync_failure_propagates(
        self,
        mock_read_version: MagicMock,
        mock_read_sc: MagicMock,
        mock_sync: MagicMock,
        mock_info: MagicMock,
    ) -> None:
        self.assertFalse(tc.ensure_server_constants_version_sync())


class TestReadServerConstantsPackageVersion(unittest.TestCase):
    """Smoke test for regex extraction against a real temp file."""

    def test_extracts_semver_from_file(self) -> None:
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".dart",
            delete=False,
            encoding="utf-8",
        ) as f:
            f.write(
                "class X {\n"
                "  static const String packageVersion = '9.8.7';\n"
                "}\n",
            )
            path = f.name
        try:
            with patch.object(tc, "SERVER_CONSTANTS_PATH", path):
                self.assertEqual(tc.read_server_constants_package_version(), "9.8.7")
        finally:
            Path(path).unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
