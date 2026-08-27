# T04-18 Session traffic parameters

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-17
**Blocks:** T04-19, T04-20, T05-13
**Launch:** Implement this ticket only. Do not add UI, time scheduling, or departures.

## Goal

A typed, deterministic session configuration selects scenario, arrival count, and seed without changing the existing FPS bench semantics. A normal KDEM session with an overridden arrival count remains a seeded STAR-inbound pack, not a downwind arc.

## Context

T04-14 made default KDEM traffic catalog-driven and seeded. Its `?traffic=N` path deliberately replaces the pack with a downwind arc for the FPS bench. That overloaded query must not become the trainer's arrival-count control.

`phases/_shared/glossary.md` defines a Scenario as spawn rules, active runway, maps, and traffic mix. This ticket changes session construction only; it does not add a menu.

## Research

R01 / R03 define arrival and descend-via terms. Seeded traffic mix and session controls are trainer deltas, not ATC phraseology. Comment the split between catalog STAR arrivals and the explicit performance bench.

## Scope

- Add DOM-free `SessionTrafficParams` with `scenarioId`, `arrivalCount`, and `seed`; preserve defaults from selected scenario.
- Add a separate explicit bench flag or mode. Preserve `?traffic=N` as the heading-090 downwind FPS bench; do not reinterpret it as session arrival count.
- Change normal `star-inbound` creation to generate exactly the requested count using catalog STAR slots, unique deterministic callsigns, and T04-14 assignment rules.
- Keep authored scenarios such as `kdem-ils27` deterministic and unchanged unless a future scenario explicitly opts into configurable traffic.
- Normalize invalid counts to documented bounds. Validate integer seed as uint32. No `Math.random` or wall-clock default.
- Retain query parsing for backwards compatibility; add query parsing for the session form only if it can use the same parameter parser.

## Out of scope

- UI, localStorage, Apply/restart flow (T05-13).
- Time-based arrival scheduling (T04-19).
- Departures, SIDs, runway changes, radio frequencies.
- Changing the FPS benchmark traffic layout or its commandability.

## Implementation notes

Prefer:

```ts
interface SessionTrafficParams {
  scenarioId: string;
  arrivalCount?: number;
  seed: number;
  benchMode?: "downwind-arc";
}
```

The scenario registry in T04-21 owns resolving `scenarioId`; accept a loaded `Scenario` here until that ticket lands. A normal count override must call generic STAR assignment and synthesize callsigns without a KDEM/DEM1 branch. Reserve collisions against authored callsigns deterministically.

## Acceptance criteria

- [ ] **AC1 —** Given loaded KDEM and `{ arrivalCount: 4, seed: 1 }`, when a normal session World is created, then it has 4 unique STAR-inbound/VIA arrivals and no downwind-arc heading-090 replacement.
- [ ] **AC2 —** Given the same scenario and `{ arrivalCount: 8, seed: 1 }`, when created twice, then both Worlds have deep-equal assignment inputs/poses and 8 unique callsigns.
- [ ] **AC3 —** Given explicit bench mode with count 30, when created, then it retains today's 30-aircraft downwind arc; `?traffic=30` maps only to that mode.
- [ ] **AC4 —** Given `kdem-ils27` and a normal count override, when created, then its authored two-aircraft acceptance fixture remains unchanged.
- [ ] **AC5 —** Invalid count or seed input returns documented defaults/bounds without crashing boot. No production session path calls `Math.random`.
- [ ] **AC6 —** Automated tests cover AC1–AC5.
- [ ] **AC7 — Research:** Spawn code comments distinguish catalog STAR traffic from the explicit FPS bench and call both trainer behavior.

## Test plan

- Unit: parameter normalize/parse; seeded count 4 and 8; callsign uniqueness.
- Integration: KDEM normal override remains VIA; explicit benchmark and ILS fixture remain unchanged.
- Manual: none.

## Suggested files

- `src/scenario/sessionTraffic.ts`
- `src/scenario/spawn.ts`
- `src/scenario/starSpawn.ts`
- `src/scenario/trafficQuery.ts`
- `src/scenario/types.ts`
- `src/scenario/spawn.test.ts`
- `src/scenario/starSpawn.test.ts`
- `src/scenario/trafficQuery.test.ts`
