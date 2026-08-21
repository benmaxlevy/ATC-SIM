# T04-07 Missed approach stub

**Phase:** 04 Procedures
**Priority:** P0
**Size:** M
**Depends on:** T04-06
**Blocks:** T04-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

If the aircraft reaches DA on ILS 27 without a tower landing clearance, it flies a **missed approach stub**: climb heading 270 to 3000, then optional DIRECT `MISSD`. A typed go-around may start the same path early.

## Context

Catalog `missed`: heading 270, climbToFt 3000, `directFixId: "MISSD"`. DA 200 ft MSL. T04-12 adds the tower stub that *prevents* this by setting `LANDING`. This ticket should honor a `landingCleared` / `lateral === LANDING` flag even if the UI is not done — default false.

Heading still cancels missed lateral after they take vectors.

## Scope

- At `vertical === GS` (or LOC below GS intercept) when `alt <= daFt` and not `LANDING`: transition to missed.
- Missed: `lateral = MISSED` (or HEADING 270 + DIRECT after level), `vertical = MISSED_CLIMB` 3000, drop GS, event `nav.missed.started`.
- After reaching 3000 (±100 ft), if `directFixId` set, `lateral = DIRECT` MISSD (reuse T04-03).
- Optional IR `{ type: "GO_AROUND" }` with parser `GA`. If added, **patch `phases/_shared/command-ir.md` in the same PR**. Readback “going around.” Reject `GA` if not on INTERCEPT_LOC / LOC / GS / MISSED (or allow anytime — prefer only when `clearedApproachId` is set).
- Tests: GS down to 200 without landing flag → climb; with landing flag → do **not** missed (T04-12 will despawn; here assert no `nav.missed.started` for 5 s below 200 if LANDING).
- Do not model published missed climbs via navaids beyond one DIRECT.

## Out of scope

- Full missed procedure with holds.
- Tower voice, frequency change as radio IR (handoff is a **scope** control in T04-12).
- Terrain, engine-out.
- Flare / touch-and-go.

## Implementation notes

DA check once per tick, edge-triggered (don’t spam events). If they are LANDING, T04-12 owns threshold despawn; this ticket just skips missed.

Climb: reuse phase 1 VS. Heading 270 true.

If `GA` while still 6 NM on loc, immediately leave GS/LOC, same missed path (do not wait for DA).

IR extension note (implementation PR only):

> If `GO_AROUND` is added to `Instruction`, update `phases/_shared/command-ir.md` in this PR: type, parser token `GA`, validation, readback template. Do not rename existing types.

## Acceptance criteria

- [ ] **AC1 —** Given GS captured, `landingCleared === false`, when altitude first `<= 200`, then `nav.missed.started` fires once and commanded heading is 270.
- [ ] **AC2 —** Given AC1, when stepped, then altitude increases to 3000 (±150 ft) and does not remain on the GS path.
- [ ] **AC3 —** Given AC2 at 3000, when `MISSD` is configured, then lateral becomes DIRECT `MISSD` (or equivalent) and distance to MISSD decreases.
- [ ] **AC4 —** Given `landingCleared === true` (or `lateral === LANDING`) on GS at 200 ft, when stepped 2 sim seconds, then `nav.missed.started` does **not** fire.
- [ ] **AC5 —** If `GA` is implemented: given LOC at 3000 ft with `APP` armed/captured, when `DAL123 GA` accepted, then missed starts without waiting for DA. `_shared/command-ir.md` patched in the same PR.
- [ ] **AC6 —** Automated tests for AC1–AC4 (and AC5 if implemented). DOM-free.

## Test plan

- Unit: DA edge trigger; inhibit when LANDING.
- Integration: continue T04-06 fixture through 200 ft; GA if present.
- Manual: let one arrival ride GS with no handoff; watch climb west then toward MISSD.

## Suggested files

- `src/core/fms/missed.ts`
- `src/core/fms/missed.test.ts`
- `src/parse/` (`GA` optional)
- `src/pilot/` (optional GO_AROUND)
- `phases/_shared/command-ir.md` (only if GA added)
