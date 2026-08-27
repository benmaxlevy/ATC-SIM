# T02-43 ATPA approach volume schema and KDEM fixture

**Phase:** 02 Scope (TPA / ATPA addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-27 (dual-runway approaches on `master`)
**Blocks:** T02-44
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Add the adapted **ATPA approach volume** to the facility catalog as data, plus the pure geometry helpers that answer "is this track eligible for ATPA on this approach, and how far is it from the threshold along the final?"

KDEM ships one volume per existing approach (`ILS27`, `ILS09`). A third runway or a second airport adds a JSON row and nothing else.

## Context

CRC STARS only runs ATPA for tracks inside an "enabled ATPA Approach volume" (R07). The reference never publishes the volume dimensions — they are facility adaptation — so ours are authored trainer geometry and must say so.

Approaches already carry everything the volume needs to place itself: `courseDeg`, `thresholdFixId`, `lengthNm` in `src/scenario/data/kdem/procedures.json`, parsed by `parseApproach` in `src/scenario/procedures/loadCatalog.ts`. The volume references an approach by id and derives threshold and course from it. Do not copy runway coordinates into the volume, and do not branch on `"ILS27"` / `"KDEM"`.

`catalog.json` already lists its member files in a `files` map. `atpaVolumes` joins that map as an **optional** key: a facility folder without it must still load.

## Research

Read **R07** `docs.virtualnas.net/crc/stars` — "ATPA (Automatic Terminal Proximity Alert)" overview. Note that the enabled-volume concept is named but never dimensioned.

- Search: `STARS ATPA approach volume adaptation`
- **Terms:** ATPA approach volume, in-trail, final approach course. Not TCAS, not CA, not CRDA.
- Comment: volume geometry is authored trainer adaptation, not NAS data.

## Scope

- `src/scenario/procedures/types.ts`: add `AtpaVolume` and `ProcedureCatalog.atpaVolumes: AtpaVolume[]`.

  | Field | Meaning |
  | --- | --- |
  | `id` | volume id, uppercase, unique in the facility |
  | `approachId` | must resolve to a catalog approach; supplies threshold and final course |
  | `enabled` | volume participates in pairing when true |
  | `lengthNm` | how far out along the final the volume extends from the threshold |
  | `halfWidthNm` | lateral half-width about the final course centerline |
  | `floorFt` / `ceilingFt` | altitude band, MSL |
  | `courseToleranceDeg` | max heading deviation from the final course for eligibility |
  | `basicSeparationNm` | required in-trail minimum, default `3` |
  | `reducedSeparationNm` | reduced minimum, default `2.5` |
  | `reducedWithinNm` | both tracks must be inside this distance-to-threshold for the reduced minimum, default `10` |

- `src/scenario/procedures/loadCatalog.ts`: parse `atpaVolumes` when `files.atpaVolumes` is present, default to `[]` when absent. Validate like the other files — `airportId` match, duplicate `id` rejected, unknown `approachId` rejected through `validateRefs`, numeric fields asserted, `reducedSeparationNm <= basicSeparationNm`, positive lengths.
- `src/scenario/data/kdem/atpa-volumes.json` + the `files.atpaVolumes` entry in `src/scenario/data/kdem/catalog.json`. Two volumes: `ATPA27` on `ILS27` and `ATPA09` on `ILS09`. Suggested trainer geometry for both: `lengthNm: 15`, `halfWidthNm: 1.5`, `floorFt: 0`, `ceilingFt: 6000`, `courseToleranceDeg: 30`, `basicSeparationNm: 3`, `reducedSeparationNm: 2.5`, `reducedWithinNm: 10`, `enabled: true`. Each row carries a `note` saying the numbers are authored trainer adaptation.
- New pure module `src/scenario/atpaVolume.ts` (no canvas, no world import beyond the aircraft shape):
  - `atpaVolumeThreshold(catalog, volume)` — resolves the approach and its threshold fix to `{ xNm, yNm, courseDeg }`.
  - `alongCourseDistanceNm(volume geometry, xNm, yNm)` — signed distance to threshold measured **along** the inbound final course. Positive means still inbound.
  - `lateralOffsetNm(...)` — perpendicular offset from centerline.
  - `isInsideAtpaVolume(geometry, volume, track)` — inbound distance within `0..lengthNm`, `|lateral| <= halfWidthNm`, altitude within the band, heading within `courseToleranceDeg` of the final course.

## Out of scope

- Pairing, sequencing, status, cones, datablock text (T02-44 onward).
- Any live-path read of `wakeCategory`.
- A volume editor, MVA interaction, or CRDA.

## Implementation notes

Reuse existing planar NM math; the world is a local tangent plane with `+x` east and `+y` north, so along-course distance is a dot product with the reciprocal-course unit vector. Heading comparison must wrap at 360.

Keep `atpaVolumes` optional in the type as an always-present array (`[]` when the facility omits the file) so callers never branch on `undefined`.

## Acceptance criteria

- [ ] **AC1 —** `loadCatalog("kdem")` returns two volumes, `ATPA27` and `ATPA09`, each resolving to its approach's threshold and inbound course.
- [ ] **AC2 —** A catalog folder whose `catalog.json` omits `files.atpaVolumes` still loads, with `atpaVolumes` equal to `[]`.
- [ ] **AC3 —** Schema failures throw and return nothing partial: duplicate volume id, unknown `approachId`, `reducedSeparationNm` greater than `basicSeparationNm`, non-positive `lengthNm`.
- [ ] **AC4 —** `isInsideAtpaVolume` accepts a track on the RW27 final at 8 NM / 3000 ft / heading 272, and rejects each of: 20 NM out (beyond `lengthNm`), 3 NM laterally offset, 9000 ft (above ceiling), heading 200 (outside tolerance).
- [ ] **AC5 —** The same helpers accept an RW09 track with no runway-specific code path; a test proves the RW09 case runs through the identical function with only the volume row changed.
- [ ] **AC6 — Research:** module comment names R07, states that volume dimensions are authored trainer adaptation rather than NAS data, and that minima are basic radar separation only.

## Test plan

- Unit: `src/scenario/atpaVolume.test.ts` — along-course distance sign and magnitude, lateral offset, eligibility table above, RW09 parity.
- Unit: extend `src/scenario/procedures/loadCatalog.test.ts` — optional file, schema failures, ref validation.
- `npm test`.

## Suggested files

- `src/scenario/procedures/types.ts`
- `src/scenario/procedures/loadCatalog.ts`
- `src/scenario/data/kdem/catalog.json`
- `src/scenario/data/kdem/atpa-volumes.json` (new)
- `src/scenario/atpaVolume.ts` (new)
- `src/scenario/atpaVolume.test.ts` (new)
- `src/scenario/procedures/loadCatalog.test.ts`
