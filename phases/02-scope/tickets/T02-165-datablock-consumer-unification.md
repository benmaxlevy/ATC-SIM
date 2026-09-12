# T02-165 Datablock consumer unification

**Phase:** 02 Scope — datablock source unification  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-164  
**Blocks:** none  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Route datablock paint, layout, and hit-testing through the same runtime source
and formatted result so displayed text, geometry, and selection cannot drift.

## Research

- Supplied `/home/ben/Documents/stars refs/full_manual.pdf`, §2.12,
  pp. 2-58–2-70: FDB/PDB/LDB field and presentation behavior.
- Supplied manual §5.4.1, pp. 5-66–5-67: selected-track association and
  datablock interaction.
- Supplied manual §5.6.17, pp. 5-167–5-173: datablock presentation and
  associated operational data.
- R07: CRC data-block positioning and leader behavior; automatic layout is an
  explicit ATC-SIM trainer delta, not asserted real-STARS behavior.

## Scope

- Replace duplicated source assembly in `drawDatablock()`, the layout pass,
  and `pick.ts` with the T02-164 runtime projection.
- Ensure paint and layout use identical mode, content, time-share phase,
  tags, character metrics, and queried-LDB state.
- Ensure picking uses the same formatted lines and resolved rectangles used by
  paint.
- Preserve existing shared overlap-layout behavior and leader geometry.
- Keep the adapter and formatter independent from canvas drawing.

## Non-goals

- New datablock semantics or fields.
- Layout algorithm redesign, new obstacle classes, manual datablock placement,
  cross-leader routing, or system-list collision handling.
- Changes to DCB, radio, Command IR, pilot behavior, parser, speech,
  kinematics, or flight-plan lifecycle semantics.

## Acceptance criteria

- [ ] Paint, layout, and pick consume the same runtime datablock projection.
- [ ] No consumer independently rebuilds plan ACID, scratchpads, handoff,
      ATPA, beacon, or datablock mode from raw state.
- [ ] Rendered text, resolved geometry, and hitboxes agree for FDB/PDB/LDB.
- [ ] Beaconator remains a display-only override and never mutates plan or
      aircraft state.
- [ ] Existing FDB/PDB/LDB, leader, overlap, alert, altitude-filter,
      handoff, and flight-plan lifecycle regressions pass.
- [ ] Synthetic tests prove equivalent source input produces equivalent paint,
      layout, and pick results.
- [ ] A 30-target render still invokes source derivation/layout within the
      accepted Phase 2 performance budget.
- [ ] Datablock regression suite passes after implementation and after merge.
- [ ] Manual clustered-track check confirms moved datablocks pick correctly;
      compare representative output with supplied manual §2.12.

## Tests

- Unit: consumer contract and time-share/mode parity tests.
- Integration: real World + ScopeView + synthetic FDB/PDB/LDB cluster,
  captured paint rectangles, and pointer hits.
- Regression: all existing datablock, leader, overlap, pick, handoff, and
  flight-plan lifecycle tests.
- Gate: focused datablock tests plus `npm run ci` after this ticket.

## Files

- `src/scope/render/renderScopePaint.ts`
- `src/scope/pick.ts`
- `src/scope/datablock.ts` or `src/scope/datablockRuntime.ts`
- `src/scope/datablockLayout.ts`
- `src/scope/test/datablockFidelity.integration.test.ts`
- `src/scope/test/datablockOverlap.integration.test.ts`

## Handoff

Worker returns `READY TO MERGE` only after focused datablock regression tests,
`npm run ci`, and manual review or an explicit manual-review skip reason pass.
