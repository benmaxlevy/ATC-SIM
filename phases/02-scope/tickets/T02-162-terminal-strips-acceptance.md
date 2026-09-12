# T02-162 Terminal Strips Acceptance

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** S  
**Depends on:** T02-160, T02-161  
**Blocks:** None  
**Launch:** Implement this ticket only.

## Goal

Prove happy-path terminal departure and arrival strips match supplied geometry and FAA §2-3-4 field meanings.

## Research

- [FAA JO 7110.65 §2-3-4](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_3.html#para-2-3-4): terminal arrival and departure data must occupy correspondingly numbered spaces.
- Supplied arrival and departure structure images define shared physical placement.

## Scope

- Add one synthetic plan-backed departure fixture and one synthetic plan-backed arrival fixture.
- Verify projection truth, assigned beacon handling, and every happy-path field placement.
- Verify shared five-column layout and Boxes 9A/9B/9C.
- Document narrow happy-path scope in existing Phase 2 documentation only if required.

## Acceptance criteria

- [ ] Acceptance test proves one departure and one arrival from `World` render expected fields.
- [ ] Box-number assertions cover 1–9C and 10–18 without production-specific map counts or geometry assumptions beyond supplied layout.
- [ ] Assigned and reported squawks remain distinguishable.
- [ ] Existing strip board selection and annotation behavior still passes.
- [ ] FAA §2-3-4 manual validation is recorded after this ticket.
- [ ] `npm run ci` passes.

## Out of scope

- Recording/RA behavior, FDIO, overflight strips, manual correction workflow, and facility-specific optional-field policies.

## Test plan

- `src/ui/strips/test/stripsAcceptance.test.tsx`
- Focused strip projection/component tests.
- FAA §2-3-4 manual validation.
- `npm run ci`

## Suggested files

- `src/ui/strips/test/stripsAcceptance.test.tsx`
- `phases/02-scope/README.md` only if documentation needs updating
