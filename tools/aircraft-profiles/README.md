# Aircraft performance profiles

Build-time profile generator and dataset documentation.

The simulator uses a unified single-file dataset at
`src/core/performance/aircraft-profiles.json`. The browser runtime imports only
this JSON artifact; it does not invoke Python, load OpenAP, or make network requests.

## Dataset architecture

The dataset consists of two top-level sections:

```json
{
  "defaults": {
    "limits": { "minControlledSpeedKt": 100, "maxControlledSpeedKt": 340, "serviceCeilingFt": 41000 },
    "regimes": {
      "initialClimb": { "nominalClimbFpm": 2600, ... },
      "climb": { "nominalClimbFpm": 2000, ... },
      "enroute": { "nominalClimbFpm": 1000, ... },
      "arrival": { "nominalDescentFpm": 2200, ... },
      "approach": { "nominalDescentFpm": 1200, ... },
      "landing": { "nominalDescentFpm": 750, ... },
      "missedApproach": { "nominalClimbFpm": 2200, ... }
    }
  },
  "aircraft": {
    "A320": {
      "source": "openap",
      "limits": { "maxControlledSpeedKt": 350, "serviceCeilingFt": 12500 },
      "regimes": {
        "initialClimb": { "nominalClimbFpm": 2478.35 },
        "climb": { "nominalClimbFpm": 1659.45 },
        "approach": { "minSpeedKt": 130.24, "maxSpeedKt": 149.68 }
      }
    },
    "B753": {}
  }
}
```

- **`defaults`**: Defines baseline envelope limits and standard performance parameters across all 7 flight regimes (`initialClimb`, `climb`, `enroute`, `arrival`, `approach`, `landing`, `missedApproach`).
- **`aircraft`**: Map of ICAO aircraft type codes to sparse override records (48 types covering commercial, regional, cargo, and business jets). Types populated from OpenAP specify `"source": "openap"` along with empirical limits and regime rates. Unpopulated types remain empty objects `{}` and inherit `defaults`.
- **OpenAP Aliases**: `build_profiles.py` maps non-standard or synonym ICAO codes to OpenAP aliases (e.g. `E175` -> `E75L`, `B77F` -> `B77W`) to maximize empirical coverage.

## Runtime resolution cascade

When querying aircraft performance via `performanceRegistry.getProfile(type)`:

1. **Aircraft overrides:** If the ICAO type exists in `aircraft`, its specified fields (limits, regime speeds/rates/bank) override defaults.
2. **Default cascade:** Any limit or regime field omitted in the aircraft entry inherits from `defaults`.
3. **Trainer fallback:** If the aircraft type is unknown, unlisted, or null, it falls back to `DEFAULT_PROFILE` (safe legacy kinematics: 1800 fpm climb/descent, 3°/s standard rate turn, 1 kt/s acceleration).

## Commands

Install the pinned build dependency in a local environment:

```sh
python3 -m venv .venv
.venv/bin/pip install -r tools/aircraft-profiles/requirements.txt
```

### Populate or refresh profiles

```sh
# Refresh all aircraft defined in aircraft-profiles.json
npm run aircraft:profiles

# Update specific types only
npm run aircraft:profiles -- --types A320,B738
```

The generator queries OpenAP (`openap.prop.aircraft` and `openap.kinematic.WRAP`), converts SI units to aviation units (knots, feet per minute), and updates `src/core/performance/aircraft-profiles.json` in-place with deterministic 2-space formatting. Types with unavailable OpenAP data log a warning and remain empty objects to cascade to defaults.

### Verification and CI check

```sh
# Compare committed JSON file against calculated output (exits 0 on match, 2 on drift)
npm run aircraft:profiles:check

# Run Python generator test suite
npm run aircraft:profiles:test
```

`npm run aircraft:profiles:check` is the release and CI gate. It verifies that the committed artifact matches generator output without modifying the file on disk.

## Licensing

OpenAP is licensed under LGPL-3.0. OpenAP is used exclusively at build time to populate static trainer values into `aircraft-profiles.json`. Empirical values represent open-literature aircraft performance estimates, not certified manufacturer operating limitations.
