# T02-18 Position symbol and history contrast

**Phase:** 02 Scope
**Priority:** P1
**Size:** M
**Depends on:** T02-03, T02-08
**Blocks:** T02-19, T02-21
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Targets read as **radar position symbols**, not website dots. Unowned vs owned is a **system color**, not `#DDDDDD` grey-on-black. History is **5 discrete dots** in the track color family, high enough contrast to see.

## Context

T02-03 froze a 6×6 unfilled square and 2×2 history. T02-08 froze unowned `#DDDDDD`. This ticket **amends** those for TCW grammar. Still 1:1 tracks, no ADS-B vs primary, no airplane sprites (`R12`). IDENT flash stays.

## Research

Read **R07** (target / history), **R12** (no sprites).

- Search: `STARS target symbol correlated history dots CRC`
- **Terms:** **target**, **track**, **history**, **initiate track**. Not sprite, icon, trail, nametag.
- CSI-like **one character** in/near the symbol is trainer sugar (`*` unowned, `G` after F3). Not a real NAS CSI.
- Comment: analog CRC position symbol; letter is trainer-owned stub.

## Scope

- Position symbol: **diamond or box** (pick one and freeze), ~7–9 CSS px, 1 px stroke, **not** rotated with heading. Optional short heading tick (keep if already present).
- One-char stub: `*` (or blank) unowned; `G` (or `A`) after F3 owned. Selected: yellow selection treatment from T02-08, not a third letter unless documented.
- **Amend palette:** unowned track/block must not be “webpage grey.” Propose a frozen hex closer to STARS unowned (e.g. dim blue/white-green) — update `palette.ts` + README table. Still **no red**. Owned stays green; selected yellow.
- History: keep **5 samples / 5 s sim**. Draw as discrete dots (2–3 px), **40–70% of current track color** but bump alpha/size so they read on black. No phosphor fade, no connected snake.
- F8 / scope-focus `H` unchanged. Do not alter kinematics.

## Out of scope

- Datablock field changes (T02-19). Primary vs beacon symbol types. Real STARS font. Phosphor bloom (non-goal).

## Implementation notes

`targetSymbol.ts`, `history.ts`, `ownership.ts`, `palette.ts`. Update tests that hardcode `#DDDDDD`.

## Acceptance criteria

- [x] **AC1 —** Symbol is not a 1–2 px dot; unit test or render test asserts size ≥ 6 px.
- [x] **AC2 —** Unowned vs F3-owned letter (or equivalent) differs; F4 returns unowned.
- [x] **AC3 —** `PALETTE.unowned` is no longer `#DDDDDD`; README palette table matches.
- [x] **AC4 —** History length still 5; dots use track color family (not independent grey).
- [x] **AC5 —** IDENT flash still works. No Command IR from drawing.
- [x] **AC6 — Research:** target/history comments; no sprite/airplane.

## Test plan

- Unit: symbol metrics, ownership letter, palette hex, history buffer.
- Manual: contrast on black PPI at 20 NM. skip-with-reason: swarm leaf; no GPU/visual operator; live Chrome Windows PPI not watched. Automated tests prove size, CSI stub, palette, history family, IDENT, and no Command IR from drawing.

## Suggested files

- `src/scope/targetSymbol.ts`
- `src/scope/history.ts`
- `src/scope/palette.ts`
- `src/scope/ownership.ts`
- `phases/02-scope/README.md` (palette row only)
