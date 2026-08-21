# T00-05 KDEM scenario JSON stub

**Phase:** 00 Slice
**Priority:** P0
**Size:** S
**Depends on:** T00-04
**Blocks:** T00-10
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A typed **Scenario** JSON file for fictional **KDEM** loads in unit tests: runway **27**, mag var **0**, field elev **0**, ILS 27 stub, one downwind spawn stub, empty video maps.

## Context

`phases/_shared/architecture.md` demo facility: **KDEM — Demo Field**, mag var 0°, one runway **27**, ILS 27, one downwind spawn. Field elevation 0 ft. Real CIFP airports are a phase 4 swap.

Glossary: **Scenario** = spawn rules, active runway, maps, and traffic mix. **Facility** = one airport + one approach position for v1.

Coordinates: store ARP as lat/lon **and** precomputed `NmEastNorth` of runway threshold using T00-04 helpers (or compute on load). Do not invent a second unit system.

## Scope

- `src/scenario/types.ts` — TypeScript types for the JSON.
- `src/scenario/kdem.json` — the stub.
- `src/scenario/load.ts` — `loadKdem(): Scenario` (import JSON) + `assertScenario(s: unknown): Scenario` runtime checks for required fields.
- Re-export from `@scenario`.
- Vitest: load KDEM and assert frozen fields.
- Enable JSON module resolution (`resolveJsonModule: true` in tsconfig) if not already.

## Out of scope

- Drawing the runway on the PPI.
- STAR/SID procedure geometry, intercept math, glideslope (phase 4).
- Extra runways, real FAA identifiers as if KDEM were real, copyrighted map polylines.
- Traffic mix probabilities beyond a single spawn template.
- Spawning aircraft into `World` (phase 1).

## Implementation notes

### JSON shape (required keys)

```json
{
  "id": "KDEM",
  "name": "Demo Field",
  "icao": "KDEM",
  "magVarDeg": 0,
  "fieldElevFt": 0,
  "arp": { "latDeg": 0, "lonDeg": 0 },
  "activeRunwayId": "27",
  "runways": [
    {
      "id": "27",
      "headingTrueDeg": 270,
      "headingMagDeg": 270,
      "lengthFt": 10000,
      "thresholdLatLon": { "latDeg": 0, "lonDeg": 0 }
    }
  ],
  "approaches": [
    { "id": "ILS27", "runwayId": "27", "type": "ILS" }
  ],
  "fixes": [],
  "maps": { "videoMaps": [] },
  "spawns": [
    {
      "id": "downwind",
      "kind": "downwind",
      "runwayId": "27",
      "offsetNm": { "xNm": 0, "yNm": 8 }
    }
  ]
}
```

`thresholdLatLon` at ARP is acceptable for the stub (boring math). `spawns[0].offsetNm` is world ENU relative to ARP: **8 NM north** of ARP as a placeholder left-downwind-ish offset (phase 1 may retune). Do not add extra spawn fields unless needed for typing.

`assertScenario` must throw if `icao !== "KDEM"` is not required globally — only validate: `icao` string, `magVarDeg === 0` for this file’s test, `fieldElevFt === 0`, one runway id `27`, one approach id `ILS27`, `maps.videoMaps` is an array, at least one spawn with `id === "downwind"`.

On load, compute `arpNm: { xNm: 0, yNm: 0 }` via `latLonToNm(arp, arp)` so scenario consumers never guess.

### Types

```ts
export interface Scenario {
  id: string;
  name: string;
  icao: string;
  magVarDeg: number;
  fieldElevFt: number;
  arp: LatLon;
  arpNm: NmEastNorth;
  activeRunwayId: string;
  runways: Runway[];
  approaches: Approach[];
  fixes: Fix[];
  maps: { videoMaps: VideoMap[] };
  spawns: Spawn[];
}
```

`Fix` and `VideoMap` may be empty interfaces/`{ id: string }` stubs. `loadKdem` fills `arpNm`.

JSON cannot contain `arpNm` if you compute it — either omit from JSON and add in `loadKdem`, or include `{ xNm: 0, yNm: 0 }` and still recompute/assert.

## Acceptance criteria

- [ ] **AC1 —** `src/scenario/kdem.json` has `icao` `"KDEM"`, `magVarDeg` `0`, `fieldElevFt` `0`, `activeRunwayId` `"27"`.
- [ ] **AC2 —** Loaded scenario includes a runway `{ id: "27", headingTrueDeg: 270, headingMagDeg: 270 }` (Vitest).
- [ ] **AC3 —** Loaded scenario includes approach `{ id: "ILS27", runwayId: "27", type: "ILS" }` (Vitest).
- [ ] **AC4 —** Loaded scenario includes spawn `{ id: "downwind" }` (Vitest).
- [ ] **AC5 —** `maps.videoMaps` is an empty array (Vitest).
- [ ] **AC6 —** `loadKdem().arpNm` is `{ xNm: 0, yNm: 0 }` within `1e-9` using T00-04 helpers (Vitest).
- [ ] **AC7 —** `assertScenario` throws on missing `icao` or empty `runways` (Vitest).
- [ ] **AC8 —** No CIFP files, no second airport JSON.

## Test plan

- Unit: `src/scenario/kdem.test.ts`.
- Integration: none.
- Manual: none.

## Suggested files

- `src/scenario/kdem.json`
- `src/scenario/types.ts`
- `src/scenario/load.ts`
- `src/scenario/kdem.test.ts`
- `src/scenario/index.ts`
- `tsconfig.json` (`resolveJsonModule`)
