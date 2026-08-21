# T02-10 Display control bar lite (range, maps, filter)

**Phase:** 02 Scope
**Priority:** P1
**Size:** M
**Depends on:** T02-01, T02-02, T02-06, T02-07
**Blocks:** T02-13
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A **lite display-control bar** above the PPI gives mouse access to range, map layers, altitude filter, PTL, and history. It is not a STARS DCB.

## Context

`phases/_shared/non-goals.md`: no full DCB, CRDA, FMA, preference sets. CRC DCB is two dense rows of multifunction buttons. We ship a thin dark toolbar that calls the **same functions** as the keyboard (single source of truth in `src/scope`).

Pad the drawable PPI so the bar does not cover the north edge of the range circle (T02-01 camera view size = canvas minus bar height).

History toggle lives on F8 from T02-03; expose it here too.

## Research

Read **R07** DCB, **R06** (feature names to *not* put on the bar: CRDA, weather).

- Search: `STARS DCB display control bar CRC MAPS BRITE RANGE`
- **Terms:** **DCB** in code comments; visible title `DCB` or unlabeled bar. Buttons: `RNG`, `MAPS`, `FILTER`, `PTL`, `HIST` — not Toolbar, Layers, Zoom.
- Comment: analog CRC DCB; lite subset only.

## Scope

- Bar ~28–36 px tall, full width of the PPI column, background `#111`, text `#9AA0A6`, monospace 12 px. No drop shadows, no rounded “game HUD” cards.
- Controls (left to right is a suggestion):
  - **RNG** readout + `−` / `+` buttons (same preset step as PageDown/PageUp).
  - **MAP** toggles: `RWY` `LOC` `RING` `CST` (coastline disabled/gray if JSON `enabled: false`).
  - **FIL** two numeric fields (hundreds) + Apply, or min–max inputs bound to `AltitudeFilter`.
  - **PTL** toggle (F7).
  - **HX** or **HIST** toggle (F8).
- Clicking a toggle must not steal focus in a way that makes the next letter go to the wrong place: after clicking a **button**, return focus to PPI. After editing filter **inputs**, Enter applies and blurs to PPI; Esc reverts the field.
- Range buttons fire the same `stepRange(±1)` as keys.
- Do **not** add MAPBRITE, CHARSIZE, SHIFT, CSA, CRDA, weather, center-on-DCB-then-click workflows beyond a **CTR** button that equals `Home`.
- Optional **CTR** = Home (airport). Optional **END** not required.
- Visible range number always matches camera.
- Accessibility: `aria-label` on buttons; not a 508 program, but labels help.

## Out of scope

- Full DCB layout clone, collapsible second row, brightness sliders, charsize, overlap with FMA, dragging the bar, dual-monitor.

## Implementation notes

React (or whatever T00-10 used) in `src/ui`. Import palette. Do not duplicate filter validation — call `altitudeFilter.ts`.

If the app is not React yet, vanilla DOM is fine; keep it in `src/ui`.

## Acceptance criteria

- [ ] **AC1 —** `+` / `−` step through the same 8 presets as PageUp/PageDown; readout shows `5`…`60`.
- [ ] **AC2 —** MAP toggles hide/show runway, loc, rings, coastline independently (coastline no-op/disabled if JSON off).
- [ ] **AC3 —** FIL fields apply the same predicate as the `F` chord; invalid max<min does not apply.
- [ ] **AC4 —** PTL and HIST buttons match `F7`/`F8` state (click on ≡ key toggle).
- [ ] **AC5 —** CTR (if present) or documented equivalent recenters airport; PPI drawable region is fully below the bar (no targets under the bar at center).
- [ ] **AC6 —** Bar is visually a dark terminal strip, not a colorful game HUD (no neon, no icons-only without text). **Manual.**
- [ ] **AC7 —** Using only the mouse (no keys), a tester can set range 10, turn rings off, set filter 050–100, enable PTL. **Manual.**
- [ ] **AC8 —** No Command IR from any bar click.
- [ ] **AC9 — Research:** Visible labels are RNG/MAPS/FILTER/PTL/HIST (or spelled glossary words), not Zoom/Layers/HUD.

## Test plan

- Unit: button handlers call shared camera/filter/ptl functions (mock).
- Integration: FIL apply validation.
- Manual: AC6–AC7, focus return after click.

## Suggested files

- `src/ui/DisplayControlBar.tsx`
- `src/ui/DisplayControlBar.test.ts`
- `src/ui/ScopeCanvas.tsx` (layout / padding)
- `src/scope/camera.ts` (reuse)
