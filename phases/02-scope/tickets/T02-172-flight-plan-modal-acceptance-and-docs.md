# T02-172 Flight-plan modal acceptance and documentation

**Phase:** 02 Scope  
**Priority:** P1  
**Size:** M  
**Depends on:** T02-171  
**Blocks:** none  
**Merge target:** `feature/nas-flightplan-modal`  
**Launch:** Implement this ticket only.

## Mission

Prove the complete `*FP` lifecycle with a synthetic catalog, close the T02-171
manual-review findings, and document its filed-route-only boundary.

## Research

- FAA JO 7110.65 §2-3-4: route, altitude, beacon, and remarks are current
  operational strip data, while facility implementation is local.
- Supplied `full_manual.pdf`, §5.5.5 / §5.6.17: flight data and amendment
  review anchors.
- T02-170 and T02-171 contracts are authoritative.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Create → associate → `*FP` amend valid route → Save | FL/strip/datablock plan projections update | Aircraft snapshot unchanged | — | JO §2-3-4 |
| Existing plan + invalid transition → Save | Inline error; modal remains | Plan/aircraft snapshots unchanged | `UNKNOWN_TRANSITION` | catalog fixture |
| `*FP` Cancel/Escape | Previous focus restored | No plan change | no key fallthrough | Manual browser walk |
| F6/F9/`*F`/`*TV` regressions | Existing result | No modal | exact prefix/modifier preservation | existing command docs |

## Reconciled trainer delta

`*FP <ACID>`, a two-digit current visible TAB ID, and bare `*FP` then target
slew identify one local form. A visible TAB entry or slewed target with no
local plan opens a create draft using its ACID; an existing plan amends. A
stale/off-page TAB ID or a target without a usable ACID is `NO FLIGHT`. This is
an explicit ATC-SIM extension, not a STARS-manual claim. It must not associate
the plan to the target or mutate target, intent, FMS, kinematics, Command IR,
readback, or session state.

| Input/form | Expected action/result | State/side effect | Error/negative case | Manual evidence |
| --- | --- | --- | --- | --- |
| `*FP 07 Enter` | Opens current visible TAB 07 plan/draft | UI draft only | stale/off-page → `NO FLIGHT` | §5.5.5/Table 5-7; trainer delta |
| `*FP`, click target | Opens matching plan/draft by ACID | UI draft only | blank ACID → `NO FLIGHT` | §5.7.1; trainer delta |
| Escape/Cancel | restores opener focus | no mutation | no scope/radio fallthrough | §5.6.17 |

## Scope

- Add one generic end-to-end integration file using a minimal synthetic catalog
  with a SID, STAR, transition, fix, and navaid.
- Assert canonical plan/list/strip projections after Save and unchanged
  aircraft `intent`, position, velocity, squawk, association, and event log.
- Add user documentation/manual walkthrough: `*FP` entry, create vs amend,
  valid route, invalid route, Save, Cancel, keyboard accessibility, and the
  explicit no-clearance/no-route-execution rule.
- Reconcile Help and `docs/USER.md`; no stale F/V/A modal claim remains.
- Add `src/ui/controls/test/flight-plan-modal.test.tsx`: create/amend, invalid
  atomic Save, Escape/Cancel restoration, focus trap, labels, keyboard controls.
- Restrict TAB resolution to current visible FL page and test page offsets.

## Acceptance criteria

- [ ] One automated create/amend/reject/cancel flow passes with synthetic data.
- [ ] Tests prove no route activation or pilot/radio side effect.
- [ ] Help and `docs/USER.md` expose exactly `*FP <ACID> Enter` and explain
  `SID:`, `STAR:`, and `DCT` route syntax.
- [ ] Manual browser walk records dialog focus, field errors, projections, and
  F6/F9/filter/list non-regression.
- [ ] `npm run ci` passes.

## Non-goals

- New route grammar, modal fields, core mutation, clearance execution,
  route/FMS activation, scenario fixtures, manual screenshots, or unrelated
  documentation cleanup.

## Handoff

Worker reports changed paths, commits, focused tests, `npm run ci`, manual
source result, and exactly `READY TO MERGE` or `BLOCKED`.
