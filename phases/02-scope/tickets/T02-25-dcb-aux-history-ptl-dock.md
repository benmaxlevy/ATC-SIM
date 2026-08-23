# T02-25 DCB aux HISTORY, PTL, and dock

**Phase:** 02 Scope (post-exit addendum)
**Priority:** P0
**Size:** L
**Depends on:** T02-22
**Blocks:** T02-28, T02-29
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

AUX is a real second bar: **VOL** disabled, **HISTORY** spinner (dot count), **DCB TOP / LEFT / RIGHT / BOTTOM**, **PTL** length spinner, **PTL OWN**, **PTL ALL**, **TPA/ATPA** opener stub, **SHIFT** back to MAIN. PPI padding follows the docked edge.

## Context

T02-03/07/16: history is on/off (5 dots / 5 s), PTL is global on/off at **1.0 min**. DCB is glued to the top of the PPI column. CRC AUX docks the bar and splits PTL own vs all. T02-22 already has AUX + disabled VOL.

## Research

Read **R07** DCB AUX / HISTORY / PTL / DCB position.

- Search: `STARS DCB AUX HISTORY PTL OWN PTL ALL DCB LEFT`
- **Terms:** **history**, **predicted track line (PTL)**, **DCB**. Not trail, velocity vector, toolbar dock.
- Comment: analog CRC AUX; trainer discrete history 0–5 and PTL minute steps.

## Scope

- **VOL** — keep disabled (OS audio). Do not hook WebAudio gain.
- **HISTORY** — spinner **0–5** dots (existing ring buffer size). 0 = off (same draw skip as `historyEnabled === false`). F8 / `H` still toggles: prefer 0 ↔ last non-zero (or 0 ↔ 5); document the pick and test it. Sample interval stays **5.0 s sim**.
- **DCB TOP / LEFT / RIGHT / BOTTOM** — actions/toggles; one dock at a time. LEFT/RIGHT are a **vertical** cell stack along that PPI edge. TOP/BOTTOM horizontal. Drawable PPI size = canvas minus DCB thickness on that edge (same contract as T02-01: range circle inscribed in remaining rect). SSA / strip list stay screen-fixed and must remain readable (do not cover airport at 20 NM).
- **PTL** length — spinner over a frozen minute set that includes **1.0** (T02-07 default), plus at least 0.5 and 2 (e.g. 0.5, 1, 2, 4). Straight GS line still; no turn curve. `ptlEndpoint(..., minutes)` already takes minutes — wire it.
- **PTL ALL** — toggle; when on, every in-filter track with GS gets a PTL (today’s global on).
- **PTL OWN** — toggle; when on, only **owned** (F3) tracks get PTLs. If both ALL and OWN are on, ALL wins (draw everyone). If both off, no PTLs (F7 should turn ALL on, matching today’s F7 global). Document F7 = toggle ALL (or toggle “any PTL”); keep F7 always-on.
- **TPA/ATPA** — submenu opener that may show a stub bar with **DONE** only until T02-28. Do not implement J-rings here.
- Moving PTL/HIST off MAIN: MAIN may drop HIST/PTL cells once AUX has them (CRC-like). If you drop them, F7/F8 still work. FILTER stays on MAIN.
- Clicks never emit Command IR. Focus returns to PPI.

## Out of scope

- TPA J-rings / ATPA cones (T02-28). PREF (T02-29). Real volume. Dual DCB. Touch layout.

## Implementation notes

`dcbDock: "TOP" | "BOTTOM" | "LEFT" | "RIGHT"` on `ScopeView`. `ScopeCanvas` / `PpiPlaceholder` must swap header/footer/aside. Vertical DCB: cell min height, two text rows still, 1 px gutters, same green grammar. Rebuild camera view size on dock change.

History: replace boolean with `historyDotCount: 0 | 1 | 2 | 3 | 4 | 5` (or keep boolean derived from count).

## Acceptance criteria

- [ ] **AC1 —** HISTORY spinner 0–5; 0 draws no dots; 5 matches current 5-dot buffer; F8 still toggles on/off as documented.
- [ ] **AC2 —** PTL length spinner changes `ptlEndpoint` distance (unit: 180 kt × 2 min → 6 NM).
- [ ] **AC3 —** PTL OWN draws only owned tracks; PTL ALL draws all in-filter tracks; both off draws none; F7 turns PTL ALL on if everything was off (or documented equivalent).
- [ ] **AC4 —** DCB LEFT/RIGHT/BOTTOM/TOP all render; camera view size shrinks on the docked edge (unit or layout test).
- [ ] **AC5 —** VOL remains disabled. TPA/ATPA opener opens a submenu with DONE (stub OK).
- [ ] **AC6 —** No Command IR. `DAL123 H270` still works.
- [ ] **AC7 — Research:** history/PTL/DCB in comments; not trail/HUD/dock panel.

## Test plan

- Unit: history count, PTL minutes, OWN vs ALL predicate, dock enum.
- Integration: layout class/style for LEFT vs TOP; F7/F8.
- Manual: none required (T02-30).

## Suggested files

- `src/ui/DisplayControlBar.tsx`
- `src/ui/ScopeCanvas.tsx`
- `src/scope/ppi-placeholder.tsx` (or current PPI host)
- `src/scope/ptl.ts`
- `src/scope/scopeView.ts`
- `src/scope/history.ts` / `targetSymbol.ts`
- `src/ui/index.css`
