import importlib.util
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name("build_profiles.py")
spec = importlib.util.spec_from_file_location("build_profiles", MODULE)
assert spec and spec.loader
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ProfileBuilderTests(unittest.TestCase):
    def test_types_are_normalized_deduplicated_and_sorted_in_output(self):
        self.assertEqual(builder.parse_types(["a320,b738", "A320"], None), ["A320", "B738"])

    def test_si_conversion_keeps_precision_until_serialization(self):
        value = builder.distribution({"default": 100, "minimum": 50, "maximum": 150}, "fake", "speed", "kt")
        self.assertAlmostEqual(value["value"], 194.3844492440605)
        self.assertAlmostEqual(value["minimum"], 97.19222462203024)

    def test_unresolved_mapping_is_emitted(self):
        result = builder.build_profile(
            {"icaoType": "NOPE", "representativeVariant": "unknown", "representativeEngine": "unknown"},
            {"limits": {"minControlledSpeedKt": 100, "maxControlledSpeedKt": 340, "serviceCeilingFt": 41000}, "regimes": {}},
            lambda _: (_ for _ in ()).throw(AssertionError("reader must not run")),
        )
        self.assertEqual(result["status"], "UNRESOLVED")

    def test_mocked_openap_regime_is_converted_and_policy_is_provenanced(self):
        policy = {"limits": {"minControlledSpeedKt": 100, "maxControlledSpeedKt": 340, "serviceCeilingFt": 41000}, "regimes": {}}
        for regime in builder.REGIMES:
            policy["regimes"][regime] = {"maxBankDeg": 25, "openap": {"nominalClimbFpm": {"method": "climb_vs", "unit": "fpm"}}}
        mapping = {"icaoType": "A320", "representativeVariant": "A320", "representativeEngine": "engine", "openapType": "A320"}

        class FakeWrap:
            def climb_vs(self):
                return {"default": 10, "minimum": 5, "maximum": 15}

        profile = builder.build_profile(mapping, policy, lambda _: ({"vmo": 300, "ceiling": 39000}, FakeWrap()))
        self.assertEqual(profile["status"], "SUPPORTED")
        self.assertAlmostEqual(profile["regimes"]["climb"]["nominalClimbFpm"], 1968.503937007874)
        self.assertEqual(profile["provenance"]["climb"]["maxBankDeg"]["kind"], "simulator-policy")

    def test_serialized_dataset_has_no_wall_clock_field(self):
        mappings = [{"icaoType": "A320", "representativeVariant": "A320", "representativeEngine": "engine"}]
        policies = {"limits": {"minControlledSpeedKt": 100, "maxControlledSpeedKt": 340, "serviceCeilingFt": 41000}, "regimes": {}}
        for regime in builder.REGIMES:
            policies["regimes"][regime] = {"maxBankDeg": 25, "openap": {}}
        dataset = builder.make_dataset(["A320"], mappings, policies, lambda _: ({}, None))
        self.assertNotIn("generatedAt", dataset["generator"])


if __name__ == "__main__":
    unittest.main()
