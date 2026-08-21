# T02-16 DCB cell grid (visual grammar)

**Phase:** 02 Scope
**Priority:** P0
**Size:** L
**Depends on:** T02-10, T02-15
**Blocks:** T02-17
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The top of the PPI is a **STARS-like DCB**: a full-width **grid of green cells**, two text rows where needed, 1 px black gutters, dark green fill, bright green text. No browser buttons, no `Apply`, no HTML number inputs. Existing range / filter / PTL / HIST / center behavior still works.

## Context

T02-10 shipped **DCB-lite** on purpose (`#111` toolbar). That freeze is **amended** here for *visual grammar only*. `phases/_shared/non-goals.md` still forbids a **full** DCB (WX mosaic, PREF, SHIFT, CSA, CRDA, FMA, dual FSL). This is a trainer-safe subset that *looks* like a DCB.

T02-15 must already have moved the disclaimer off the bar.

## Research

Read **R07** DCB, **R06** (do not put weather / CRDA on the bar).

- Open: https://docs.virtualnas.net/crc/stars/ — DCB.
- Search: `STARS DCB RANGE MAPS BRITE LDR CRC`
- **Terms:** **DCB**, **RANGE**, **MAPS**, **FILTER**, **PTL**, **HIST**. Not toolbar, ribbon, HUD, zoom.
- Pressed = stipple / invert (analog `MODE FSL`), not a CSS chip.
- Comment: analog CRC DCB cells; lite function set.

## Scope

- Rebuild `DisplayControlBar` as equal-height **cells** flush to the top of the PPI (bar **on** the glass, not a separate grey flex sibling that looks like Chrome UI).
- Cell copy (this ticket; extra functions in T02-17):
  - **RANGE n** — click cycles the same 8 presets as PageUp/Down (not − / +). Optional split **OFF CNTR** can wait for T02-17 if timeboxed; prefer a second row on the same cell if pan offset ≠ 0.
  - **MAPS** — one cell that *opens* a submenu in T02-17; this ticket may keep RWY/LOC/CST/RING as **temporary cells** or a single MAPS latch. Do not keep `MAPS [−][+]`.
  - **FILTER** — cell shows `000-180` (hundreds). Click starts the same chord as scope-focus `F` (or a DCB digit entry overlay). **No** `<input type>` pair, no Apply.
  - **PTL** / **HIST** — latching cells, same as F7/F8.
  - **CTR** — Home (airport). May become PLACE CNTR in T02-17.
- Drop **FLIGHT STRIPS** from the DCB row (strips stay until T02-20).
- After a cell click, focus returns to the PPI (same as T02-10).
- Clicks never emit Command IR.
- Pad the drawable PPI so cells do not cover the north of the range circle (T02-01).

## Out of scope

- MAPS numbered submenu, RR interval, LDR DIR, CHAR SIZE, BRITE, PLACE CNTR click-to-place (T02-17).
- WX1–6, SITE FUSED, PREF, SHIFT, CSA, CRDA, FMA, dual FSL/EFSL, STARS font.

## Implementation notes

Single source of truth remains `src/scope` (`stepRange`, `togglePtlOn`, `tryApplyAltitudeFilterDigits`, …). Palette: dark green cells + `PALETTE.map` text, not `uiChrome` grey. Height ~2 rows of mono 11–12 px.

## Acceptance criteria

- [ ] **AC1 —** No `<input>` and no `Apply` in the DCB DOM.
- [ ] **AC2 —** RANGE click cycles 5–60 presets; readout is `RANGE n` (glossary **range**).
- [ ] **AC3 —** PTL / HIST cells match F7/F8 (existing tests adapted).
- [ ] **AC4 —** FILTER cell applies the same predicate as the `F` chord; invalid max&lt;min does not apply.
- [ ] **AC5 —** No `command.accepted` from DCB clicks.
- [ ] **AC6 —** Manual: cells look like a green DCB grid, not a website toolbar.
- [ ] **AC7 — Research:** Labels are RANGE/MAPS/FILTER/PTL/HIST, not Zoom/Layers.

## Test plan

- Unit: cell handlers call shared scope functions.
- Integration: filter validation; range presets.
- Manual: AC6 on Chrome 1080p.

## Suggested files

- `src/ui/DisplayControlBar.tsx`
- `src/ui/DisplayControlBar.test.ts`
- `src/index.css`
- `src/scope/scopeView.ts`
