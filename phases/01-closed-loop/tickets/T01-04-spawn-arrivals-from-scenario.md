# T01-04 Spawn arrivals from scenario

**Phase:** 01 Closed loop
**Priority:** P0
**Size:** M
**Depends on:** T01-02, T00-05 (KDEM scenario JSON stub)
**Blocks:** T01-10, T01-13, T01-14
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Loading the KDEM scenario places **4–8** arrival aircraft (default **6**) east of the airport on a downwind-ish heading, level 6000–10000 ft, 210–250 kt, including **`DAL123`**. Spawn is data-driven from scenario JSON, not hardcoded in the PPI.

## Context

`phases/_shared/architecture.md` Demo facility: **KDEM**, rwy **27**, mag var 0, field elev 0, origin from `T00-04`.

`phases/_shared/glossary.md`: **Scenario** = spawn rules, active runway, maps, traffic mix. Maps are Phase 2; this ticket only extends spawn.

Downwind for rwy 27 is heading **~090** (opposite 270), typically north or south of the field. Phase 1 freezes **east of the field, north of centerline, heading 080–100** so they are right-downwind-ish and on-screen with a 40 NM PPI.

**`DAL123` must spawn at heading 100**, not 090. `H270` is `FLY_HEADING` / `SHORTEST`. From 090 to 270 is a 180° tie (T01-03 turns LEFT, away from KDEM). From 100, shortest to 270 is **right** (~170°), toward the airport — that is the phase-exit demo.

## Scope

- Extend KDEM scenario JSON (`T00-05` path; likely `src/scenario/kdem.json` or `public/scenarios/kdem.json`) with a `spawns` (or `arrivals`) array **or** a spawn rule object plus a concrete list. Prefer an **explicit list of 6 aircraft** for determinism, plus comments/docs that the allowed band is 4–8.
- `loadScenario(json) → World` or `spawnArrivals(world, scenario): void` that `createAircraft` for each entry and pushes onto `world.aircraft`.
- Each spawn record: `callsign`, `xNm`, `yNm`, `headingDeg`, `altitudeFt`, `speedKt`.
- Constraints on data (enforce in loader tests, not a fancy schema lib unless Phase 0 already has one):
  - Count 4–8 inclusive; **default file has 6**.
  - One callsign is exactly `DAL123`.
  - All `xNm` in **[+10, +22]** (east of origin).
  - All `yNm` in **[+3, +12]** (north — right downwind for 27).
  - `headingDeg` in **[080, 100]**; **`DAL123` is exactly 100**.
  - `altitudeFt` in **[6000, 10000]**, multiple of 100.
  - `speedKt` in **[210, 250]**.
  - Callsigns unique.
- `createWorldFromScenario(scenario)` helper used by the app boot (wire into the shell if a one-line change is needed so `npm run dev` actually spawns; full PPI is T01-10 — if the shell has no place to put aircraft yet, exporting the helper + a test is enough, and T01-10 will call it. **Prefer** calling it from the existing Phase 0 boot so T01-10 only draws).
- Do not randomize in v1 default path (tests and the exit demo must see `DAL123` every time). An optional `seed` is out of scope.

## Out of scope

- Departures, overflights, random traffic mix, time-based sequential spawn.
- CIFP, SIDs/STARs, maps in the JSON.
- Performance variation by type (all simple jets).

## Implementation notes

Suggested JSON fragment (merge into existing KDEM stub without breaking Phase 0 fields):

```json
{
  "id": "KDEM",
  "activeRunway": "27",
  "arrivals": [
    {
      "callsign": "DAL123",
      "xNm": 16,
      "yNm": 8,
      "headingDeg": 100,
      "altitudeFt": 8000,
      "speedKt": 220
    }
  ]
}
```

Fill 5 more unique callsigns, e.g. `AAL45`, `UAL200`, `SWA88`, `JBU17`, `NKS310` — **do not** give two aircraft the same numeric suffix `123` in the default scenario (ambiguous-suffix tests will clone in T01-06).

Loader errors: throw in tests / `console.error` + empty list is unacceptable for the default file. Invalid default JSON fails `npm test`.

Keep loader in `src/scenario` so `src/core` does not import JSON if Phase 0 already forbade that; core only receives `AircraftInit[]`.

## Acceptance criteria

- [x] **AC1 —** Default KDEM scenario file lists **6** arrivals including `DAL123`.
- [x] **AC2 —** `createWorldFromScenario(kdem)` (or equivalent) yields 6 aircraft; `DAL123` has `xNm >= 10`, **`headingDeg === 100`**, altitude in [6000, 10000], speed in [210, 250].
- [x] **AC3 —** All default positions are east of origin (`xNm > 0`) and satisfy the spawn box in Scope.
- [x] **AC4 —** Callsigns unique; stored uppercase.
- [x] **AC5 —** Each spawned aircraft is in equilibrium (intent matches present state) so they fly straight until a command.
- [x] **AC6 —** Unit test loads the real default JSON (not a duplicate hardcoded list) and asserts AC1–AC5.
- [x] **AC7 —** Loader rejects (throw or `Result` err) a fixture with 3 aircraft or duplicate callsigns — tested with a **test-only** JSON object, not by breaking the default file.

## Test plan

- Unit: default scenario counts and bounds; invalid count; duplicate callsign.
- Integration: none
- Manual: none (visibility on PPI is T01-10 / T01-14)

## Suggested files

- `src/scenario/kdem.json` (or Phase 0 path)
- `src/scenario/spawn.ts`
- `src/scenario/spawn.test.ts`
- `src/scenario/types.ts`
- `src/ui/` or `src/main.ts` — call spawn at boot if the shell already exists
