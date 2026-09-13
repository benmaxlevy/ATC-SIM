# T02-175 Correlated plan presentation and acceptance

**Phase:** 02 Scope  
**Priority:** P1  
**Depends on:** T02-173, T02-174  
**Merge target:** `feature/nas-flightplan-modal`

## Mission

Route TAB/FL, datablocks, strips, F1/F4 projections, and `*FP` through derived
correlation and present scenario IFR plans without a persistent association.

| Input/form | Expected action/result | State/side effect | Error/negative case | Manual evidence |
| --- | --- | --- | --- | --- |
| spawned IFR target | all projections show same plan | display only | — | T02-173/174 |
| code mismatch | projections lose plan | display only | `NO FLIGHT`; no rewrite | JO §5-2-2 |
| `*FP` target/TAB/ACID | opens one existing plan | modal draft only | zero/ambiguous → `NO FLIGHT` | §5.7.1; trainer delta |

## Scope and acceptance

- Migrate remaining presentation/lifecycle consumers and remove association-only
  paths. Update Help/USER language.
- Add one generic E2E: pending departure → spawn → correlate → modal amend →
  mismatch, with unchanged intent/kinematics/IR/session snapshots.
- Manual browser walk: TAB, slew, focus/error, F6/F9/`*F`/`*TV` regressions.
- All projections agree; ambiguity never chooses arbitrarily; CI/manual pass.

## Non-goals

Clearances, pilot/FMS behavior, manual association, networking, NAS claims.
