# T02-130 FDB Physical Field Alignment

**Phase:** 02 Scope — datablock fidelity  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-129  
**Blocks:** none  
**Launch:** Implement this ticket only. Stop after acceptance.

## Mission

Make the physical FDB/PDB presentation derive from the explicit logical field
model, with pending handoff coverage and a documented decision for the current
aircraft-type Line 3 trainer delta.

## Research

- User-provided `TI 6191.409 Rev. 30`, Figures 2-20 through 2-23, pp. 2-66–70:
  Field 3 is left Line 2 data, Field 4 is the center TCP, Field 5 is right
  Line 2 data, and Fields 6–8 occupy the trailing physical line.
- R07, [CRC STARS data blocks](https://docs.virtualnas.net/crc/stars/#data-blocks):
  FDB/PDB layout, time-sharing, and one-/two-character TCP terminology.
- R02, [FAA Pilot/Controller Glossary](https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/):
  canonical `datablock` and `Mode C` terminology.

Trainer delta: this remains a STARS-like Canvas presentation, not a clone of
proprietary STARS software or a NAS-compatible implementation.

## Scope

- Establish one generic adapter from `DatablockFields` to physical lines.
- Keep Field 4 logical output and physical center-slot output consistent.
- Preserve stable character-cell spacing for one- and two-character TCPs.
- Cover pending inbound, accepted inbound, outbound, pointout, FDB, and PDB
  states with synthetic fixtures.
- Resolve aircraft type placement: prefer strict PDF/CRC placement in Field 5
  on Line 2; if compatibility requires retaining Line 3, document it as an
  explicit trainer delta and test it.
- Update phase documentation only for behavior actually shipped.

## Acceptance criteria

- [x] **AC1 —** Physical lines are derived from logical Fields 0–8 without a
  separate handoff-only formatter path.
- [x] **AC2 —** Field 4 appears identically in the logical result and physical
  center slot for `N` and `1N`.
- [x] **AC3 —** FDB and PDB synthetic fixtures cover pending inbound and
  accepted inbound handoff states.
- [x] **AC4 —** Field 5 aircraft type placement follows the selected strict
  PDF alignment or is explicitly documented as a trainer delta; no silent
  contradiction remains.
- [x] **AC5 —** Existing pointout, ATPA, alert, limited-block, and Mode C
  behavior remains green.
- [x] **AC6 —** One acceptance/fidelity integration file covers the feature;
  generic unit tests remain minimal and parameterized.

## Tests

- Extend `src/scope/test/datablockFidelity.integration.test.ts`.
- Add focused physical-line tests in `src/scope/test/datablock.test.ts` only
  where pure formatter coverage is needed.
- Run the focused scope suites after merge, then `npm run ci`.

## Non-goals

- TSAS scheduling, ADS-B services, pointout workflow redesign, networking,
  parser, Command IR, speech, DCB, scenario data, or facility branches.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, with changed paths,
progressive commits, focused test results, and manual visual leftovers.
