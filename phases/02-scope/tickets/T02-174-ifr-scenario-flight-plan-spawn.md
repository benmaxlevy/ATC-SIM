# T02-174 IFR scenario flight-plan spawn

**Phase:** 02 Scope  
**Priority:** P0  
**Depends on:** T02-173  
**Blocks:** T02-175  
**Merge target:** `feature/nas-flightplan-modal`

## Mission

Create one validated filed IFR plan for every scenario-generated IFR arrival
and departure before its target is presented. Plan and target remain separate;
their matching assigned/reported code is the correlation key.

| Input/form | Expected action/result | State/side effect | Error/negative case | Manual evidence |
| --- | --- | --- | --- | --- |
| authored arrival STAR/transition | valid plan before display | one plan + target | invalid route aborts atomically | JO §4-2-1; T02-170 |
| generated departure SID/transition | pending plan then due target | plan first | no code/slot → setup error | JO §4-2-1, §5-2-1 |
| spawn | target reports plan code | target added only | absent plan invariant failure | trainer delta |
| VFR target | no IFR plan fabricated | target unchanged | — | JO §4-2-8 |

## Scope

- Add data-first typed scenario plan input and generic factory for authored,
  random, bench, and scheduled departures.
- Author route/procedure identity, altitude, type, beacon; deterministic
  defaults only for optional fields. Validate through T02-170/catalog.
- Preserve pose, intent, handoff, RNG, and route-inactive boundary.
- Generic synthetic tests plus one shipped-data wiring test; no facility branch.

## Acceptance criteria

- [ ] Every IFR target has exactly one valid code-correlatable plan.
- [ ] Pending departures expose plan before spawn; invalid input has no partial state.
- [ ] No plan stores target ID or activates FMS/pilot/radio behavior.
- [ ] CI/manual pass: manual §5.5.5, §5.5.9; JO §4-2-1, §5-2-1.

## Non-goals

Clearance/squawk commands, FMS activation, networking, airways, facility paths.

