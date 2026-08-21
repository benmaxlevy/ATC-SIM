# T02-15 Trainer chrome off the TCW

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-09, T02-10
**Blocks:** T02-16, T02-20
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The visible workstation is a **dark PPI + DCB**, not a web app with banners and a footer tutorial. T00-01 disclaimer copy is still available. Sim pause / 1× / 2× still work. Typed radio still works.

## Context

Phase 2 DCB-lite sits in a flex column under a disclaimer and above pause/help prose. That reads as a trainer site, not a TCW (`phases/02-scope/README.md` layout). This ticket moves chrome **off** the glass.

## Research

Read **R07** (TCW / DCB placement), **R12** (not a game HUD). T00-01 exact disclaimer string.

- Search: `STARS TCW display control bar SSA`
- **Terms:** **scope**, **PPI**, **DCB**, **command line**. Not toolbar, HUD, banner, overlay (except F1 help).
- Comment: analog TCW glass; trainer chrome is first-run / F1 / corner, not a header.

## Scope

- **Disclaimer:** remove the always-visible banner over the DCB. Show the **exact** T00-01 copy on first boot (dismiss once per browser profile is OK) **and/or** inside F1. Must remain reachable without a README.
- **Tutorial prose** (`type DAL123 H270`, `F1 lists keys`, grey sentences on the PPI footer): delete from the persistent layout. F1 already lists keys.
- **Pause / 1× / 2× / sim clock:** leave the PPI footer. Put them in a small **corner readout** (map-green mono) or behind a later DCB `SIM` cell (T02-16 may restyle; this ticket must not lose the functions).
- **Command line:** one **narrow green strip** at the bottom **of the PPI column** (or drawn on the canvas). Not a large lime web `<input>` block. Tokens only (`DAL123 H270`). Do **not** implement spoken English (phase 3 Path A).
- DCB may still sit above the canvas until T02-16; do not rebuild the cell grid here.
- Focus model unchanged: `/` or click focuses radio; Tab cycles.

## Out of scope

- DCB cell grid (T02-16). SSA block (T02-20). Moving strips onto the PPI (T02-20). Path A parser. Changing Command IR.

## Implementation notes

Keep `submitCommand` / `handleRadioText` wiring. CSS: no drop shadows, no rounded cards. Command-line placeholder if any: token example, not telephony.

## Acceptance criteria

- [ ] **AC1 —** Cold boot: no disclaimer banner spanning the DCB. Exact T00-01 copy is one click or F1 away.
- [ ] **AC2 —** Persistent footer has no tutorial sentences. F1 still lists keys (`TRAINER KEYS — NOT CRC`).
- [ ] **AC3 —** Pause / 1× / 2× still change `world.paused` / `simRate` (existing tests).
- [ ] **AC4 —** Radio-focus `DAL123 H270` still readbacks and turns (heading-command integration).
- [ ] **AC5 —** Command strip does not call `parseCommand` Path A; unknown English still fails as today.
- [ ] **AC6 — Research:** No user-facing “HUD / zoom / toolbar.” Analog+delta comment on the shell.

## Test plan

- Unit: disclaimer still exported; sim controls helpers.
- Integration: heading-command test.
- Manual: Chrome — glass is PPI + thin bars, not a blog header.

## Suggested files

- `src/ui/shell.tsx` (or current shell)
- `src/ui/ScopeHelpOverlay.tsx`
- `src/index.css`
- `src/ui/disclaimer-copy.ts`
