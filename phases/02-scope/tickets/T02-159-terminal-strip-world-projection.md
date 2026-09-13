# T02-159 Terminal Strip World Projection

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-158  
**Blocks:** T02-160, T02-161  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Project canonical flight-plan and aircraft data into terminal strips without fabricating operational values.

## Research

- [FAA JO 7110.65 §2-3-4](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_3.html#para-2-3-4): Box 5 is assigned beacon code; departure Box 6 is proposed departure time; arrival Box 8 is ETA; departure Box 9 contains route, destination, and remarks; arrival Box 9 contains altitude and remarks.
- `src/core/flightPlan.ts`: canonical association, assigned/reported beacon, aircraft type, equipment, route, requested altitude, ETA, and PTD.

## Scope

- Update `terminalStripsFromWorld` to use associated `FlightPlan` values first.
- Use explicit `cwtWakeCategory` for wake display.
- Use plan equipment/suffix, `ptd`, `eta`, route, altitude, airport, CID, assigned beacon, and remarks.
- Keep reported squawk available for later mismatch presentation but never use it as assigned Box 5.
- Remove live-path defaults that imply false operational data, including hardcoded `/L`, fabricated CID values, `1200`, `DEST`, and synthetic times when plan values exist.
- Keep partitioning and sorting generic.

## Acceptance criteria

- [ ] Plan-backed departure projects plan ACID, equipment, CID, assigned beacon, PTD, requested altitude, route, departure airport, destination, and remarks.
- [ ] Plan-backed arrival projects plan ACID, equipment, CID, assigned beacon, ETA, coordination data, altitude, destination, and remarks.
- [ ] `cwtWakeCategory` drives terminal wake category.
- [ ] Reported squawk never replaces assigned beacon in strip DTO.
- [ ] Tests prove plan values beat aircraft fallback values.
- [ ] Tests prove no fabricated defaults override plan data.
- [ ] Manual validation after ticket inspects every populated projection field against FAA §2-3-4 numbered spaces; handoff records PASS/FAIL.

## Out of scope

- Rendering changes, mismatch glyphs, recording/RA behavior, and non-happy-path missing data.

## Test plan

- `src/ui/strips/test/terminalStripsFromWorld.test.ts`
- Focused projection tests.
- FAA §2-3-4 manual validation after implementation.

## Suggested files

- `src/ui/strips/terminalStripsFromWorld.ts`
- `src/ui/strips/test/terminalStripsFromWorld.test.ts`
