# -*- coding: utf-8 -*-
"""Tests for the runtime (System B) l10n toolchain (plan 75 §4).

Covers the pure, deterministic cores: registry extraction/unescape, brand
shielding + classification, provenance quality model, scope selection, the audit
classifier (on synthetic in-memory bundles), sync currency, the circuit breaker,
the translate gate, and CLI dispatch. The actual machine-translation path is never
exercised (and never runs in this repo).
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parents[1]
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from modules.l10n import audit, bundles, brands, cli, engines, extract, provenance, scopes
from modules.l10n.provenance import (
    ENGINE_GOOGLE, ENGINE_IDENTITY, ENGINE_MANUAL, ENGINE_NLLB, ENGINE_UNTRACKED,
)


class TestExtract(unittest.TestCase):
    def test_parses_keys_values_and_unescapes(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "strings-x.ts"
            f.write_text(
                "/** header with a fake 'doc.key': 'ignored' example */\n"
                "export const x: Record<string, string> = {\n"
                "  'a.b': 'Hello',\n"
                "  'c.d':\n    'Multi-line value {0}',\n"
                "  'e.f': 'It\\'s escaped',\n"
                "  'g.h': 'dot \\u00b7 mark',\n"
                "};\n",
                encoding="utf-8",
            )
            parsed = extract.parse_registry_file(f)
        self.assertEqual(parsed["a.b"], "Hello")
        self.assertEqual(parsed["c.d"], "Multi-line value {0}")
        self.assertEqual(parsed["e.f"], "It's escaped")
        self.assertEqual(parsed["g.h"], "dot · mark")
        # The doc-comment example before `= {` must NOT be scraped.
        self.assertNotIn("doc.key", parsed)

    def test_real_registries_extract(self):
        # Smoke: the live registries parse into non-trivial maps.
        self.assertGreater(len(extract.extract_host()), 100)
        self.assertGreater(len(extract.extract_web()), 100)


class TestBrands(unittest.TestCase):
    def test_brand_only(self):
        self.assertTrue(brands.is_brand_only("Drift"))
        self.assertTrue(brands.is_brand_only("SQLite"))
        self.assertTrue(brands.is_brand_only("Saropa Drift Advisor"))
        self.assertFalse(brands.is_brand_only("Open in Drift"))

    def test_acronym_only(self):
        self.assertTrue(brands.is_acronym_only("SQL"))
        self.assertTrue(brands.is_acronym_only("PII"))
        self.assertFalse(brands.is_acronym_only("Copy SQL"))

    def test_no_translatable_content(self):
        self.assertTrue(brands.is_no_translatable_content("{0}/100"))
        self.assertTrue(brands.is_no_translatable_content("{0} #"))
        self.assertFalse(brands.is_no_translatable_content("Rows {0}"))

    def test_shield_unshield_roundtrip(self):
        text = "Open Saropa Drift Advisor with SQLite"
        shielded, repl = brands.shield_brands(text)
        self.assertNotIn("Saropa Drift Advisor", shielded)
        self.assertEqual(brands.unshield_brands(shielded, repl), text)

    def test_validate_brands_flags_dropped(self):
        self.assertEqual(brands.validate_brands("Use SQLite", "Use SQLite"), [])
        self.assertIn("SQLite", brands.validate_brands("Use SQLite", "Use Datenbank"))


class TestProvenance(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._orig = provenance.PROVENANCE_DIR
        provenance.PROVENANCE_DIR = Path(self._tmp.name)

    def tearDown(self):
        provenance.PROVENANCE_DIR = self._orig
        self._tmp.cleanup()

    def test_quality_classification(self):
        self.assertFalse(provenance.is_low_quality(ENGINE_NLLB))
        self.assertFalse(provenance.is_low_quality(ENGINE_MANUAL))
        self.assertTrue(provenance.is_low_quality(ENGINE_GOOGLE))
        self.assertTrue(provenance.is_low_quality(None))
        self.assertTrue(provenance.is_low_quality("some_unknown_engine"))

    def test_save_load_roundtrip(self):
        provenance.save_provenance("de", {"viewer.a": ENGINE_NLLB})
        provenance.save_provenance("de", {"viewer.b": ENGINE_GOOGLE})
        loaded = provenance.load_provenance("de")
        self.assertEqual(loaded, {"viewer.a": ENGINE_NLLB, "viewer.b": ENGINE_GOOGLE})

    def test_classify_brand_is_identity_not_untracked(self):
        # A brand value classifies as identity even with no provenance record.
        counts = provenance.classify_translated_keys(
            "de", {"k.brand": "SQLite", "k.real": "Hello"},
        )
        self.assertEqual(counts.get(ENGINE_IDENTITY), 1)
        self.assertEqual(counts.get(ENGINE_UNTRACKED), 1)

    def test_quality_split(self):
        high, low = provenance.quality_split({ENGINE_NLLB: 3, ENGINE_GOOGLE: 2, ENGINE_UNTRACKED: 1})
        self.assertEqual((high, low), (3, 3))


class TestScopes(unittest.TestCase):
    def setUp(self):
        self.source = {"k.a": "Apple", "k.b": "Banana", "k.brand": "SQLite", "k.c": "Cherry"}

    def test_missing(self):
        translated = {"k.a": "Apfel"}
        got = scopes.select_keys(scopes.SCOPE_MISSING, self.source, translated, "de")
        self.assertEqual(got, {"k.b", "k.brand", "k.c"})

    def test_gaps_excludes_brand_encopy(self):
        # k.b is an en-copy (real gap); k.brand is an en-copy but forced-identity (not a gap).
        translated = {"k.a": "Apfel", "k.b": "Banana", "k.brand": "SQLite"}
        got = scopes.select_keys(scopes.SCOPE_GAPS, self.source, translated, "de")
        self.assertIn("k.b", got)        # en-copy → gap
        self.assertIn("k.c", got)        # missing → gap
        self.assertNotIn("k.brand", got)  # brand en-copy → not a gap

    def test_low_quality_picks_weak_provenance(self):
        translated = {"k.a": "Apfel", "k.b": "Banane"}
        prov = {"k.a": ENGINE_NLLB, "k.b": ENGINE_GOOGLE}
        got = scopes.select_keys(scopes.SCOPE_LOW_QUALITY, self.source, translated, "de", prov)
        self.assertEqual(got, {"k.b"})

    def test_unknown_scope_raises(self):
        with self.assertRaises(ValueError):
            scopes.select_keys("nonsense", self.source, {}, "de")


class TestEngines(unittest.TestCase):
    def test_circuit_breaker_opens_and_resets(self):
        b = engines.CircuitBreaker(threshold=3)
        b.check()  # closed
        b.record_failure(); b.record_failure()
        b.check()  # still closed at 2
        b.record_failure()
        with self.assertRaises(engines.CircuitOpenError):
            b.check()
        b.record_success()
        b.check()  # reset

    def test_translate_refuses_without_authorization(self):
        b = engines.CircuitBreaker()
        with self.assertRaises(engines.TranslationNotAuthorizedError):
            engines.translate_one("Hello", "de", authorized=False, breaker=b)

    def test_make_locale_translator_refuses_without_authorization(self):
        b = engines.CircuitBreaker()
        with self.assertRaises(engines.TranslationNotAuthorizedError):
            engines.make_locale_translator("de", authorized=False, breaker=b)

    def test_make_locale_translator_google_when_nllb_skipped(self):
        # SAROPA_SKIP_NLLB disables NLLB → Google label, no model load. _google_translate
        # is faked so the test makes no network call.
        import os
        b = engines.CircuitBreaker()
        orig_g = engines._google_translate
        engines._google_translate = lambda text, loc: f"G:{text}"
        os.environ["SAROPA_SKIP_NLLB"] = "1"
        try:
            fn, label = engines.make_locale_translator("de", authorized=True, breaker=b)
            self.assertEqual(label, engines.ENGINE_LABEL_GOOGLE)
            self.assertEqual(fn("Hello"), "G:Hello")
        finally:
            engines._google_translate = orig_g
            os.environ.pop("SAROPA_SKIP_NLLB", None)

    def test_nllb_cache_probe_returns_bool(self):
        # Delegates to nllb_engine.is_available without loading the model.
        self.assertIsInstance(engines.nllb_model_is_cached(), bool)


class TestAuditSync(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        # Redirect bundle + provenance IO to the temp tree.
        self._orig = (bundles.HOST_L10N_DIR, bundles.WEB_L10N_DIR, provenance.PROVENANCE_DIR)
        bundles.HOST_L10N_DIR = root / "l10n"
        bundles.WEB_L10N_DIR = root / "web"
        provenance.PROVENANCE_DIR = root / "l10n" / "provenance"
        # Pin a tiny synthetic source so the classifier is deterministic.
        self._orig_host = extract.extract_host
        self._orig_web = extract.extract_web
        extract.extract_host = lambda: {"host.greet": "Hello"}
        extract.extract_web = lambda: {"viewer.brand": "SQLite", "viewer.bye": "Bye"}

    def tearDown(self):
        bundles.HOST_L10N_DIR, bundles.WEB_L10N_DIR, provenance.PROVENANCE_DIR = self._orig
        extract.extract_host = self._orig_host
        extract.extract_web = self._orig_web
        self._tmp.cleanup()

    def test_audit_english_only_when_no_bundles(self):
        report = audit.run_audit()
        self.assertTrue(report["english_only"])
        self.assertEqual(report["locales"], [])
        self.assertEqual(report["source_keys"], 3)

    def test_audit_classifies_a_synthetic_locale(self):
        # web.de: bye translated, brand left as English (identity, not untranslated).
        bundles.write_json_atomic(
            bundles.web_locale_bundle_path("de"),
            {"viewer.bye": "Tschüss", "viewer.brand": "SQLite", "viewer.orphan": "x"},
        )
        # host bundle.l10n.de: greet untranslated (en-copy).
        bundles.write_json_atomic(
            bundles.host_locale_bundle_path("de"), {"Hello": "Hello"},
        )
        loc = audit.audit_locale("de")
        self.assertEqual(loc["translated"], 1)       # viewer.bye
        self.assertEqual(loc["identity"], 1)         # viewer.brand
        self.assertEqual(loc["untranslated"], 1)     # host greet en-copy
        self.assertEqual(loc["orphans"], 1)          # viewer.orphan
        self.assertTrue(audit.has_gaps({"locales": [loc]}))

    def test_sync_builds_base_and_is_current(self):
        from modules.l10n import sync
        res = sync.build_host_base_bundle(dry_run=False)
        self.assertEqual(res["entries"], 1)  # one host value "Hello"
        self.assertTrue(sync.base_bundle_is_current()["current"])

    def test_align_prunes_orphans(self):
        from modules.l10n import sync
        bundles.write_json_atomic(
            bundles.web_locale_bundle_path("de"),
            {"viewer.bye": "Tschüss", "viewer.gone": "stale"},
        )
        res = sync.align_locale_bundle("de", is_web=True)
        self.assertEqual(res["orphans_pruned"], 1)
        self.assertNotIn("viewer.gone", bundles.load_json(bundles.web_locale_bundle_path("de")))

    def test_translate_writes_bundles_with_injected_fake(self):
        # Confirmed translate with an injected fake translator — no network. Writes
        # the web key + the host (English-value-keyed) entry, and records provenance.
        from modules.l10n import actions
        out: list[str] = []
        fake = lambda english, locale: f"[{locale}]{english}"
        # reports_dir/timestamp are pinned to the temp tree so the run's journal
        # files land there instead of polluting the real repo reports/ folder.
        reports_dir = Path(self._tmp.name) / "reports"
        code = actions.run_translate_action(
            out.append, ["de"], "gaps", confirmed=True, translate_fn=fake, throttle=0,
            reports_dir=reports_dir, timestamp="testrun",
        )
        self.assertEqual(code, 0)
        web = bundles.load_json(bundles.web_locale_bundle_path("de"))
        host = bundles.load_json(bundles.host_locale_bundle_path("de"))
        self.assertEqual(web.get("viewer.bye"), "[de]Bye")
        self.assertEqual(host.get("Hello"), "[de]Hello")
        self.assertEqual(provenance.load_provenance("de").get("viewer.bye"), ENGINE_GOOGLE)
        # The success log and (always-created) error log exist and are surfaced.
        self.assertTrue((reports_dir / "testrun_translate.log").exists())
        self.assertTrue((reports_dir / "testrun_translate_errors.log").exists())
        self.assertTrue(any("Translation log:" in line for line in out))


class TestMenu(unittest.TestCase):
    """Interactive menu dispatch — drives input + capturing emit (no console writes)."""

    def setUp(self):
        import builtins
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        self._orig = (bundles.HOST_L10N_DIR, bundles.WEB_L10N_DIR, provenance.PROVENANCE_DIR)
        bundles.HOST_L10N_DIR = root / "l10n"
        bundles.WEB_L10N_DIR = root / "web"
        provenance.PROVENANCE_DIR = root / "l10n" / "provenance"
        self._orig_host, self._orig_web = extract.extract_host, extract.extract_web
        extract.extract_host = lambda: {"host.greet": "Hello"}
        extract.extract_web = lambda: {"viewer.bye": "Bye"}
        self._real_input = builtins.input

    def tearDown(self):
        import builtins
        bundles.HOST_L10N_DIR, bundles.WEB_L10N_DIR, provenance.PROVENANCE_DIR = self._orig
        extract.extract_host, extract.extract_web = self._orig_host, self._orig_web
        builtins.input = self._real_input
        self._tmp.cleanup()

    def _drive(self, answers):
        import builtins
        from modules.l10n import cli
        it = iter(answers)
        builtins.input = lambda *a, **k: next(it)
        out: list[str] = []
        code = cli.interactive_menu(emit=out.append, reports_dir=Path(self._tmp.name))
        return code, out

    def test_exit_choice(self):
        code, _ = self._drive(["0"])
        self.assertEqual(code, 0)

    def test_audit_choice(self):
        code, out = self._drive(["1"])
        self.assertEqual(code, 0)
        self.assertTrue(any("source keys" in line for line in out))

    def test_sync_choice_builds_baseline(self):
        code, _ = self._drive(["2"])
        self.assertEqual(code, 0)
        self.assertTrue(bundles.host_base_bundle_path().exists())

    def test_translate_all_dispatches_directly(self):
        # Menu choice 3 (translate all) dispatches immediately — no second confirm
        # (matches the reference flow). engines.make_locale_translator is
        # monkeypatched so NO engine (NLLB/Google) loads and no network call is made.
        import time as _time
        from modules.l10n import engines
        orig, orig_sleep = engines.make_locale_translator, _time.sleep
        engines.make_locale_translator = lambda loc, **k: (lambda text: f"[{loc}]{text}", "nllb")
        _time.sleep = lambda *a, **k: None  # skip the real per-call throttle in tests
        try:
            code, out = self._drive(["3"])  # single answer — no confirmation prompt
        finally:
            engines.make_locale_translator, _time.sleep = orig, orig_sleep
        self.assertEqual(code, 0)
        self.assertTrue(any("translations across" in line for line in out))

    def test_translate_specific_unknown_locale_cancels(self):
        code, out = self._drive(["4", "xx"])  # specific locales → invalid tag
        self.assertEqual(code, 2)
        self.assertTrue(any("Unknown locale" in line for line in out))


class TestCli(unittest.TestCase):
    def test_audit_dispatch_returns_zero(self):
        out: list[str] = []
        with tempfile.TemporaryDirectory():
            code = cli.main(["--run-mode", "audit"], emit=out.append)
        self.assertEqual(code, 0)

    def test_translate_refuses(self):
        out: list[str] = []
        code = cli.main(["--run-mode", "translate"], emit=out.append)
        self.assertEqual(code, 1)
        self.assertTrue(any("REFUSED" in line for line in out))

    def test_translate_refuses_without_confirm_flag(self):
        # Named locale but no --confirm-translate → still gated.
        out: list[str] = []
        code = cli.main(["--run-mode", "translate", "--locales", "de"], emit=out.append)
        self.assertEqual(code, 1)
        self.assertTrue(any("REFUSED" in line for line in out))


if __name__ == "__main__":
    unittest.main()
