# T02-185 Datablock display semantics

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends:** T02-184  
**Blocks:** T02-186  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only.

## Mission

Make the runtime datablock projection distinguish flight rules, requested
altitude, assigned altitude, and Mode C. The display must show only `V` for
VFR, blank for IFR, `R###` for a flight-plan requested altitude, and `A###`
only for a flight-plan assigned altitude.

## Contract

This is display projection only. It has no command, parser, focus, preview,
readback, lifecycle, or world-state transition. Internal plan storage may keep
its existing IFR representation; the datablock boundary normalizes it. Only
flight-plan `requestedAltitudeFt` and `assignedAltitudeFt` can feed `R###` and
`A###`; aircraft intent fields are never altitude-display provenance.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| IFR plan with no request | Ground-speed/other supported Field 5 data; no `I` or `IFR` | Display-only | Unknown/non-VFR rule displays blank | Supplied `full_manual.pdf`, Table 2-14 p. 2-64; §2.12 p. 2-63 |
| VFR plan/track | VFR marker is `V`, without standalone `VFR` | Display-only | Other adapted rule letters are not emitted by this trainer | Table 2-14 p. 2-64; §2.12 p. 2-63 |
| Associated plan requests 12,000 ft | Field 5 may time-share `R120` when requested-altitude display is enabled | No mutation | Missing/non-finite request emits no `R` | §2.12 p. 2-63; Figure 2-20 pp. 2-66–67; §5.6.3 p. 5-146 |
| Aircraft has a request but no associated plan | No `R###` | No mutation | Aircraft/intent fallback is forbidden | Appendix A p. A-5; §2.12 pp. 2-63, 2-66 |
| Active plan assigned altitude 8,000 ft | Existing Field 7 `A080` behavior remains | No mutation | Baseline/default spawn altitude or command intent must not fabricate `A` | Figure 2-20 pp. 2-66–67; §5.6.3 p. 5-146 |
| Mode C 8,000 ft plus assigned/requested values | Mode C remains separate from `A080`/`R###` | No mutation | Neither plan value replaces observed Mode C | §2.12 p. 2-63; Figure 2-20 pp. 2-66–67 |

## Research

- Supplied `C:\Users\Ben\Documents\full_manual.pdf`, §2.12 p. 2-63:
  altitudes display in hundreds; assigned altitude is prefixed `A`; requested
  altitude is prefixed `R`.
- Figure 2-20, pp. 2-66–67: Field 5 is on the middle physical line and may
  contain requested altitude; Field 7 is on the bottom line and may contain
  assigned altitude.
- Section 5.6.3, p. 5-146: examples `A110` and `R110`.
- Table 2-14, p. 2-64: `V` means VFR and a blank field means IFR.
- Appendix A, p. A-5: requested altitude is supplied in an IFDT flight plan or
  as controller-requested data; assigned altitude is a separate field.

No CRC/vSTARS source is used. Trainer delta: this product emits only `V` for
VFR and blank for IFR, even though the manual permits other adapted alpha
characters.

## Scope

- Add one canonical flight-rules display normalization used by Field 5 and
  ground-speed formatting: VFR becomes `V`; IFR and unsupported rules become
  absent.
- Remove the raw `flightRules` value from Field 5 time-sharing.
- Make requested altitude in the runtime projection plan-backed only. Do not
  fall back to aircraft or intent requested altitude when no plan is
  associated.
- Make assigned altitude in the runtime projection plan-backed only. Do not
  fall back to aircraft or intent assigned altitude when no plan is associated.
- Ensure climb/descend commands may update aircraft intent for flight behavior
  but never create or overwrite plan-backed `A###`/`R###` display values.
- Remove the climb/descend application side effect that writes
  `controllerAssignedAltitudeFt`; plan altitude fields change through flight
  plan adjustment only.
- Preserve `R###` formatting, manual requested-altitude display inhibition,
  Field 5 time-sharing, and explicit Field 7 `A###` behavior.
- Preserve the shared T02-164/165 runtime source used by paint, layout, and
  picking.

## Non-goals

- No change to flight-plan storage, parser grammar, radio/clearance grammar,
  readback, aircraft kinematics, Mode C, CWT categories, wake display policy,
  or datablock layout. The only command-path change is removing an incorrect
  datablock-provenance write.
- No new commands, errors, help keys, or association behavior.
- No facility-specific branch.

## Acceptance criteria

- [ ] No runtime FDB/PDB/LDB path emits raw `I`, `IFR`, or standalone `VFR`.
- [ ] VFR display normalization emits only `V` where the existing Field 5
      flight-rule marker is shown; IFR emits no marker.
- [ ] `R###` is produced only from an associated plan’s explicit requested
      altitude, subject to existing Full Datablock display inhibition.
- [ ] `A###` is produced only from an associated plan’s explicit assigned
      altitude, without using baseline or command-updated intent altitude as a
      fabricated assignment.
- [ ] Climb/descend command regressions prove intent changes do not create,
      clear, or overwrite plan requested/assigned altitude display values.
- [ ] Flight-plan adjustment tests prove explicit plan assigned altitude is
      still the source of `A###`.
- [ ] Mode C, requested altitude, and assigned altitude remain separate.
- [ ] Paint, layout, and pick continue consuming one runtime projection.

## Tests

- Unit: `src/scope/test/datablock.test.ts` covers IFR blank, VFR `V`, no raw
  rules value, plan-only `R###`, and explicit `A###` edges.
- Integration: `src/scope/test/datablockFidelity.integration.test.ts` and
  existing runtime-source tests cover FDB time-sharing and requested-altitude
  inhibition.
- Regression: existing handoff, lifecycle, overlap, PDB/LDB, and clearance
  tests remain green.
- Gate: focused datablock tests, `npm run ci`, and supplied-manual review.

## Files

- `src/scope/datablock.ts`
- `src/pilot/applyIntent.ts`
- `src/scope/test/datablock.test.ts`
- `src/scope/test/datablockFidelity.integration.test.ts`
- Relevant pilot/flight-plan tests for command and adjustment provenance.

## Handoff

Return `READY TO MERGE` only after every contract row has a focused test or
explicit Manual check, focused tests pass, `npm run ci` passes, and the
supplied manual review has no FAIL.
