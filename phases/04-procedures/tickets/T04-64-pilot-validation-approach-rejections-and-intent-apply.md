# T04-64 Pilot validation, approach rejections, and intent apply

**Phase:** 04 Procedures (seventy-first swarm addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-63
**Blocks:** T04-65
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement pilot validation and intent application for SID/STAR altitude precedence, approach altitude rejection, intercept heading preservation prior to localizer capture, FAA 5 DME/FAF speed boundary validation, and DSR intent state.

## Context

Under FAA JO 7110.65, assigning an altitude to an arrival on a STAR cancels the vertical restrictions of the procedure while lateral routing continues. Once cleared for an approach, altitude instructions are invalid. Speed instructions inside the FAF or 5 DME (whichever is closer) violate separation policy and must be rejected as unable. Headings assigned before localizer capture adjust the intercept heading without dropping the approach clearance.

## Research

- **FAA JO 7110.65 § 4-8-1 — Approach Clearance & Altitudes**:
  Once cleared for an instrument approach, altitude clearances are not issued; pilot navigates the published profile.
- **FAA JO 7110.65 § 5-7-1 — Application of Speed Adjustments**:
  Do not assign speed adjustments to aircraft inside the final approach fix or 5 miles from the runway, whichever is closer.
- **FAA JO 7110.65 § 5-9-1 & § 5-9-2 — Radar Vectors to Final Approach Course**:
  Heading adjustments issued to aircraft prior to localizer capture serve as intercept vectors.
- **Official terms**: Cleared approach, final approach fix, 5 DME, intercept localizer, unable, delete speed restrictions.
- **Trainer delta**: Simulator computes along-track threshold distance and compares against `Math.min(approach.fafDistanceNm ?? 5, 5)` to enforce FAA speed boundaries deterministically.

## Command & State Contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `C50` / `D50` while `vertical === VIA_STAR` | Transitions vertical to `ASSIGNED` targeting 5000 ft | Lateral remains `PROCEDURE`; `cross` cleared | Verb direction conflict rejects as `CLIMB_NOT_ABOVE`/`DESCEND_NOT_BELOW` | JO 7110.65 § 4-8-1 |
| `A30` / `D30` while `clearedApproachId` is set | Rejection: `"AAL123 unable. cleared for the ILS already."` | Intent remains unchanged | Initial clearance command with `untilEstablished` remains valid | JO 7110.65 § 4-8-1 |
| `H240` / `T10R` while `clearedApproachId` set & not on `LOC` | Preserves `clearedApproachId`, updates heading, arms `INTERCEPT_LOC` | Lateral is `INTERCEPT_LOC`; flies assigned heading | Malformed heading rejected by standard validator | JO 7110.65 § 5-9-2 |
| `H240` while `lateral === LOC` | Cancels approach; breakouts to heading | `clearedApproachId = null`; lateral is `HEADING` | None | JO 7110.65 § 5-9-2 |
| `S180` / `S180/FAF` inside 5 DME / FAF | Rejection: `"AAL123 unable. restriction too close to 5 DME"` | Intent remains unchanged | Boundary uses `Math.min(fafDistanceNm ?? 5, 5)` | JO 7110.65 § 5-7-1 |
| `S180/3DME` when boundary is 5 DME | Rejection: `"AAL123 unable. restriction too close to 5 DME"` | Intent remains unchanged | Target point inside boundary fails validation | JO 7110.65 § 5-7-1 |
| `DSR` on SID/STAR | Sets `speedRestrictionsDeleted = true`, clears controller speed | Bypasses procedure speed constraints | Valid for any active aircraft | JO 7110.65 § 5-7-2 |

## Scope

- In `src/pilot/validate.ts`:
  - In `validateAltitude`:
    - Check if `aircraft.intent.clearedApproachId` is set.
    - If set: reject with `{ ok: false, reason: "ALTITUDE", detail: isIls ? "unable. cleared for the ILS already." : "unable. cleared for the approach already." }`.
  - In `validateSpeed`:
    - Calculate approach boundary distance: `hardBoundaryNm = Math.min(approach.fafDistanceNm ?? 5, 5)`.
    - If aircraft is on approach and along-track distance `<= hardBoundaryNm`: reject with unable detail referencing the controlling limit (`"unable. restriction too close to 5 DME"` or `"unable. restriction too close to final approach fix"`).
    - If instruction specifies `until`:
      - If `until.type === "DME"` and `until.distanceNm < hardBoundaryNm`: reject with unable detail.
      - If `until.type === "FIX"` and fix position distance from threshold `< hardBoundaryNm`: reject with unable detail.
  - In `validateOne`:
    - Handle `DELETE_SPEED_RESTRICTIONS`: returns `{ ok: true }`.
- In `src/pilot/applyIntent.ts`:
  - `ALTITUDE`:
    - If `vertical?.type === "VIA_STAR" || vertical?.type === "VIA_SID"`:
      - Set `vertical = { type: "ASSIGNED" }`.
      - Clear `cross = undefined`.
      - Lateral remains untouched (`PROCEDURE`).
  - `SPEED`:
    - Set `controllerAssignedSpeedKt = instruction.speedKt`.
    - Set `assignedSpeedKt = instruction.speedKt`.
    - Set `speedUntil = instruction.until`.
    - Clear `speedRestrictionsDeleted = undefined`.
  - `DELETE_SPEED_RESTRICTIONS`:
    - Clear `controllerAssignedSpeedKt = undefined`.
    - Clear `speedUntil = undefined`.
    - Set `speedRestrictionsDeleted = true`.
  - `FLY_HEADING` / `TURN_DEGREES` / `PRESENT_HEADING`:
    - In `setHeadingMode`:
      - If `aircraft.intent.clearedApproachId` is present AND `lateral?.type !== "LOC"` AND `lateral?.type !== "LANDING"`:
        - Do NOT clear `clearedApproachId`.
        - Set `assignedHeadingDeg = headingDeg; turn = turn`.
        - Set `lateral = { type: "INTERCEPT_LOC", approachId: clearedApproachId }`.
        - Set `locInterceptApproachId = clearedApproachId`.
      - If established on `LOC` or `LANDING`:
        - Clear `clearedApproachId = null`.
        - Clear `locInterceptApproachId = null`.
        - Set `lateral = { type: "HEADING", headingDeg }`.
  - `applyVia` (`DESCEND_VIA` / `CLIMB_VIA`):
    - Reset `speedRestrictionsDeleted = false`.
- In `src/pilot/readback.ts`:
  - Support rejection detail strings in `formatRejectReadback` preserving natural, concise telephony:
    - `"AAL123 unable. cleared for the ILS already."`
    - `"AAL123 unable. restriction too close to 5 DME"` / `"AAL123 unable. restriction too close to final approach fix"`

## Out of scope

- Kinematics deceleration physics and FMS `targetSpeedKt` calculation (owned by T04-65).
- Parsing new Command IR tokens (owned by T04-63).
- Modifying MVA, ATPA, or CA alert thresholds.

## Acceptance criteria

- [ ] **AC1 — Altitude on STAR precedence**: Issuing an altitude clearance to an aircraft descending via STAR switches vertical mode to `ASSIGNED` directly to the assigned altitude, clears `cross`, and keeps the lateral STAR path.
- [ ] **AC2 — Altitude rejection on approach**: Issuing an altitude clearance when `clearedApproachId` is active rejects with `"unable. cleared for the ILS already."`.
- [ ] **AC3 — Intercept heading on approach**: Issuing a heading to an aircraft cleared for approach but not established updates heading and maintains `INTERCEPT_LOC` without dropping `clearedApproachId`.
- [ ] **AC4 — Breakout on localizer**: Issuing a heading to an aircraft established on `LOC` breaks out to heading and cancels `clearedApproachId`.
- [ ] **AC5 — Speed rejection inside 5 DME / FAF**: Speed instructions inside the hard boundary `Math.min(fafDistanceNm ?? 5, 5)` reject with `"unable. restriction too close to 5 DME"` (or FAF).
- [ ] **AC6 — Speed until validation**: Speed instructions specifying an `until` gate inside the hard boundary reject with unable.
- [ ] **AC7 — DSR intent application**: `DSR` sets `speedRestrictionsDeleted = true` and clears `controllerAssignedSpeedKt`. Re-clearing via resets the flag.

## Test plan

- **Unit:** Test altitude validation on cleared approach vs un-cleared; speed validation outside and inside 5 DME / FAF boundary; heading apply on intercepting vs established aircraft; DSR intent mutation.
- **Integration:** Command execution via `handleRadioText` verifying accepted intent and reject readbacks.
- **Repo CI:** `npm run ci`.

## Suggested files

- `src/pilot/validate.ts`
- `src/pilot/applyIntent.ts`
- `src/pilot/readback.ts`
- `src/pilot/test/validate.test.ts`
- `src/pilot/test/applyIntent.test.ts`
- `src/pilot/test/readback.test.ts`
