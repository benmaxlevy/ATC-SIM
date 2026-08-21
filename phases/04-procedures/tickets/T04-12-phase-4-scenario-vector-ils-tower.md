# T04-12 Phase 4 scenario: vector to ILS and land/hand off to tower stub

**Phase:** 04 Procedures
**Priority:** P0
**Size:** M
**Depends on:** T04-04, T04-06, T04-07, T04-09, T04-10
**Blocks:** phase exit
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A playable KDEM scenario proves the phase: spawn on DEMO ONE, vectors, intercept ILS 27, then **hand off to a tower stub and land** (despawn) **or** ride DA into the missed stub. CA or MSAW is visible in the same session via a second aircraft or the script’s setup. This is the phase 4 demo, not a new sim engine.

## Context

Phase 1 spawned 4–8 downwind arrivals. Replace or add a **phase 4 scenario** (`kdem-ils27` or a flag on KDEM) that starts at least one arrival on `DEM1` with VIA armed. Phase 2 ownership colors: tower stub reuses that, not NAS handoff. Glossary: radio vs scope — tower handoff is a **scope** control, not Command IR (unless you only use `GA` on the radio).

Training/entertainment label stays.

## Scope

- Scenario file: spawn DAL123 on DEM1 **north** (`transitionId: "N"`), before NEMAX, descend-via armed, speed 250, alt ≥ 10000. Second aircraft: prefer DEM1 **south** at SEMAX (same alt band) so CA is one vector away, **or** a low MSAW victim via typed `D10` — document one.
- Tower stub: when `lateral` is LOC/GS and along-track `<= 5 NM` (gate documented), show a control (keyboard key on the phase 2 overlay, e.g. documented `F3` was ownership stub — pick a key, e.g. **Shift+H** or a button “HO TWR”). Action: `lateral = LANDING`, `landingCleared = true`, ownership color = tower, event `handoff.tower`. **Not** a readback.
- LANDING: continue GS to threshold; when along-track `<= 0` and alt `<= 100` (or dist to RW27 `< 0.2 NM`), event `nav.landed`, remove aircraft from World (despawn). Do not start missed (T04-07 AC4).
- If the controller never hands off: existing missed stub at DA.
- Manual acceptance script in this ticket (below) plus a short in-repo `docs` or `phases/04-procedures/MANUAL.md` **only if** you need a file under this folder — prefer putting the script in this ticket and a `src/scenario/data/kdem-phase4.md` brief **only** if phase 5 won’t duplicate it. **Do not write files outside `phases/04-procedures/` and app source.** A `src/scenario/briefs/kdem-ils27.md` in the app is OK.
- Integration test (automated, not Manual): fixture World, force LOC+GS, set LANDING, step past threshold → aircraft gone + `nav.landed`. Second test: no LANDING → `nav.missed.started` at DA.
- Parser still used for the vector/APP flow; no new IR required for handoff.

## Out of scope

- Real tower frequency, two-person crew, ground movement.
- Phase 5 scoring UI (emitting events is enough).
- CIFP airports, wind (unless T04-11 already merged).
- CRDA dual runway.

## Implementation notes

Keep spawn positions in JSON, not code. STAR walker from T04-03 should run at start (VIA from T04-04).

Despawn: filter aircraft array; strips/datablocks must not throw on missing id.

Gate hysteresis: offer handoff from 5 NM to 1 NM; if they pass 1 NM without HO, they can still HO until DA.

If phase 2 `F3` already toggles ownership color, you may **reuse** it when the gate is active to mean tower HO; document the binding in the keyboard overlay. Do not invent a full NAS initiate/accept.

## Acceptance criteria

- [ ] **AC1 —** Given the phase 4 scenario, when loaded, then ≥1 aircraft is on `DEM1` (`PROCEDURE` or equivalent) with a VIA vertical mode, and ILS27 exists in the catalog.
- [ ] **AC2 —** Automated: LANDING + GS through threshold → `nav.landed` and aircraft removed; no `nav.missed.started`.
- [ ] **AC3 —** Automated: GS to DA without LANDING → `nav.missed.started`.
- [ ] **AC4 —** Manual script (below) completed once by the implementer: STAR → headings as needed → **full ILS clearance** (heading + maintain until established + cleared ILS 27) → loc then GS visible on Mode C → handoff → despawn **or** no handoff → missed. Second target demonstrates CA yellow/red **or** MSAW yellow/red.
- [ ] **AC5 —** Handoff control does not emit a pilot readback (scope pipeline). `handoff.tower` is on the session log.
- [ ] **AC6 —** `npm test` green; training/entertainment disclaimer still visible.

## Test plan

- Unit: none required beyond AC2–AC3 fixtures.
- Integration: AC2, AC3, scenario JSON parse.
- Manual: **Phase 4 playable slice**

  1. `npm run dev`, load KDEM phase 4 scenario. Confirm disclaimer.
  2. Identify the STAR arrival on the DEM1 video map. Confirm it does not bust NEMAX (Mode C ≥ 100, speed ≤ 250 until NEMAX).
  3. After MERGE / vectors, the **one** ILS clearance (typed `R240 A20 APP ILS27` if north of loc, or spoken: *turn right heading two four zero maintain two thousand until established cleared ils approach runway two seven*). Confirm readback includes **until established** and **cleared i l s**. Confirm turn to intercept heading. Confirm Mode C **holds ~2000 until loc**, then GS (Mode C leaves 2000 ~6 NM).
  4a. Inside 5 NM, tower stub → aircraft disappears at the field; log has `handoff.tower` and `nav.landed`.
  4b. (Repeat or second arrival) Do not HO → missed climb 270 / 3000.
  5. Create or use the second aircraft so CA lights yellow then red, **or** descend someone off-loc below MVA for MSAW.
  6. No console errors.  Pause/1x/2x still work.

## Suggested files

- `src/scenario/data/kdem-phase4.json` (or extend KDEM)
- `src/core/fms/landing.ts`
- `src/core/fms/landing.test.ts`
- `src/scope/towerHandoff.ts`
- `src/scope/keyboard` overlay update
- `src/scenario/briefs/kdem-ils27.md` (optional controller brief)
