# T04-14 Seeded STAR inbound spawn (default session)

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-13, T04-04 (VIA already works)
**Blocks:** none (T04-15 can start after T04-13 in parallel)
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The **default student session** (`npm run dev`, no query) spawns the KDEM arrival list on catalog STARs at the farthest-out transition fix, VIA armed, heading along the first STAR leg. STAR × transition assignment is **seeded-random** over the loaded catalog. Same seed → same picture. `kdem-ils27` stays the deterministic T04-12 demo. `?traffic=N` stays the FPS downwind arc.

## Context

T04-13 supplies `listStarSlots`, `starInboundPose`, and stagger constants. Today `createWorldFromScenario` copies JSON xy and only arms VIA when `starId`+`transitionId` are set. `createWorldForSession(scenario, n)` **replaces** JSON arrivals with a heading-090 downwind arc.

Human request: inbound planes start at the farthest-out STAR fix, randomly assigned, descending via the STAR. KDEM ships **one** STAR (`DEM1`) with **two** transitions — random means uniform over catalog `(starId, transitionId)` pairs, not `if (N vs S)`. A second STAR JSON of the same shape must participate with no live `if`.

T01-04 freeze (downwind box, DAL123 heading 100) is **historical for the authored JSON fixture**, not the playable default. T04-12 `kdem-ils27` must remain DAL123 north / AAL45 south.

See T04-13, T04-12, `src/scenario/spawn.ts`, `src/main.tsx` (`loadKdem()` vs `?scenario=kdem-ils27`).

## Research

- **R01** / **R03** — descend via: spawned aircraft already comply with the published STAR (VIA armed). The student does not have to issue `VIA DEM1` for the default pack (same as T04-12).
- **R02** — STAR / arrival.
- Seeded RNG is trainer traffic mix, not 7110.65. Do not call this “random vectors.”

**Trainer delta:** live default pack is STAR inbounds with a persisted seed; ILS acceptance fixture remains authored. Comment on the assignment module: analog T04-12 spawn-on-VIA; delta = pose from catalog + seed.

## Scope

- `mulberry32(seed)` (or equivalent uint32 PRNG) in `[0, 1)`. **No** `Math.random` on the spawn path. Prefer `src/core/rng.ts` so phase 5 replay can reuse it later — do not implement replay.
- `parseSpawnSeed(search)` next to `parseTrafficCount`. `?seed=42` → `42`. Missing / invalid → `DEFAULT_SPAWN_SEED` (`1`). Integer `0` is legal.
- `assignStarRoutes({ catalog, count, seed })` — `count` rows: slot + `stackIndex` + pose from T04-13.
- Scenario `spawnPolicy`: `"authored"` | `"star-inbound"`. Omitted → `"authored"` so `kdem-ils27` stays bit-stable if you do not touch that file’s policy.
- `kdem.json`: `"spawnPolicy": "star-inbound"`. Keep **6** unique callsigns including `DAL123` and existing aircraft types. World pose comes from `assignStarRoutes`, not JSON xy/heading/alt/speed.
- `createWorldFromScenario` / `createWorldForSession`:
  - `star-inbound` + `trafficCount === null`: assign in **JSON arrival order** (index `i` gets assignment `[i]`; copy callsign / aircraft type). Arm `PROCEDURE` + `VIA_STAR` (`sense: "DESCEND"`). `toFixIndex === 0`.
  - `star-inbound` + `trafficCount === n`: **ignore STAR assignment** — keep today’s downwind arc helper for the T02-12 FPS bench (`?traffic=30`). Do not dump 30 jets on two gates.
  - `authored` (ils27): **ignore** `trafficCount` and seed for pose; JSON xy + existing `armStarVia`. Optionally replace JSON xy with `starInboundPose(..., STAR_SPAWN_GATE_OFFSET_NM)` **only if** DAL123 remains DEM1 N and AAL45 DEM1 S and T04-12’s script still finds them on those transitions — prefer **leave ils27 JSON coordinates unchanged** unless a test proves they sequence the gate at t=0.
- `main.tsx`: pass `parseSpawnSeed(search)` into session create. Persist seed on `session.started` (add a `seed` field if the event already exists) so T05-07 can record it later. Do not build a replay player.
- Preserve the T01-04 box as `testdata/scenarios/kdem-downwind.json` (copy of today’s authored arrivals, `spawnPolicy: "authored"`). Retarget `spawn.test.ts` box asserts and the heading-command integration (`DAL123` heading 100 → H270 right) onto that fixture.
- Seed 1 snapshot test for the six default assignments (slots + stackIndex + pairwise distance).

## Out of scope

- Check-in radio, pad, TTS (T04-15).
- Changing T04-12 manual script intent (DAL123 north, AAL45 south, VIA, ILS).
- Second shipped STAR (testdata-only is T04-13).
- STAR-assigning `?traffic=N`.
- Imperfect pilots / replay UI (phase 5).
- `Math.random` / `Date.now()` as the default seed.
- SIDs, ATIS, center handoff, wind (T04-11).

## Implementation notes

**Assignment (normative):**

1. `slots = listStarSlots(catalog)` (stable catalog order — do not shuffle the slot table).
2. `rng = mulberry32(seed >>> 0)`.
3. For `i` in `0 .. n-1`:
   - if `i < slots.length`: `slot = slots[i]` (round-robin cover so every published transition gets one aircraft when `n >= slotCount`).
   - else: `slot = slots[floor(rng() * slots.length)]` (uniform remainder). Guard `min(idx, length-1)`.
4. `stackIndex` is `0, 1, 2, …` per slot in assignment order.
5. `alongTrackOffsetNm = STAR_SPAWN_GATE_OFFSET_NM + stackIndex * STAR_SPAWN_STAGGER_NM`.
6. `pose = starInboundPose(catalog, slot.starId, slot.transitionId, alongTrackOffsetNm)`.

KDEM: 2 slots. n=6 → first two are DEM1 N stack0 and DEM1 S stack0; remaining four are seeded uniform; trailers sit 2.25, 4.25, … NM before the gate.

Round-robin prefix consumes **zero** RNG draws. Freeze `seed = 1` in tests.

**Loader:** JSON pose fields may remain as unused placeholders under `star-inbound` **or** become optional. Tests must not treat placeholder xy as World pose.

**Pinned `starId` on a `star-inbound` row:** ignore for v1 (assignment is always seeded). Pinning is what `"authored"` is for.

**DAL123 heading 100 is dead on the default pack.** Seed 1 + round-robin → DAL123 (index 0) is DEM1 **N**, ~0.25 NM before NEMAX, alt 11000, speed 250. Heading-command “from 100, shortest to 270 is right” **must load the downwind fixture**.

**`spawns[]` T00-05 stub** (`id: "downwind"`): leave it so `kdem.test.ts` does not lose a map/spawn stub AC, **or** retarget that one test. Aircraft do not use `spawns[]` for pose.

## Acceptance criteria

- [ ] **AC1 —** Given `loadKdem()` and seed `1`, when `createWorldFromScenario` (or the session helper the boot uses) runs, then 6 aircraft, unique uppercase callsigns including `DAL123`, each `lateral.type === "PROCEDURE"` with `toFixIndex === 0`, each `vertical.type === "VIA_STAR"` sense `DESCEND`, altitude `>= 10000`, speed `<= 250`. DAL123 is on DEM1 N. Production spawn/assign source has no `"NEMAX"` / `"DEM1"` branch.
- [ ] **AC2 —** Given those six, pairwise hypot `> 0.3` NM. Same-slot aircraft are colinear on that slot’s first-leg extension, spaced `2 ± 0.05` NM along-track. At least one aircraft has `yNm < 0` (south slot used).
- [ ] **AC3 —** Same seed run twice → deep-equal slots/stack/xy (within `1e-9`). Seed `2` changes at least one remainder assignment.
- [ ] **AC4 —** Given `createWorldForSession(loadKdem(), 30, 1)`, then 30 aircraft on the **downwind arc** (existing T02-12 helper), **not** STAR-stacked. Unique callsigns. Heading 090 pack still holds.
- [ ] **AC5 —** Given `loadKdemIls27()`, when `createWorldForSession(ils27, 30, 99)` runs, then still **2** aircraft: DAL123 DEM1 N VIA, AAL45 DEM1 S VIA, JSON (or helper-equivalent) poses **not** overwritten by RNG. T04-12 automated ACs stay green.
- [ ] **AC6 —** Given testdata `kdem-downwind.json`, when loaded via authored policy, then T01-04 box still holds: 6 aircraft, DAL123 heading **100**, x/y/hdg/alt/speed bands from T01-04. Heading-command integration uses this fixture.
- [ ] **AC7 —** `parseSpawnSeed("")` and `parseSpawnSeed("?traffic=30")` are `1`. `parseSpawnSeed("?seed=42")` is `42`. `parseSpawnSeed("?seed=abc")` is `1`. `main.tsx` passes the seed. `Math.random` does not appear in rng/assignment/spawn modules (grep).
- [ ] **AC8 —** Testdata catalog with 3 slots and `count = 3` uses each slot once (round-robin, no remainder draw).
- [ ] **AC9 —** Automated tests for AC1–AC8. DOM-free except existing boot test if it already mounts.
- [ ] **AC10 —** Manual: `npm run dev` shows six arrivals on DEMO ONE north/south corridors, Mode C ~110, not the old east-downwind line. `?scenario=kdem-ils27` still matches T04-12. `?traffic=30` is still the heading-090 arc. `?seed=2` reshuffles remainder aircraft. `DAL123 H270` still turns and **cancels** FMS.
- [ ] **AC11 — Research:** assignment/spawn comment cites descend-via analog + trainer delta (pre-armed VIA; pose from catalog; seeded mix).

## Test plan

- Unit: `assignStarRoutes` seed=1 n=6 snapshot; two-STAR n=3; pairwise distance; `parseSpawnSeed`; grep `Math.random`.
- Integration: default KDEM World PROCEDURE+VIA; ils27 freeze; downwind fixture + heading-command.
- Manual: AC10.

## Suggested files

- `src/core/rng.ts` / `src/core/rng.test.ts`
- `src/scenario/starSpawn.ts` (extend with assignment)
- `src/scenario/starSpawn.test.ts`
- `src/scenario/spawn.ts` / `spawn.test.ts`
- `src/scenario/types.ts` / `load.ts`
- `src/scenario/kdem.json` (`spawnPolicy`)
- `src/scenario/trafficQuery.ts` / `index.ts`
- `src/main.tsx`
- `testdata/scenarios/kdem-downwind.json`
- `tests/integration/heading-command.test.ts` (or current path)
- `src/app/boot-session.test.ts`
- `README.md` (`?seed=` / default spawn sentence only if it currently claims downwind)
