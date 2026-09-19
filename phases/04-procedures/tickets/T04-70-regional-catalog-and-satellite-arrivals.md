# T04-70 Regional catalog and satellite-arrival pack

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-69
**Blocks:** T04-71
**Launch:** Implement this ticket only. Do not start VFR navigation, request handling, or UI work.

## Goal

Generate and load a KATL regional pack from the T04-69 local FAA source model,
covering the existing 40 NM procedure radius, towered public-use satellite
airports, per-airport runway/approach geometry, and controlled-airspace
volumes. Runtime consumers receive one generic regional facility contract; no
KATL or satellite-airport branch is required.

## Context

The current KATL procedure catalog and scenario already load through generic
catalog/scenario code, and the existing generator uses a 40 NM radius. The
current weather-airport list is not an airport inventory and cannot establish
public-use, towered status, runway geometry, or destination eligibility. The
regional pack must be generated from local source files, with no hand-filled
KATL or satellite records. A satellite arrival needs a runway threshold,
heading, and valid destination catalog so later navigation can complete a
generic tower-managed arrival.

## Research

- **R11 / FAA CIFP product:**
  https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/cifp/
  CIFP supplies airport, runway, navaid, waypoint, procedure, and controlled
  airspace source families used by the generator.
- **FAA CIFP Readme, pp. 2--5:**
  https://aeronav.faa.gov/Upload_313-d/cifp/CIFP%20Readme.pdf
  Use the source's UC airspace and altitude/geometry rules. Do not assert that
  a procedure or PA record alone proves an airport is towered/public-use.
- **FAA NASR subscription:**
  https://www.faa.gov/air_traffic/flight_info/aeronav/Aero_Data/NASR_Subscription/
  APT, ATC, TWR, CLS_ARSP, and Class B/C/D shape products supply operational
  airport and airspace metadata. The generated pack records source provenance
  but never bundles the local source cycle.
- **Trainer delta:** runtime uses imported data as a training approximation;
  it does not model an FAA tower, certify an approach, or claim operational
  airspace accuracy.

## Scope

- Extend the generic CIFP pack pipeline with a regional output mode that takes
  the T04-69 source manifest, center airport, and radius. Preserve the existing
  KATL procedure pack and use `40 NM` for the first KATL generation because
  that is the current generator coverage; do not add a second airport branch.
- Emit a regional manifest and separate generated data files under the facility
  data directory. The file contract must include:
  - a manifest identifying schema version, center ICAO, radius in NM, source
    families/effective cycles, and file names;
  - airport rows with ICAO/name, source coordinates/elevation, local ENU
    projection at load, public-use/towered evidence, eligibility flags,
    runway threshold/heading/length geometry, and a reference to the airport's
    generated procedure catalog;
  - controlled-airspace rows with source lat/lon boundaries, class/kind,
    lower/upper altitude references, and enough geometry for runtime projection;
  - one catalog file set for the center and each eligible destination airport,
    using the existing generic catalog schema and procedure-reference closure.
- Generate destination catalogs by looping source airport IDs through the
  existing generic parser/radius/closure/writer. A satellite airport is not
  eligible merely because it appears in `ssaWeatherAirports`, has a PA record,
  or is near KATL. Eligibility requires source-proven towered + public-use
  metadata and valid runway geometry; preserve whether published approaches
  are available as data for later IFR selection.
- Add a generic runtime loader for a regional pack and its airport catalogs.
  It must project source coordinates to the scenario ARP, validate schema,
  reject duplicate airport IDs/catalog references/invalid rings or altitude
  ranges, and expose lookup by ICAO. Unknown or unlisted destinations must
  fail deterministically before a flight can use them.
- Add an optional data-only regional-pack reference to scenario loading. Both
  KATL flow scenarios point to the generated region pack; KDEM and scenarios
  without this field continue to load with no regional data. Do not select a
  pack through an ICAO conditional in runtime code.
- Preserve per-airport runway and approach geometry for later arrival
  completion. The loader must make the destination airport identity and runway
  threshold available to later navigation without requiring map art or a
  hardcoded KATL position.
- Add generic synthetic tests for a two-airport regional pack, one eligible
  and one excluded airport, one controlled-airspace volume, and one satellite
  catalog. Add one KATL structural acceptance test only when a locally
  authorized source has produced the committed pack.
- Update `tools/cifp-import/README.md`, `src/scenario/README.md`, and
  `phases/04-procedures/README.md` with the regional pack command, generated
  file contract, 40 NM KATL reproduction workflow, source provenance rules,
  eligibility rule, and the limitation that tower coordination/landing are
  trainer behavior supplied by later tickets.

## Out of scope

- Random VFR population, named-zone weights, radio requests, flight following,
  IFR pickup/cancellation, Class B avoidance behavior, or UI controls.
- Hand-authored KATL/satellite coordinates, runways, airspace polygons,
  public-use/tower flags, approaches, or destination lists. Only the regional
  pack reference and generic schema metadata may be authored in scenario JSON.
- Live FAA/NASR downloads, browser/network access, committed source cycles,
  chart scraping, video-map conversion, MVA/ATPA generation, or changing KDEM.
- New procedure flying or approach selection semantics. The pack preserves
  generated procedure catalogs for downstream tickets.
- Automatic landing, simulated tower controller, or aircraft removal. Later
  navigation/service tickets consume the destination geometry.

## Implementation notes

- Suggested generated layout (exact filenames may follow existing pack naming,
  but the roles must remain distinct):

  ```text
  src/scenario/data/katl/
    regional.json
    regional-airports.json
    regional-airspace.json
    airports/<ICAO>/{catalog.json,vors.json,ndbs.json,ils.json,fixes.json,procedures.json,sids.json}
  ```

  Keep the primary KATL catalog files at their existing path for compatibility.
  Do not make the loader depend on a fixed list of satellite ICAOs.
- The regional manifest is a generated source artifact, not an authorization
  to commit FAA input. Store source product names/effective dates and a
  reproducible command or source-manifest digest; never store local absolute
  paths, credentials, or the source cycle itself.
- Use a generic `RegionalFacility`/`RegionalAirport`/`RegionalAirspaceVolume`
  runtime contract. Airport rows with unknown operational metadata are either
  excluded from the eligible destination list or make strict generation fail;
  they are never silently promoted. The output may retain excluded rows and
  exclusion diagnostics for auditability, but downstream destination lookup
  must return only eligible rows.
- Source airspace remains data-first. Load all supported generated Class B/C/D
  volumes selected for the region; later Class B avoidance walks volume class,
  boundary, and vertical limits. Do not infer airspace from video maps or
  draw a KATL fallback polygon.
- Catalog loading must use the existing `parseCatalogFiles` validation and a
  generic nested/registry lookup. A synthetic second region must load through
  the same path without adding a facility-specific condition.
- Generated data is allowed only after an authorized local source exists. If
  no source is present in the checkout, tests must exercise a synthetic source
  and the real KATL generation/manual check is recorded as skipped with the
  reason; do not fabricate replacement files.

## Acceptance contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| T04-69 source manifest, center `KATL`, radius `40 NM` | Regional pack writes manifest, airport rows, airspace rows, center and eligible satellite catalogs | Output is deterministic and source-provenance tagged | Missing/unauthorized source exits before any output write | FAA CIFP/NASR cycle and local reproduction command |
| Synthetic region with two towered/public-use airports | Both eligible airports are listed and each has a catalog/runway reference | No ICAO-specific branch; generated coordinates come from source | Duplicate ICAO or missing catalog reference fails validation | Generic loader test |
| Synthetic private or untowered airport inside radius | Airport is excluded from downstream destination lookup and report names reason | It may remain in audit diagnostics; no eligibility promotion | Missing NASR status is `unknown`, never `false` or eligible | NASR APT/ATC/TWR review |
| Imported satellite runway with threshold, length, and heading | Runtime airport lookup returns destination geometry for later tower-managed arrival | No hand-authored runway position or map dependency | Missing/invalid runway geometry excludes the airport and reports source record | CIFP PG/source provenance |
| Imported satellite procedure catalog | `loadRegionalAirportCatalog(icao)` validates and returns generic procedure data | Route/fix references remain closed and airport-owned | Unknown ICAO, mismatched catalog airport, or dangling ref fails atomically | CIFP closure report |
| Imported Class B volume crossing region | Runtime regional data exposes source ring/segments, class, and vertical limits after ARP projection | Later navigation can query volume without map art | Invalid ring, unsupported altitude, or lower > upper rejects pack | FAA CIFP Readme pp. 2--5 |
| KATL scenario JSON with `regionalPack` reference | `loadScenario` attaches one validated regional facility to either KATL flow | KDEM and non-regional scenarios remain unchanged | Unknown pack id or center mismatch fails before session boot | Manual KATL scenario boot |
| Region data input order shuffled | Serialized pack, airport ordering, catalog references, and diagnostics remain stable | Same source/parameters produce byte-stable output | No seed-dependent or filesystem-order-dependent list | Determinism test |

## Acceptance criteria

- [x] **AC1 —** A synthetic two-airport source produces a regional pack and
  runtime load result with no KATL, KFTY, or other facility-specific condition.
- [x] **AC2 —** Regional generation uses the existing KATL `40 NM` coverage,
  records source provenance, and writes no generated output when required local
  FAA source files are unavailable or unauthorized.
- [x] **AC3 —** Only airports with source-proven towered and public-use status,
  valid runway geometry, and an emitted catalog appear in the eligible
  destination lookup. CIFP-only and missing-status rows never qualify.
- [x] **AC4 —** The runtime can load the center and at least one generated
  satellite catalog through one generic registry, with runway/approach
  geometry available by airport ICAO and all catalog references validated.
- [x] **AC5 —** Generated Class B/C/D airspace volumes load with source
  boundaries, class/kind, and vertical limits; invalid geometry or altitude
  ranges fail atomically and no map-derived fallback exists.
- [x] **AC6 —** KATL west/east scenario data references the regional pack and
  boots through generic loading; KDEM remains default and has no regional
  dependency.
- [x] **AC7 —** Synthetic tests cover eligible/excluded airports, missing
  metadata, duplicate IDs, missing catalogs, source coordinate projection,
  airspace validation, deterministic output, and unknown pack/airport errors.
- [x] **AC8 —** Existing KATL procedure/video-map behavior and generic catalog
  validation remain green; no source cycle or generated national dump is
  tracked.
- [x] **AC9 —** Tool/scenario/phase documentation names the regional command,
  generated files, source provenance rule, 40 NM coverage, eligibility rule,
  and trainer landing/tower limitation.
- [x] **AC10 —** `npm run ci` passes.

## Test plan

- Unit: regional schema parsing, airport eligibility, coordinate projection,
  runway/approach reference validation, airspace ring/vertical validation,
  stable sorting, and unknown lookup errors with synthetic fixtures.
- Integration: synthetic regional generation through the generic CIFP pack
  pipeline; loader boot for a synthetic second region; KDEM/KATL loader and
  existing catalog/video-map regressions.
- Manual: with an authorized local CIFP/NASR source, generate KATL at `40 NM`,
  inspect the dry-run/report and generated provenance, boot both KATL flows,
  select a generated satellite destination, and confirm its runway/approach
  geometry is available. If no authorized source exists, record the KATL
  generation and visual boot checks as skipped with that reason.
- Manual review: cite the FAA CIFP Readme record/altitude sections and NASR
  source-product pages in the handoff; do not claim FAA-cycle fidelity from
  synthetic fixtures.

## Suggested files

- `tools/cifp-import/pack.ts`
- `tools/cifp-import/catalogWriter.ts`
- `tools/cifp-import/regionalPack.ts`
- `tools/cifp-import/regionalPack.test.ts`
- `src/scenario/regional.ts`
- `src/scenario/regionalCatalogs.ts`
- `src/scenario/types.ts`
- `src/scenario/load.ts`
- `src/scenario/procedures/loadCatalog.ts`
- `src/scenario/katl.json`
- `src/scenario/katl-08.json`
- `src/scenario/data/katl/regional.json` (generated only with authorized source)
- `src/scenario/data/katl/regional-airports.json` (generated only with authorized source)
- `src/scenario/data/katl/regional-airspace.json` (generated only with authorized source)
- `src/scenario/data/katl/airports/<ICAO>/` (generated only with authorized source)
- `src/scenario/README.md`
- `phases/04-procedures/README.md`
- `tools/cifp-import/README.md`
