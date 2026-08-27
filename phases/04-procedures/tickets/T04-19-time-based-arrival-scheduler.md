# T04-19 Time-based arrival scheduler

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-18
**Blocks:** T04-20, T05-13
**Launch:** Implement this ticket only. Do not add departures or session UI.

## Goal

Configurable arrivals per hour schedules deterministic, catalog-backed STAR inbounds over simulation time. Existing tracks remain; scheduled arrivals appear only at their due simulated time.

## Context

All current arrivals spawn at session start. T04-18 separates normal session traffic from the `?traffic=N` FPS bench. A rate control cannot be a visual preference: it needs scheduler state, deterministic spawn data, and a tick integration point.

`stepWorld` remains the only kinematics integrator. Scheduler logic may observe simulation time and append due aircraft, but must not duplicate aircraft motion or mutate Command IR.

## Research

R01 / R03 terminology: arrivals follow the published STAR with VIA armed. The rate is trainer traffic density, not an ATC radio frequency. Document that delta beside the scheduler.

## Scope

- Extend session traffic parameters with `arrivalsPerHour`; define bounds, default, and disabled/off value.
- Create a DOM-free scheduler with seeded future assignments, due simulation times, and a drain operation that returns all due arrivals.
- Define initial population separately from future arrivals. Default existing startup pack remains intact; later tracks are added at deterministic intervals.
- Reuse generic STAR slot assignment and pose generation. Each future track is STAR-inbound/VIA and receives deterministic unique callsign generation.
- Wire drain to the app/session tick exactly once. Large time steps may spawn multiple due aircraft; paused simulation spawns none.
- Preserve authored scenarios and explicit FPS bench. They do not gain scheduled arrivals unless explicitly supported by data.

## Out of scope

- Departure scheduling (T04-20).
- Mid-session editing, UI, persistence, or restart confirmation (T05-13).
- Live traffic feeds, weather, ATIS, radio-frequency commands, multiplayer.
- Changing check-in/handoff rules; newly spawned default arrivals use existing T04-16/17 and T04-15 paths.

## Implementation notes

Use simulation milliseconds only. Prefer a stable interval `3_600_000 / arrivalsPerHour`, starting after the initial pack. Store scheduler state outside `World` only if replay/session serialization cannot yet own it; expose a JSON-safe snapshot shape for future replay. Seed assignment and callsigns at creation time or consume a documented deterministic RNG sequence—never `Math.random`.

Set a conservative documented rate range suitable for the 30-arrival/60-FPS quality bar. Tests must advance simulated time without timers.

## Acceptance criteria

- [ ] **AC1 —** Given initial KDEM traffic and 12 arrivals/hour, when simulation time is before 300_000 ms, then no additional aircraft spawn; at 300_000 ms, exactly one due STAR-inbound/VIA aircraft is added.
- [ ] **AC2 —** Given a tick that crosses two due times, when drained once, then both aircraft spawn once with unique callsigns; a second drain at same time spawns none.
- [ ] **AC3 —** Given equal parameters and seed, when two schedulers advance through the same simulated times, then emitted assignments, callsigns, and poses deep-equal.
- [ ] **AC4 —** Given paused simulation, when wall time passes, then no scheduler spawn occurs.
- [ ] **AC5 —** Given authored `kdem-ils27` or explicit downwind benchmark mode, when session runs, then no scheduled arrivals are added.
- [ ] **AC6 —** Existing pending-inbound handoff and check-in behavior applies to a spawned default arrival.
- [ ] **AC7 —** Automated tests cover AC1–AC6 with no fake timers required.
- [ ] **AC8 — Research:** Scheduler comment calls arrivals/hour trainer density, not a radio frequency, and cites pre-armed VIA as the arrival analog.

## Test plan

- Unit: interval calculation, due drain, equal-seed sequence, zero/off rate.
- Integration: session tick, pause, inbound handoff/check-in behavior.
- Manual: `npm run dev` with a high test rate; wait in sim time for one inbound.

## Suggested files

- `src/scenario/arrivalScheduler.ts`
- `src/scenario/arrivalScheduler.test.ts`
- `src/scenario/sessionTraffic.ts`
- `src/scenario/spawn.ts`
- `src/app/create-app.ts`
- `src/core/world.ts`
