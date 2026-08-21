# T04-01 Procedure JSON schema and KDEM demo navaids / ILS27 / STAR

**Phase:** 04 Procedures
**Priority:** P0
**Size:** L
**Depends on:** none (phase 2 exit)
**Blocks:** T04-02, T04-08, T04-10, T04-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

KDEM has committed, schema-validated **demo data files**: VORs, NDBs, ILS components, named fixes, DEMO ONE STAR, and ILS 27. Runtime loads that set as one catalog. Nothing flies it yet. Coordinates must match the JSON already in `src/scenario/data/kdem/` (do not invent a second geometry).

## Context

Published geometry must be data, not literals inside `stepWorld`. Phase 0 shipped a KDEM scenario stub (runway, spawn). Phase 2 drew a localizer *feather* as map art — that art must match these numbers. Real CIFP is T04-08; this ticket is the first-class catalog CIFP must emit.

**Demo files (already in repo; load them):**

| File | Owns |
| --- | --- |
| `src/scenario/data/kdem/catalog.json` | Index / ARP / mag var / file map (`schemaVersion: 1`) |
| `src/scenario/data/kdem/vors.json` | `DEM` 113.00, `OCT` 115.90 |
| `src/scenario/data/kdem/ndbs.json` | `DMO` 385 kHz |
| `src/scenario/data/kdem/ils.json` | I-DEM loc/GS/DME, OM27, MM27 |
| `src/scenario/data/kdem/fixes.json` | NEMAX NELBO NJOIN / SEMAX SELBO SJOIN, MERGE, FI27, RW27/09, MISSD, NORMA, SNARF, DEMEE, OCTTA |
| `src/scenario/data/kdem/procedures.json` | STAR `DEM1` (transitions N/S + common MERGE), approach `ILS27` |
| `src/scenario/video-maps/KDEM/006-dem1-star.json` | MAPS 6; polylines = STAR fixes |
| `src/scenario/data/kdem/sids.json` | `sids: []` — schema slot for later CIFP departures; **do not fly** |

Loader must take a **directory path** (`loadCatalog(dir)`), not a `KDEM`-only function, so a later importer can write `data/<ICAO>/` without a rewrite.

If you must edit those JSON files, keep README frozen numbers (loc course 270, FAF 6 NM, DA 200, STAR AOA). Do not empty `fixes: []` on `kdem.json` without pointing the loader at `data/kdem/`.

See `phases/_shared/architecture.md` (KDEM, rwy 27, elev 0, mag var 0), `phases/_shared/glossary.md` (CIFP, units), `phases/_shared/non-goals.md` (no chart scraping), `phases/04-procedures/README.md` (frozen coordinates + navaid table).

## Scope

- TypeScript types for a **facility-generic** catalog: `NavFix`, `Navaid`, `AltConstraint`, `StarProcedure`, `SidProcedure`, `ApproachProcedure` (KDEM ships ILS only; `type` is a string union so later RNAV/VOR/LOC rows parse), `ProcedureCatalog`. `airportId` is `string`, not `"KDEM"`.
- Optional `latDeg` / `lonDeg` on navaids and fixes (omit on KDEM demo). Runtime geometry is `xNm`/`yNm`; lat/lon is for a later import boundary.
- JSON schema + loader: read `catalog.json` and every file it lists (including empty `sids.json`). Duplicate ids across vors/ndbs/ils/fixes **fail load**. Every procedure `fixId` / navaid ref must exist.
- Loc/GS **geometry used for flying** comes from `procedures.json` + threshold `RW27` (and ils.json course/length/beam). Antenna xy in `ils.json` is documentation / future map; GS origin stays threshold `(0,0)` unless you document a translation.
- Unit tests: valid KDEM catalog parses; `catalog.sids` is an array (empty OK); missing fix-on-leg fails; ILS course is 270; STAR has transitions `N` and `S` plus common `MERGE` and `termination === "VECTORS"`; every STAR leg has alt **and** speed constraint; `DEM` and `OCT` present; `DCT`-able ids include navaids.
- Video map `DEM1` is a **separate MAPS drawing** (default on). It is **not** generated from the STAR/fix catalog. Do not add `fixIds` on polylines. Aircraft fly `fixes.json` + `procedures.json`; the PPI paints `video-maps/`. They may be authored to look alike. Changing a fix must not rewrite the map file, and changing the map must not rewrite the STAR.
- Map/feather in phase 2 should consume threshold + course from this catalog **or** a test asserts the existing map JSON matches within 0.01 NM / 0.1°. Prefer one source; if you must duplicate, add a test that they agree. Do not redesign the PPI.

## Out of scope

- Flying, DIRECT, intercept, GS, alerts, CIFP parser, wind.
- **Flying** SIDs / RNAV / holds (schema must still accept empty `sids` and non-ILS `approach.type` strings).
- Editing `_shared`.
- Replacing KDEM with a real airport.
- Live FAA/CIFP/NASR download or `faa:update` (later).

## Implementation notes

Suggested types (names may match README):

```ts
export type NavaidKind = "VOR" | "VORDME" | "NDB" | "DME" | "LOC" | "GS" | "OM" | "MM" | "IM";

export interface GeoPoint {
  xNm: number;
  yNm: number;
  /** Present after a real CIFP/NASR import. Omit on KDEM demo. */
  latDeg?: number;
  lonDeg?: number;
}

export interface Navaid extends GeoPoint {
  id: string; // uppercase [A-Z0-9]{2,6}
  kind: NavaidKind;
  name?: string;
  freqMhz?: number;
  freqKhz?: number;
  class?: "T" | "L" | "H";
  courseDeg?: number; // LOC
}

export interface NavFix extends GeoPoint {
  id: string;
  kind: "WAYPOINT" | "INTERSECTION" | "FAF" | "MAPT" | "THRESHOLD";
  formedBy?: string;
}

export type ApproachType = "ILS" | "LOC" | "RNAV" | "VOR" | "NDB";

export type SpeedConstraint =
  | { type: "AT"; speedKt: number }
  | { type: "AT_OR_ABOVE"; speedKt: number }
  | { type: "AT_OR_BELOW"; speedKt: number };

export interface StarLeg {
  fixId: string;
  altConstraint?: AltConstraint;
  speedConstraint?: SpeedConstraint;
}

export interface StarTransition {
  id: string; // "N" | "S"
  name: string;
  legs: StarLeg[];
}

export interface StarProcedure {
  id: string;
  name: string;
  transitions: StarTransition[];
  common: StarLeg[];
  termination: "VECTORS";
}

export interface SidProcedure {
  id: string;
  name: string;
  runway?: string;
  legs: Array<{ fixId: string; altConstraint?: AltConstraint }>;
}

export interface ProcedureCatalog {
  schemaVersion: 1;
  airportId: string; // ICAO — not a KDEM literal
  name: string;
  magVarDeg: number;
  fieldElevFt: number;
  arp: { latDeg: number; lonDeg: number };
  navaids: Navaid[];
  fixes: NavFix[];
  stars: StarProcedure[];
  approaches: ApproachProcedure[];
  sids: SidProcedure[]; // KDEM: []
}
```

KDEM content: **do not re-type the coordinate tables here** — assert against the committed JSON. README tables are the human snapshot; if JSON and README disagree, **JSON wins, then fix the README in this ticket**.

Coordinate system: use phase 0’s tangent plane. If airport ref is not origin, translate the table and document the offset in a comment at the top of the JSON (`"originNote"` allowed).

## Acceptance criteria

- [ ] **AC1 —** Given the committed KDEM files, when the loader runs, then `catalog.approaches` contains `id: "ILS27"` with `courseDeg === 270` (or `localizer.courseDeg`) and `daFt === 200`.
- [ ] **AC2 —** Given STAR `DEM1`, when parsed, then transitions `N` and `S` each have 3 legs, `common[0].fixId === "MERGE"`, `termination === "VECTORS"`, and every STAR leg has both `altConstraint` and `speedConstraint`.
- [ ] **AC3 —** Given a catalog whose STAR `fixId` is not in `fixes` ∪ navaids, when parsed, then load throws (or returns a typed error); World does not start with a partial catalog.
- [ ] **AC4 —** Given ILS 27, when read, then loc length 18 NM, GS 3°, FAF 6 NM, intercept 2000 ft, missed heading 270 / 3000 ft, and `MISSD` exists as a fix.
- [ ] **AC5 —** Catalog includes VOR `DEM` (113.00) and `OCT`, NDB `DMO`, loc `IDEM` course 270, fixes `NEMAX`/`SEMAX`/`MERGE`/`FI27`/`RW27`, and `sids` is an array (empty). `airportId` type is not hardcoded to only `"KDEM"`. Duplicate ids fail load.
- [ ] **AC5b —** Video map `DEM1` is in the MAPS catalog, default-on, and loads as polylines/text only (no catalog join). STAR `DEM1` still parses if the map file is missing in a unit fixture.
- [ ] **AC6 —** Automated test: schema happy path + one invalid catalog. DOM-free.
- [ ] **AC7 —** Manual: `npm run dev` still boots; no console error from catalog load. (If the UI does not yet display navaids, that is OK.)

## Test plan

- Unit: parse KDEM files; reject dangling fixId; reject duplicate `DEM`; reject empty STAR.
- Integration: scenario boot attaches `world.catalog` (or equivalent) with `airportId: "KDEM"` and navaids loaded.
- Manual: AC7.

## Suggested files

- `src/scenario/procedures/types.ts`
- `src/scenario/procedures/loadCatalog.ts`
- `src/scenario/video-maps/KDEM/006-dem1-star.json` (already present — keep in sync with fixes)
- `src/scenario/procedures/loadCatalog.test.ts`
- `src/scenario/procedures/kdemCatalog.test.ts`
