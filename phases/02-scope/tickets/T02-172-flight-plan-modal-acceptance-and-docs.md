# T02-172 Flight-plan modal acceptance and documentation

**Phase:** 02 Scope  
**Priority:** P1  
**Size:** M  
**Depends on:** T02-171  
**Blocks:** none  
**Merge target:** `feature/nas-flightplan-modal`  
**Launch:** Implement this ticket only.

## Mission

Prove the complete `*FP` lifecycle with a synthetic catalog and document its
filed-route-only boundary. This ticket does not add behavior.

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

## Scope

- Add one generic end-to-end integration file using a minimal synthetic catalog
  with a SID, STAR, transition, fix, and navaid.
- Assert canonical plan/list/strip projections after Save and unchanged
  aircraft `intent`, position, velocity, squawk, association, and event log.
- Add user documentation/manual walkthrough: `*FP` entry, create vs amend,
  valid route, invalid route, Save, Cancel, keyboard accessibility, and the
  explicit no-clearance/no-route-execution rule.
- Reconcile Help and `docs/USER.md`; no stale F/V/A modal claim remains.

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
