# T02-07 Predicted track line

**Phase:** 02 Scope
**Priority:** P1
**Size:** S
**Depends on:** T02-03
**Blocks:** T02-10, T02-13
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A global **predicted track line** (PTL) draws one minute of current ground speed along current heading. Toggle `F7` / later DCB. Straight line only.

## Context

README frozen decision 10. Not a turn-radius predictor. Not weather. CRC analog is PTL on the DCB. Architecture: display only; no intent change.

Can parallel T02-04–06 after T02-03. If altitude filter already exists, suppress PTL when the track is filtered; if not, add a TODO hook and T02-06 will call the same predicate.

## Research

Read **R07** predicted track / PTL.

- Search: `STARS PTL predicted track line CRC DCB`
- **Terms:** **predicted track line** or **PTL**. Not velocity vector, heading line, or “projection.”
- Straight 1-minute GS along ground track — not a turn predictor (CRC may offer more; we do not). Comment the delta.

## Scope

```ts
export function ptlEndpoint(
  eastNm: number,
  northNm: number,
  headingTrueDeg: number,
  gsKt: number,
  minutes: number,
): { eastNm: number; northNm: number };
```

- `minutes` frozen at **1.0**. Distance NM = `gsKt / 60 * minutes`.
- Heading true, north-up: east += dist * sin(hdg), north += dist * cos(hdg) with degrees→radians. Match T00-04 / kinematics heading convention (document if heading 0 = north).
- Draw line + 4 px cap tick; track color; 1 px stroke.
- Global `ptlOn` default **false**.
- `F7` always-on toggle (`preventDefault`).
- Do not draw for tracks without GS (should not happen).
- Clip to range circle.

## Out of scope

- Multiple minute presets (0.5/2/4), per-track PTL, curved prediction, J-rings/halos, velocity vector separate from PTL (heading tick on the symbol is T02-03).

## Implementation notes

Unit-test: at 180 kt, 1 min → 3.0 NM; heading 090 → endpoint east+3, north+0 (±1e-6); heading 000 → east+0, north+3.

## Acceptance criteria

- [ ] **AC1 —** Automated: 180 kt / 090° / 1 min → +3 NM east, 0 north.
- [ ] **AC2 —** Automated: 240 kt / 000° / 1 min → +4 NM north.
- [ ] **AC3 —** `F7` with command line focused still toggles PTL and does not insert a character.
- [ ] **AC4 —** Default off: no PTL until toggled. When on, each unfiltered track has a line ~1 min ahead.
- [ ] **AC5 —** If filter API exists, filtered tracks have no PTL; symbols remain.
- [ ] **AC6 —** No Command IR / readback.
- [ ] **AC7 — Research:** UI says **PTL** or **predicted track line**. Comment cites CRC PTL; straight 1 min only.

## Test plan

- Unit: endpoint math (table-driven headings 0/90/180/270).
- Integration: F7 routing.
- Manual: turn the aircraft; PTL rotates with heading, length follows GS.

## Suggested files

- `src/scope/ptl.ts`
- `src/scope/ptl.test.ts`
- `src/scope/renderScope.ts`
- `src/scope/scopeKeys.ts`
