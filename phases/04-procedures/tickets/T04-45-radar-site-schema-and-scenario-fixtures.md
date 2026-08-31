# T04-45 radar site schema and scenario fixtures

**Phase:** 04 Procedures (twenty-second swarm addendum)
**Priority:** P0
**Size:** M
**Depends on:** scenario loader
**Blocks:** T02-75, T02-77
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Scenario data can declare trainer-authored radar sites in either local ENU
coordinates or latitude/longitude. The loader validates and normalizes those
rows, supplies deterministic defaults, and exposes KDEM and KATL fixtures so
later surveillance sampling can distinguish FUSED from geographically
different site coverage.

## Context

The twenty-second swarm separates surveillance truth from display reports.
T04-45 owns only the authored site data contract and scenario fixtures;
T02-75 owns sampling, report timing, and paints; T02-76 owns SITE controls
and the SSA radar word. Empty or legacy scenarios must continue to load with
implicit FUSED behavior.

Sites are trainer configuration, not FAA/NAS sensor adaptation. KDEM remains
the authored default. KATL uses the same schema shape, without invented
official FAA site identifiers. Runtime scenario code must not import CIFP
tools or select behavior through an airport-id switch.

## Research

- **R07 — CRC / vNAS STARS client**, https://docs.virtualnas.net/crc/stars/;
  Search: `vNAS CRC STARS site fused multi radar`. Use only for display/site
  vocabulary and operator model; this ticket does not reproduce proprietary
  adaptation.
- **R04 — FAA STARS / TAMR overview**, https://www.faa.gov/air_traffic/technology/tamr;
  Search: `FAA STARS terminal automation surveillance`. Use for product
  posture and the trainer-vs-NAS boundary.

**Official/display terms:** radar site, FUSED, MULTI, surveillance report.

**Trainer delta:** Rows are authored simulator fixtures with configurable
  range and period. They are not live sensors, official site adaptation, or
  certified surveillance.

## Scope

- Add `RadarSite` to scenario types:
  ```ts
  /**
   * Trainer-authored display fixture; not NAS adaptation or a live sensor.
   */
  export type RadarSite = {
    id: string;
    name: string;
    kind: "asr" | "airport";
    xNm?: number;
    yNm?: number;
    latDeg?: number;
    lonDeg?: number;
    rangeNm: number;
    periodMs: number;
  };
  ```
  The normalized loaded form may require `xNm`/`yNm`; preserve source
  latitude/longitude only if existing scenario conventions need them.
- Add optional `radarSites?: RadarSite[]` to scenario input and normalized
  scenario types.
- Validate:
  - nonempty unique `id` and `name`;
  - exact `kind` enum;
  - finite coordinates;
  - exactly one usable coordinate representation, or define and test the
    repository's precedence if both are accepted;
  - positive finite `rangeNm` and `periodMs`;
  - coordinate conversion through existing `latLonToNm` using scenario ARP,
    never hard-coded KATL/KDEM transforms.
- Apply defaults:
  - omitted `rangeNm` → `60`;
  - omitted `periodMs` → `4800` for airport and ASR;
  - omitted `radarSites` → `[]`.
  Document both defaults in schema/types and loader tests.
- Integrate validation and normalization with the existing scenario loader.
  Invalid rows fail with actionable field/site errors. Do not silently drop
  malformed rows.
- Add KDEM fixture data: one airport site at scenario ARP, 60 NM range,
  4800 ms period, plus one remote ASR with trainer id/name and coordinates
  far enough away that site coverage differs from the airport.
- Add KATL fixture data with one airport site and one remote ASR, using the
  same schema shape and trainer-authored identifiers. Do not label rows as
  official FAA adaptation.
- Add generic testdata containing sites without asserting production map
  counts or facility-specific geometry.
- Ensure empty/omitted sites expose implicit FUSED semantics to consumers.
  This ticket does not implement sampler or paint behavior; document the
  contract for T02-75.

## Out of scope

- SITE DCB controls or SSA radar-word display; T02-76 owns them.
- Surveillance sampler, report pose, history, coast, or FUSED/MULTI/single
  site paints; T02-75 owns them.
- Weather, MODE FSL, live sensors, 30-second coast, or vendor APIs.
- CIFP importer/runtime dependency, video maps, or map-count assertions.
- Airport-id conditionals or official FAA site IDs.

## Implementation notes

Keep source and normalized types distinct if needed: JSON may use ENU or
lat/lon, while runtime receives a validated local tangent-plane point. Use
the scenario's ARP for every conversion and existing `latLonToNm` ordering
(`eastNm`, `northNm`). Reject partial pairs such as only `latDeg` or only
`xNm`. If both coordinate forms are accepted for authoring, establish one
documented precedence and validate consistency when practical.

`radarSites: []` means no explicit sensor rows, not “no surveillance.”
Consumers must treat it as implicit FUSED, with no site selection entries.
Do not add this fallback as a KDEM branch. Site range checks belong at load
time; T02-75 decides whether a track is covered at report time.

Choose clearly trainer-looking ids such as `KDEM-APT`, `KDEM-REMOTE`,
`KATL-APT`, and `KATL-REMOTE`, or equivalent values already accepted by the
catalog conventions. Add a data comment/README note that these are invented
trainer ids, not official adaptation.

## Acceptance criteria

- [ ] **AC1 — Type contract:** Scenario input and normalized output expose
  `RadarSite` with id, name, kind, position, range, and period; comment says
  trainer-authored, not NAS adaptation or live sensor.
- [ ] **AC2 — Defaults:** Omitted `radarSites` loads as `[]`; omitted range
  becomes 60 NM; omitted airport/ASR period becomes 4800 ms.
- [ ] **AC3 — Coordinates:** Valid ENU rows load unchanged; valid lat/lon
  rows convert through `latLonToNm` and scenario ARP; no facility-specific
  transform exists.
- [ ] **AC4 — Validation:** Invalid kind, duplicate/empty identity, partial
  or nonfinite coordinates, nonpositive range, and nonpositive period reject
  with actionable errors.
- [ ] **AC5 — KDEM fixture:** KDEM contains airport-at-ARP and remote-ASR
  rows with 60 NM / 4800 ms authored values, and their coverage regions
  differ geographically.
- [ ] **AC6 — KATL fixture:** KATL contains airport and remote-ASR rows using
  identical schema shape and explicitly trainer-authored, nonofficial ids.
- [ ] **AC7 — Compatibility:** A scenario with no site rows still exposes
  implicit FUSED semantics; no SITE buttons or sampler behavior are added by
  this ticket.
- [ ] **AC8 — Boundary:** `src/` runtime has no CIFP-tools import, airport-id
  site branch, live sensor call, or video-map change.
- [ ] **AC9 — Research:** Relevant schema/type comment or fixture note cites
  R07/R04 and states trainer delta.
- [ ] **AC10 — Automated tests:** Generic parse/default/invalid-row tests and
  KDEM/KATL JSON loader validation pass without production map-count
  assertions.

## Test plan

- **Unit:** Schema validation, defaults, coordinate normalization,
  duplicate/partial coordinate rejection, empty-site compatibility.
- **Integration:** Load KDEM and KATL scenario fixtures; assert normalized
  sites and distinct remote coverage geometry. Use generic fixture data for
  behavior not tied to production maps.
- **Manual:** None required for this schema-only ticket. T02-75/T02-77 may
  manually verify site sampling and paints.

## Suggested files

- `src/scenario/`
- `src/scenario/types.ts`
- `src/scenario/loader.ts`
- `src/scenario/*schema*`
- `src/scenario/data/kdem/`
- `src/scenario/data/katl/`
- `src/scenario/*.test.ts`
- `testdata/`
