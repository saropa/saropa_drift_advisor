# -*- coding: utf-8 -*-
"""Unit tests for the publish pipeline's import-graph test selection.

Covers modules.dart_build._direct_deps / _select_affected_tests against a
synthetic package laid out in a temp dir (REPO_ROOT patched). The headline case
is the multi-line conditional export (``export 'stub.dart'\n  if (...) 'io.dart';``)
that an earlier per-line parser missed, leaving the io implementation wrongly
reported as untested.
"""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules import dart_build


def _write(root: str, rel: str, text: str) -> None:
    """Write [text] to root/rel, creating parent dirs."""
    full = os.path.join(root, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(text)


def _make_pkg(root: str) -> None:
    """Lay out a minimal package: a barrel with a multi-line conditional export,
    an io/stub pair behind it, a lonely uncovered source, and two tests."""
    _write(root, "pubspec.yaml", "name: testpkg\nversion: 0.0.1\n")
    # Barrel conditionally exports io vs stub across TWO lines (the regression).
    _write(
        root,
        "lib/barrel.dart",
        "export 'src/stub.dart'\n    if (dart.library.io) 'src/io.dart';\n",
    )
    _write(root, "lib/src/io.dart", "// io impl, no imports\n")
    _write(root, "lib/src/stub.dart", "// stub impl, no imports\n")
    _write(root, "lib/src/lonely.dart", "// imported by no test\n")
    # A test that reaches io only THROUGH the barrel's conditional export.
    _write(
        root,
        "test/barrel_test.dart",
        "import 'package:testpkg/barrel.dart';\n",
    )
    # An unrelated test importing a different source.
    _write(root, "lib/src/other.dart", "// other\n")
    _write(
        root,
        "test/other_test.dart",
        "import 'package:testpkg/src/other.dart';\n",
    )


class TestImportGraphSelection(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = self._tmp.name
        _make_pkg(self.root)
        self._patch = patch.object(dart_build, "REPO_ROOT", self.root)
        self._patch.start()

    def tearDown(self) -> None:
        self._patch.stop()
        self._tmp.cleanup()

    def test_direct_deps_parses_multiline_conditional_export(self) -> None:
        """Both branches of a wrapped conditional export resolve to deps."""
        deps = dart_build._direct_deps(
            "lib/barrel.dart", "testpkg", set(dart_build._all_dart_files())
        )
        self.assertIn("lib/src/io.dart", deps)
        self.assertIn("lib/src/stub.dart", deps)

    def test_change_to_io_selects_test_via_barrel(self) -> None:
        """Editing the io file selects the test that reaches it through the barrel,
        and reports NO coverage gap (the prior false 'untested' case)."""
        selected, uncovered = dart_build._select_affected_tests(
            ["lib/src/io.dart"]
        )
        self.assertIn("test/barrel_test.dart", selected)
        self.assertEqual(uncovered, [])

    def test_uncovered_source_is_reported_not_selected(self) -> None:
        """A changed library file no test imports is a logged coverage gap."""
        selected, uncovered = dart_build._select_affected_tests(
            ["lib/src/lonely.dart"]
        )
        self.assertEqual(selected, [])
        self.assertEqual(uncovered, ["lib/src/lonely.dart"])

    def test_changed_test_file_selects_itself(self) -> None:
        """A changed *_test.dart is in its own closure, so it is selected."""
        selected, uncovered = dart_build._select_affected_tests(
            ["test/other_test.dart"]
        )
        self.assertIn("test/other_test.dart", selected)
        self.assertEqual(uncovered, [])

    def test_unrelated_change_does_not_select_barrel_test(self) -> None:
        """Selection is scoped: editing other.dart must not pull in barrel_test."""
        selected, _ = dart_build._select_affected_tests(["lib/src/other.dart"])
        self.assertIn("test/other_test.dart", selected)
        self.assertNotIn("test/barrel_test.dart", selected)


if __name__ == "__main__":
    unittest.main()
