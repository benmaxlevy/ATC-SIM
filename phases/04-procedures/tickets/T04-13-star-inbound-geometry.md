# T04-13 STAR inbound geometry helpers

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** S
**Depends on:** T04-01, T04-02, T04-03 (catalog + STAR route ids + `courseDeg`)
**Blocks:** T04-14, T04-15
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A catalog-generic helper reports the farthest-out STAR spawn pose (fix, xy, heading, altitude, speed, remaining route) without hardcoding `NEMAX`, `DEM1`, or KDEM. A second STAR JSON of the same shape works with no new `if`.

## Context

Phase 4 exit is already green. T04-12 arms `PROCEDURE` + `VIA_STAR` but **positions stay in scenario JSON** (`kdem-ils27.json` hardcodes DAL123 before NEMAX). Default `kdem.json` is still the T01-04 downwind box. This ticket is **pure helpers + tests**. Assignment RNG and default-boot wiring are T04-14. Check-in radio is T04-15.

**Farthest-out** = first published **transition** leg (`transitions[].legs[0]`), never `common[0]` / MERGE, never the ILS FAF. For shipped DEMO ONE that is NEMAX (N) and SEMAX (S) — tests may assert those ids against the **loaded JSON**, production code must not contain them.

See `phases/_shared/architecture.md` (pilot owns intent; procedures are data), `.cursor/rules/extensible-features.mdc` (walk `catalog.stars`), `phases/04-procedures/README.md` (DEMO ONE tables; JSON wins).

## Research

- **R01** JO 7110.65 — descend via STAR / published arrival path. Search: `FAA JO 7110.65 descend via`.
- **R03** AIM — *Descend Via*: fly the published lateral path and published altitude/speed restrictions. Search: `FAA AIM descend via`.
- **R11** CIFP — fix identifiers, not chart names.

**Official term:** STAR transition, initial STAR fix, descend via.

**Trainer delta:** spawn pose is derived from catalog legs (first transition fix + first-leg course). We do not scrape charts. VIA arming at spawn is T04-14/T04-12; this ticket only publishes the numbers. Cite analog + delta in a one-line comment on the helper file.

## Scope

- `listStarSlots(catalog)` — every `(starId, transitionId)` pair in catalog array order (star, then that star’s transitions). KDEM today: `(DEM1, N)`, `(DEM1, S)`.
- `outermostStarFix(catalog, starId, transitionId)` — first transition-leg `fixId` plus xy from the fix/navaid registry. Throw if STAR/transition missing, legs empty, or fix unknown.
- `starInboundPose(catalog, starId, transitionId, alongTrackOffsetNm)` — aircraft on the first-leg **inbound extension**, heading toward the gate, altitude/speed from the first transition-leg constraints.
- Export from `@scenario`. Reuse `starRouteFixIds` (already in `src/scenario/spawn.ts`) and `courseDeg` from `@core` geometry. Do not duplicate the route walk.
- Unit tests against committed KDEM catalog **and** a tiny second STAR in testdata (not shipped under `src/scenario/data/kdem/`).
- Do not call parser, pilot, or scope. Do not edit `kdem.json` / `kdem-ils27.json`.

## Out of scope

- Seeded RNG, `?seed=`, default-boot swap, `?traffic=`.
- Check-in radio / TTS / session events.
- A second authored KDEM STAR in shipped data.
- Changing FMS fly-by / VIA math.
- `Math.random`.
- Hard-coded `DEMO_ONE_NORTH_FIX_IDS`-style tables in the new helper (that existing T04-03 constant is not a license to add spawn literals).

## Implementation notes

Suggested file: `src/scenario/starSpawn.ts` (scenario may import `@core`; `@core` stays scenario-JSON-free).

```ts
export interface StarSlot {
  starId: string;
  transitionId: string;
}

export interface StarInboundPose {
  xNm: number;
  yNm: number;
  headingDeg: number;
  altitudeFt: number;
  speedKt: number;
  routeFixIds: string[];
  /** Always 0 — aircraft is inbound to the gate fix. */
  toFixIndex: 0;
  gateFixId: string;
}

/** Extra NM before the gate so distance(gate) > 0 and heading is defined. */
export const STAR_SPAWN_GATE_OFFSET_NM = 0.25;
/** Along-track gap used by T04-14 trailers on the same transition. */
export const STAR_SPAWN_STAGGER_NM = 2;
/** Spawn above an AT_OR_ABOVE so VIA has room to descend (T04-12 used 11000). */
export const STAR_SPAWN_VIA_ALT_MARGIN_FT = 1000;
```

**Geometry:** first-leg course = `courseDeg(gate, next)` where `next = routeFixIds[1]`. Place the aircraft on the **back-azimuth** (`firstLegCourse + 180`) at distance `alongTrackOffsetNm` from the gate. Heading = `firstLegCourse`. +x east +y north.

For shipped DEM1 N: gate is JSON `legs[0]` (NEMAX `(17, 12)`); next is NELBO; heading is whatever `courseDeg` returns — tests call the helper, they do not paste `191.3` into production.

**Altitude:** first-leg `altConstraint`. `AT` → that altitude. `AT_OR_ABOVE` → value + `STAR_SPAWN_VIA_ALT_MARGIN_FT`. `AT_OR_BELOW` → that altitude. Result is a multiple of 100. DEM1 → **11000**.

**Speed:** first-leg `speedConstraint`. `AT` / `AT_OR_BELOW` / `AT_OR_ABOVE` → that speed (do not invent a cruise). DEM1 → **250**.

**Testdata second STAR:** inline fixture or `testdata/catalogs/two-star-spawn.json`. Same schema: DEM1-shaped STAR **plus** `TST1` transition `E`, first leg `OUTER` at `(30, 0)`, second `INNER` at `(20, 0)`. `outermostStarFix(..., "TST1", "E")` is `OUTER`. Do not add `TST1` to shipped KDEM JSON.

Throw a typed/`Error` on unknown STAR, unknown transition, empty legs, or missing next fix. World is not involved.

## Acceptance criteria

- [ ] **AC1 —** Given the committed KDEM catalog, when `outermostStarFix(catalog, "DEM1", "N")` runs, then the returned `fixId` equals DEM1 transition `N` `legs[0].fixId` (today NEMAX) and xy matches that fix within `1e-9`. Production helper source contains no `"NEMAX"` / `"SEMAX"` string.
- [ ] **AC2 —** Given DEM1 `S`, when the same helper runs, then the gate is transition `S` `legs[0]` (today SEMAX), **not** MERGE and **not** FI27.
- [ ] **AC3 —** Given `alongTrackOffsetNm = 0.25`, when `starInboundPose(catalog, "DEM1", "N", 0.25)` runs, then distance to the gate is `0.25 ± 0.01` NM, heading equals `courseDeg(gate, next)` within `0.1°`, `altitudeFt === 11000`, `speedKt === 250`, `toFixIndex === 0`, and `routeFixIds[0]` is the gate.
- [ ] **AC4 —** Given testdata STAR `TST1` / `E`, when `outermostStarFix` / `starInboundPose` run, then the gate is `OUTER` and heading is `courseDeg(OUTER, INNER)` (270° in the fixture). No KDEM branch.
- [ ] **AC5 —** `listStarSlots(kdem)` is `[{ starId: "DEM1", transitionId: "N" }, { starId: "DEM1", transitionId: "S" }]`. Two-STAR fixture yields three slots in catalog order.
- [ ] **AC6 —** Unknown STAR/transition/empty legs throws; World is not constructed.
- [ ] **AC7 —** Automated tests for AC1–AC6. DOM-free.
- [ ] **AC8 — Research:** helper file comment cites 7110.65/AIM descend-via analog + trainer delta (pose from catalog legs, not charts).

## Test plan

- Unit: KDEM N/S gate + pose; two-STAR fixture; throw paths; helper `.ts` does not contain `NEMAX`.
- Integration: none.
- Manual: none.

## Suggested files

- `src/scenario/starSpawn.ts`
- `src/scenario/starSpawn.test.ts`
- `src/scenario/spawn.ts` (re-export / move `starRouteFixIds` only if needed to avoid duplication)
- `src/scenario/index.ts`
- `testdata/catalogs/two-star-spawn.json` (or inline fixture in the test)
