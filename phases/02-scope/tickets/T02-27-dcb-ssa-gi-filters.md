# T02-27 DCB SSA FILTER and GI TEXT FILTER

**Phase:** 02 Scope (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T02-22, T02-20
**Blocks:** T02-29
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

**SSA FILTER** toggles which **existing** SSA lines paint. **GI TEXT FILTER** toggles ten facility **GI** lines (general information) drawn with the SSA. No live METAR, no CRDA engine, no extra NAS fields that we do not already stub.

## Context

T02-20 SSA is a fixed block: time, `KDEM 29.92`, FILTER, RANGE, optional OFF CNTR, fused `OK`. CRC SSA FILTER hides individual SSA fields; GI TEXT is facility-configured lines (ATIS, runway in use). We author GI in scenario JSON, not a host download.

Altitude **FILTER** on MAIN (T02-16) stays the Mode C window. SSA FILTER is **visibility of SSA lines**, not the altitude window.

## Research

Read **R07** SSA / GI text. **R05** display data.

- Search: `STARS SSA FILTER GI TEXT DCB`
- **Terms:** **SSA**, **GI text**. Not HUD, caption, tooltip, METAR panel.
- Altimeter stays the T02-20 stub. Fused `OK` stays static.
- Comment: analog CRC SSA/GI filters; trainer stub fields + authored GI.

## Scope

- MAIN (or keep openers where T02-22 placed them): **SSA FILTER** and **GI TEXT** submenu openers. Submenus replace the bar; DONE/Esc → MAIN.
- **SSA FILTER** toggles, one cell per **existing** `buildSsaLines` field, plus only these optional stubs if you add the string to SSA (otherwise omit the cell):
  - TIME
  - ALTSTG (altimeter stub)
  - STATUS (`OK`)
  - RANGE
  - OFF CNTR (when panned; hiding the flag means do not draw `OFF CNTR`)
  - FILTER (the SSA filter readout line, not the DCB altitude chord)
  - PTL (optional SSA readout of PTL minutes once T02-25 exists; if PTL is not on SSA yet, add a one-line `PTL n.n` stub or skip the cell)
- Do **not** invent live CODES / SPC / QL / CON/CPL / CRDA lists. If you want chrome parity, a **disabled** CRDA cell is allowed. No CRDA logic.
- **GI TEXT:**
  - Scenario/facility JSON: `giTextLines: string[10]` (empty string = unused slot).
  - KDEM ships a few trainer lines (e.g. ATIS letter stub, RWY 27, approach in use) and the rest `""`.
  - Draw visible non-empty lines under SSA (or a GI column next to SSA), screen-fixed, map-green mono.
  - GI FILTER submenu: GI 1 … GI 10 toggles + DONE. Empty authored slots still show a disabled or inert cell.
- Default: all existing SSA lines on; all non-empty GI lines on.
- Clicks never emit Command IR. No live weather fetch.

## Out of scope

- Real METAR/ATIS download. CRDA, FMA, QL other facility. Editing GI at runtime (PREF may snapshot visibility in T02-29; not the strings).

## Implementation notes

Extend `SsaInput` with a visibility bitmask/object. `buildSsaLines` skips hidden fields. GI is a sibling builder `buildGiLines(lines, visible[])`. Keep canvas text (T02-20), not a web list widget.

## Acceptance criteria

- [ ] **AC1 —** SSA FILTER can hide TIME (or ALTSTG) so `buildSsaLines` omits that string; showing it again restores it.
- [ ] **AC2 —** Hiding STATUS omits `OK`; RANGE/FILTER lines still match camera/filter when visible.
- [ ] **AC3 —** KDEM JSON has 10 GI slots; at least two non-empty; GI FILTER hides a line on the PPI string list.
- [ ] **AC4 —** Empty GI slots cannot paint. No METAR HTTP. No Command IR.
- [ ] **AC5 —** Altitude DCB FILTER chord still works (T02-06/16). `DAL123 H270` still works.
- [ ] **AC6 — Research:** SSA/GI text comments; not HUD/METAR panel.

## Test plan

- Unit: `buildSsaLines` / `buildGiLines` with toggles.
- Integration: submenu markup; heading command.
- Manual: none required (T02-30).

## Suggested files

- `src/scope/ssa.ts`
- `src/scope/ssa.test.ts`
- `src/scope/scopeView.ts`
- `src/scope/dcbFunctions.ts`
- `src/ui/DisplayControlBar.tsx`
- `src/scenario/kdem.json` (or facility JSON next to video maps)
