# T02-109: Datablock overlap render, pick, and acceptance integration

**Phase:** 02 Scope — Datablock overlap addendum  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-108  

## Goal

Run the layout pass once per scope paint input, draw every resolved datablock
and leader from that shared result, and hit-test the same resolved rectangles.
Overlapping datablock boundaries separate whenever a viewport position exists.

## Research

`drawTracks`, `drawDatablock`, and `pick.ts` currently calculate their own
preferred datablock geometry. They must share a layout result so paint and
selection do not drift. CRC documents data-block positioning and leader
controls (R07, https://docs.virtualnas.net/crc/stars/); automatic avoidance is
an ATC-SIM trainer delta, not asserted real-STARS behavior.

## Scope

- Build paint inputs after formatting, alert tags, visibility/filtering, and
  font metrics are known. Layout visible non-primary datablocks only.
- Invoke the solver once per paint. Use resolved rectangles/endpoints for both
  leader/text paint; do not recompute the preferred origin afterward.
- Make datablock picking use equivalent inputs and resolved rects, including
  time-shared FDB content, tags, character size, and queried LDB state.
- If no free slot exists, keep higher-priority blocks placed; do not paint an
  overlapping lower-priority block, and show `DATABLOCK DENSITY` in scope
  chrome. Clear it once all visible blocks place.
- Keep layout ephemeral unless profiling proves a bounded cache necessary. Any
  cache must invalidate on reports, block content/metrics/mode, selection,
  bounds, camera, filters, and display state; never retain stale World IDs.
- Update Phase 2's overlap non-goal/risk wording to lift it with the
  capacity/no-free-slot limitation. Never rewrite historic tickets/SWARM.

## Non-goals

- System-list collision behavior; manual placement; new keyboard/DBB controls;
  cross-leader obstacle routing; map/SSA/DCB avoidance.
- A guarantee when the canvas cannot fit all rects.
- Command IR, aircraft behavior, radio focus, parser, or speech changes.

## Acceptance criteria

- [ ] Synthetic FDB/PDB/LDB preferred-rect collisions render as pairwise
  non-overlapping datablocks when viewport capacity exists.
- [ ] A displaced leader runs from the target symbol to its resolved block
  edge/anchor; an undisplaced block preserves existing leader geometry.
- [ ] Clicking each resolved rect selects its track. Clicking its old preferred
  rect does not select it unless also in its new rect or symbol.
- [ ] Auto-layout does not change leader settings, block mode, scratchpads,
  ownership, selection, intent, kinematics, or Command IR.
- [ ] Impossible capacity produces no intersecting rendered blocks and visible
  `DATABLOCK DENSITY`, which clears after capacity is restored.
- [ ] Existing FDB/PDB/LDB, alert-tag, altitude-filter, L5, leader-chord,
  scope/radio focus, and pick tests remain green.
- [ ] 30-target render invokes layout once per paint and does not regress the
  accepted Phase 2 60-FPS benchmark threshold.
- [ ] Manual: four clustered tracks at normal desktop size have separate text
  boundaries; each moved datablock picks correctly; no radio command emits.

## Tests

Integration test with real `World` + `ScopeView` + mock canvas, synthetic
overlap cluster, paint rect capture, and pointer hits. Run existing datablock,
leader, pick, and fidelity tests plus `npm run ci`.

## Files

- `src/scope/render/renderScopePaint.ts`
- `src/scope/pick.ts`
- `src/scope/scopeView.ts` (only if a bounded cache is justified)
- `src/scope/datablockLayout.ts`
- `src/scope/test/datablockOverlap.integration.test.ts` (new)
- `src/scope/test/datablockFidelity.integration.test.ts`
- `phases/02-scope/README.md`

## Handoff

`READY TO MERGE` only after targeted tests and `npm run ci` pass. Report a real
manual observation or explicit skip reason.
