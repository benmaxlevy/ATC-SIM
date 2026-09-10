# T02-126 ATPA FAA wake matrix and NOWGT adaptation

**Phase:** 02 Scope — ATPA wake criteria
**Priority:** P0
**Size:** M
**Depends on:** T02-125
**Blocks:** T02-127
**Launch:** Implement this ticket only. Stop after acceptance.

## Goal

Add the FAA JO 7110.65 leader/follower wake-minimum matrix as explicit
catalog/adaptation data and define missing-category behavior. A required
unavailable category produces `NOWGT` and a `10 NM` minimum.

## Research

- [FAA JO 7110.65 §5-5-4](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_5.html): terminal wake application, TBL 5-5-1, `NOWGT`, and reduced-final conditions.
- [FAA JO 7110.65BB current PDF](https://www.faa.gov/documentLibrary/media/Order/7110.65BB_Bsc_w_Chg_1_and_2_dtd_1-22-26_Final.pdf): current order text and category terminology.

The table orientation is **leader row × follower column**. Blank table cells
are not zero separation. Under this trainer policy, a blank or unavailable
required wake relationship produces `NOWGT` and `10 NM`.

## Scope

- Add a generic ATPA wake adaptation schema containing categories `A`–`I` and
  leader/follower separation values in NM.
- Encode the current JO 7110.65 TBL 5-5-1 values as reviewed data, not inline
  evaluator literals.
- Add explicit `NOWGT` / `10 NM` representation for unavailable required wake
  data.
- Keep wake adaptation opt-in per ATPA volume or catalog policy so existing
  authored basic-only fixtures remain interpretable during migration.
- Preserve `basicSeparationNm`, `reducedSeparationNm`, and
  `reducedWithinNm` as trainer adaptation fields.

## Out of scope

- Evaluator integration; T02-127 owns it.
- ICAO aircraft-type mapping.
- Per-position adaptation, live facility downloads, TSAS, or UI changes.
- Replacing the KDEM/KATL authored volume geometry.

## Acceptance criteria

- [ ] **AC1 —** Schema represents leader category, follower category, and NM minimum without reversing matrix orientation.
- [ ] **AC2 —** Reviewed FAA matrix values are stored as data and loaded generically by `approachId`/volume.
- [ ] **AC3 —** Missing category or blank required relationship resolves to explicit `NOWGT` with `10 NM`.
- [ ] **AC4 —** No wake minimum is inferred from `aircraftType`, display `wakeCategory`, or a facility ID.
- [ ] **AC5 —** Synthetic fixtures cover populated, blank, invalid, and missing-category relationships.
- [ ] **AC6 — Research:** data comments cite JO 7110.65 §5-5-4/TBL 5-5-1 and explain the trainer blank-cell policy.

## Test plan

- Unit: matrix lookup, orientation, invalid categories, blank cells, and
  `NOWGT`/`10 NM` result.
- Loader/schema tests using minimal synthetic catalog data.

## Suggested files

- `src/scenario/procedures/types.ts`
- `src/scenario/procedures/loadCatalog.ts`
- `src/scenario/data/kdem/atpa-volumes.json`
- `src/scenario/data/katl/atpa-volumes.json`
- `src/core/alerts/atpa.ts` or a dedicated ATPA adaptation module
- `src/scenario/test/atpaVolume.test.ts`
