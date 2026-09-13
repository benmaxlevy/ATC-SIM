# T02-133 FDB Field 0 Physical Rendering

**Phase:** 02 Scope — datablock fidelity  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-131, T02-132  
**Blocks:** none  
**Launch:** Implement this ticket only. Stop after acceptance and manual review.

## Mission

Render existing Full Datablock (FDB) Field 0 in its manual-defined physical
position without changing existing alert semantics.

## Research

User-supplied `TI 6191.409 Rev. 30`, §2.12, Figure 2-20, pp. 2-66–67:

- Field 0 is the line-0 content above the callsign.
- Field 1 is the callsign on line 1.
- Fields 3, 4, and 5 occupy line 2.
- Fields 6, 7, and 8 occupy line 3.
- Field 0 contains special conditions, safety alerts, cautions, and TSAS
  sequence number when present.
- Field 2 contains alert-inhibit indicators associated with the callsign.

Trainer delta: render only existing logical/runtime values. Do not add new SPC,
alert, TSAS, or surveillance behavior.

## Scope

- Add Field 0 to the physical rendering model as an optional row above FDB
  line 1.
- Render existing logical Field 0 values without appending them to callsign.
- Preserve renderer-owned color/blink handling for existing `LA` and `CA`.
- Preserve inline Field 2 inhibit glyphs after callsign.
- Update datablock metrics, leader placement, hit testing, and overlap layout
  for the optional Field 0 row.
- Ensure empty Field 0 adds no row.
- Add synthetic canvas/integration coverage for SPC, LA/CA, TSAS sequence input,
  empty Field 0, and no duplication.

## Acceptance criteria

- [ ] FDB Field 0 paints above callsign when non-empty.
- [ ] Field 0 is never concatenated into `line1`.
- [ ] Existing `EM`, `RF`, `HJ`, `LA`, and `CA` behavior remains correct.
- [ ] Field 2 inhibit glyphs remain inline and distinct from Field 0.
- [ ] Optional row affects metrics, leaders, hit testing, and collision layout.
- [ ] Empty Field 0 preserves current three-row geometry.
- [ ] Manual review uses only the supplied PDF and records pp. 2-66–67 findings.

## Tests

- `src/scope/test/datablock.test.ts`
- `src/scope/test/datablockFidelity.integration.test.ts`
- `src/scope/test/renderScopePaint.test.ts`
- `src/scope/datablockLayout.test.ts` when geometry changes.
- Focused scope tests, then `npm run ci` after merge.

## Non-goals

- New SPCs, alert types, or alert evaluation.
- Pointout, quicklook, ADS-B, FMA, RNP, TSAS runtime, parser, Command IR,
  speech, DCB, networking, or facility-specific behavior.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, with changed paths,
progressive commits, focused test results, and manual visual leftovers.
