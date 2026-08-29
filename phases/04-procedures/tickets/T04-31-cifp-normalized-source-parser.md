# T04-31 CIFP normalized source parser

**Phase:** 04 Procedures  
**Priority:** P0  
**Size:** L  
**Depends on:** T04-08  
**Blocks:** T04-32, T04-33

## Goal

Replace the fixture-only CIFP parser boundary with a reusable developer-tool
parser that reads a local FAA CIFP input and produces a normalized,
airport-independent source model. Emit the existing `ProcedureCatalog` shape
only after normalization. Runtime must not import this tool or parse ARINC 424.

## Scope

- Keep synthetic fixture support and existing `ProcedureCatalog` compatibility.
- Parse the documented fixed-width ARINC records needed for:
  - airport/runway identity and reference coordinates;
  - VOR/DME, NDB, localizer, glideslope, and marker navaids;
  - terminal/enroute fixes;
  - SID and STAR legs, runway transitions, and altitude restrictions;
  - ILS/LOC approaches, missed references, and supported constraints.
- Preserve source `latDeg` / `lonDeg` in normalized points.
- Represent unsupported leg types explicitly as skipped diagnostics; never
  silently convert RF, hold, arc, or procedure-turn behavior into straight legs.
- Deduplicate records by stable source identity and report malformed or
  conflicting records with airport/section context.
- Parse supported SID records into the existing SID schema. Keep SID route
  flying out of scope; unsupported SID leg types must be diagnosed, not
  flattened into straight legs.

## Out of scope

- Browser fetch, CDN, runtime CIFP loading, chart scraping, or vendor APIs.
- Committing any FAA cycle or national derived dump.
- Full ARINC coverage, RNAV/holds/RF flying, or changing FMS behavior.

## Acceptance criteria

- [ ] AC1 — Local fixed-width fixture parses offline into normalized source
  records and emits a catalog matching expected schema.
- [ ] AC2 — At least one VOR/NDB, fix, SID constraint, STAR constraint, and ILS
  approach survive conversion with lat/lon preserved.
- [ ] AC3 — Duplicate/conflicting source records produce deterministic
  diagnostics; dangling procedure references fail conversion clearly.
- [ ] AC4 — Unsupported leg types are counted and documented, never silently
  emitted as valid straight-line legs.
- [ ] AC5 — Existing synthetic fixture tests stay green; no `src/` import points
  at `tools/cifp-import`.
- [ ] AC6 — Tool README documents local input, source provenance responsibility,
  unsupported records, and no-cycle-in-git boundary.

## Test plan

- Unit tests for fixed-width fields, coordinates, records, conflicts, and
  unsupported-leg diagnostics.
- Fixture conversion test with no network access.
- Negative test for a dangling fix and malformed coordinate.

## Suggested files

- `tools/cifp-import/parse.ts`
- `tools/cifp-import/normalize.ts`
- `tools/cifp-import/parse.test.ts`
- `tools/cifp-import/README.md`
- `testdata/cifp/`
