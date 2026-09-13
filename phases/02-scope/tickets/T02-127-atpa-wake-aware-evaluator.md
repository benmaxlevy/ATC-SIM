# T02-127 ATPA wake-aware evaluator

**Phase:** 02 Scope — ATPA wake criteria
**Priority:** P0
**Size:** L
**Depends on:** T02-126
**Blocks:** T02-128
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Make ATPA required separation wake-aware while preserving the existing pure
20 Hz evaluator, pairing behavior, and alert timing. Wake minimums must always
dominate reduced radar minima. Missing required wake data produces `NOWGT` and
`10 NM`.

## Research

- [FAA JO 7110.65 §5-5-4](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_5.html): TBL 5-5-1 wake minima, `NOWGT`, and 2.5 NM final conditions.
- [FAA Aircraft Wake Turbulence overview](https://www.faa.gov/about/office_org/headquarters_offices/avs/offices/afx/afs/afs400/afs410/aircraft-wake-turbulence): wake risk is mitigated through leader/follower minimum separation.

## Scope

- Extend ATPA track/pair state with explicit wake source/status as needed:
  `basic`, `wake`, or `nowgt`.
- Resolve the leader/follower CWT matrix from explicit track category data.
- Use `10 NM` for missing required category or blank required matrix cell.
- Compute effective minimum as the greater of applicable wake minimum and
  volume radar minimum.
- Keep existing in-trail sequencing, volume eligibility, closure, 45-second
  Warning, and current Alert policy unless directly required by this ticket.
- Keep evaluator pure and facility-agnostic.

## Out of scope

- New wake-category mapping from ICAO type or performance data.
- Changing 24-second Alert policy.
- Implementing new 2.5 NM facility authorization semantics beyond preserving
  the existing volume predicate.
- Datablock rendering, DCB, aural ATPA, CA, MSAW, TSAS, CRDA, or networking.

## Acceptance criteria

- [ ] **AC1 —** A populated leader/follower category pair uses the FAA matrix value.
- [ ] **AC2 —** Missing category or blank required matrix cell yields `requiredNm: 10` and `wakeSource: "nowgt"`.
- [ ] **AC3 —** A wake minimum larger than `2.5 NM` wins even when both tracks are inside the reduced-final distance.
- [ ] **AC4 —** A valid wake minimum below the volume basic minimum does not reduce the volume’s applicable radar minimum.
- [ ] **AC5 —** Existing pairing, ordering, monitor, Warning, and Alert behavior remains green apart from changed required distances.
- [ ] **AC6 —** No evaluator path reads display-only `wakeCategory`, aircraft type, or facility identifiers.
- [ ] **AC7 —** Pair state exposes enough source information for future `NOWGT` datablock rendering without parsing display text.

## Test plan

- Unit: representative A–I matrix pairs, `NOWGT`, blank cells, reduced-final
  precedence, basic fallback, and status thresholds.
- World integration: real `stepWorld` attaches and clears wake-aware pairs.
- Regression: existing ATPA, CA, and MSAW tests.

## Suggested files

- `src/core/alerts/atpa.ts`
- `src/core/alerts/test/atpa.test.ts`
- `src/core/world.ts`
- `src/core/test/world.atpa.test.ts`
