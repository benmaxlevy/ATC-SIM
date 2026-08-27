# T04-25 Configurable arrival traffic

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-23
**Blocks:** T05-13
**Launch:** Implement this ticket only. Do not add session UI or change departure behavior.

## Goal

Session parameters control seeded initial arrival count and arrivals-per-hour. Normal traffic remains catalog STAR inbound/VIA; `?traffic=N` remains a separate downwind FPS benchmark.

## Context

T04-14 seeds one initial STAR pack. T04-21 configures departure generation. Arrival count/rate still lacks a typed session API and simulated-time scheduler, so T05-13 must not expose those controls yet.

`stepWorld` remains the sole kinematics integrator. Scheduler code may drain due aircraft using sim time but must not integrate motion or change Command IR.

## Scope

- Add DOM-free arrival session parameters: initial count, arrivals/hour, seed, and documented validated bounds/defaults.
- Separate normal traffic from explicit `?traffic=N` downwind benchmark. A normal count override creates catalog STAR arrivals, never heading-090 benchmark aircraft.
- Create deterministic future arrival schedule with due sim times and one drain operation. Initial pack remains at session start; later arrivals use generic STAR assignment, unique callsigns, existing inbound-handoff, and check-in paths.
- Wire scheduler once into session tick. Paused time produces no arrivals; a large step drains every due entry exactly once.
- Keep authored ILS scenario and benchmark free from scheduled arrivals unless their data explicitly supports it.

## Out of scope

- Departure scheduler/rate behavior (T04-21).
- Session UI, storage, or restart flow (T05-13).
- Live traffic feeds, radio-frequency commands, changing active runway, weather.

## Implementation notes

Use `3_600_000 / arrivalsPerHour` sim ms. No timer, `Date.now`, or `Math.random`. Freeze a documented initial population/default rate suitable for 30-arrival FPS budget. Seeded assignment/callsign sequence must deep-equal across sessions.

## Acceptance criteria

- [ ] **AC1 —** KDEM normal `{ initialArrivalCount: 4, seed: 1 }` creates 4 unique STAR-inbound/VIA arrivals, never a downwind arc.
- [ ] **AC2 —** At 12 arrivals/hour, no future aircraft appears before 300_000 sim ms; one appears at that time with normal inbound-handoff/check-in behavior.
- [ ] **AC3 —** A tick crossing two due times drains two unique arrivals once; second drain at same sim time drains none.
- [ ] **AC4 —** Equal seed/parameters/times produce deep-equal callsigns, slots, poses, and due times.
- [ ] **AC5 —** Explicit `?traffic=30` preserves heading-090 benchmark; `kdem-ils27` remains authored and gets no scheduler.
- [ ] **AC6 —** Paused simulation and wall time alone produce no arrivals.
- [ ] **AC7 —** Automated tests cover AC1–AC6. No fake timer required.
- [ ] **AC8 — Research:** Comments call arrivals/hour trainer traffic density, not radio frequency, and state pre-armed VIA analog.

## Test plan

- Unit: parse/bounds, due drain, same-seed sequence, zero/off rate.
- Integration: session tick, pause, inbound handoff/check-in, ILS/benchmark regressions.
- Manual: high test rate, advance sim time until one arrival appears.

## Suggested files

- `src/scenario/arrivalScheduler.ts`
- `src/scenario/arrivalScheduler.test.ts`
- `src/scenario/sessionTraffic.ts`
- `src/scenario/spawn.ts`
- `src/scenario/trafficQuery.ts`
- `src/app/create-app.ts`
