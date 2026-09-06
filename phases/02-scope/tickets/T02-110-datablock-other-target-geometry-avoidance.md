# T02-110: Datablock avoidance of other-target geometry

**Phase:** 02 Scope — Datablock overlap follow-up  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-109  

## Goal

Extend automatic datablock placement so a block moves when it would intersect
scope geometry belonging to another target: target symbols (including primary
targets), PTLs, leaders, history dots, A/TPA cones, and TPA J-rings. System
lists are explicitly excluded.

## Research

`drawTracks` paints PTLs, then target symbols, then leaders and datablocks.
Current `solveDatablockLayout` reserves only accepted datablock rectangles.
CRC documents data-block positioning and leader controls (R07,
https://docs.virtualnas.net/crc/stars/); this broader automatic collision
avoidance remains an ATC-SIM trainer delta, not asserted NAS STARS behavior.

Use FAA PCG terms **datablock**, **track**, **leader**, and **predicted track
line** (R02, https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/).

## Scope

- Extend the pure layout contract with immutable protected geometry: rectangles,
  circles, line segments, polylines, and polygons tagged with owning aircraft
  IDs. Keep intersection math DOM-free and export it for tests.
- For each candidate datablock, reject intersection with protected geometry
  owned by any **other** target. Its own symbol, leader, PTL, history, J-ring,
  or cone remains attachable/visible and is not an obstacle to itself.
- Reserve all visible other-target geometry:
  - secondary and primary target-symbol bounds;
  - enabled PTL line segment and caps;
  - existing leader segment plus a displaced leader's resolved segment;
  - rendered history-dot disks;
  - rendered TPA J-ring strokes; and
  - rendered A/TPA monitor/warning/alert cone polygons and mileage geometry.
- Do not reserve system lists, SSA, DCB, preview area, maps, range rings,
  runway/localizer, weather, or unrelated canvas chrome.
- Compute the same obstacle/layout inputs for paint and pick. Preserve existing
  block priority and `DATABLOCK DENSITY` fallback. Never mutate TrackDisplay,
  World, Command IR, radio, intent, or kinematics.
- Keep collision tolerances explicit and CSS-pixel based: target/history/line
  stroke footprint plus a documented 1 px clearance. Do not use scenario- or
  airport-specific rules.

## Non-goals

- Any system-list avoidance or list relocation.
- Preventing a target's own datablock from crossing its own leader/PTL/history/
  cone/J-ring.
- Routing one protected graphic around another; only datablocks move.
- New DCB controls, keys, manual dragging, persistence, or schema changes.

## Acceptance criteria

- [ ] A block overlapping another target's secondary or primary symbol moves;
  overlapping only its own target symbol does not force relocation.
- [ ] A block overlapping another target's visible PTL or leader moves; its own
  PTL/leader does not force relocation.
- [ ] A block overlapping another target's history-dot disk, J-ring stroke, or
  A/TPA cone polygon moves; its own corresponding graphic does not force it.
- [ ] A candidate with no protected-geometry collision keeps current preferred
  placement and current datablock-priority behavior.
- [ ] Protected geometry and resolved datablock rectangles never intersect for
  distinct aircraft when capacity exists. An impossible case remains explicit
  `DATABLOCK DENSITY`, never overlap.
- [ ] Paint and pick use identical resolved rectangles under a mixed cluster of
  symbols, PTLs, leaders, history, cones, and J-rings.
- [ ] Existing system-list collision behavior remains unchanged; lists are not
  passed to the datablock solver.
- [ ] 30-target benchmark stays within the existing accepted threshold, with
  one obstacle collection/layout pass per paint.
- [ ] `npm run ci` passes; manual test records a real mixed-graphics cluster
  observation or an explicit skip reason.

## Tests

- Unit: rect/segment/circle/polyline/polygon intersections, 1 px clearance,
  own-ID exemption, and deterministic candidate selection.
- Integration: synthetic minimal targets proving every protected geometry type,
  paint/pick parity, density fallback, and no list input.
- Regression: PTL, leader, history, TPA, ATPA, pick, datablock, and scope
  performance suites.

## Files

- `src/scope/datablockLayout.ts`
- `src/scope/datablockLayout.test.ts`
- `src/scope/render/renderScopePaint.ts`
- `src/scope/pick.ts`
- `src/scope/leader.ts` (only if geometry helpers need extraction)
- `src/scope/ptl.ts` (only if geometry helpers need extraction)
- `src/scope/test/datablockOtherTargetGeometry.integration.test.ts` (new)
- `phases/02-scope/README.md`

## Handoff

`READY TO MERGE` only after all automated acceptance and CI pass. Do not add
system-list avoidance.
