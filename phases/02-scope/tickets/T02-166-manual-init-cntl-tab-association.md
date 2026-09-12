# T02-166: Manual INIT CNTL and TAB identity association

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-167 is not required; this ticket owns the scope command path
**Merge target:** `improvement/db-source-unification`

## Mission

Align the trainer's F1 `INIT CNTL` path with the supplied Raytheon STARS
manual. F1 remains the repository's frozen INIT CNTL mapping. The supported
operation is identity entry followed by slew to an unassociated target and
left-click. Do not implement unsupported datablock creation.

## Manual research

Authoritative source: `/home/ben/Documents/stars refs/full_manual.pdf`.

- §5.4.1, pp. 5-66–5-67: enter ACID, beacon code, or tabular line number;
  tabular line number is exactly two digits, leading zero allowed; slew to an
  unassociated track and click left; activate and associate the plan, then
  remove it from the flight list.
- §5.4.2, p. 5-68: INIT CNTL keyboard procedure also requires identity entry,
  slew, and left click.
- §5.4.1, p. 5-67: invalid TAB line is `NO FLIGHT`; an already associated
  target is an invalid track condition.

Trainer delta: repository maps INIT CNTL to F1, not the manual's physical key
label where the supplied adaptation differs. This ticket does not add
unsupported datablocks, NAS handoff, or Command IR.

## Scope

- Resolve only ACID, discrete beacon code, and exactly two-digit TAB index for
  INIT CNTL.
- Make TAB display and lookup use the same two-digit identity (`01`, `02`, ...).
- Require slew/click for INIT CNTL identity association.
- Remove the direct `F1 + identity + Enter` apply path and its documentation.
- Keep CID out of INIT identity resolution; CID is flight-strip data, not ACID,
  beacon code, or TAB line number.
- Preserve the existing selected-track implied F1 behavior only where it does
  not conflict with the manual-aligned identity workflow.

## Acceptance criteria

- **AC1:** F1 with no selection arms `INIT CNTL`; no identity is applied by
  Enter alone.
- **AC2:** `F1 + ACID + slew/click` associates the ACID's plan to the clicked
  unassociated target.
- **AC3:** `F1 + discrete beacon + slew/click` associates the matching plan to
  the clicked unassociated target.
- **AC4:** `F1 + 01 + slew/click` resolves TAB line 01. One-digit `1` is not a
  valid manual TAB identity. A missing line rejects with the repository's
  documented invalid/no-flight feedback.
- **AC5:** The clicked target must be unassociated and eligible. Wrong target,
  already associated target, malformed identity, CID, and ambiguous identity
  do not associate and show rejection feedback.
- **AC6:** Successful association activates the plan as applicable, sets the
  authoritative plan association, upgrades the target to FDB, and removes the
  entry from the TAB list.
- **AC7:** INIT CNTL identity association does not create an unsupported
  datablock, emit Command IR, change aircraft kinematics, or use CID.
- **AC8:** Existing selected-track F1 behavior, radio command behavior, and
  unrelated list actions remain green.

## Tests

- Extend `src/scope/test/previewArea.integration.test.ts` with strict two-digit
  TAB identity, no-Enter, ACID, beacon, wrong-target, CID, and missing-row cases.
- Extend `src/scope/test/systemLists.operational.test.ts` with two-digit display
  and direct association behavior.
- Extend `src/scope/test/flightPlanLifecycle.integration.test.ts` only where
  needed to prove TAB removal and authoritative association.
- Run `npm run ci` after implementation.
- Run `$check-stars-manual` against this ticket and its implementation before
  the next swarm wave.

## Likely files

- `src/scope/previewArea.ts`
- `src/scope/previewParse.ts`
- `src/scope/ppi.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/systemLists.ts`
- `src/scope/keymap.ts`
- `src/scope/test/previewArea.integration.test.ts`
- `src/scope/test/systemLists.operational.test.ts`
- `src/scope/test/flightPlanLifecycle.integration.test.ts`
- `docs/USER.md`

## Non-goals

- Unsupported datablocks.
- CID-based target lookup.
- Direct INIT CNTL Enter semantics.
- New flight-plan schema fields.
- NAS handoff, speech, procedures, DCB, or unrelated datablock work.

## Handoff

Worker returns changed paths, commit IDs, tests, and exactly `READY TO MERGE`
or `BLOCKED`.
