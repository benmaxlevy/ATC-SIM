# T04-51 OpenAP profile generator and data contract

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-50
**Blocks:** T04-52, T04-53, T04-54
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

An offline, pinned Python/OpenAP generator emits one deterministic, reviewable
performance-profile JSON dataset for any caller-supplied ICAO type list. The
initial preset covers 33 common terminal aircraft types.

## Context

`Aircraft.aircraftType` is a display-only ICAO key today. Kinematics use global
turn, climb/descent, and acceleration constants. The runtime must never import
Python, OpenAP, CSV parsers, or a network client. OpenAP's public `prop` and
`kinematic.WRAP` APIs provide aircraft metadata and phase-envelope statistics;
WRAP output is SI, so conversion is an offline boundary.

## Research

- OpenAP handbook, kinematic models: https://openap.dev/kinematic.html
  Search: `OpenAP WRAP kinematic model units`. It documents `WRAP(ac=...)`,
  phase methods, distribution `default`/`minimum`/`maximum`, and SI output.
- OpenAP repository: https://github.com/junzis/openap
  Search: `junzis openap license aircraft data open literature`. It describes
  aircraft data as collected from open literature and is LGPL-3.0.

**Trainer delta:** OpenAP envelopes are offline input data, not certified
aircraft operating limitations. Simulator bank limits and missing-data rules
are explicit policy, never presented as source-derived limits.

## Scope

- Add `tools/aircraft-profiles/` with a pinned Python requirements file,
  `build_profiles.py`, reviewed `type-mappings.json`, and
  `simulator-policies.json`.
- Support repeated and comma-separated `--types` ICAO input. Inputs normalize
  to uppercase, deduplicate deterministically, and accept any mapped ICAO id;
  do not hardcode the initial preset into execution logic.
- Supply named initial preset `terminal-v1` containing: `B737`, `B738`,
  `B739`, `B752`, `B753`, `B744`, `B788`, `B789`, `B78X`, `A320`, `A321`,
  `E135`, `E140`, `E145`, `E170`, `E175`, `E190`, `E195`, `CRJ1`, `CRJ2`,
  `CRJ7`, `CRJ9`, `CRJX`, `A20N`, `A21N`, `B38M`, `B39M`, `E290`, `E295`,
  `B763`, `B772`, `B77W`, `A333`.
- Mapping rows explicitly select one representative variant and engine, map the
  simulator ICAO key to an OpenAP lookup key, and document any alias. A type
  lacking usable data emits one `UNRESOLVED` row; it is never silently replaced
  by a family profile.
- Extract public OpenAP properties/WRAP parameter dictionaries, retain source
  method names and `default`/`minimum`/`maximum`, convert SI values exactly,
  and transform them into the approved static dataset schema.
- Store bank limits, regime interpolation/caps, and values OpenAP cannot supply
  in explicit named policy data with provenance `simulator-policy`.
- Emit stable pretty JSON, sorted by ICAO type, at
  `src/core/performance/aircraft-profiles.generated.json`. Do not include a
  wall-clock timestamp; include pinned OpenAP version and hashes of mapping and
  policy inputs.
- Add `--out`, `--check`, and `--report`. `--check` compares deterministic
  output; `--report` lists source values, policy values, mappings, and unresolved
  types. Normal generation makes no network request after the pinned dependency
  is installed.
- Add a package command such as `aircraft:profiles` plus a check command. Keep
  Python requirements separate from `speech-api` requirements.

## Out of scope

- TypeScript runtime lookup or changed kinematics; T04-52/T04-53 own them.
- Runtime engine selection, weather, mass, fuel, flap/stall modeling, wake
  separation, paid APIs, BADA data, or browser downloads.
- Claiming OpenAP data is certified or individually manufacturer-authoritative.

## Implementation notes

- Use OpenAP's library API, not unpinned raw GitHub file paths or undocumented
  internal dataset layout.
- Convert at the generator boundary: m/s to kt, m/s2 to kt/s, and m/s vertical
  speed to fpm. Round only at JSON serialization after invariant checks.
- Keep numeric runtime fields flat. Put field-level provenance in a parallel
  metadata map so TypeScript does not parse citations in its 20 Hz path.
- Committed generated JSON is product data. Do not commit the OpenAP package,
  wheel cache, virtual environment, or unlicensed raw snapshots.

## Acceptance criteria

- [ ] **AC1 — Arbitrary input:** A documented command builds a valid dataset
  for a caller-provided `--types A320,B738` list and for repeated `--types`.
- [ ] **AC2 — Initial preset:** `terminal-v1` emits exactly one ordered record
  for every listed initial ICAO key, each `SUPPORTED` or `UNRESOLVED`.
- [ ] **AC3 — Provenance:** Each numeric output field declares OpenAP method,
  policy, or derivation provenance; selected variant/engine and OpenAP alias
  are explicit.
- [ ] **AC4 — Units:** Synthetic mocked WRAP responses prove all SI-to-runtime
  conversions and no premature rounding.
- [ ] **AC5 — Determinism:** `--check` succeeds on committed inputs and fails
  on an intentionally changed generated artifact. No wall-clock field changes
  the output.
- [ ] **AC6 — Validation:** Unknown mapping, invalid OpenAP response,
  nonfinite values, reversed speed bounds, duplicate normalized ICAO keys, and
  invalid policy data fail with actionable errors.
- [ ] **AC7 — Boundary:** No `src/` module imports Python/OpenAP or fetches a
  network resource. No raw source dataset, package cache, or virtualenv enters
  git.
- [ ] **AC8 — License/docs:** Tool README identifies OpenAP version, LGPL-3.0
  review requirement, source/trainer distinction, and reproduce command.

## Test plan

- **Unit:** CLI parsing, mappings, mocked OpenAP extraction, conversion,
  transformation, validation, deterministic serialization.
- **Integration:** Build initial preset into a temp path and check committed
  artifact equivalence without network access.
- **Manual:** Install pinned dependency once and inspect `--report`; do not
  claim every OpenAP mapping is manufacturer-validated.

## Suggested files

- `tools/aircraft-profiles/`
- `src/core/performance/aircraft-profiles.generated.json`
- `package.json`
- `.gitignore`
