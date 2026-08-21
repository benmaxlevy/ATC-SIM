# T02-20 SSA status and on-PPI lists

**Phase:** 02 Scope
**Priority:** P1
**Size:** L
**Depends on:** T02-11, T02-15, T02-06
**Blocks:** T02-21
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

**SSA-style** status lives **on the PPI** (top-left, map-green mono): sim time, altimeter stub, FILTER, range, OFF CNTR if panned, static `OK` fused stub. Flight-plan / strip data moves from the labeled right dock onto the glass (bottom-left or top-left list). Click still selects.

## Context

STARS puts SSA / FP / tower lists on the scope, not a CSS sidebar titled FLIGHT STRIPS. T02-11 stays the data model; this ticket changes **presentation**. T02-15 already removed trainer footer prose.

## Research

Read **R07** SSA / preview area, **R05** display data.

- Search: `STARS SSA altimeter filter CRC flight plan list`
- **Terms:** **SSA**, **FILTER**, **range**, **flight strip** (if the word remains in F1 only). Not sidebar, panel, widget.
- Altimeter is a **stub** (`KDEM 29.92`) — no METAR live feed.
- Fused `OK` is static trainer text, not Site/Fused radar.

## Scope

- Draw (canvas or overlay DOM with pointer-events carefully) a top-left block:
  - `HHMM/SS` or existing sim clock
  - `KDEM 29.92` (constant OK)
  - `FILTER xxx-yyy` hundreds (same as altitude filter)
  - `RANGE n` and `OFF CNTR` when center ≠ airport
  - `OK` (or `OK/OK/NA` stub) — not a live radar health system
- Replace the right **FLIGHT STRIPS** dock with an on-PPI list: callsign + assigned H/A/S (same fields as T02-11). Click row = select (T01-11). Altitude filter does **not** remove rows (T02-11 contract).
- Collapsible dock may remain as a trainer escape hatch **off** by default, or go away. Default view: no labeled right column.
- Do not cover the airport at 20 NM range (keep list in a corner; clip/overflow scroll if many tracks).
- No Command IR from clicks. F3/F4 still ownership only.

## Out of scope

- Real altimeters / weather. JFK tower list. Multi-facility. DCB SSA FILTER menus (optional later). Pref sets.

## Implementation notes

Prefer canvas text in `renderScope` for SSA so it pans with nothing (screen-fixed, not world-fixed). Strip list may be DOM positioned over the canvas; hit-test must not steal PPI empty-click deselect incorrectly.

## Acceptance criteria

- [ ] **AC1 —** SSA block unit-testable string builder includes FILTER hundreds and RANGE; OFF CNTR only when panned.
- [ ] **AC2 —** Default layout has no `FLIGHT STRIPS` header on the right (grep or DOM test).
- [ ] **AC3 —** Clicking a list row selects that callsign (adapt T02-11 tests).
- [ ] **AC4 —** Filter hides datablocks but list still shows all arrivals.
- [ ] **AC5 —** `DAL123 H270` still works. No Command IR from SSA.
- [ ] **AC6 — Research:** SSA/FILTER/range in comments; not HUD/sidebar.

## Test plan

- Unit: SSA lines from camera + filter.
- Integration: strip-model click select.
- Manual: 20 NM — lists readable, maps still visible.

## Suggested files

- `src/scope/ssa.ts` (new)
- `src/scope/renderScope.ts`
- `src/ui/FlightStrips.tsx`
- `src/ui/flightStripModel.ts`
- `src/ui/shell.tsx`
