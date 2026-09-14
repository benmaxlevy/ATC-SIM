# T02-186 Scenario altitude provenance

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends:** T02-185  
**Blocks:** T02-187  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only.

## Mission

Stop scenario spawn altitude from masquerading as requested or assigned
altitude. Preserve explicit flight-plan requests and assignments. Climb/descend
commands continue to control aircraft intent, but never become datablock
altitude provenance.

## Contract

Scenario construction may create plans and targets, but it must not alter
aircraft motion semantics. Spawn pose altitude is surveillance/kinematics
state. Plan requested and assigned altitude are separate operational fields.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Generated arrival pose at 6,000 ft | No automatic `R060` | Pose and intent movement unchanged | No explicit request means request field absent | `full_manual.pdf` §2.12 p. 2-63; Appendix A p. A-5 |
| Generated STAR arrival pose at 6,000 ft | No automatic `R060` | Route/STAR state unchanged | No request inherited from current Mode C | Figure 2-20 pp. 2-66–67 |
| Explicit scenario plan request 12,000 ft | Plan retains `requestedAltitudeFt: 12000`; associated FDB can show `R120` | Plan creation only | Invalid altitude keeps existing validation | §5.6.3 p. 5-146 |
| Scheduled departure target altitude 5,000 ft | Kinematics may use the target; no automatic `A050` or `R050` | Plan data and departure intent remain distinct | Pending schedule data is not a plan assignment | §2.12 p. 2-63; Figure 2-20 pp. 2-66–67 |
| VFR plan with explicit request 5,000 ft | VFR marker `V` plus plan-backed `R050` when applicable | No kinematics mutation | VFR with no request has no `R` | Table 2-14 p. 2-64; §5.6.3 p. 5-146 |
| Existing IFR scenario plan | Internal plan rule representation remains accepted | No plan migration required | Datablock projection must not expose `I` | Table 2-14 p. 2-64 |
| Climb/descend command to 10,000 ft | Aircraft intent may target 10,000 ft; datablock A/R values stay plan-derived | Aircraft behavior only | No automatic plan altitude edit | §5.6.3 p. 5-146; Appendix A p. A-5 |

## Research

- Supplied `C:\Users\Ben\Documents\full_manual.pdf`, §2.12 p. 2-63 and
  Figure 2-20 pp. 2-66–67: requested and assigned altitude are separate
  datablock values with `R` and `A` prefixes.
- Section 5.6.3, p. 5-146: requested and assigned altitude are separately
  modified and displayed as `R110` and `A110`.
- Appendix A, p. A-5: requested altitude is a flight-plan field, not a Mode C
  or spawn-pose field.

No CRC/vSTARS source is used. CWT category remains out of scope.

## Scope

- Remove pose-altitude arguments currently passed as `requestedAltitudeFt` by
  generated arrival, STAR-arrival, arrival-scheduler, and departure-spawn
  paths.
- Keep scheduled departure target altitude in kinematics/intent only; do not
  turn it into a flight-plan assigned altitude automatically.
- Keep explicit requested altitude from flight-plan creation, VFR commands,
  or other plan authors intact.
- Ensure spawn code does not add requested or assigned altitude metadata to a
  plan, `Aircraft`, or `Intent` merely because the target has a current or
  climb/descend target altitude.
- Ensure climb/descend application changes only aircraft intent/kinematics;
  flight-plan altitude fields change only through flight-plan adjustment.

## Non-goals

- No change to spawn positions, altitude targets, route execution, vertical
  kinematics, beacon correlation, flight-rule storage, or radio clearance
  semantics.
- No automatic assignment of requested altitude and no new plan workflow.
- No CWT/category changes, facility branches, or unrelated scenario cleanup.

## Acceptance criteria

- [ ] Generated arrivals and STAR arrivals have no requested altitude solely
      because of their spawn pose.
- [ ] Scheduled departure target altitudes are not written as requested or
      assigned flight-plan altitude automatically.
- [ ] Explicit requested altitude survives scenario plan creation and remains
      available to the datablock adapter after correlation.
- [ ] Explicit flight-plan assigned altitude remains the only source of `A###`.
- [ ] Climb/descend commands do not mutate flight-plan requested or assigned
      altitude fields and do not create datablock A/R values.
- [ ] Flight-plan adjustment remains the only supported path for adding or
      changing plan requested/assigned altitude metadata.
- [ ] VFR plan requests retain both VFR classification and requested-altitude
      data without exposing `VFR`/`IFR` raw text in the datablock.
- [ ] Spawn kinematics and intent movement are byte-for-byte unchanged except
      for removal of fabricated request metadata.
- [ ] Existing scenario, flight-plan, lifecycle, and clearance tests pass.

## Tests

- Unit/integration: `src/scenario/test/ifrFlightPlanSpawn.test.ts` covers
  explicit request versus no request.
- Scenario regressions: `src/scenario/test/spawn.test.ts`,
  `src/scenario/test/arrivalScheduler.test.ts`, and
  `src/scenario/test/departureSpawn.test.ts` cover every removed pose fallback.
- Scope integration: a synthetic associated IFR/VFR plan proves only the plan
  request produces `R###`, while an explicit plan adjustment produces the
  `A###` path.
- Gate: focused tests, `npm run ci`, and supplied-manual review.

## Files

- `src/scenario/ifrFlightPlan.ts`
- `src/scenario/spawn.ts`
- `src/scenario/arrivalScheduler.ts`
- `src/scenario/departureSpawn.ts`
- `src/core/flightPlan.ts` only if the existing adjustment seam needs an
  adapter-level correction; do not change its validation contract casually.
- Relevant scenario and scope tests listed above.

## Handoff

Return `READY TO MERGE` only after all spawn-source rows are tested, focused
tests and `npm run ci` pass, and the supplied manual review has no FAIL.
