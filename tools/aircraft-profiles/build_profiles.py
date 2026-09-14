#!/usr/bin/env python3
"""Direct OpenAP aircraft profile populator.

Reads src/core/performance/aircraft-profiles.json directly, queries OpenAP
(openap.prop.aircraft and openap.kinematic.WRAP), and populates aircraft overrides
with "source": "openap".
"""
from __future__ import annotations

import argparse
import importlib
import json
import math
import sys
from pathlib import Path
from typing import Any, Callable

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
DEFAULT_OUT = ROOT / "src/core/performance/aircraft-profiles.json"
SI_TO_KT = 1.9438444924406048
SI_TO_FPM = 196.8503937007874


def parse_types(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        for item in value.split(","):
            key = item.strip().upper()
            if not key or key in seen:
                continue
            seen.add(key)
            result.append(key)
    return result


def finite_number(value: Any, label: str) -> float | int:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} must be numeric") from exc
    if not math.isfinite(number):
        raise ValueError(f"{label} must be finite")
    if isinstance(value, int):
        return value
    return number


def query_openap(icao: str) -> tuple[dict[str, Any] | None, Any | None]:
    """Query OpenAP prop and WRAP directly for an aircraft type."""
    try:
        prop = importlib.import_module("openap.prop")
        kinematic = importlib.import_module("openap.kinematic")
    except ImportError:
        return None, None

    aircraft_fn = getattr(prop, "aircraft", None)
    wrap_fn = getattr(kinematic, "WRAP", None)
    if not callable(aircraft_fn) or not callable(wrap_fn):
        return None, None

    try:
        metadata = aircraft_fn(icao)
        wrap = wrap_fn(icao)
        return metadata, wrap
    except Exception:
        return None, None


def extract_openap_profile(icao: str, metadata: dict[str, Any], wrap: Any) -> dict[str, Any]:
    """Extract limits and regime speeds from OpenAP metadata and WRAP kinematics."""
    limits: dict[str, Any] = {}
    vmo = metadata.get("vmo")
    if vmo is not None:
        limits["maxControlledSpeedKt"] = finite_number(vmo, f"{icao}.vmo")
    ceiling = metadata.get("ceiling")
    if ceiling is not None:
        limits["serviceCeilingFt"] = finite_number(ceiling, f"{icao}.ceiling")

    regimes: dict[str, Any] = {}

    # initialClimb: nominalClimbFpm from wrap.initclimb_vs() default, converted m/s -> fpm
    init_fn = getattr(wrap, "initclimb_vs", None)
    if callable(init_fn):
        try:
            init_res = init_fn()
            val = init_res.get("default") if isinstance(init_res, dict) else init_res
            if val is not None:
                regimes.setdefault("initialClimb", {})["nominalClimbFpm"] = (
                    finite_number(val, f"{icao}.initclimb_vs") * SI_TO_FPM
                )
        except Exception:
            pass

    # climb: nominalClimbFpm from wrap.climb_vs_concas() default, converted m/s -> fpm
    climb_fn = getattr(wrap, "climb_vs_concas", None)
    if callable(climb_fn):
        try:
            climb_res = climb_fn()
            val = climb_res.get("default") if isinstance(climb_res, dict) else climb_res
            if val is not None:
                regimes.setdefault("climb", {})["nominalClimbFpm"] = (
                    finite_number(val, f"{icao}.climb_vs_concas") * SI_TO_FPM
                )
        except Exception:
            pass

    # approach: minSpeedKt / maxSpeedKt from wrap.finalapp_vcas() min/max or default, converted m/s -> kt
    app_fn = getattr(wrap, "finalapp_vcas", None)
    if callable(app_fn):
        try:
            app_res = app_fn()
            if isinstance(app_res, dict):
                min_val = app_res.get("minimum", app_res.get("default"))
                max_val = app_res.get("maximum", app_res.get("default"))
            else:
                min_val = app_res
                max_val = app_res

            app_dict: dict[str, Any] = {}
            if min_val is not None:
                app_dict["minSpeedKt"] = (
                    finite_number(min_val, f"{icao}.finalapp_vcas.min") * SI_TO_KT
                )
            if max_val is not None:
                app_dict["maxSpeedKt"] = (
                    finite_number(max_val, f"{icao}.finalapp_vcas.max") * SI_TO_KT
                )
            if app_dict:
                regimes["approach"] = app_dict
        except Exception:
            pass

    override: dict[str, Any] = {"source": "openap"}
    if limits:
        override["limits"] = limits
    if regimes:
        override["regimes"] = regimes
    return override


def populate_dataset(
    data: dict[str, Any],
    types_to_update: list[str] | None = None,
    reader: Callable[[str], tuple[dict[str, Any] | None, Any | None]] = query_openap,
) -> dict[str, Any]:
    """Update aircraft entries in the dataset in-place using the given reader."""
    aircraft = data.setdefault("aircraft", {})
    target_keys = types_to_update if types_to_update is not None else list(aircraft.keys())

    for icao in target_keys:
        metadata, wrap = reader(icao)
        if metadata is None or wrap is None:
            print(f"aircraft profile build: warning: OpenAP lookup failed for {icao}", file=sys.stderr)
            if icao not in aircraft:
                aircraft[icao] = {}
            continue

        try:
            aircraft[icao] = extract_openap_profile(icao, metadata, wrap)
        except Exception as exc:
            print(
                f"aircraft profile build: warning: failed to extract profile for {icao}: {exc}",
                file=sys.stderr,
            )
            if icao not in aircraft:
                aircraft[icao] = {}

    # Sort aircraft keys for deterministic ordering
    data["aircraft"] = {k: aircraft[k] for k in sorted(aircraft.keys())}
    return data


def format_dataset(data: dict[str, Any]) -> str:
    """Format dataset as deterministic JSON with 2-space indentation and trailing newline."""
    return json.dumps(data, indent=2, sort_keys=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--types", action="append", default=[], help="ICAO ids; repeat or comma-separate")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Target JSON file path")
    parser.add_argument("--check", action="store_true", help="Compare calculated output against disk")
    parser.add_argument("--preset", default=None, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    try:
        target_path = args.out
        source_path = target_path if target_path.exists() else DEFAULT_OUT
        if not source_path.exists():
            raise FileNotFoundError(f"source file not found: {source_path}")

        raw_content = target_path.read_text(encoding="utf-8") if target_path.exists() else None
        source_content = target_path.read_text(encoding="utf-8") if target_path.exists() else source_path.read_text(encoding="utf-8")
        data = json.loads(source_content)

        if not isinstance(data, dict) or "aircraft" not in data:
            raise ValueError(f"invalid aircraft profile dataset: missing 'aircraft' in {source_path}")

        requested_types = parse_types(args.types)
        if requested_types:
            missing = [t for t in requested_types if t not in data["aircraft"]]
            if missing:
                raise ValueError(f"unknown aircraft type(s) in --types: {', '.join(missing)}")
            types_to_update: list[str] | None = requested_types
        else:
            types_to_update = None

        populate_dataset(data, types_to_update)
        encoded = format_dataset(data)

        if args.check:
            if raw_content is None or raw_content != encoded:
                print(
                    f"aircraft profile build: check failed: {target_path} differs from calculated output",
                    file=sys.stderr,
                )
                return 2
            return 0

        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(encoded, encoding="utf-8")
        return 0

    except (ValueError, RuntimeError, OSError) as exc:
        print(f"aircraft profile build: error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
