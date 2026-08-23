# T02-22 DCB menu model, SHIFT, and interaction primitives

**Phase:** 02 Scope (post-exit addendum)
**Priority:** P0
**Size:** L
**Depends on:** T02-17, T02-21
**Blocks:** T02-23, T02-24, T02-25, T02-26, T02-27
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The DCB is a **menu machine**, not a single strip of one-shot cells. MAIN and AUX swap via **SHIFT**. Submenus **replace** the bar. Cell kinds (action, toggle, spinner, submenu opener, disabled) share one interaction model. Existing T02-16/17 jobs still work.

## Context

T02-16/17 shipped a green cell grid with click-to-cycle RANGE/RR/CHAR/BRITE and latching MAPS/LDR submenus. CRC STARS (R07) uses SHIFT, DONE, spinner arm+wheel, and disabled chrome. This ticket **lifts** SHIFT / submenu replace / primitives only. Do not fill every STARS button yet.

`phases/_shared/non-goals.md`: trainer DCB subset is lifted here; weather mosaic, CRDA, FMA, NAS pref host stay out.

## Research

Read **R07** DCB MAIN / AUX / SHIFT / DONE. **R06** (do not paint weather).

- Search: `STARS DCB SHIFT AUX DONE spinner CRC`
- **Terms:** **DCB**, **SHIFT**, **MAIN**, **AUX**, **DONE**. Not toolbar, ribbon, HUD, modal dialog.
- Comment: analog CRC DCB menus; trainer subset; Esc = DONE.

## Scope

- Add display-only state on `ScopeView` (names may vary, keep testable):

  ```ts
  type DcbMenu =
    | "MAIN"
    | "AUX"
    | "MAPS"
    | "BRITE"
    | "CHAR_SIZE"
    | "PREF"
    | "SSA_FILTER"
    | "GI_FILTER"
    | "TPA_ATPA";

  type DcbCellKind = "action" | "toggle" | "spinner" | "submenu" | "disabled";
  ```

- **SHIFT** on MAIN opens AUX (skeleton is enough: SHIFT back + **VOL** disabled). SHIFT on AUX returns MAIN. Do not implement HISTORY/PTL/dock contents (T02-25).
- Opening MAPS (already a submenu) **replaces** the DCB row. **DONE** and **Esc** return to MAIN. Same pattern for a stub submenu if you add BRITE/CHAR as openers that still show today’s cycle UI — or leave CHAR/BRITE as cycles until T02-26. If you leave them as cycles, document it; T02-26 converts them.
- Cell primitives in `src/scope` (DOM-free reducers) + thin React cells in `DisplayControlBar`:
  - **action** — one click.
  - **toggle** — latch, pressed invert/stipple (existing grammar).
  - **spinner** — first click arms (pressed); wheel steps a reducer; second click or Esc commits/disarms. Tests do not need real Pointer Lock: clamp/arm/step/commit is enough. Optional `setPointerCapture` in the cell.
  - **submenu** — sets `dcbMenu`.
  - **disabled** — visible, dark/inert, no click, `aria-disabled`.
- Rehome current MAIN cells onto the new menu field. FILTER / PTL / HIST / PLACE CNTR stay on MAIN this ticket (PTL/HIST may move to AUX in T02-25; do not drop them).
- Clicks never emit Command IR. After a cell click, focus returns to the PPI (T02-10).
- Update `tcwVisualAcceptance` / DCB greps that **forbid SHIFT**. SHIFT is now a legal cell. Do **not** add PREF/WX contents yet; if a grep forbids the word SHIFT, narrow it so SHIFT is allowed and CSA/CRDA/FMA/OSM stay forbidden.
- F1: one line that SHIFT swaps MAIN/AUX; Esc closes a submenu. Footer still `TRAINER KEYS — NOT CRC`.

## Out of scope

- RANGE/RR spinner behavior (T02-23) — you may wire RANGE as a spinner that still steps the existing 8 presets, or leave RANGE as click-cycle until T02-23. Prefer wiring RANGE as a spinner here so T02-23 only splits CNTR/RR cells.
- MAPS 1–30 / WX (T02-24). Dock LEFT/RIGHT/BOTTOM (T02-25). Per-channel BRITE / per-subsystem CHAR (T02-26). SSA/GI filters (T02-27). TPA (T02-28). PREF slots (T02-29).
- Weather paint, CRDA, FMA, licensed STARS font, OS volume, Pointer Lock as a hard requirement.

## Implementation notes

Single source of truth remains `src/scope`. Suggested: `src/scope/dcbMenu.ts` for menu + spinner reducers. React only renders `dcbMenu`. Do not use `<input>` or `window.prompt`.

If T02-21 `FORBIDDEN_DCB_CELLS` includes `SHIFT`, change it this ticket (otherwise MAIN SHIFT cannot ship).

## Acceptance criteria

- [ ] **AC1 —** Given MAIN, when SHIFT is clicked, then AUX is shown and MAIN cells are gone. SHIFT on AUX returns MAIN.
- [ ] **AC2 —** Given MAPS (or any open submenu), when DONE or Esc, then menu is MAIN. Esc does not type into the command line (`preventDefault`).
- [ ] **AC3 —** Spinner reducer: arm → step(+1/−1) → commit; second Esc while armed disarms without a second mutation. Unit test, no canvas.
- [ ] **AC4 —** Disabled VOL cell is in the DOM, `disabled` / `aria-disabled`, click is a no-op.
- [ ] **AC5 —** Existing RANGE/MAPS/RR/LDR/FILTER/PTL/HIST/PLACE CNTR still mutate the same `src/scope` functions (adapt tests; no Command IR).
- [ ] **AC6 —** `DAL123 H270` still parses. No `command.accepted` from DCB.
- [ ] **AC7 — Research:** comments say DCB MAIN/AUX/SHIFT analog + trainer subset; UI copy is SHIFT/DONE/MAIN/AUX, not toolbar/modal.

## Test plan

- Unit: menu transitions; spinner arm/step/commit; disabled no-op.
- Integration: DCB markup contains SHIFT; MAPS still toggles catalog maps; radio heading still works.
- Manual: none required this ticket.

## Suggested files

- `src/scope/dcbMenu.ts` (new)
- `src/scope/dcbMenu.test.ts`
- `src/scope/scopeView.ts`
- `src/scope/dcbFunctions.ts`
- `src/ui/DisplayControlBar.tsx`
- `src/ui/DisplayControlBar.test.ts`
- `src/ui/tcwVisualAcceptance.test.ts` (SHIFT grep)
- `src/ui/ScopeHelpOverlay.tsx`
