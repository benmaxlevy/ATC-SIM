# T02-108: Deterministic datablock overlap layout solver

**Phase:** 02 Scope — Datablock overlap addendum  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-42  
**Blocks:** T02-109  

## Goal

Provide a pure, deterministic, screen-space layout pass that gives every
visible datablock a non-overlapping rectangle. It preserves each track's
configured leader direction and length as the first choice, then moves only
later conflicting datablocks to a free position.

## Research

The existing scope derives each rectangle independently through
`datablockTopLeft`, so it has no collision pass. CRC documents data-block
positioning and leader direction/length controls (R07,
https://docs.virtualnas.net/crc/stars/). FAA PCG terminology remains
**datablock**, **track**, and **leader** (R02,
https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/).

Trainer delta: automatic Canvas2D collision avoidance is not a claim about NAS
STARS behavior. It adds no controller key and never mutates Command IR,
intent/kinematics, or saved `leaderDir` / `leaderLengthPx` preferences.

## Scope

- Add DOM-free `src/scope/datablockLayout.ts` with input/output types: stable
  aircraft ID, target point, preferred rect, metrics, leader preference,
  display priority, and canvas bounds; output resolved rect plus leader anchor.
- Resolve in stable priority: selected; full, partial, limited; aircraft ID.
- Try the preferred `datablockTopLeft` result first. On collision, try ordered
  compass/radial candidates, then an in-bounds viewport-grid fallback. Accepted
  rectangles must not overlap prior accepted rectangles.
- Return explicit `unplaced` if no in-bounds free rectangle exists. Never
  silently emit an overlapping rectangle.
- Export layout functions from `src/scope/index.ts`. Keep `leader.ts` focused
  on geometry; only small arbitrary-rect anchor helpers may live there.

## Non-goals

- Manual datablock dragging, new DCB/keys, system-list layout, or facility
  branches.
- Hiding/changing mode/overwriting a controller leader as normal resolution.
- Command IR, parser, pilot-agent, World, scenario, or speech changes.

## Acceptance criteria

- [ ] One item resolves exactly to its existing preferred rectangle.
- [ ] Two colliding items resolve to distinct, non-intersecting in-bounds
  rectangles; higher priority keeps its preferred rectangle.
- [ ] Identical inputs resolve identically regardless of input-array order.
- [ ] Priority is selected > FDB > PDB > LDB > aircraft ID.
- [ ] A six-track synthetic collision fixture with available capacity resolves
  to pairwise non-overlapping, wholly in-bounds rectangles.
- [ ] No-free-slot inputs return `unplaced` for lower priority and never emit
  an overlapping rect.
- [ ] Module comment cites R02/R07 and names this an ATC-SIM trainer delta.

## Tests

DOM-free unit tests: edge-touch intersection, preferred placement, candidate
ordering, stable priority, synthetic density, in-bounds rule, and no-free-slot.
No KDEM/scenario geometry in reusable tests.

## Files

- `src/scope/datablockLayout.ts` (new)
- `src/scope/datablockLayout.test.ts` (new)
- `src/scope/leader.ts`
- `src/scope/index.ts`

## Handoff

`READY TO MERGE` only after solver tests pass. Do not wire paint or picking.
