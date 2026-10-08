from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).with_name("build_profiles.py")
spec = importlib.util.spec_from_file_location("build_profiles", MODULE)
assert spec and spec.loader
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ProfileBuilderTests(unittest.TestCase):
    def test_unit_conversions(self) -> None:
        """Verify SI unit conversions from m/s to knots and feet-per-minute, and meters to feet."""
        speed_ms = 100.0
        climb_ms = 10.0
        ceiling_m = 12500.0
        self.assertAlmostEqual(speed_ms * builder.SI_TO_KT, 194.3844492440605)
        self.assertAlmostEqual(climb_ms * builder.SI_TO_FPM, 1968.503937007874)
        self.assertEqual(round(ceiling_m * builder.M_TO_FT), 41010)

    def test_parse_types_normalization_and_deduplication(self) -> None:
        """Verify types argument parsing trims, uppercases, and deduplicates."""
        parsed = builder.parse_types([" a320, b738 ", "A320", "crj9"])
        self.assertEqual(parsed, ["A320", "B738", "CRJ9"])

    def test_extract_openap_profile_with_mock_wrap(self) -> None:
        """Verify extracting limits and regimes with mocked OpenAP metadata and WRAP."""
        metadata = {"vmo": 350, "ceiling": 12500}

        class MockWrap:
            def initclimb_vs(self) -> dict[str, float]:
                return {"default": 12.59, "minimum": 9.15, "maximum": 16.04}

            def climb_vs_concas(self) -> dict[str, float]:
                return {"default": 8.43, "minimum": 6.28, "maximum": 10.6}

            def descent_vs_concas(self) -> dict[str, float]:
                return {"default": -10.5, "minimum": -15.0, "maximum": -6.0}

            def finalapp_vs(self) -> dict[str, float]:
                return {"default": -3.84, "minimum": -4.56, "maximum": -3.12}

            def takeoff_acceleration(self) -> dict[str, float]:
                return {"default": 1.82, "minimum": 1.37, "maximum": 2.28}

            def landing_acceleration(self) -> dict[str, float]:
                return {"default": -1.36, "minimum": -2.14, "maximum": -0.57}

            def initclimb_vcas(self) -> dict[str, float]:
                return {"default": 87.0, "minimum": 80.0, "maximum": 93.0}

            def climb_const_vcas(self) -> dict[str, float]:
                return {"default": 151.0, "minimum": 140.0, "maximum": 161.0}

            def descent_const_vcas(self) -> dict[str, float]:
                return {"default": 145.0, "minimum": 132.0, "maximum": 159.0}

            def finalapp_vcas(self) -> dict[str, float]:
                return {"default": 72.0, "minimum": 67.0, "maximum": 77.0}

            def landing_speed(self) -> dict[str, float]:
                return {"default": 70.0, "minimum": 65.0, "maximum": 75.0}

        profile = builder.extract_openap_profile("A320", metadata, MockWrap())
        self.assertEqual(profile["source"], "openap")
        self.assertEqual(profile["limits"]["maxControlledSpeedKt"], 350)
        self.assertEqual(profile["limits"]["serviceCeilingFt"], 41010)

        # Vertical speeds
        self.assertAlmostEqual(
            profile["regimes"]["initialClimb"]["nominalClimbFpm"],
            12.59 * builder.SI_TO_FPM,
        )
        self.assertAlmostEqual(
            profile["regimes"]["climb"]["nominalClimbFpm"],
            8.43 * builder.SI_TO_FPM,
        )
        self.assertAlmostEqual(
            profile["regimes"]["arrival"]["nominalDescentFpm"],
            10.5 * builder.SI_TO_FPM,
        )
        self.assertAlmostEqual(
            profile["regimes"]["enroute"]["nominalDescentFpm"],
            10.5 * builder.SI_TO_FPM,
        )
        self.assertAlmostEqual(
            profile["regimes"]["approach"]["nominalDescentFpm"],
            3.84 * builder.SI_TO_FPM,
        )
        self.assertAlmostEqual(
            profile["regimes"]["landing"]["nominalDescentFpm"],
            3.84 * builder.SI_TO_FPM,
        )

        # Accelerations
        self.assertAlmostEqual(
            profile["regimes"]["initialClimb"]["accelKtPerS"],
            1.82 * builder.SI_TO_KT,
        )
        self.assertAlmostEqual(
            profile["regimes"]["climb"]["accelKtPerS"],
            1.82 * builder.SI_TO_KT,
        )
        self.assertAlmostEqual(
            profile["regimes"]["approach"]["decelKtPerS"],
            1.36 * builder.SI_TO_KT,
        )
        self.assertAlmostEqual(
            profile["regimes"]["landing"]["decelKtPerS"],
            1.36 * builder.SI_TO_KT,
        )

        # Speeds
        self.assertAlmostEqual(
            profile["regimes"]["initialClimb"]["minSpeedKt"],
            80.0 * builder.SI_TO_KT,
        )
        self.assertAlmostEqual(
            profile["regimes"]["initialClimb"]["maxSpeedKt"],
            93.0 * builder.SI_TO_KT,
        )
        self.assertAlmostEqual(
            profile["regimes"]["climb"]["minSpeedKt"],
            140.0 * builder.SI_TO_KT,
        )
        self.assertAlmostEqual(
            profile["regimes"]["climb"]["maxSpeedKt"],
            161.0 * builder.SI_TO_KT,
        )
        self.assertAlmostEqual(
            profile["regimes"]["arrival"]["minSpeedKt"],
            132.0 * builder.SI_TO_KT,
        )
        self.assertAlmostEqual(
            profile["regimes"]["arrival"]["maxSpeedKt"],
            159.0 * builder.SI_TO_KT,
        )
        self.assertAlmostEqual(
            profile["regimes"]["approach"]["minSpeedKt"],
            67.0 * builder.SI_TO_KT,
        )
        self.assertAlmostEqual(
            profile["regimes"]["approach"]["maxSpeedKt"],
            77.0 * builder.SI_TO_KT,
        )
        self.assertAlmostEqual(
            profile["regimes"]["landing"]["minSpeedKt"],
            65.0 * builder.SI_TO_KT,
        )
        self.assertAlmostEqual(
            profile["regimes"]["landing"]["maxSpeedKt"],
            75.0 * builder.SI_TO_KT,
        )

    def test_fallback_tolerance_for_missing_or_failed_types(self) -> None:
        """Aircraft with failed OpenAP lookup remain empty without raising exceptions."""
        dataset = {
            "defaults": {"limits": {}, "regimes": {}},
            "aircraft": {"A320": {}, "UNKNOWN": {}},
        }

        def mock_reader(icao: str) -> tuple[dict[str, int] | None, None]:
            if icao == "A320":
                return {"vmo": 350, "ceiling": 12500}, None
            return None, None

        result = builder.populate_dataset(dataset, reader=mock_reader)
        # UNKNOWN remains empty dict
        self.assertEqual(result["aircraft"]["UNKNOWN"], {})

    def test_populate_dataset_with_types_restriction(self) -> None:
        """Restricting update with types_to_update only modifies specified types."""
        dataset = {
            "defaults": {"limits": {}, "regimes": {}},
            "aircraft": {"A320": {}, "B738": {}},
        }

        def mock_reader(icao: str) -> tuple[dict[str, int], object]:
            return {"vmo": 340, "ceiling": 12500}, object()

        builder.populate_dataset(dataset, types_to_update=["B738"], reader=mock_reader)
        self.assertEqual(dataset["aircraft"]["A320"], {})
        self.assertEqual(dataset["aircraft"]["B738"]["source"], "openap")
        self.assertEqual(dataset["aircraft"]["B738"]["limits"]["maxControlledSpeedKt"], 340)
        self.assertEqual(dataset["aircraft"]["B738"]["limits"]["serviceCeilingFt"], 41010)

    def test_cli_execution_and_check_flag(self) -> None:
        """CLI writes formatted JSON, --check succeeds on match and exits 2 on drift."""
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_file = Path(temp_dir) / "aircraft-profiles.json"
            base_data = {
                "defaults": {
                    "limits": {
                        "minControlledSpeedKt": 100,
                        "maxControlledSpeedKt": 340,
                        "serviceCeilingFt": 41000,
                    },
                    "regimes": {},
                },
                "aircraft": {
                    "A320": {},
                },
            }
            temp_file.write_text(json.dumps(base_data, indent=2) + "\n", encoding="utf-8")

            # Run populator on temp_file
            res = subprocess.run(
                [sys.executable, str(MODULE), "--out", str(temp_file), "--types", "A320"],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(res.returncode, 0, res.stderr)

            # Check flag against up-to-date file succeeds with 0
            check_res = subprocess.run(
                [sys.executable, str(MODULE), "--out", str(temp_file), "--check", "--types", "A320"],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(check_res.returncode, 0, check_res.stderr)

            # Alter file to simulate drift
            temp_file.write_text(json.dumps(base_data, indent=2) + "\n", encoding="utf-8")

            # Check flag detects drift and exits 2
            drift_res = subprocess.run(
                [sys.executable, str(MODULE), "--out", str(temp_file), "--check", "--types", "A320"],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(drift_res.returncode, 2)

    def test_cli_unknown_type_fails_with_exit_2(self) -> None:
        """CLI rejects types not defined in the aircraft dictionary."""
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_file = Path(temp_dir) / "aircraft-profiles.json"
            base_data = {
                "defaults": {"limits": {}, "regimes": {}},
                "aircraft": {"A320": {}},
            }
            temp_file.write_text(json.dumps(base_data, indent=2) + "\n", encoding="utf-8")

            res = subprocess.run(
                [sys.executable, str(MODULE), "--out", str(temp_file), "--types", "NONEXISTENT"],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(res.returncode, 2)
            self.assertIn("unknown aircraft type", res.stderr)

    def test_format_dataset_collapses_short_arrays(self) -> None:
        """Format dataset preserves single-line primitive arrays to match Prettier."""
        data = {"aliases": ["Bonanza", "Skyhawk"], "nested": {"single": ["Cirrus"]}}
        formatted = builder.format_dataset(data)
        self.assertIn('"aliases": ["Bonanza", "Skyhawk"]', formatted)
        self.assertIn('"single": ["Cirrus"]', formatted)


if __name__ == "__main__":
    unittest.main()
