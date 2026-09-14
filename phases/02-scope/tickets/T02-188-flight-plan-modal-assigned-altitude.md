# T02-188 Flight-plan modal assigned altitude

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends:** T02-187  
**Blocks:** none  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only.

## Mission

Expose the existing plan-backed `assignedAltitudeFt` field in the Flight Plan
modal for active plans. Saving it must update only the flight plan, allowing the
datablock projection to show `A###`; climb/descend commands remain aircraft
intent operations and never become this field.

## Context

`src/core/filedRoute.ts` already accepts, validates, normalizes, and atomically
persists `assignedAltitudeFt`. `src/core/flightPlan.ts` already rejects assigned
altitude on non-active plans with `assigned altitude requires an active flight`.
`src/ui/controls/FlightPlanModal.tsx` currently exposes and submits only
`requestedAltitudeFt`, so the UI cannot perform the approved flight-plan
adjustment that supplies `A###`.

## Research

- Supplied `C:\Users\Ben\Documents\full_manual.pdf`, §2.12 p. 2-63: altitude
  values display in hundreds; assigned altitude is prefixed `A` and requested
  altitude is prefixed `R`.
- Figure 2-20, pp. 2-66–67: requested altitude belongs to Field 5 and assigned
  altitude belongs to Field 7; the fields remain separate from Mode C.
- §5.6.17, pp. 5-167–168: Modify flight plan accepts assigned altitude only for
  active flight plans and displays an entered assigned value with `A`, e.g.
  `A110`; requested altitude displays with `R`, e.g. `R110`.
- §5.6.3, p. 5-146: flight-plan altitude modification is distinct from other
  aircraft data.

This browser modal is an ATC-SIM trainer UI for the manual flight-plan
adjustment seam; it is not claimed to reproduce STARS controls. No CRC source,
new key, parser grammar, or Command IR change is in scope.

## Contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Open modal for active plan with `assignedAltitudeFt: 8000` | Assigned altitude control is enabled and prefilled `8000` | Draft only until Save | — | §5.6.17 pp. 5-167–168 |
| Active plan; enter `10000`, Save | Plan stores `assignedAltitudeFt: 10000`; datablock source can render `A100` | Only the plan changes; aircraft intent, Mode C, position, velocity, association, and event log do not change | Invalid route still fails atomically | §2.12 p. 2-63; Figure 2-20 pp. 2-66–67 |
| Active plan; enter `0`, Save | Existing core behavior removes the assigned-altitude field | Only the plan field is cleared | No `A###` remains | §5.6.17 p. 5-168 |
| Create or non-active plan | Assigned altitude control is unavailable; no invalid submit path is exposed | No plan or aircraft mutation | Direct helper input is rejected with `assigned altitude requires an active flight` | §5.6.17 p. 5-167 |
| Active plan with requested `12000` and assigned `10000` | Modal preserves separate values; saved projection can show `R120` and `A100` | Requested and assigned plan fields remain distinct; Mode C is untouched | Neither value is copied from aircraft intent | §2.12 p. 2-63; Figure 2-20 pp. 2-66–67 |
| Assigned altitude `12345`, negative, or above the existing limit | Save remains atomic and reports existing altitude validation error | No partial plan or aircraft mutation | `altitudes must be whole hundreds from 0 through 99000` | §5.6.17 p. 5-171 |

## Scope

- Add `assignedAltitudeFt` to `flightPlanModalDraftFromPlan`.
- Render a labeled assigned-altitude control in the modal; enable it only for
  an active plan. Keep create/pending/non-active forms visibly unavailable.
- Pass the normalized field through `submitFlightPlanModalDraft` to the
  existing `saveFlightPlanDraft` transaction.
- Preserve requested-altitude behavior and existing error atomicity; route
  active-plan rejection to the assigned-altitude control when applicable.
- Add focused modal tests for prefill/render, active-plan save, clearing with
  `0`, non-active rejection/unavailable UI, invalid values, and preservation of
  requested altitude and aircraft state.
- Update `docs/USER.md` with the modal’s assigned-altitude availability and
  plan-only side-effect boundary.

## Non-goals

- No changes to `FlightPlan`, `FlightPlanDraftInput`, core validation, or route
  compilation unless required to preserve the already-shipped contract.
- No new radio/scope command, parser token, shortcut, Command IR instruction,
  readback, pilot intent, kinematics, FMS, association, or datablock formatter
  behavior.
- No automatic assignment from spawn altitude, Mode C, clearance, or
  climb/descend commands.
- No CWT/category, CRC, or browser visual redesign.

## Acceptance criteria

- [ ] Active-plan modal shows an enabled assigned-altitude field prefilled from
      `plan.assignedAltitudeFt`.
- [ ] Saving a valid active-plan assigned altitude persists only the plan field;
      existing requested-altitude and aircraft-state values remain separate.
- [ ] Entering `0` clears the plan assigned-altitude field and removes its
      `A###` source; invalid values preserve atomicity and the existing error.
- [ ] Create and non-active plans do not expose an editable assigned-altitude
      path; direct invalid submission returns the existing exact active-flight
      error.
- [ ] Existing requested-altitude, route validation, focus, and modal lifecycle
      tests remain green.
- [ ] `docs/USER.md` documents assigned-altitude editing as an active-plan,
      plan-only adjustment.

## Test plan

- Unit/integration: extend `src/ui/controls/test/flight-plan-modal.test.tsx`
  with synthetic active/pending plans and unchanged aircraft snapshots.
- Regression: run focused modal/core/flight-plan tests and `npm run ci`.
- Manual: open an active plan in Chrome, edit assigned altitude, Save, verify
  `A###` while Mode C and requested `R###` remain separate; verify create and
  non-active forms do not offer an editable assigned altitude.
- Manual review: supplied `full_manual.pdf`, CRC ignored.

## Suggested files

- `src/ui/controls/FlightPlanModal.tsx`
- `src/ui/controls/test/flight-plan-modal.test.tsx`
- `docs/USER.md`

## Handoff

Return `READY TO MERGE` only after focused tests, `npm run ci`, and supplied-
manual review have no in-scope FAIL. Report changed paths and any unperformed
browser manual check; do not push.
