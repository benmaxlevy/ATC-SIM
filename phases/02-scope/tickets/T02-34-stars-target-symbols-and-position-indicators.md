# T02-34 STARS target symbols, position indicators, and primary/secondary radar targets

**Phase:** 02 Scope (STARS CRC fidelity addendum)
**Priority:** P1
**Size:** M
**Depends on:** T02-18, T02-21, T02-33
**Blocks:** T02-35, T02-38
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Align radar target and position symbols with the STARS CRC specification (docs.virtualnas.net/crc/stars):
- Unassociated secondary beacon target: **Asterisk (`*`)** default, **`V`** for 1200 VFR squawk, or **Square (`□`)** if beacon code matches the beacon code select list.
- Primary-only target (no transponder): **Diamond (`◇`)** with no datablock.
- Controlled / Tracked target: Owning controller's **Sector ID character** (e.g. `D`, `B`, or active controller position symbol), replacing the uniform diamond + stub.
- Remove the non-standard fixed 8px heading tick line attached to the symbol (PTL handles velocity vector projection).
- Apply TCW BRITE channel brightness to position symbols (`POS` for FDB tracks, `OTH` for non-FDB tracks, `PRI` for primary).

## Context

T02-18 froze an 8×8 unfilled diamond with an internal ownership stub letter and a fixed 8px heading tick. While functional, STARS CRC distinguishes primary vs secondary vs tracked targets by symbol shape: diamond for primary, asterisk/V/square for unassociated secondary, and sector ID letter for tracked aircraft.

## Research

Read **docs.virtualnas.net/crc/stars** (Tracking Aircraft, Data Blocks, BRITE submenu).
- Search: `STARS target symbol position symbol asterisk diamond sector ID CRC`
- **Terms:** **target symbol**, **position symbol**, **primary target**, **beacon select**, **TCP sector ID**.
- Comment: STARS position symbol displays sector ID when tracked, asterisk for unassociated beacon, V for 1200, square for selected beacon, diamond for primary-only.

## Scope

- Update `targetSymbol.ts` / `renderScope.ts` to compute position symbol shape based on track surveillance and ownership state:
  - Primary-only (no transponder / Mode C): Unfilled diamond (`◇`).
  - Unassociated beacon: Asterisk (`*`), unless squawking 1200 (`V`) or in beacon select list (`□`).
  - Controlled / Tracked: Sector ID character (e.g. `D` for departure / user TCP, or transferring controller's ID).
- Remove the hardcoded 8px heading tick line projecting from the target center (PTL lines via `ptl.ts` remain the standard vector projection).
- Support position symbol sizing via `charSizes.pos`.
- Connect BRITE channel multipliers: `brite.pos` for tracked FDB position symbols, `brite.oth` for unassociated/PDB symbols, `brite.pri` for primary targets.
- Position symbol stays search/fusion blue (`PALETTE.positionSymbol = "#1E78FF"`) or inherits TCW brightness, flashing yellow on IDENT and turning red/yellow on CA/MSAW.

## Out of scope

- PDB/LDB datablock content (T02-35).
- Time-sharing datablock fields (T02-36).
- Secondary multi-radar fusion calculations.

## Implementation notes

- Modify `src/scope/targetSymbol.ts`, `src/scope/renderScope.ts`, `src/scope/palette.ts`.
- Update tests in `src/scope/targetSymbol.test.ts`, `src/scope/renderScope.test.ts`.

## Acceptance criteria

- [ ] **AC1 —** Primary-only target renders as a diamond without a datablock.
- [ ] **AC2 —** Unassociated secondary target renders as an asterisk `*` (or `V` for 1200 squawk, `□` for selected beacon).
- [ ] **AC3 —** Tracked target renders the owning controller's sector ID (e.g. `D` or `G`) as the position symbol.
- [ ] **AC4 —** Fixed 8px heading tick line is removed from the target symbol; PTL lines continue to render correctly.
- [ ] **AC5 —** BRITE channels `pos`, `oth`, and `pri` properly modulate the target symbol brightness.
- [ ] **AC6 —** Automated unit tests cover all target symbol shapes and brightness variations.

## Test plan

- Unit: test `renderTargetSymbol` / `targetSymbolShape` for primary, unassociated, 1200 VFR, selected beacon, and tracked states.
- Visual: verify on PPI that unassociated tracks show `*` / `V` and change to sector ID upon track acquisition (F3).

## Suggested files

- `src/scope/targetSymbol.ts`
- `src/scope/targetSymbol.test.ts`
- `src/scope/renderScope.ts`
- `src/scope/palette.ts`
