# T04-01 Procedure JSON schema and KDEM ILS27 STAR

**Phase:** 04 Procedures
**Priority:** P0
**Size:** L
**Depends on:** none (phase 2 exit)
**Blocks:** T04-02, T04-08, T04-10, T04-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

KDEM has a committed, schema-validated procedure catalog: named fixes, DEMO ONE STAR (two or three at-or-above legs, then vectors), and ILS 27 (localizer, glidepath parameters, missed-approach stub). Runtime loads this JSON. Nothing flies it yet.

## Context

Published geometry must be data, not literals inside `stepWorld`. Phase 0 shipped a KDEM scenario stub (runway, spawn). Phase 2 drew a localizer *feather* as map art — that art must match these numbers. Real CIFP is T04-08; this ticket is the first-class catalog CIFP must emit.

See `phases/_shared/architecture.md` (KDEM, rwy 27, elev 0, mag var 0), `phases/_shared/glossary.md` (CIFP, units), `phases/_shared/non-goals.md` (no chart scraping), `phases/04-procedures/README.md` (frozen coordinates).

## Scope

- TypeScript types for `NavFix`, `AltConstraint`, `StarProcedure`, `ApproachProcedure` (ILS only), `ProcedureCatalog`.
- JSON schema (Zod or similar already in repo, else a typed parse function that throws on bad data — do not add a heavy dependency if the repo has none).
- `src/scenario/data/kdem-procedures.json` with the README geometry (or a documented rigid translation if phase 0’s airport ref is not `(0,0)`).
- Loader used by scenario start: catalog attached to `World` or `Facility` (one source of truth).
- Unit tests: valid KDEM catalog parses; missing fix-on-leg fails; ILS course is 270; STAR terminates `VECTORS`; at least two STAR legs with `AT_OR_ABOVE`.
- Map/feather in phase 2 should consume threshold + course from this catalog **or** a test asserts the existing map JSON matches within 0.01 NM / 0.1°. Prefer one source; if you must duplicate, add a test that they agree. Do not redesign the PPI.

## Out of scope

- Flying, DIRECT, intercept, GS, alerts, CIFP parser, wind.
- RNAV, SIDs, holds, procedure turns.
- Editing `_shared`.
- Replacing KDEM with a real airport.

## Implementation notes

Suggested types (names may match README):

```ts
export type AltConstraint =
  | { type: "AT"; altitudeFt: number }
  | { type: "AT_OR_ABOVE"; altitudeFt: number }
  | { type: "AT_OR_BELOW"; altitudeFt: number };

export interface NavFix {
  id: string; // uppercase [A-Z0-9]{2,5}
  xNm: number;
  yNm: number;
}

export interface StarLeg {
  fixId: string;
  altConstraint?: AltConstraint;
}

export interface StarProcedure {
  id: string; // "DEM1"
  name: string; // "DEMO ONE"
  legs: StarLeg[];
  termination: "VECTORS";
}

export interface IlsApproach {
  id: string; // "ILS27"
  type: "ILS";
  runway: "27";
  localizer: {
    courseDeg: number; // 270
    thresholdXNm: number;
    thresholdYNm: number;
    lengthNm: number; // 18
    beamHalfWidthDeg: number; // 2.5
    gsAngleDeg: number; // 3
    tchFt: number; // 50
    fafDistanceNm: number; // 6
    gsInterceptAltFt: number; // 2000
    daFt: number; // 200
  };
  missed: {
    headingDeg: number; // 270
    climbToFt: number; // 3000
    directFixId?: string; // "MISSD"
  };
}

export interface ProcedureCatalog {
  airportId: "KDEM";
  fixes: NavFix[];
  stars: StarProcedure[];
  approaches: IlsApproach[];
}
```

KDEM content (encode exactly; tests may snapshot):

| Fix | xNm | yNm |
| --- | --- | --- |
| ALPHA | 30 | 12 |
| BRAVO | 18 | 8 |
| CHARLIE | 12 | 4 |
| FI27 | 6 | 0 |
| RW27 | 0 | 0 |
| MISSD | -8 | 6 |

STAR `DEM1`: ALPHA 9000 AOA → BRAVO 6000 AOA → CHARLIE 4000 AOA → VECTORS.

Every `fixId` on a STAR/approach/missed must exist in `fixes`. Validate that on load.

Coordinate system: use phase 0’s tangent plane. If airport ref is not origin, translate the table and document the offset in a comment at the top of the JSON (`"originNote"` allowed).

## Acceptance criteria

- [ ] **AC1 —** Given the committed KDEM JSON, when the loader runs, then `catalog.approaches` contains `id: "ILS27"` with `localizer.courseDeg === 270` and `daFt === 200`.
- [ ] **AC2 —** Given STAR `DEM1`, when parsed, then `legs.length` is 2 or 3, each listed leg has `AT_OR_ABOVE`, and `termination === "VECTORS"`.
- [ ] **AC3 —** Given a catalog whose STAR `fixId` is not in `fixes`, when parsed, then load throws (or returns a typed error); World does not start with a partial catalog.
- [ ] **AC4 —** Given ILS 27, when read, then `lengthNm === 18`, `gsAngleDeg === 3`, `fafDistanceNm === 6`, `gsInterceptAltFt === 2000`, missed heading 270 / 3000 ft, and `MISSD` exists as a fix.
- [ ] **AC5 —** Automated test: schema happy path + one invalid catalog. DOM-free.
- [ ] **AC6 —** Manual: `npm run dev` still boots; no console error from catalog load. (If the UI does not yet display procedures, that is OK.)

## Test plan

- Unit: parse KDEM; reject dangling fixId; reject empty STAR; reject non-270 ILS if you freeze 270 as a KDEM invariant (or only check the file, not the type).
- Integration: scenario boot attaches `world.catalog` (or equivalent) with `airportId: "KDEM"`.
- Manual: AC6.

## Suggested files

- `src/scenario/procedures/types.ts`
- `src/scenario/procedures/loadCatalog.ts`
- `src/scenario/data/kdem-procedures.json`
- `src/scenario/procedures/loadCatalog.test.ts`
- `src/scenario/procedures/kdemCatalog.test.ts`
