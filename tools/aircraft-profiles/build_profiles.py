#!/usr/bin/env python3
"""Build the checked-in aircraft performance artifact.

OpenAP is deliberately a build-time dependency.  This command never downloads
data: install the pinned requirement first, then run it offline.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import math
import sys
from pathlib import Path
from typing import Any, Callable

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
DEFAULT_OUT = ROOT / "src/core/performance/aircraft-profiles.generated.json"
PRESETS = {"terminal-v1": [
    "B737", "B738", "B739", "B752", "B753", "B744", "B788", "B789", "B78X",
    "A320", "A321", "E135", "E140", "E145", "E170", "E175", "E190", "E195",
    "CRJ1", "CRJ2", "CRJ7", "CRJ9", "CRJX", "A20N", "A21N", "B38M", "B39M",
    "E290", "E295", "B763", "B772", "B77W", "A333",
]}
REGIMES = ("initialClimb", "climb", "enroute", "arrival", "approach", "missedApproach", "landing")
SI_TO_KT = 1.9438444924406048
SI_TO_FPM = 196.8503937007874
SI_ACCEL_TO_KT_PER_S = SI_TO_KT


def canonical_json(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def sha256(value: Any) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


def load_json(name: str) -> Any:
    with (HERE / name).open(encoding="utf-8") as stream:
        return json.load(stream)


def parse_types(values: list[str], preset: str | None) -> list[str]:
    raw = PRESETS[preset] if preset else values
    if not raw:
        raise ValueError("provide --preset terminal-v1 or at least one --types value")
    result: list[str] = []
    seen: set[str] = set()
    for value in raw:
        for item in value.split(","):
            key = item.strip().upper()
            if not key:
                continue
            if key in seen:
                continue
            seen.add(key)
            result.append(key)
    return result


def finite_number(value: Any, label: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} must be numeric") from exc
    if not math.isfinite(number):
        raise ValueError(f"{label} must be finite")
    return number


def convert(value: Any, unit: str, label: str) -> float:
    number = finite_number(value, label)
    if unit == "kt":
        return number * SI_TO_KT
    if unit == "fpm":
        return number * SI_TO_FPM
    if unit == "kt/s":
        return number * SI_ACCEL_TO_KT_PER_S
    if unit in ("ft", "deg"):
        return number
    raise ValueError(f"unsupported source unit {unit!r} for {label}")


def distribution(raw: Any, method: str, field: str, unit: str) -> dict[str, Any]:
    """Extract WRAP's default/minimum/maximum without early rounding."""
    if not isinstance(raw, dict):
        raise ValueError(f"OpenAP {method}.{field} response is not a dictionary")
    if "default" not in raw:
        raise ValueError(f"OpenAP {method}.{field} response lacks default")
    return {
        "value": convert(raw["default"], unit, f"{method}.{field}.default"),
        "minimum": convert(raw["minimum"], unit, f"{method}.{field}.minimum") if "minimum" in raw else None,
        "maximum": convert(raw["maximum"], unit, f"{method}.{field}.maximum") if "maximum" in raw else None,
        "provenance": {"kind": "openap-wrap", "method": f"{method}.{field}", "unit": unit},
    }


def openap_reader(alias: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Read public OpenAP APIs; kept in one adapter for version changes/tests."""
    try:
        prop = importlib.import_module("openap.prop")
        kinematic = importlib.import_module("openap.kinematic")
    except ImportError as exc:
        raise RuntimeError("OpenAP is not installed; install tools/aircraft-profiles/requirements.txt") from exc
    aircraft_fn = getattr(prop, "aircraft", None)
    wrap_fn = getattr(kinematic, "WRAP", None)
    if not callable(aircraft_fn) or not callable(wrap_fn):
        raise RuntimeError("installed OpenAP version lacks prop.aircraft or kinematic.WRAP")
    metadata = aircraft_fn(alias)
    wrap = wrap_fn(alias)
    return metadata, wrap


def call_wrap(wrap: Any, method: str) -> Any:
    fn = getattr(wrap, method, None)
    if not callable(fn):
        raise ValueError(f"OpenAP WRAP object lacks {method}()")
    return fn()


def build_profile(mapping: dict[str, Any], policy: dict[str, Any], reader: Callable[[str], tuple[dict[str, Any], Any]]) -> dict[str, Any]:
    icao = mapping["icaoType"]
    profile: dict[str, Any] = {
        "icaoType": icao,
        "representativeVariant": mapping["representativeVariant"],
        "representativeEngine": mapping["representativeEngine"],
        "openapType": mapping.get("openapType"),
        "status": "UNRESOLVED",
        "limits": None,
        "regimes": None,
        "provenance": {"mapping": {"kind": "mapping", "note": mapping.get("note", "")}},
    }
    if not mapping.get("openapType"):
        profile["provenance"]["status"] = {"kind": "unresolved", "reason": "no reviewed OpenAP alias"}
        return profile
    try:
        metadata, wrap = reader(mapping["openapType"])
        if not isinstance(metadata, dict):
            raise ValueError("aircraft metadata is not a dictionary")
        limits = {"minControlledSpeedKt": policy["limits"]["minControlledSpeedKt"],
                  "maxControlledSpeedKt": finite_number(metadata.get("vmo", policy["limits"]["maxControlledSpeedKt"]), "vmo"),
                  "serviceCeilingFt": finite_number(metadata.get("ceiling", policy["limits"]["serviceCeilingFt"]), "ceiling")}
        regimes: dict[str, Any] = {}
        for regime in REGIMES:
            source = policy["regimes"][regime].copy()
            source_fields = {k: v for k, v in source.pop("openap", {}).items()}
            values: dict[str, Any] = {}
            provenance: dict[str, Any] = {}
            for field, spec in source_fields.items():
                values[field] = distribution(call_wrap(wrap, spec["method"]), spec["method"], field, spec["unit"])["value"]
                provenance[field] = {"kind": "openap-wrap", "method": spec["method"], "unit": spec["unit"]}
            for field, value in source.items():
                values[field] = value
                provenance[field] = {"kind": "simulator-policy", "policy": f"regimes.{regime}.{field}"}
            regimes[regime] = values
            profile["provenance"][regime] = provenance
        profile["limits"] = limits
        profile["regimes"] = regimes
        profile["status"] = "SUPPORTED"
    except (RuntimeError, ValueError, KeyError, TypeError) as exc:
        profile["provenance"]["status"] = {"kind": "unresolved", "reason": str(exc)}
    return profile


def validate(dataset: dict[str, Any], requested: list[str]) -> None:
    profiles = dataset["profiles"]
    keys = [p["icaoType"] for p in profiles]
    if keys != sorted(requested):
        raise ValueError("profiles must contain requested types sorted by ICAO type exactly once")
    for profile in profiles:
        if profile["status"] == "SUPPORTED":
            limits = profile["limits"]
            if limits["minControlledSpeedKt"] > limits["maxControlledSpeedKt"]:
                raise ValueError(f"reversed speed bounds for {profile['icaoType']}")
            for regime in profile["regimes"].values():
                for value in regime.values():
                    if isinstance(value, (int, float)) and not math.isfinite(value):
                        raise ValueError(f"nonfinite value for {profile['icaoType']}")


def make_dataset(types: list[str], mappings: list[dict[str, Any]], policies: dict[str, Any], reader: Callable[[str], tuple[dict[str, Any], Any]]) -> dict[str, Any]:
    by_icao = {row["icaoType"]: row for row in mappings}
    missing = [key for key in types if key not in by_icao]
    if missing:
        raise ValueError(f"unknown mapping for ICAO type(s): {', '.join(missing)}")
    profiles = [build_profile(by_icao[key], policies, reader) for key in sorted(types)]
    dataset = {"schemaVersion": 1, "generator": {"openapVersion": openap_version(), "mappingSha256": sha256(mappings), "policySha256": sha256(policies)}, "profiles": profiles}
    validate(dataset, types)
    return dataset


def openap_version() -> str:
    try:
        return importlib.metadata.version("openap")
    except importlib.metadata.PackageNotFoundError:
        return "uninstalled"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preset", choices=sorted(PRESETS))
    parser.add_argument("--types", action="append", default=[], help="ICAO ids; repeat or comma-separate")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--check", action="store_true", help="fail when generated output differs")
    parser.add_argument("--report", action="store_true", help="print mappings, provenance, and unresolved types")
    args = parser.parse_args(argv)
    try:
        types = parse_types(args.types, args.preset)
        mappings = load_json("type-mappings.json")
        policies = load_json("simulator-policies.json")
        dataset = make_dataset(types, mappings, policies, openap_reader)
        encoded = json.dumps(dataset, indent=2, sort_keys=False) + "\n"
        if args.check:
            if not args.out.exists() or args.out.read_text(encoding="utf-8") != encoded:
                raise ValueError(f"generated artifact differs: {args.out}")
        else:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(encoded, encoding="utf-8")
        if args.report:
            for profile in dataset["profiles"]:
                print(f"{profile['icaoType']}: {profile['status']} ({profile['openapType'] or 'no alias'})")
        return 0
    except (ValueError, RuntimeError, OSError) as exc:
        print(f"aircraft profile build: error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
