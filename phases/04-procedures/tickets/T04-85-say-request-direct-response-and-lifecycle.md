# T04-85 Direct pilot request response to REQUEST_DETAILS and lifecycle acceptance

**Phase:** 04 Procedures (satellite traffic addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-84
**Blocks:** None
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start a later ticket or phase.

## Goal

Eliminate the awkward pilot parroting of `"say request"` in readback. When ATC issues `REQUEST_DETAILS` (`"<callsign>, say request"`), the pilot must immediately respond with their full request details (VFR flight following or airborne IFR pickup with destination and requested altitude) without a secondary polling queue or duplicate speech playback.

## Context

Under current behavior, when ATC says `"Skyhawk 172SP, say request"`, [`src/pilot/readback.ts`](file:///home/ben/ATC-SIM/src/pilot/readback.ts#L225) returns `"say request"`, making the pilot read back *"Skyhawk 172SP say request"*. Then, seconds later, [`VfrRequestQueue`](file:///home/ben/ATC-SIM/src/pilot/vfrRequestQueue.ts#L622-L636) polls for requests in `AWAITING_DETAILS` status and plays a separate audio transmission with the actual request details.

Under this ticket:
1. When ATC issues `REQUEST_DETAILS`, [`handleRadioText`](file:///home/ben/ATC-SIM/src/pilot/handleRadioText.ts) retrieves the pending radio request for the aircraft, formats the direct pilot request text (`formatVfrFlightFollowingRequest` or `formatIfrPickupRequest`), updates the radio request status, and returns this text directly as `result.readback`.
2. Remove `"say request"` from [`formatInstructionClause`](file:///home/ben/ATC-SIM/src/pilot/readback.ts).
3. Remove the redundant delayed `AWAITING_DETAILS` polling loop in [`VfrRequestQueue`](file:///home/ben/ATC-SIM/src/pilot/vfrRequestQueue.ts) so audio plays exactly once.
4. Standby request behavior is preserved: `"Skyhawk 172SP, stand by"` (`STANDBY_REQUEST`) still reads back `"Skyhawk 172SP standby"` and transitions request status to `STANDBY`. When the controller subsequently issues `"Skyhawk 172SP, say request"`, the pilot responds directly with their request details.

## Research

- **FAA JO 7110.65 §2-4-15 (Simultaneous and Incomplete Transmissions / Say Request):**
  When ATC queries a pilot with `"say request"`, the controller is soliciting information. The pilot does not read back the controller's query; the pilot transmits the required flight information directly.
- **FAA JO 7110.65 §2-4-14 (Words and Phrases / Stand By):**
  `STAND BY` means pause or wait for acknowledgment. Pilot acknowledges with callsign and `"standby"`.
- **FAA AIM §4-2-3 (Contact Procedures):**
  Two-way contact pattern:
  - Pilot: `"Atlanta Approach, Skyhawk 1 7 2 Sierra Papa"`
  - Controller: `"Skyhawk 172SP, say request"`
  - Pilot: `"Skyhawk 1 7 2 Sierra Papa, 15 miles northeast of PDK, Cessna 172, 4500, request flight following to FTY"`
  - Controller: `"Skyhawk 172SP, squawk 4215, maintain VFR"`

## Scope

- Direct Request Response (`src/pilot/handleRadioText.ts`):
  - In `handleRadioText`: when `requestControl.type === "REQUEST_DETAILS"`, find the active open request for the aircraft.
  - If a request is found:
    - Generate the response using `formatVfrFlightFollowingRequest` (for `FLIGHT_FOLLOWING`) or `formatIfrPickupRequest` (for `IFR_PICKUP`).
    - Transition request status to `PENDING` with details submitted.
    - Log `vfr.request.details_reported` session event.
    - Set `readback` to this generated pilot response string.
  - If no open request is found:
    - Return standard pilot rejection/query (`"${callsign} unable, say again"` or rejection).
- Readback Phraseology Cleanup (`src/pilot/readback.ts`):
  - In `formatInstructionClause`, remove the literal `"say request"` return for `case "REQUEST_DETAILS":`.
- Deduplication (`src/pilot/vfrRequestQueue.ts`):
  - Remove redundant delayed `AWAITING_DETAILS` polling in `vfrRequestQueue.step()`.
- Lifecycle Acceptance & Integration Tests:
  - Update `src/pilot/test/readback.test.ts` and `src/pilot/test/handleRadioText.test.ts`.
  - Update or add integration tests in `tests/integration/vfr-radio-contact-lifecycle.test.ts`:
    - Full flow: Initial cold call -> `say request` -> direct request details -> clearance / approval.
    - Standby flow: Initial cold call -> `stand by` -> readback `"standby"` -> `say request` -> direct request details -> clearance.
    - Decline flow: Initial cold call -> `say request` -> request details -> `unable flight following` / `unable IFR pickup` -> pilot reads back unable.

## Out of scope

- Changing initial cold call format (owned by T04-84).
- Modifying STT / Speech API Command IR definitions.
- Automatic pilot route changes without ATC clearance.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| :--- | :--- | :--- | :--- | :--- |
| ATC: `"N172SP, say request"` with pending flight following | Pilot immediately replies with full VFR request (no `"say request"` readback) | Request marked with details reported; audio played once | Aircraft unknown -> `CALLSIGN_UNKNOWN` rejection | JO 7110.65 §2-4-15 |
| ATC: `"N210AB, say request"` with pending IFR pickup | Pilot immediately replies with full IFR request (position, type, destination, altitude) | Request marked with details reported; ready for `IFR_CLEARANCE` | No open request -> `unable, say again` | AIM §5-1-14 |
| ATC: `"N172SP, stand by"` | Pilot replies `"N172SP standby"` | Request status set to `STANDBY` | Additional commands bundled -> rejected (single-instruction rule) | JO 7110.65 §2-4-14 |
| Subsequent ATC: `"N172SP, say request"` after standby | Pilot immediately replies with full request details | Request resumes and reports details | Request already terminated -> rejected | JO 7110.65 §2-4-15 |

## Acceptance criteria

- [ ] Pilot never parrots `"say request"` in readback.
- [ ] ATC `"say request"` immediately produces the pilot's full request details (VFR flight following or airborne IFR pickup) as the readback response.
- [ ] Radio audio plays the request details exactly once without secondary delayed polling.
- [ ] Standby workflow (`"stand by"` -> `"standby"` readback -> `"say request"` -> direct request details) functions reliably without state desync.
- [ ] All unit, lifecycle, and integration tests pass cleanly.
- [ ] `npm run ci` and `cd speech-api && SPEECH_API_MOCK=1 pytest` pass cleanly.
