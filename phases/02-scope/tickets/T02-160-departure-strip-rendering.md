# T02-160 Departure Strip Rendering Alignment

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-158, T02-159  
**Blocks:** T02-162  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Render departure strips using the supplied FAA physical structure and terminal departure field meanings.

## Research

- [FAA JO 7110.65 §2-3-4](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_3.html#para-2-3-4): departure Boxes 1–8 identify aircraft, beacon, proposed time, requested altitude, and departure airport; computer-generated Box 9 contains route, destination, and remarks.
- Supplied departure image: `1–4 | 5–7 | 8/8A/8B | 9/9A/9B/9C | 10–18`.

## Scope

- Preserve the shared five-column physical layout.
- Render departure Box 9 with route, destination, and remarks.
- Render explicit empty/available Boxes 9A, 9B, and 9C in the large Box 9 area.
- Preserve 3×3 Boxes 10–18 and existing selection, drag, indentation, and annotation behavior.
- Keep existing typography and buff-card styling.

## Acceptance criteria

- [ ] DOM exposes Boxes 1–4, 5–7, 8/8A/8B, 9/9A/9B/9C, and 10–18 in supplied geometry.
- [ ] Box 9 contains departure route, destination, and remarks.
- [ ] Box 9A/9B/9C do not display arrival-only fields.
- [ ] Existing strip interactions remain functional.
- [ ] Component tests cover happy-path departure placement.
- [ ] Manual validation after ticket compares rendered departure placement with FAA §2-3-4 and supplied image; handoff records PASS/FAIL.

## Out of scope

- Arrival rendering, RA/recording behavior, manual strips, and optional local-field semantics.

## Test plan

- `src/ui/strips/test/stripComponents.test.tsx`
- Focused departure rendering tests.
- FAA §2-3-4 manual validation after implementation.

## Suggested files

- `src/ui/strips/DepartureStrip.tsx`
- `src/ui/strips/strips.css`
- `src/ui/strips/test/stripComponents.test.tsx`
