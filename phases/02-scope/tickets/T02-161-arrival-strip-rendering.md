# T02-161 Arrival Strip Rendering Alignment

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-158, T02-159  
**Blocks:** T02-162  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Render arrival strips using the supplied FAA physical structure and terminal arrival field meanings.

## Research

- [FAA JO 7110.65 §2-3-4](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_3.html#para-2-3-4): arrival Boxes 1–8 identify aircraft, beacon, previous/coordination fix, and ETA; Box 9 contains altitude and remarks; Box 9A contains destination and related arrival data.
- Supplied arrival image: `1–4 | 5–7 | 8/8A/8B | 9/9A/9B/9C | 10–18`.

## Scope

- Preserve the shared five-column physical layout.
- Render arrival Box 9 with altitude and remarks.
- Render arrival Box 9A with destination and happy-path arrival data.
- Render explicit Boxes 9B and 9C in labeled positions.
- Remove `IFR`/`VFR` from Box 9; retain flight rules only as model data if needed elsewhere.
- Preserve 3×3 Boxes 10–18 and existing selection, drag, indentation, and annotation behavior.

## Acceptance criteria

- [ ] DOM exposes Boxes 1–4, 5–7, 8/8A/8B, 9/9A/9B/9C, and 10–18 in supplied geometry.
- [ ] Box 9 contains arrival altitude and remarks.
- [ ] Box 9A contains destination and happy-path arrival data.
- [ ] Box 9B and Box 9C have correct labeled positions.
- [ ] Box 9 contains no `IFR`/`VFR` field rendering.
- [ ] Component tests cover happy-path arrival placement.
- [ ] Manual validation after ticket compares rendered arrival placement with FAA §2-3-4 and supplied image; handoff records PASS/FAIL.

## Out of scope

- Recording/RA behavior, optional local semantics, overflight strips, and missing-data handling.

## Test plan

- `src/ui/strips/test/stripComponents.test.tsx`
- Focused arrival rendering tests.
- FAA §2-3-4 manual validation after implementation.

## Suggested files

- `src/ui/strips/ArrivalStrip.tsx`
- `src/ui/strips/strips.css`
- `src/ui/strips/test/stripComponents.test.tsx`
