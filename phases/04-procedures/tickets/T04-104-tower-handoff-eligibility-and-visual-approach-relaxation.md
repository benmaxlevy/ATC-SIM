# T04-104 Tower Handoff Eligibility and Visual Approach Relaxation

**Phase:** 04 Procedures (tower handoff relaxation addendum)  
**Priority:** P0  
**Size:** M  
**Depends on:** T04-102  
**Blocks:** None  
**Merge target:** `feature/sattelite-traffic`  
**Launch:** Implement this ticket only.

## Mission

Relax controller tower handoff eligibility (`F5` and `CONTACT_TOWER`) to align with FAA JO 7110.65 §5-9-5. Permit tower transfer when an aircraft has an active approach clearance (`clearedApproachId`, `LOC`, `INTERCEPT_LOC`, or `VISUAL_FINAL`), is set to lock onto or established on final approach course (within 45° of final course), and is within 10 NM of the destination threshold/airport. Preserve `VISUAL_FINAL` lateral guidance and threshold auto-land/despawn across tower handoff.

## Research

- **FAA JO 7110.65 §5-9-5 (Approach Separation Responsibility):**
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_9.html
  "Transfer communications to the tower... after the aircraft is established on the final approach course, or... when the aircraft is on a heading to intercept the final approach course and approach clearance has been issued."
- **FAA JO 7110.65 §7-4-1 / §7-4-2 (Visual Approach):**
  Visual approach clearance authorizes pilot to fly visually to the runway. Tower transfer occurs while tracking final approach or intercepting visual final.
- **FAA JO 7110.65 §7-6-8 (Tower Transfer):**
  Communications transfer typically occurs 7–12 NM out (at least 5 NM from runway).

Trainer delta: Simulates terminal tower communications transfer without live cab staffing. `RegionalAirport.towered === true` or loaded airport catalog defines towered status.

## Scope

### 1. Relaxed Tower Handoff Eligibility (`isTowerHandoffEligible`)

An arrival is eligible for tower handoff (`F5` / `applyHandoffToSelection` and `CONTACT_TOWER` / `validateContactTower`) when:
1. **Airborne & Active:** Airborne, not landing-inhibited (not already handed off / landing), and not on a missed approach.
2. **Approach Clearance Present:**
   - `ac.intent.clearedApproachId` is set, OR
   - `ac.intent.lateral?.type === "LOC"`, `"INTERCEPT_LOC"`, or `"VISUAL_FINAL"`.
3. **Distance Gate (10 NM):**
   - Along-track or planar distance to destination runway threshold / airport is `<= 10 NM` (`TOWER_HANDOFF_GATE_NM = 10`) and `> 0`.
4. **Final Approach Intercept / Alignment:**
   - For instrument approach (`LOC`, `INTERCEPT_LOC`, catalog approach with `locAxis`):
     - Aircraft heading is within 45° of the published inbound course, OR already captured on `LOC`.
   - For visual approach (`VISUAL_FINAL`):
     - Aircraft is in `VISUAL_FINAL` guidance (already steering to final) or heading within 45° of runway heading.
5. **Altitude Gate:**
   - Aircraft altitude is above decision altitude / field elevation.

### 2. Preserve Visual Approach Final Guidance on Handoff

In `acceptTowerHandoff`:
- When `ac.intent.lateral?.type === "VISUAL_FINAL"`:
  - Do NOT overwrite `ac.intent.lateral` with `{ type: "LANDING", approachId }`.
  - Set `ac.intent.landingCleared = true`.
  - Retain `ac.intent.lateral` as `VISUAL_FINAL` and vertical guidance as `GLIDEPATH`.
  - Emit `handoff.tower` session event.
  - Aircraft continues visual descent and despawns upon crossing threshold in `despawnLandedAircraft`.
- When on an instrument approach (`LOC` / etc.):
  - Set `ac.intent.landingCleared = true` and `ac.intent.lateral = { type: "LANDING", approachId }`.

### 3. F5 Scope Key and Spoken `CONTACT_TOWER` Parity

- `applyHandoffToSelection` in `src/scope/ownership.ts` reuses `isTowerHandoffEligible`. `F5` initiates outbound handoff to `TWR` for both visual and instrument arrivals within 10 NM.
- `validateContactTower` and `applyContactTower` in `src/core/handoff.ts` accept both visual and instrument arrivals within 10 NM.

## Acceptance Contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| A/C on `VISUAL_FINAL` within 10 NM + `F5` | Handoff to tower initiated | `landingCleared = true`, retains `VISUAL_FINAL`, logs `handoff.tower` | Outside 10 NM or wrong heading returns false / unapplied | JO 7110.65 §5-9-5 |
| A/C on `VISUAL_FINAL` within 10 NM + `CONTACT ATLANTA TOWER` | Pilot accepts tower handoff | Pilot reads back tower contact; flight plan closed on landing | Ineligible returns "unable contact tower" | JO 7110.65 §5-9-5 |
| A/C on `INTERCEPT_LOC` (45° intercept dogleg) within 10 NM + `F5` | Handoff to tower initiated | `landingCleared = true`, arms landing | Intercept angle > 45° or > 10 NM rejected | JO 7110.65 §5-9-5 |
| A/C not cleared for approach within 10 NM + `F5` or `CONTACT TOWER` | Handoff rejected | No state mutation | Rejected atomically; pilot says "unable contact tower" | JO 7110.65 §5-9-5 |

## Files

- Touch `src/core/fms/landing.ts`: Update `isTowerHandoffEligible`, `TOWER_HANDOFF_GATE_NM`, and `acceptTowerHandoff`.
- Touch `src/core/fms/test/landing.test.ts`: Update gate boundary test and add visual / intercept coverage.
- Touch `src/pilot/test/contactTransferRuntime.test.ts`: Add visual approach tower contact acceptance test.
- Touch `docs/USER.md` (if tower handoff distance mentioned).

## Manual-Review Checklist

- [ ] FAA JO 7110.65 §5-9-5: Transfer communications when established or on intercept heading with approach clearance.
- [ ] Visual approach centerline guidance maintained after handoff until threshold despawn.
- [ ] Both `F5` and `CONTACT_TOWER` work identically for visual and ILS arrivals inside 10 NM.
