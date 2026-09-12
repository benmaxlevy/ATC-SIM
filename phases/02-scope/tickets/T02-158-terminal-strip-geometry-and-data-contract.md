# T02-158 Terminal Strip Geometry and Data Contract

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-143 through T02-157  
**Blocks:** T02-159, T02-160, T02-161  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Define the shared terminal flight-progress strip contract represented by the supplied FAA arrival/departure geometry.

## Research

- [FAA JO 7110.65 §2-3-4, Terminal Data Entries](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_3.html#para-2-3-4): terminal strips use numbered spaces; arrival and departure fields differ in Boxes 6–9.
- Supplied structure: both strip types share columns `1–4`, `5–7`, `8/8A/8B`, `9/9A/9B/9C`, and `10–18`.

## Scope

- Keep one shared physical layout for arrival and departure strips.
- Extend strip data with happy-path fields needed by terminal boxes: aircraft count, plan equipment/suffix, CID, assigned beacon, altitude, departure/destination airports, route, ETA/PTD, and remarks.
- Keep Boxes 9A, 9B, and 9C explicit in the model even when 9B/9C are blank.
- Preserve generic/data-first models; do not add airport-specific branches.

## Acceptance criteria

- [ ] Both strip types expose the shared five-column geometry contract.
- [ ] Departure data represents Boxes 1–9 in FAA departure meaning.
- [ ] Arrival data represents Boxes 1–9A in FAA arrival meaning.
- [ ] Assigned beacon and reported squawk remain separate concepts.
- [ ] Existing annotation support for 8A/8B and 10–18 remains compatible.
- [ ] Synthetic type tests cover one departure and one arrival.
- [ ] Manual validation after ticket compares field names and numbered-space meanings against FAA §2-3-4; handoff records PASS/FAIL.

## Out of scope

- Recording, RA events, FDIO distinctions, overflight strips, missing-data handling, handwritten correction workflow, rendering, and World projection.

## Test plan

- Focused TypeScript/domain tests.
- FAA §2-3-4 manual validation after implementation.

## Suggested files

- `src/ui/strips/types.ts`
- `src/ui/strips/test/stripFormatter.test.ts`
- `src/ui/strips/test/terminalStripsFromWorld.test.ts`
