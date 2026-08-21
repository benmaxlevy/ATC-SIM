# T01-11 Click select track

**Phase:** 01 Closed loop
**Priority:** P0
**Size:** S
**Depends on:** T01-10, T01-06, T01-09
**Blocks:** T01-14
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Clicking a tick selects that aircraft (`World.selectedAircraftId`). The PPI highlights it. The command line can then omit the callsign (`H270`). Click empty space clears selection. Radio commands still go through the pilot agent.

## Context

`phases/_shared/command-ir.md`: callsign optional if a track is selected.

Selection is a **scope** action: it must **not** produce a readback and must **not** change intent.

Phase exit path: click `DAL123` then type `H270`.

## Scope

- `canvasToWorld` inverse of T01-10 projection.
- On click: convert CSS pixel → NM; pick the nearest aircraft whose screen distance is ≤ **12 px** (or 1.0 NM, **whichever you document** — freeze **12 CSS pixels**).
- If one hit: `setSelectedAircraft(world, id)`.
- If none: `setSelectedAircraft(world, null)`.
- If two within the radius, pick the **nearest**.
- After click, **focus the command line** so the next keys are a radio command, not a lost focus.
- Highlight: already sketched in T01-10; must be obvious (thicker ring or yellow vs green).
- Do not issue IDENT or heading on click.
- Ignore clicks on the command line region (they should not clear selection unless the click is on the canvas).

## Out of scope

- Lasso, box select, keyboard cycle through tracks, CRC `F3` initiate.
- Datablock click vs tick click distinction (no datablocks).
- Touch/pinch (mouse click is enough; touch `click` is OK if the browser fires it).

## Implementation notes

Use CSS coordinates: `const rect = canvas.getBoundingClientRect(); const x = event.clientX - rect.left;` — not raw `offsetX` if you use DPR incorrectly.

Hit-test in **pixel space** so a 12 px radius is stable at 40 NM range.

```ts
export function pickAircraftAt(
  world: World,
  cssX: number,
  cssY: number,
  cam: Camera,
  cssWidth: number,
  cssHeight: number,
  radiusPx: number,
): Aircraft | null;
```

Unit-test `pickAircraftAt` with two aircraft far apart and a click on one.

`src/scope` may set `selectedAircraftId`. It must not set `intent`.

## Acceptance criteria

- [x] **AC1 —** `pickAircraftAt` unit test: aircraft at known NM; click its projected pixel selects it; click 40 px away returns null.
- [ ] **AC2 —** **Manual:** click `DAL123` tick → visual highlight; command line focused.
- [ ] **AC3 —** **Manual:** with DAL selected, type `H270` Enter → same accept/readback/turn as `DAL123 H270`.
- [ ] **AC4 —** **Manual:** click empty canvas → highlight gone; `H270` then `unable` (no selection).
- [x] **AC5 —** Click does not append a readback by itself (status line unchanged until Enter).
- [x] **AC6 —** No intent change on select (unit: heading assigned unchanged after `pick` + `setSelectedAircraft`).

## Test plan

- Unit: pick nearest / miss / two targets (nearest wins).
- Integration: none
- Manual: AC2–AC5 with `npm run dev`

## Suggested files

- `src/scope/pick.ts`
- `src/scope/pick.test.ts`
- `src/scope/ppi.ts` — click listener
- `src/ui/commandLine.ts` — `focus()` helper
