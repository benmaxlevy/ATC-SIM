# Scenario assets

Playable sessions are registered in `playable-scenarios.json`. Each entry names
its stable id, airport ICAO, display label, default marker, and scenario source.
The inventory validates every source before exposing it to boot or a future
picker.

Add an airport by registering its scenario asset and facility catalog/MAPS/MVA
assets. Do not add ICAO, scenario-id, or named-loader conditionals to boot or
picker code.

## Folder layout

```text
src/scenario/
  *.json                  Scenario assets consumed by inventory or compatibility loaders
  playable-scenarios.json Scenario manifest; controls playable/session-visible entries
  data/<icao>/            Facility catalog JSON: navaids, fixes, SIDs, STARs, approaches
  data/*-mva.json         Optional authored MVA chart for one facility
  procedures/             Runtime catalog types, loader, and SID helpers
  video-maps/<ICAO>/      Runtime video-map catalog and geometry
  briefs/                 Human-facing controller/training documentation
  *.ts                    Runtime scenario loading, spawning, scheduling, and validation
  *.test.ts               Colocated automated coverage and intentional fixtures
```

`procedures/` is not a data dump or dead folder. `load.ts` loads it for every
scenario, FMS/spawn code uses its helpers, and the CIFP pack tool emits its
catalog schema. Procedure JSON lives under `data/<icao>/`; the directory name
is runtime code.

Loose scenario JSON is intentional. KDEM has visible configurations plus
hidden ILS/ATPA test benches. KATL west/east configurations are playable and
session-visible; video maps stay empty until a KATL map set is authored. Do
not point KATL at KDEM maps. Do not delete or move these files without
updating their manifest, loader, tests, and compatibility exports.

Scenario JSON files define **route templates** (e.g. `starId`, `transitionId`,
`aircraftType`, authored pose coordinates) and must **not** contain `callsign`
keys on arrivals or authored departures. Callsigns are assigned dynamically at
spawn/schedule time from the shared session allocator (`callsigns.ts`), ensuring
unique airline codes and numeric tails across active arrivals, future scheduled
arrivals, and scheduled departures.

## Radar sites

Optional `radarSites` rows are trainer-authored display fixtures (R07 SITE /
FUSED / MULTI vocabulary; R04 STARS / TAMR posture). They are **not** FAA/NAS
sensor adaptation or live sensors. Ids such as `KDEM-APT`, `KDEM-REMOTE`,
`KATL-APT`, and `KATL-REMOTE` are invented trainer labels.

Each row is `asr` or `airport`, with either local ENU (`xNm`/`yNm`) or
lat/lon (`latDeg`/`lonDeg`) — exactly one complete pair. Load converts lat/lon
through `latLonToNm` and the scenario ARP. Omitted `rangeNm` is 60 NM; omitted
`periodMs` is 4800 ms; omitted `radarSites` is `[]`.

Empty `[]` means implicit FUSED for T02-75: no SITE selection entries, not “no
surveillance.” This package does not sample reports or paint SITE marks.

## Regional packs (T04-70)

Scenarios can optionally specify a `"regionalPack"` string pointing to a facility
directory under `src/scenario/data/<pack>/` (e.g. `"katl"` in `katl.json` and `katl-08.json`).

When present, `assertScenario` / `loadRegionalPack` loads:
- `regional.json`: Manifest with center ICAO, radius in NM, source provenance, and component filenames.
- `regional-airports.json`: Regional airports with coordinates projected to local ENU (`xNm`/`yNm`) relative to the scenario ARP, elevation, source-proven towered and public-use status, runway threshold/heading/length geometry, and catalog references.
- `regional-airspace.json`: Controlled airspace volumes (Class B, Class C, Class D) with source boundary vias and vertical limits (MSL/AGL), projected atomically to scenario ARP coordinates.

### Runtime RegionalFacility contract

The loaded `RegionalFacility` provides:
- Generic airport and destination lookups: `lookupAirport(icao)` returns any regional airport; `getEligibleDestinations()` returns only airports with source-proven towered, public-use status, valid runway geometry, and an emitted catalog.
- Controlled airspace volumes: `airspace` volumes for lateral/vertical boundary checks.
- Per-airport procedure catalogs: loaded via `loadRegionalAirportCatalog(facility, icao)` which validates reference closure using the generic catalog parser.

KDEM and scenarios without `"regionalPack"` continue to load with `scenario.regional === undefined`
and have no dependency on regional files or FAA metadata.

### Trainer limitations

The regional facility provides destination and runway geometry as a training
approximation for satellite arrivals and navigation. Tower coordination, landing
clearances, and aircraft removal/despawn are trainer behaviors supplied by
downstream simulation tickets.
