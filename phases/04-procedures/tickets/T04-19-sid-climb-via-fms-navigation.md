# T04-19 SID climb-via and departure FMS navigation

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-18, T04-03, T04-04
**Blocks:** T04-20, T04-23
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Aircraft can fly Standard Instrument Departures (SIDs) laterally and climb via published altitude and speed restrictions (`CLIMB_VIA` / `VIA_SID`). Pilot agent validates and applies SID instructions (`CLIMB_VIA`, `JOIN_PROCEDURE`, `CROSS`); heading instructions cancel published SID guidance in accordance with FAA JO 7110.65.

## Context

Phase 4 implemented `DESCEND_VIA` for STAR arrivals with lateral fly-by waypoint transitions (`advanceStarLeg` / `guideProcedure`) and vertical constraint descending (`targetAltitudeFt`). SIDs require the climb equivalent:
- Lateral FMS advances through SID legs: runway transition -> common route -> enroute transition.
- Vertical FMS on `CLIMB_VIA`: aircraft climbs toward the top assigned altitude (e.g. 5,000 ft or assigned 10,000 ft) while respecting intermediate `AT` / `AT_OR_ABOVE` / `AT_OR_BELOW` crossing constraints and speed limits (e.g. 250 kt max below 10,000 ft).
- As with STARs, radar vectors (`FLY_HEADING`, `TURN_DEGREES`) take the aircraft off the SID lateral path, canceling `CLIMB_VIA` and leaving the aircraft on assigned heading and altitude.

See `src/core/fms/lateral.ts`, `src/core/fms/vertical.ts`, `src/core/fms/procedureJoin.ts`, `src/pilot/validate.ts`, `src/pilot/applyIntent.ts`.

## Research

- **R01** JO 7110.65 — Section 4-5-7: *Climb Via* clearance phraseology and procedures.
- **R03** AIM 5-2-8 — *Climb Via*: Pilot complies with published lateral path, speed restrictions, and published altitude constraints up to the top altitude.
- **R01** JO 7110.65 — Radar vectors cancel published SID navigation unless amended with an explicit join or direct instruction.

**Official term:** Climb Via SID, Top Altitude, Published Speed Restriction, Radar Vectors Off SID.

**Trainer delta:** Discrete physics tick (20 Hz), kinematic climb rates (~1,500–2,500 fpm for standard jets), FMS guidance uses `FixRegistry` and catalog lookup without facility branches.

## Scope

- Extend `VerticalMode` in `src/core/aircraft.ts`:
  ```ts
  export type VerticalMode =
    | { type: "ASSIGNED" }
    | { type: "VIA_STAR"; starId: string; sense?: "DESCEND" | "CLIMB" }
    | { type: "VIA_SID"; sidId: string }
    | { type: "GS"; approachId: string }
    | { type: "MISSED_CLIMB"; altitudeFt: number };
  ```
  *(Or unify `VIA_PROCEDURE` / `sense: "CLIMB" | "DESCEND"` with backward compatibility for `VIA_STAR`).*
- Extend `procedureRouteContainingFix` in `src/core/fms/procedureJoin.ts` to search `catalog.sids` and return matched SID transitions/routes.
- Extend `advanceStarLeg` / `guideProcedure` in `src/core/fms/lateral.ts` to generically advance `PROCEDURE` mode through SID leg sequences.
- Extend `targetAltitudeFt` in `src/core/fms/vertical.ts`:
  - When climbing via SID, next constraint `AT_OR_BELOW` caps climb until fix is sequenced; `AT_OR_ABOVE` ensures minimum climb rate or target; climbs up to assigned top altitude (`assignedAltitudeFt`).
- Update Pilot agent validation & apply:
  - `CLIMB_VIA <sid>` checks `catalog.sids`, sets `vertical: { type: "VIA_SID", sidId }` and arms SID lateral route if not already active.
  - `JOIN_PROCEDURE <sid>` joins at current or specified fix.
  - Heading instructions (`FLY_HEADING`, `TURN_DEGREES`) cancel SID lateral and vertical modes, reverting to assigned heading & altitude.
  - Readback templates for `CLIMB_VIA` (e.g. `"Climb via the DEMO ONE departure, maintain 5,000"`).
- Unit tests for SID fly-by leg progression, climb-via altitude constraints, heading cancellation, and pilot validation.

## Out of scope

- Initial spawn generation of departures (T04-20).
- Departure telephony / unsolicited check-in (T04-22).
- Real-time weather/wind adjustments (T04-11).

## Acceptance criteria

- [ ] **AC1 —** An aircraft with `lateral.type === "PROCEDURE"` and `vertical.type === "VIA_SID"` (or `VIA_STAR` sense `CLIMB`) correctly flies through SID waypoints in sequence, turning at each fly-by waypoint.
- [ ] **AC2 —** During `CLIMB_VIA`, `targetAltitudeFt` restricts climb to `AT_OR_BELOW` constraints until the fix is sequenced, then continues climb toward the assigned altitude.
- [ ] **AC3 —** Issuing a heading command (`H270`) cancels `PROCEDURE` and `VIA_SID`, reverting to `HEADING` mode and holding the currently assigned altitude.
- [ ] **AC4 —** `validateInstructions` approves valid `CLIMB_VIA <sid>` for catalog SIDs and rejects unknown SID names with `UNKNOWN_PROCEDURE`.
- [ ] **AC5 —** Readback for `CLIMB_VIA` formats correctly according to telephony standards.
- [ ] **AC6 —** Automated tests for AC1–AC5 pass. `npm test` exit 0.

## Test plan

- Unit: SID lateral sequence stepping; `targetAltitudeFt` with multiple climb constraints; validation checks; heading cancel behavior.
- Integration: Pilot command apply for `CLIMB_VIA` + heading vectors.
- Manual: None.

## Suggested files

- `src/core/aircraft.ts`
- `src/core/fms/lateral.ts`
- `src/core/fms/vertical.ts`
- `src/core/fms/vertical.test.ts`
- `src/core/fms/procedureJoin.ts`
- `src/core/fms/procedureJoin.test.ts`
- `src/pilot/validate.ts`
- `src/pilot/validate.test.ts`
- `src/pilot/applyIntent.ts`
- `src/pilot/applyIntent.test.ts`
- `src/pilot/readback.ts`
