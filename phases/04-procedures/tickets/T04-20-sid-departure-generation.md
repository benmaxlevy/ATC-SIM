# T04-20 SID departure generation

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-19, T04-21
**Blocks:** T05-13
**Launch:** Implement this ticket only. Do not add the session menu.

## Goal

Session traffic can create deterministic departures at a configured departures-per-hour rate using catalog SIDs and runway data. Each spawned departure has real, observable procedure behavior; no visible control is a no-op.

## Context

The KDEM catalog has an empty `sids` array. Phase 4 explicitly excluded flying SIDs. Departure frequency therefore requires both authored SID data and a generic procedure/spawn path before T05-13 exposes its control.

`phases/_shared/extensible-features.mdc` requires data-first facility behavior. A new SID, runway transition, or airport must be JSON/catalog work, never an ICAO or procedure-id branch.

## Research

R01 / R03 define SID and departure terminology. Use a fictional trainer procedure, not a scraped chart or current FAA data. Comment that departure generation is a trainer traffic model and describe any intentionally limited procedure behavior.

## Scope

- Extend KDEM procedure JSON with at least one fictional SID, runway association, and legs valid under the generic catalog schema.
- Add generic departure spawn templates/data and a seeded departure scheduler using `departuresPerHour`.
- Start each departure at a valid runway-relative pose, with unique deterministic callsign, climb state, and first SID target.
- Add generic SID route walking/intent behavior sufficient for departure to fly each published leg. If a schema capability is missing, add it generically; do not hardcode KDEM.
- Preserve existing arrivals, ILS scenario, FPS bench, STAR behavior, handoff, and check-in.
- Add a second same-schema test fixture proving a second SID/runway path needs no production branch.

## Out of scope

- Ground/taxi/tower cab, runway occupancy, wake separation, departures radio phraseology.
- Real FAA procedures, CIFP expansion, chart scraping.
- Changing active runway during a session.
- UI and persistence (T05-13).

## Implementation notes

Do not ship a departure-rate setting until spawned aircraft actually navigate the SID. If the current FMS cannot express required climb/termination behavior, scope a generic schema and walker. Add `phases/LATER-IMPLEMENTATION-BACKLOG.md` only if a visible/callable partial capability remains deliberately incomplete.

Use sim time, seed, catalog order, and deterministic callsign generation. Select applicable SID/runway candidates from loaded catalog data; define clear error/off behavior when no departure-capable SID exists.

## Acceptance criteria

- [ ] **AC1 —** Given KDEM catalog data, when loaded, then it contains a valid fictional SID tied to its runway and every referenced fix resolves through the generic catalog.
- [ ] **AC2 —** Given a session with departures enabled and a fixed seed, when the first departure is due, then one unique aircraft spawns runway-relative with SID intent armed and advances toward the first published leg.
- [ ] **AC3 —** Given two same-schema SID/runway fixtures, when each is selected, then departure generation follows the catalog without an ICAO/SID-id production branch.
- [ ] **AC4 —** Given equal seed and session parameters, when two schedulers advance through equal sim times, then departure callsigns, chosen SID, poses, and due times deep-equal.
- [ ] **AC5 —** Given departures disabled or a scenario without eligible SIDs, when sim advances, then no departure spawns and boot remains usable.
- [ ] **AC6 —** Existing arrival scheduling, STAR descent, ILS, and FPS bench tests stay green.
- [ ] **AC7 —** Automated tests cover AC1–AC6.
- [ ] **AC8 — Research:** Procedure/spawn comments name SID and state fictional trainer data/no chart-scrape boundary.

## Test plan

- Unit: catalog validation, eligible SID selection, seeded scheduler, no-SID behavior.
- Integration: departure moves through first SID leg; arrival regression.
- Manual: start a departure-enabled session and observe a departure climb from runway.

## Suggested files

- `src/scenario/data/kdem/sids.json`
- `src/scenario/types.ts`
- `src/scenario/procedures/types.ts`
- `src/scenario/departureScheduler.ts`
- `src/scenario/spawn.ts`
- `src/pilot/`
- `src/scenario/departureScheduler.test.ts`
- `src/scenario/procedures/`
