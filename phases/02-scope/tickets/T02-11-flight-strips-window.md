# T02-11 Flight strips window

**Phase:** 02 Scope
**Priority:** P1
**Size:** M
**Depends on:** T01-02, T01-11
**Blocks:** T02-13
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A right-dock **flight-strip bay** lists each aircraft’s callsign and assigned heading/altitude/speed from `World` intent. Clicking a strip selects the same track as the PPI. It is not FDIO/ERAM and not a second radar.

## Context

`phases/_shared/architecture.md`: `src/ui` owns strips. Intent lives on the aircraft (T01-02); the pilot agent is the only radio writer. Strips are a **view**. They ignore altitude filter (always list everyone). May start after T02-01 in parallel with maps.

## Research

Read **R02** (flight progress strip), **R08** (vice flight-strip window), **R07** if CRC documents strips.

- Search: `FAA flight progress strip TRACON` and `vice flight strips STARS`
- **Terms:** **flight strip** / **strip bay**. Not cards, tickets, aircraft list, sidebar.
- This is a trainer strip (assigned heading/alt/speed), not FDIO/vStrips/ERAM. Comment that.

## Scope

- Dock ~240 px wide, full height minus command line, dark `#0A0A0A`, scroll if > viewport.
- One strip per aircraft, top-to-bottom stable sort: **callsign lexicographic** (document; do not reshuffle every frame by position).
- Fields, monospace, one or two lines:

```
DAL123
H270  A030  S210
```

Use **assigned** heading/altitude/speed (intent), not instantaneous Mode C / GS. Altitude in hundreds to match datablocks (`A030`). Heading three digits. If intent heading is null (should not be after spawn), show `H---` .

- Selected strip: yellow left border or yellow outline (`#FFFF00`), not a bright game highlight.
- Click strip → select track (shared selection id with PPI). Selected PPI target and strip stay in sync.
- Collapse control: `[` strips `]` or a `STRIPS` button hiding the dock (PPI expands). Keyboard for collapse is optional; mouse is enough.
- Do not edit intent from the strip (no click-to-type altitude).
- Owned/unowned color: callsign text may follow T02-08 ownership if that ticket has landed; if not, white is OK and T02-08 can tint later — **if T02-08 is already done, use ownership color for the callsign**.
- Empty bay message if zero aircraft.

## Out of scope

- Paper-strip tear/flick animations, scratchpad, sequence numbers, departure vs arrival bays, drag reorder, printing, FDIO, amending flight plans, second position.

## Implementation notes

Subscribe to `World` the same way the command line does. Do not copy intent into strip-local state except for render.

Strip click must `preventDefault` focus issues: set selection then focus PPI so the next `L` chord works.

## Acceptance criteria

- [x] **AC1 —** Given 6 spawned arrivals, 6 strips show the correct callsigns.
- [x] **AC2 —** After `DAL123 C50` (climb 5000) is accepted, that strip’s altitude field becomes `A050` even before Mode C arrives.
- [x] **AC3 —** Clicking strip `DAL123` selects that track on the PPI (selection box / yellow accent).
- [x] **AC4 —** Clicking a PPI target highlights the matching strip.
- [x] **AC5 —** Filter hiding a datablock does **not** remove the strip.
- [x] **AC6 —** Strips do not emit Command IR when clicked.
- [ ] **AC7 —** Dock can be collapsed and expanded; PPI still renders. **Manual.**
- [x] **AC8 —** Sort is stable by callsign while aircraft move (no flicker reorder). Automated if the sort function is extracted.
- [x] **AC9 — Research:** Window title or heading is **strips** / **flight strips**, not “aircraft list.” Comment cites PCG strip analog.

## Test plan

- Unit: strip view-model from aircraft intent; sort.
- Integration: click → selection id.
- Manual: collapse; 2x sim; assigned vs Mode C diverge during climb.

## Suggested files

- `src/ui/FlightStrips.tsx`
- `src/ui/flightStripModel.ts`
- `src/ui/flightStripModel.test.ts`
- `src/ui/AppShell.tsx` (or T00-10 shell)
