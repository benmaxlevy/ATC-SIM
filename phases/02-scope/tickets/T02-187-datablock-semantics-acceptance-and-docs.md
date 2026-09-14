# T02-187 Datablock semantics acceptance and documentation

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends:** T02-186  
**Blocks:** none  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only.

## Mission

Prove and document the complete datablock contract: VFR is `V`, IFR is blank,
requested altitude is plan-backed `R###`, assigned altitude is plan-adjustment
backed `A###`, and no unassociated, spawned, or climb/descend-updated target
leaks altitude metadata.

## Contract

No new command or parser route exists. This ticket owns the cross-source
acceptance proof, user-facing terminology, and manual gate.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Unassociated aircraft | Limited datablock remains surveillance-only; no plan-derived `R` | No mutation | Stale plan data is not resurrected | `full_manual.pdf` §2.12 pp. 2-58–2-70 |
| Associated IFR plan, no request | No `I`, `IFR`, or flight-rule marker | No mutation | IFR maps to blank | Table 2-14 p. 2-64 |
| Associated VFR plan | Existing Field 5 ground-speed presentation may carry `V` | No mutation | No raw `VFR` | Table 2-14 p. 2-64; §2.12 p. 2-63 |
| Associated plan requests 24,000 ft | Field 5 time-shares `R240` when enabled | No mutation | No plan request means no `R` | Figure 2-20 pp. 2-66–67; §5.6.3 p. 5-146 |
| Active plan assigned 8,000 ft | Field 7 shows existing explicit `A080` behavior | No mutation | Spawn/default/intent altitude cannot fabricate `A` | Figure 2-20 pp. 2-66–67 |
| Mode C 8,000 ft, assigned 10,000 ft, requested 12,000 ft | Observed Mode C, `A100`, and `R120` remain semantically distinct | No mutation | No value overwrites another | §2.12 p. 2-63; Appendix A p. A-5 |
| Climb/descend command changes intent to 10,000 ft | A/R remain sourced from unchanged plan fields | Intent only | Command cannot edit plan altitude fields | §5.6.3 p. 5-146; Appendix A p. A-5 |

## Research

- Supplied `C:\Users\Ben\Documents\full_manual.pdf`, §2.12 p. 2-63:
  hundreds-of-feet display and `A`/`R` prefixes.
- Table 2-14, p. 2-64: `V` is VFR and blank is IFR.
- Figure 2-20, pp. 2-66–67: Field 5/requested altitude and Field 7/assigned
  altitude placement.
- Section 5.6.3, p. 5-146: `A110` and `R110` examples.
- Sections 6.13.23–6.13.24, pp. 6-107–108: requested-altitude display may be
  enabled or inhibited for Full Datablocks.

No CRC/vSTARS source is used. CWT category, other adapted rules letters, and
unmodeled NAS host behavior remain outside this trainer contract.

## Scope

- Add one generic integration/acceptance scenario using synthetic plans and
  aircraft, covering IFR, VFR, requested, assigned, Mode C, association,
  disassociation, and climb/descend intent changes.
- Verify FDB, PDB, and LDB projections consume the same runtime semantics.
- Update `phases/02-scope/README.md` and `docs/USER.md` to remove any claim
  that IFR displays `I`, document `V`/`R###`/`A###`, and state that spawn
  altitude is not requested altitude.
- Reconcile stale datablock checklist text without reopening unrelated CWT,
  layout, alert, or handoff contracts.

## Non-goals

- No new runtime semantics beyond T02-185/186.
- No CWT category implementation or removal outside the requested display
  rule; no CRC comparison.
- No new commands, parser changes, radio grammar, kinematics, or facility
  data. Existing climb/descend commands remain flight-behavior operations and
  never become flight-plan altitude adjustments.

## Acceptance criteria

- [ ] One generic acceptance suite proves the full V/blank/R/A/Mode-C matrix
      and command-versus-plan provenance.
- [ ] FDB/PDB/LDB, layout, and pick regressions remain green.
- [ ] Association/disassociation cannot leave stale plan-backed `R###` or
      `A###`.
- [ ] Climb/descend intent changes cannot create or alter plan-backed `R###` or
      `A###`; a plan adjustment can.
- [ ] `phases/02-scope/README.md` and `docs/USER.md` describe the corrected
      display contract and no longer promise raw `I`/`IFR` output.
- [ ] Manual review records printed citations and confirms no FAIL.
- [ ] `npm run ci` passes.

## Tests

- Add or extend one integration acceptance file under `src/scope/test/` with
  synthetic, parameterized plan/aircraft fixtures.
- Keep focused formatter tests in the existing datablock test file; do not
  encode KDEM production counts or geometry.
- Run the existing flight-plan lifecycle, scenario spawn, clearance, render,
  layout, and pick regressions.
- Gate: focused tests, `npm run ci`, browser/manual datablock walk if needed,
  and supplied-manual review.

## Files

- `phases/02-scope/README.md`
- `docs/USER.md`
- `src/scope/test/datablockFidelity.integration.test.ts` or one new generic
  acceptance file under `src/scope/test/`
- Existing related tests as required by the acceptance matrix.

## Manual review checklist

- [ ] §2.12 p. 2-63: altitude prefixes and hundreds-of-feet meaning.
- [ ] Table 2-14 p. 2-64: `V`/blank flight-rules display.
- [ ] Figure 2-20 pp. 2-66–67: Field 5 `R###` and Field 7 `A###` placement.
- [ ] §5.6.3 p. 5-146: `A110`/`R110` examples.
- [ ] §§6.13.23–6.13.24 pp. 6-107–108: requested-altitude display control.

## Handoff

Return `READY TO MERGE` only after docs, tests, CI, and the supplied manual
review agree. Record any browser-only visual leftover explicitly.
