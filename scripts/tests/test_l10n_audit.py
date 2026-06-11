# -*- coding: utf-8 -*-
"""Unit tests for modules.l10n_audit (plan 75 §5.5 publish-time manifest l10n audit).

Points the module's EXTENSION_DIR / REPO_ROOT at a temp directory holding synthetic
package.nls*.json bundles, so the gap math (missing vs untranslated vs translated)
and the report writer are exercised without touching the real extension manifest.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules import l10n_audit


def _write(dir_path: Path, name: str, data: dict) -> None:
    (dir_path / name).write_text(json.dumps(data), encoding="utf-8")


class TestAuditManifestNls(unittest.TestCase):
    """Branch coverage for audit_manifest_nls classification."""

    def test_no_locale_bundles_has_no_gaps(self) -> None:
        with TemporaryDirectory() as tmp:
            ext = Path(tmp)
            _write(ext, "package.nls.json", {"a.title": "A", "b.title": "B"})
            with patch.object(l10n_audit, "EXTENSION_DIR", str(ext)):
                audit = l10n_audit.audit_manifest_nls()
        self.assertEqual(audit["total_keys"], 2)
        self.assertEqual(audit["locale_count"], 0)
        self.assertFalse(audit["has_gaps"])

    def test_partial_locale_counts_missing_untranslated_translated(self) -> None:
        with TemporaryDirectory() as tmp:
            ext = Path(tmp)
            _write(ext, "package.nls.json", {"a.title": "A", "b.title": "B", "c.title": "C"})
            # de: a translated, b still English (untranslated), c absent (missing).
            _write(ext, "package.nls.de.json", {"a.title": "Ä", "b.title": "B"})
            with patch.object(l10n_audit, "EXTENSION_DIR", str(ext)):
                audit = l10n_audit.audit_manifest_nls()
        self.assertEqual(audit["locale_count"], 1)
        de = audit["locales"]["de"]
        self.assertEqual(de["translated"], 1)
        self.assertEqual(de["untranslated"], 1)
        self.assertEqual(de["missing"], 1)
        self.assertEqual(de["pct"], 33)  # round(1/3 * 100)
        self.assertTrue(audit["has_gaps"])

    def test_fully_translated_locale_has_no_gaps(self) -> None:
        with TemporaryDirectory() as tmp:
            ext = Path(tmp)
            _write(ext, "package.nls.json", {"a.title": "A", "b.title": "B"})
            _write(ext, "package.nls.fr.json", {"a.title": "Aa", "b.title": "Bb"})
            with patch.object(l10n_audit, "EXTENSION_DIR", str(ext)):
                audit = l10n_audit.audit_manifest_nls()
        fr = audit["locales"]["fr"]
        self.assertEqual(fr["translated"], 2)
        self.assertEqual(fr["pct"], 100)
        self.assertFalse(audit["has_gaps"])

    def test_base_package_nls_is_not_treated_as_a_locale(self) -> None:
        # Guards the locale-file regex: package.nls.json (the base) must NOT match
        # as a locale named "json", which would corrupt the count.
        with TemporaryDirectory() as tmp:
            ext = Path(tmp)
            _write(ext, "package.nls.json", {"a.title": "A"})
            with patch.object(l10n_audit, "EXTENSION_DIR", str(ext)):
                audit = l10n_audit.audit_manifest_nls()
        self.assertEqual(audit["locale_count"], 0)
        self.assertNotIn("json", audit["locales"])


class TestWriteAuditReport(unittest.TestCase):
    """The report writer always produces a parseable JSON file under reports/."""

    def test_report_written_and_parseable(self) -> None:
        with TemporaryDirectory() as tmp:
            repo = Path(tmp)
            audit = {"total_keys": 5, "locale_count": 0, "locales": {}, "has_gaps": False}
            with patch.object(l10n_audit, "REPO_ROOT", str(repo)):
                path = l10n_audit.write_audit_report(audit)
            self.assertTrue(Path(path).is_file())
            payload = json.loads(Path(path).read_text(encoding="utf-8"))
        self.assertEqual(payload["kind"], "manifest-nls-audit")
        self.assertEqual(payload["total_keys"], 5)
        self.assertIn("note", payload)  # the floor-not-a-guarantee caveat must ship


if __name__ == "__main__":
    unittest.main()
