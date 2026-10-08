# T04-84 Cold call initial check-in and enriched IFR pickup request schema

**Phase:** 04 Procedures (satellite traffic addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-83
**Blocks:** T04-85
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start a later ticket or phase.

## Goal

Replace the monolithic initial VFR/IFR callup information dump with an authentic FAA cold call check-in (`"Approach, <callsign>"`), while enriching scheduled airborne IFR pickup records with aircraft type, destination, and requested altitude for subsequent transmission.

## Context

Currently, [`VfrRequestQueue.step()`](file:///home/ben/ATC-SIM/src/pilot/vfrRequestQueue.ts) dumps all flight information on initial check-in (position, type, altitude, and request). Furthermore, the existing IFR pickup transmission string drops the generated `requestedAltitudeFt` and `aircraftType`.

Under this ticket:
1. When an unsolicited airborne request (VFR flight following or airborne IFR pickup) is transmitted, the pilot emits only the cold call check-in: `"${facility} Approach, ${callsign}"` (e.g. `"Atlanta Approach, Skyhawk 172SP"` when `world.regional?.facilityName` is `"Atlanta"`, or `"Approach, Skyhawk 172SP"` as generic fallback).
2. The initial transmission creates a `RadioRequest` in `world.radioRequests` with `status: "PENDING"`, retaining the full request details (`aircraftType`, `destinationAirportId`, `requestedAltitudeFt`, `positionNm`, `altitudeFt`, `headingDeg`).
3. Add a dedicated formatter `formatIfrPickupRequest` in `vfrRequestQueue.ts` formatting:
   `"${callsign}, ${positionPhrase}, ${aircraftType}, request IFR to ${destinationAirportId}, requested altitude ${altitudeFt}"`.
   When optional fields are omitted, the formatter degrades gracefully without malformed commas or tokens.

## Research

- **FAA AIM §4-2-3(a) (Contact Procedures):**
  Initial contact on a frequency should consist of:
  1. Name of facility being called (`"Atlanta Approach"` / `"Approach"`).
  2. Full aircraft identification (`"Skyhawk 172SP"`).
  In high-density radar environments, pilots initiate contact with facility and callsign, awaiting controller acknowledgment before stating their full request.
- **FAA AIM §5-1-14 (Airborne IFR Clearances):**
  Pilots requesting airborne IFR clearances must provide aircraft identification, aircraft type, present position, requested altitude, and route/destination.
- **FAA JO 7110.65 §2-4-2, §2-4-15 (Radio Communications):**
  Initial acknowledgment sequence:
  - Pilot: `"Approach, Skyhawk 1 7 2 Sierra Papa"`
  - Controller: `"Skyhawk 172SP, [Atlanta Approach], say request"` (handled in T04-85).

## Scope

- Initial Callup Formatting (`src/pilot/vfrRequestQueue.ts`):
  - In `step()` when a pending request is due and transmitted, format the initial check-in as:
    `"${facilityPrefix}Approach, ${next.callsign}"` where `facilityPrefix` is `"${regionalFacility.facilityName} "` if defined, or `""` otherwise.
  - Set `status` to `"PENDING"` in `world.radioRequests`.
  - Ensure `next.positionNm`, `next.altitudeFt`, `next.headingDeg`, `next.aircraftType`, `next.destinationAirportId`, and `next.requestedAltitudeFt` are populated into `RadioRequestDetails`.
- Enriched IFR Request Formatter (`src/pilot/vfrRequestQueue.ts`):
  - Implement `formatIfrPickupRequest(args: { callsign: string; positionPhrase?: string; aircraftType?: string; destinationAirportId?: string; requestedAltitudeFt?: number }): string`.
  - Use format: `"${args.callsign}, ${args.positionPhrase}, ${args.aircraftType}, request IFR to ${args.destinationAirportId}, requested altitude ${args.requestedAltitudeFt}"`.
  - Omit segments cleanly when properties are undefined.
- Documentation:
  - Note cold call phraseology in `docs/USER.md` (or radio section).

## Out of scope

- Direct response to `REQUEST_DETAILS` and elimination of `"say request"` parroting (owned by T04-85).
- Standby request queue timeout changes (owned by T04-85).
- New Command IR discriminants (existing `REQUEST_DETAILS`, `STANDBY_REQUEST`, and `DECLINE_REQUEST` are reused).

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| :--- | :--- | :--- | :--- | :--- |
| Unsolicited VFR flight following request due | Audio/status emits `"Atlanta Approach, Skyhawk 172SP"` | RadioRequest appended to `world.radioRequests` as `PENDING`; details contain destination and cruise altitude | Simulation paused (`dtSec <= 0`) -> no check-in | AIM §4-2-3(a) |
| Unsolicited IFR pickup request due | Audio/status emits `"Atlanta Approach, Cessna 210AB"` | RadioRequest appended to `world.radioRequests` as `PENDING`; details contain destination and requested altitude | Missing regional facility name -> defaults to `"Approach, <callsign>"` | AIM §4-2-3(a) |
| `formatIfrPickupRequest` with full fields | Produces `"N123, 15 miles NE of PDK, C172, request IFR to KPDK, requested altitude 5000"` | Pure formatting function; no side effects | Empty optional fields -> omits missing segments cleanly without double commas | AIM §5-1-14 |
| Aircraft exits airspace before check-in due | Request transitions to `WITHDRAWN` with reason `AIRCRAFT_EXITED` | Log `vfr.request.withdrawn` | Does not transmit check-in | JO 7110.65 §2-4-2 |

## Acceptance criteria

- [ ] Unsolicited airborne request check-in transmits only facility identification + aircraft callsign (`"Atlanta Approach, <callsign>"` or `"Approach, <callsign>"`).
- [ ] Initial check-in creates `RadioRequest` in `world.radioRequests` with `status: "PENDING"` and complete details.
- [ ] `formatIfrPickupRequest` builds complete IFR request string including position, aircraft type, destination, and requested altitude.
- [ ] Unit tests in `src/pilot/test/vfrRequestQueue.test.ts` and `src/pilot/test/airborneIfrPickup.test.ts` verify the cold call format and enriched payload.
- [ ] `npm run ci` passes cleanly.
