# T04-21 Randomized and customizable departure traffic generator

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-20, T04-14
**Blocks:** T04-22, T04-23
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Provide a customizable and seeded-random departure traffic generator that schedules and spawns departures periodically (or in authored batches) off the active runway, uniformly distributing them across available catalog SIDs and enroute transitions without callsign collisions or arrival interference.

## Context

Today `createWorldForSession` creates a static batch of STAR arrivals at session start. In real TRACON airspace, departures roll off the runway at regular intervals (e.g. every 3–6 minutes) interspersed with arrivals.

Controllers need customizable control over departure operations:
- Enable/disable departures via URL query parameters (`?departures=auto`, `?departures=off`, `?dep_rate=10`) or scenario JSON.
- Configurable spawn rate (departures per hour or fixed interval).
- Seeded pseudo-random stream (`mulberry32` with distinct seed / stream XOR) for deterministic replay and test stability.
- Smart callsign and airline generator avoiding collisions with active arrival callsigns.
- Runway wake turbulence / departure interval buffer (e.g. minimum 60–90 seconds between successive departures on the same runway).

See `src/scenario/trafficQuery.ts`, `src/scenario/spawn.ts`, `src/core/rng.ts`.

## Research

- **R01** JO 7110.65 — Chapter 3 Section 9 (Minimum departure intervals, same-runway separation).
- **R02** FAA Traffic Management — Terminal departure flow rates (rates per hour, metering).

**Official term:** Departure Flow Rate, Departure Spacing Interval, Traffic Mix.

**Trainer delta:** Seeded PRNG (`mulberry32`), parameterized query options, timer-based spawn scheduler evaluated in the simulation clock loop.

## Scope

- Query parameter parsing in `src/scenario/trafficQuery.ts`:
  - `parseDepartureOptions(search)`:
    - `enabled: boolean` (default false for historical scenarios unless `?departures` is specified or scenario `departurePolicy` is set).
    - `ratePerHour?: number` (default e.g. 10 departures/hr -> ~360s interval; or custom `?dep_rate=15`).
    - `initialCount?: number` (number of departures to queue/spawn initially).
- Scenario JSON schema extensions in `src/scenario/types.ts`:
  ```ts
  export interface DepartureSpawn {
    callsign: string;
    sidId: string;
    transitionId: string;
    assignedAltitudeFt: number;
    aircraftType?: string;
    scheduledSimMs?: number;
  }

  export type DeparturePolicy = "none" | "auto" | "authored";

  export interface DepartureConfig {
    policy: DeparturePolicy;
    ratePerHour?: number;
    departures?: DepartureSpawn[];
  }
  ```
- Departure Generator & Scheduler (`src/scenario/departureGenerator.ts`):
  - `generateDepartureSchedule({ catalog, seed, ratePerHour, count, runwayId, activeCallsigns })`:
    - Picks unique callsigns not currently active.
    - Uniformly samples available `(sidId, transitionId)` pairs from `catalog.sids`.
    - Samples assigned top altitude (e.g. 10000, 12000, 14000, 16000 ft).
    - Assigns scheduled spawn timestamps respecting minimum runway separation (e.g. >= 90s).
- Session loop integration:
  - `stepWorld` / departure scheduler evaluates elapsed sim time and spawns due departures into `world.aircraft`.
  - Logs `departure.scheduled` and `departure.spawned` session events.
- Snapshot and unit tests for deterministic generation under fixed seeds.

## Out of scope

- Speech check-in audio generation (T04-22).
- Manual pushback / ground taxi sequencing (airborne off runway only).

## Acceptance criteria

- [ ] **AC1 —** `parseDepartureOptions("?departures=auto&dep_rate=12&seed=5")` returns `{ enabled: true, ratePerHour: 12, seed: 5 }`. Default without params retains backward compatibility (`enabled: false`).
- [ ] **AC2 —** Given seed `1` and rate `10`, the departure generator generates identical schedules, callsigns, SIDs, and timestamps on repeated runs. Seed `2` generates a different mix.
- [ ] **AC3 —** Generated departures never duplicate callsigns of active arrivals or other departures.
- [ ] **AC4 —** Successive departures on the same runway have at least 60 seconds of simulated time between them.
- [ ] **AC5 —** When enabled during a live session, departures spawn dynamically at their scheduled times onto the scope with active SID navigation.
- [ ] **AC6 —** Automated tests for AC1–AC5 pass. `npm test` exit 0.

## Test plan

- Unit: Query param parsing; seeded schedule generation; callsign collision prevention; interval enforcement.
- Integration: Sim session runs for 600s with departures enabled; verifies departures appear at expected timestamps.
- Manual: `npm run dev -- ?departures=auto` shows departures rolling off RW27 at periodic intervals.

## Suggested files

- `src/scenario/trafficQuery.ts`
- `src/scenario/trafficQuery.test.ts`
- `src/scenario/types.ts`
- `src/scenario/departureGenerator.ts`
- `src/scenario/departureGenerator.test.ts`
- `src/scenario/spawn.ts`
- `src/core/world.ts`
