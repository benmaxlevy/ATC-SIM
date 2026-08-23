# T02-23 DCB main RANGE / CNTR / RR / LDR

**Phase:** 02 Scope (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T02-22
**Blocks:** T02-29
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

MAIN geometry matches CRC jobs: **RANGE** spinner, **PLACE CNTR**, **OFF CNTR** as its own action, **RR** spinner, **PLACE RR**, **RR CNTR**, **LDR DIR** spinner, **LDR** length spinner. Still discrete range presets. No zoom-to-cursor.

## Context

T02-17 packed RANGE+OFF CNTR into one cell, RR click-cycle (including OFF), LDR DIR as an L1–L9 submenu, and a single 36 px leader length (T02-19). CRC splits those jobs. T02-22 supplied spinner/menu primitives.

## Research

Read **R07** RANGE / PLACE CNTR / OFF CNTR / RR / PLACE RR / RR CNTR / LDR DIR / LDR.

- Search: `STARS DCB RANGE PLACE CNTR OFF CNTR PLACE RR LDR DIR`
- **Terms:** **range**, **center**, **range rings**, **leader**. Not zoom, pan tool, stem.
- Comment: analog CRC; trainer delta = 8 RANGE presets, RR intervals frozen, LDR length discrete px.

## Scope

- **RANGE** — spinner through the frozen presets **5, 10, 15, 20, 30, 40, 50, 60** NM (same as PageUp/Down / wheel). Arm + wheel; do not add 6/8/12/16/24. No continuous zoom.
- **PLACE CNTR** — action; next PPI click sets view center (existing T02-17 arm). Document in F1.
- **OFF CNTR** — own cell. Pressed/true when view center ≠ airport ref. Click **resets** center to airport (same as `Home`). Not merely a RANGE second line.
- **RR** — spinner through the frozen interval set (keep **2 / 5 / 10** NM unless you already have a documented extra). Rings stay generated circles. Independent **show/hide** may remain a wrap to OFF or a separate latch; document one. Prefer: interval spinner always on when rings visible; do not hide rings by cycling RR if you now have enough cells — hiding can stay a 0/OFF step if tests already depend on it.
- **PLACE RR** — action; next PPI click sets **range-ring origin** (world NM). Rings no longer stuck to airport only.
- **RR CNTR** — toggle/action: pressed when ring origin ≠ **view** center. Click snaps ring origin to the current view center.
- Default at session start: view center = airport, ring origin = airport (both coincide). Panning without PLACE RR leaves rings in world; RR CNTR lights when origins differ.
- **LDR DIR** — spinner 1–9 (same dirs as L1–L9 / scope-focus `L`+digit). Prefer spinner over opening nine cells. Radio-focus `L090` still a left turn.
- **LDR** length — spinner over a frozen discrete px set that includes **0** (overlay analog) and **36** (T02-19 default), plus at least one shorter and one longer (e.g. 0, 24, 36, 48). L5 / dir 5 still overlay (length 0) even if default length ≠ 0. Per-track dir from T02-05 stays; default length is scope-global unless you already store per-track length — do not invent rubber-banding.
- Amend T02-17 tests that assumed rings are airport-only and OFF CNTR is a RANGE subtitle.
- Clicks never emit Command IR.

## Out of scope

- MAPS 1–30 / WX (T02-24). Aux dock (T02-25). BRITE/CHAR submenus (T02-26). PREF (T02-29).
- CRC extra RANGE values. Zoom-to-cursor. Mouse-follow rings.

## Implementation notes

Store `rangeRingEastNm` / `rangeRingNorthNm` (or a `{ eastNm, northNm }`) on `ScopeView`. Rebuild map/ring cache when origin or interval changes. `isViewOffAirport` stays for OFF CNTR; add `isRangeRingOffViewCenter`.

## Acceptance criteria

- [ ] **AC1 —** RANGE spinner steps only the 8 frozen presets; readout `RANGE n`; PageUp/Down still match.
- [ ] **AC2 —** OFF CNTR cell is pressed iff view center ≠ airport; click recenters airport (`Home` equivalent).
- [ ] **AC3 —** PLACE CNTR then PPI click sets view center and disarms (existing helper).
- [ ] **AC4 —** PLACE RR then PPI click sets ring origin; rings draw about that point (unit test on radii origin, not pixels).
- [ ] **AC5 —** RR CNTR click sets ring origin = view center; pressed iff they differ.
- [ ] **AC6 —** LDR DIR spinner sets the same dirs as L1–L9; `L090` radio-focus still parses as a left turn.
- [ ] **AC7 —** LDR length spinner includes 0 and 36 px; default remains 36 unless dir is 5.
- [ ] **AC8 —** No Command IR from these cells.
- [ ] **AC9 — Research:** range/center/range rings/leader in comments; not zoom/layers.

## Test plan

- Unit: camera presets, off-center reset, ring origin vs view center, leader dir/length.
- Integration: `scopeKeys` routing; radio `L090`.
- Manual: none required.

## Suggested files

- `src/scope/dcbFunctions.ts`
- `src/scope/camera.ts`
- `src/scope/mapLayers.ts` (ring origin)
- `src/scope/leader.ts`
- `src/scope/scopeView.ts`
- `src/ui/DisplayControlBar.tsx`
- `src/ui/ScopeHelpOverlay.tsx`
