# T05-09 Second position stub and handoff

**Phase:** 05 Training
**Priority:** P0
**Size:** L
**Depends on:** T02-08 (ownership color stub)
**Blocks:** T05-11, T05-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

KDEM has two **trainer control positions** (APP and FIN), each with a geographic polygon and a color. F6 handoff toggles ownership APP↔FIN and logs `handoff.position`. Hot-seat chooses which position you are working. **No networking.**

## Context

Phase 2 T02-08: `unowned` (white `#DDDDDD`) vs `owned` (green `#00FF66`); F3 initiate, F4 drop. README then: “Does not talk to a second position (that stub is phase 5).”

Glossary: radio vs scope — handoff is a **scope** action. Do not create a `Command`. Do not produce a readback.

`phases/_shared/non-goals.md`: phase 5 may stub a second position; not multi-facility NAS, not VATSIM.

README § Second position stub is normative (polygons, F6 rule, colors).

## Research

Read **R01** radar handoff / point out (what *real* handoff means), **R07** CRC handoff (VATSIMism vs NAS).

- Search: `7110.65 radar handoff` and `CRC STARS handoff`
- **Terms:** **handoff**, **position** (APP/FIN). Not trade, pass, or multiplayer claim.
- F6 is **trainer sugar**, not CRC. Help: `F6 HANDOFF (hot-seat stub — not NAS)`. No frequency Command IR.

## Scope

## Scope

- Types: `AtcPosition { id, name, color, polygonNm }`. JSON `src/scenario/data/kdem-positions.json`.
- Extend track ownership from `"unowned" | "owned"` to `"unowned" | "APP" | "FIN"` (or `unowned` + `ownerPositionId: string | null`). Map `owned` → `APP` for backward compatibility with F3.
- Palette: add `ownedFinal` `#00DDFF`. Keep `owned` green for APP.
- Draw polygon outlines on the map layer (dim, map-green or per-position color at 30–40% opacity). Not filled walls.
- Hot-seat control: working position `APP` | `FIN` in the chrome (not a radio command).
- F3: unowned → **working** position (not always APP).
- F4: → unowned.
- **F6** always-on (like F3): selected owned track toggles `APP` ↔ `FIN`; unowned = no-op. `preventDefault`. Help overlay line (T02-09 overlay): `F6 Handoff (trainer stub)`.
- Emit `handoff.position` `{ callsign, fromPositionId, toPositionId }` (`unowned` as `"unowned"` if you ever log F3 — F3 may emit `handoff.position` or a separate `track.initiated`; **F6 must emit `handoff.position`**).
- Non-color cue: flight strip and/or datablock shows `APP` or `FIN` when owned (required, not P1). Limited datablock may use a 1-char `A`/`F` if space is tight — document it.
- P1 optional: split view two canvases. **Not required to exit.**

## Out of scope

- WebSocket, second browser tab sync, VATSIM, frequency change IR, automated handoff when crossing the polygon.
- Point-out, quick-look, NAS scratchpad.
- Third position, tower as a full TCP (phase 4 tower stub may remain a color; do not merge unless trivial — keep tower stub separate from APP/FIN).
- Claiming CRC-compatible handoff.

## Implementation notes

F6 vs command line: F6 is an always-on function key; it never types into the radio buffer (same as F3).

Polygon point-in-polygon is **display + documentation only** for v1. Do not auto-handoff on crossing. A unit test `pointInPolygon` may still exist for later; do not hook it to ownership.

```ts
| {
    type: "handoff.position";
    atSimMs: number;
    atWallMs: number;
    callsign: string;
    fromPositionId: "unowned" | "APP" | "FIN";
    toPositionId: "unowned" | "APP" | "FIN";
  }
```

Hot-seat: datablock color follows **owner**, not working position. Working position only changes what F3 assigns.

If both CA red and FIN cyan compete: keep phase 4 priority `CA alert > MSAW alert > CA caution > MSAW caution > ownership`. Ownership color shows when no alert.

### P1 split view

Two `renderScope` with `workingPositionId` per pane. Same World. Skip unless requested.

## Acceptance criteria

- [ ] **AC1 —** `kdem-positions.json` loads two positions `APP` and `FIN` with polygons of ≥ 3 vertices (Vitest).
- [ ] **AC2 —** F3 while working APP sets selected unowned track to APP green; F3 while working FIN sets cyan (unit on ownership reducer + Manual color).
- [ ] **AC3 —** F6 toggles APP↔FIN and appends `handoff.position` (Vitest).
- [ ] **AC4 —** F6 on unowned does not change state and appends nothing (Vitest).
- [ ] **AC5 —** F4 still returns unowned white (Vitest).
- [ ] **AC6 —** No `WebSocket`, `RTCPeerConnection`, or `fetch` in the ownership/handoff modules.
- [ ] **AC7 —** Owned track shows `APP` or `FIN` as text on strip or datablock (Manual + unit on the formatter).
- [ ] **AC8 —** Help overlay documents F6 (Manual).
- [ ] **AC9 —** Polygons visible on the PPI at default range (Manual).
- [ ] **P1 AC10 —** Split view two PPIs. **Optional for phase exit.**

## Test plan

- Unit: `src/scope/ownership.test.ts` (extend), `positions.test.ts`.
- Integration: none.
- Manual: hot-seat switch, F3/F6/F4, confirm colors + labels + map outlines.

## Suggested files

- `src/scenario/data/kdem-positions.json`
- `src/scope/positions.ts`
- `src/scope/ownership.ts`
- `src/scope/palette.ts`
- `src/scope/map-layers.ts` (polygon stroke)
- `src/ui/hotseat-control.ts`
- `src/core/events/types.ts`
- `src/scope/help-overlay.ts` (F6 line)
