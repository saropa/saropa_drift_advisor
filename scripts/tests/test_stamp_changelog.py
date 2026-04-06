# -*- coding: utf-8 -*-
"""Unit tests for _stamp_changelog no-op detection.

When _stamp_changelog is called a second time with the same version (e.g.
extension target after Dart already stamped and committed), it must NOT
rewrite CHANGELOG.md — otherwise the file becomes dirty with no target
owning the commit.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import mock_open, patch, MagicMock
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules.checks_version import _stamp_changelog


def _make_config(changelog_path: str = "CHANGELOG.md") -> SimpleNamespace:
    return SimpleNamespace(changelog_path=changelog_path)


# A changelog that has already been stamped: [Unreleased] above [2.17.6].
_ALREADY_STAMPED = """\
# Changelog

---

## [Unreleased]

---

## [2.17.6]

### Added
- Something cool
"""


class TestStampChangelogNoop(unittest.TestCase):
    """_stamp_changelog must skip the file write when content is unchanged."""

    @patch("modules.checks_version.ok")
    def test_second_stamp_skips_write(self, mock_ok: MagicMock) -> None:
        """Calling _stamp_changelog on an already-stamped file must not write."""
        config = _make_config("/fake/CHANGELOG.md")

        # The read returns the already-stamped content.
        m = mock_open(read_data=_ALREADY_STAMPED)
        with patch("builtins.open", m):
            result = _stamp_changelog("2.17.6", config)

        self.assertTrue(result)
        # open() should only be called once for reading — no write call.
        # If the file were written, open() would be called a second time
        # with mode "w".
        for c in m.call_args_list:
            args = c[0] if c[0] else ()
            kwargs = c[1] if c[1] else {}
            # Ensure no write mode was used
            mode = args[1] if len(args) > 1 else kwargs.get("mode", "r")
            self.assertNotIn("w", mode, "File should not have been written")

        # Should log that it's already up-to-date
        ok_calls = [c[0][0] for c in mock_ok.call_args_list]
        up_to_date_msgs = [m for m in ok_calls if "up-to-date" in m]
        self.assertTrue(
            up_to_date_msgs,
            f"Expected 'up-to-date' message, got: {ok_calls}",
        )

    @patch("modules.checks_version.ok")
    def test_first_stamp_writes_file(self, mock_ok: MagicMock) -> None:
        """The first stamp (Unreleased → version) must actually write."""
        config = _make_config("/fake/CHANGELOG.md")

        # A fresh changelog with only [Unreleased], no [2.17.6] yet.
        fresh = """\
# Changelog

---

## [Unreleased]

### Added
- Something cool
"""
        m = mock_open(read_data=fresh)
        with patch("builtins.open", m):
            result = _stamp_changelog("2.17.6", config)

        self.assertTrue(result)
        # open() should be called twice: once for read, once for write.
        write_calls = [
            c for c in m.call_args_list
            if (len(c[0]) > 1 and "w" in c[0][1])
            or ("mode" in (c[1] or {}) and "w" in c[1]["mode"])
        ]
        self.assertEqual(len(write_calls), 1, "File should be written exactly once")


if __name__ == "__main__":
    unittest.main()
