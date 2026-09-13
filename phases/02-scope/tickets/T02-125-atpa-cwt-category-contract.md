# T02-125 ATPA CWT wake-category contract

**Phase:** 02 Scope — ATPA wake criteria
**Priority:** P0
**Size:** M
**Depends on:** T02-124
**Blocks:** T02-126
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Separate operational FAA Consolidated Wake Turbulence (CWT) categories from
the existing display-only `wakeCategory` field. Add a validated, generic
`cwtWakeCategory` value that ATPA can use without inferring categories from
ICAO aircraft type or display text.

## Research

- [FAA JO 7110.65BB Pilot/Controller Glossary](https://www.faa.gov/documentLibrary/media/Order/7110.65BB_Bsc_w_Chg_1_and_2_dtd_1-22-26_Final.pdf): terminal wake categories A–I; A is A388, B/C/D are heavy, E is B757, F/G are large, and H/I are small.
- [FAA Pilot/Controller Glossary — Aircraft Wake Categories](https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/glossary-a.html): category definitions and terminal wake terminology.
- [FAA CWT implementation notice](https://notams.aim.faa.gov/lta/main/viewlta?lookupid=2751183952248051360): detailed B/C/D, F/G, and H/I category names.

The existing CRC category indicator remains a display concern. This ticket
does not claim that a displayed `H`, `B`, `R`, `L`, or CWT `A`–`I` value is an
operational category unless it is explicitly supplied as `cwtWakeCategory`.

## Scope

- Add a strict `CwtWakeCategory` type for `A` through `I`.
- Add optional `cwtWakeCategory` to aircraft/runtime inputs where appropriate.
- Preserve existing `wakeCategory` formatting and compatibility behavior.
- Normalize and reject invalid CWT values rather than silently coercing them.
- Keep scenario data generic; no KDEM/KATL runtime branch.

## Out of scope

- FAA matrix values and ATPA evaluator changes; T02-126 owns those.
- Mapping ICAO aircraft types to CWT categories.
- Aircraft performance, weights, OpenAP, TSAS, CRDA, parser, DCB, or speech.
- Changes to CA/MSAW.

## Acceptance criteria

- [ ] **AC1 —** `CwtWakeCategory` accepts exactly `A`–`I`.
- [ ] **AC2 —** Aircraft/test fixtures can carry `cwtWakeCategory` independently of `wakeCategory`.
- [ ] **AC3 —** Invalid, empty, or lower-case input is normalized or rejected by one documented boundary; invalid runtime state is unavailable, not guessed.
- [ ] **AC4 —** Existing FDB category display tests remain green and continue to use `wakeCategory`.
- [ ] **AC5 —** Synthetic fixtures prove CWT and display categories can differ.
- [ ] **AC6 — Research:** comments/documentation cite JO 7110.65BB and distinguish CWT operational data from CRC display category indicators.

## Test plan

- Unit: category validation and normalization.
- Regression: existing aircraft and datablock category tests.
- No production facility counts or ICAO-type mappings.

## Suggested files

- `src/core/aircraft.ts`
- `src/core/types` or existing shared type location
- `src/core/test/aircraft.test.ts`
- `src/scope/test/datablock.test.ts`
