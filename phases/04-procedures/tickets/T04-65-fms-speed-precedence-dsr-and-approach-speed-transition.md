# T04-65 FMS speed precedence, DSR, and approach speed transition

**Phase:** 04 Procedures (seventy-first swarm addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-64
**Blocks:** None (phase exit)
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Enforce controller speed precedence on SID/STAR procedures, normal arrival/climb speed under DSR, and automatic transition to approach/landing speed upon crossing the FAF / 5 DME hard boundary or specified `until` gate.

## Context

On a published STAR, assigning a speed to an aircraft overrides published fix speed restrictions. Issuing DSR deletes those restrictions, allowing the aircraft to fly normal arrival speed. On approach, controller assigned speeds remain in effect outside the FAF or 5 DME; once crossing the boundary or specified gate, the assignment expires and the aircraft decelerates to approach/landing speed.

## Research

- **FAA JO 7110.65 § 5-7-1 & § 5-7-2 — Application of Speed Adjustments**:
  Speed adjustments override published procedure restrictions. At the final approach fix or 5 miles from the runway, speed restrictions terminate.
- **FAA AIM § 5-4-1 — Arrival Procedures**:
  Aircraft transition to approach reference speed (Vref/Vapp) inside the final approach fix.
- **Official terms**: Speed constraint, normal arrival speed, final approach fix, 5 DME, approach speed, landing speed.
- **Trainer delta**: Aircraft profile regimes (`arrival`, `approach`, `landing`) supply nominal speeds; unpopulated profiles default safely to standard category speeds (e.g. 140 kt approach).

## Command & State Contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `S210` on STAR with 250 kt restriction | Flies 210 kt, ignoring 250 kt fix constraint | `controllerAssignedSpeedKt = 210` overrides procedure constraint | Bounded by aircraft min/max envelope | JO 7110.65 § 5-7-1 |
| `S250` on STAR with 210 kt restriction | Flies 250 kt, ignoring 210 kt fix constraint | `controllerAssignedSpeedKt = 250` overrides procedure constraint | Bounded by aircraft min/max envelope | JO 7110.65 § 5-7-1 |
| `DSR` on STAR with published speeds | Ignores published fix speeds; flies normal arrival speed | `speedRestrictionsDeleted = true` | Capped at 250 kt below 10,000 ft | JO 7110.65 § 5-7-2 |
| `S180/7DME` crosses 7 DME on final | Speed clears at 7 DME; decelerates to approach speed | `controllerAssignedSpeedKt = undefined` | Reaching 7 DME triggers speed drop | JO 7110.65 § 5-7-1 |
| `S180` (no until) crosses 5 DME on final | Speed clears at 5 DME; decelerates to approach speed | `controllerAssignedSpeedKt = undefined` | `Math.min(fafDistanceNm ?? 5, 5)` boundary triggers drop | JO 7110.65 § 5-7-1 |

## Scope

- In `src/core/fms/vertical.ts`:
  - Update `targetSpeedKt`:
    - If `ac.intent.controllerAssignedSpeedKt !== undefined`: return `controllerAssignedSpeedKt` (takes precedence over procedure fix constraint).
    - If `ac.intent.speedRestrictionsDeleted === true`: ignore `nextConstraint.speed`; return normal profile arrival speed (from `profile.regimes.arrival` / default arrival speed, respecting 250 kt rule below 10,000 ft).
    - Otherwise: comply with published procedure speed constraints (`nextConstraint.speedKt`).
- In `src/core/world.ts`:
  - Calculate `hardBoundaryNm = Math.min(approach.fafDistanceNm ?? 5, 5)` for aircraft on approach using `locAxisForApproach` or approach threshold geometry.
  - Outside `hardBoundaryNm`: allow controller assigned speeds to operate without premature clamping by approach regime speed limits.
  - Monitor gate expiry:
    - If `ac.intent.speedUntil` is set:
      - If `until.type === "DME"` and along-track distance `<= until.distanceNm`: gate met.
      - If `until.type === "FAF"` and along-track distance `<= (approach.fafDistanceNm ?? 5)`: gate met.
      - If `until.type === "FIX"` and fix sequenced or along-track distance past fix: gate met.
    - If along-track distance `<= hardBoundaryNm`: boundary reached.
    - When either condition is met:
      - Clear `ac.intent.controllerAssignedSpeedKt = undefined`.
      - Clear `ac.intent.speedUntil = undefined`.
      - Set `ac.intent.assignedSpeedKt` to aircraft approach speed (`profile.regimes?.approach?.minSpeedKt` / landing speed, or fallback 140 kt).

## Out of scope

- Autopilot autothrottle physics simulation beyond existing kinematics deceleration models.
- Wind computation or non-kinematic sensor errors.
- Visual scope datablock layout changes (existing datablock displays `S<speed>` from `controllerAssignedSpeedKt` and clears when `undefined`).

## Acceptance criteria

- [ ] **AC1 — Controller speed precedence on STAR**: An aircraft on a STAR with published speed restrictions flies the controller-assigned speed even when the published restriction differs.
- [ ] **AC2 — DSR normal arrival speed**: An aircraft with `speedRestrictionsDeleted === true` ignores procedure fix constraints and flies normal profile arrival speed.
- [ ] **AC3 — Approach speed outside boundary**: An aircraft on approach outside `Math.min(fafDistanceNm ?? 5, 5)` maintains controller assigned speeds (e.g. 180-210 kt) without premature clamping to approach regime limits.
- [ ] **AC4 — Expiry at specified until gate**: An aircraft assigned speed with `until` (DME, fix, or FAF) clears the assignment upon reaching that gate and slows to approach speed.
- [ ] **AC5 — Expiry at FAA hard boundary**: An aircraft assigned speed with no `until` (or until inside the boundary) clears the assignment upon reaching `Math.min(fafDistanceNm ?? 5, 5)` and slows to approach/landing speed.
- [ ] **AC6 — Automated tests**: Tests in `src/core/fms/test/vertical.test.ts` and `src/core/fms/test/approach.test.ts` verify speed precedence, DSR, and boundary transitions.

## Test plan

- **Unit:** Test `targetSpeedKt` with controller speed, with DSR, and with published constraints.
- **Integration:** Test end-to-end `stepWorld` approach tracking verifying speed maintenance to 7 DME and 5 DME, followed by automatic deceleration.
- **Repo CI:** `npm run ci`.

## Suggested files

- `src/core/fms/vertical.ts`
- `src/core/world.ts`
- `src/core/fms/test/vertical.test.ts`
- `src/core/fms/test/approach.test.ts`
