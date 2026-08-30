# T04-32 CIFP spatial index and pack seed

**Phase:** 04 Procedures  
**Priority:** P0  
**Size:** M  
**Depends on:** T04-31  
**Blocks:** T04-34

## Goal

Build reusable geographic selection over normalized CIFP records. A scenario
pack starts with an airport ARP and radius in NM, then receives only the
selected source records needed by later closure.

## Scope

- Define a tool-only intermediate source/index format keyed by ICAO and stable
  record identity.
- Implement accurate enough great-circle distance for radius selection,
  including longitude wrap near ±180°.
- Select airports, fixes, navaids, runways, and procedure candidates inside
  `--airport <ICAO> --radius <NM>`.
- Keep source lat/lon in the intermediate data. Do not calculate permanent
  scenario-local ENU coordinates here.
- Make selection deterministic: stable ordering, stable serialization, and
  explicit units.
- Support local files and generated temp output. National source/index files
  remain ignored and are never imported by Vite.

## Out of scope

- Procedure-reference closure (T04-33).
- Browser lazy loading, network APIs, maps, MVA, or traffic spawning.
- Full national data committed to git.

## Acceptance criteria

- [ ] AC1 — Points inside radius are selected; points outside radius are not.
- [ ] AC2 — Dateline-crossing longitude cases and exact-boundary points have
  tested behavior.
- [ ] AC3 — Selection is deterministic and preserves source identity,
  coordinates, and airport ownership.
- [ ] AC4 — A radius seed can be passed to closure without requiring a second
  spatial-index implementation.
- [ ] AC5 — Tests prove radius is only a seed and do not claim it contains all
  legs of a procedure.
- [ ] AC6 — README documents NM units, ARP origin, ignored national files, and
  no runtime/browser dependency.

## Test plan

- Unit tests for distance, boundary, dateline, empty, and deterministic cases.
- Integration test selecting a synthetic airport with near and far records.

## Suggested files

- `tools/cifp-import/spatialIndex.ts`
- `tools/cifp-import/spatialIndex.test.ts`
- `tools/cifp-import/types.ts`
- `tools/cifp-import/README.md`
