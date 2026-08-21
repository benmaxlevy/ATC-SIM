# T01-14 Phase 1 playable slice (manual script)

**Phase:** 01 Closed loop
**Priority:** P0
**Size:** S
**Depends on:** T01-09, T01-10, T01-11, T01-12, T01-13
**Blocks:** Phase 2 start (human gate)
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A human can play the Phase 1 product and tick the phase-exit checklist. This ticket is the **manual script** plus any last-meter wiring (boot, HUD labels) — not a new subsystem. If gaps appear, fix only glue; do not start Phase 2 features.

## Context

Phase README **Phase exit** and `phases/README.md`: “Type a heading, hear/see a readback, aircraft turns.” Phase 1 **sees** the readback (no TTS).

Out of scope for the whole phase: maps, datablocks, voice, ILS flying, alerts.

## Scope

- Confirm `npm test` includes parser, kinematics, pilot, and T01-13.
- Confirm `npm run dev` boots KDEM with 6 arrivals on the PPI.
- Run the manual script below and fix glue bugs (focus, z-index, canvas size, command line covering ticks, spawn not called, rAF not started).
- Add a one-line HUD hint if missing: `type DAL123 H270` or `click then H270` — **optional**, do not build a tutorial system.
- Keep disclaimer visible.
- Do **not** add maps, datablocks, ASR, or approach flying to “look done.”

## Out of scope

- Phase 2–5 tickets.
- Recording a trailer, CI screenshots (unless Phase 0 CI already has Playwright — do not add Playwright here).
- Tuning turn rate away from 3 deg/s.

## Implementation notes

Manual script (copy into the PR description or a `PLAYTEST.md` **only if** you need it; prefer not adding extra markdown — this ticket **is** the script).

If something fails, the implementing agent fixes code to make the script pass, then re-runs.

Suggested last-meter checks:

- Canvas `resize` on window resize.
- Command line not covering `DAL123` (traffic is east/right; command line is bottom — OK).
- `user-select` / canvas cursor `crosshair` optional.

## Acceptance criteria

All **Manual** unless noted.

- [ ] **AC1 — Automated:** `npm test` green; T01-13 ran.
- [ ] **AC2 — Manual:** `npm run dev`, no console errors on load.
- [ ] **AC3 — Manual:** 6 ticks + callsigns visible, including `DAL123`; range rings visible; north-up (eastbound-ish traffic moves toward the **right**).
- [ ] **AC4 — Manual:** Type `DAL123 H270`, Enter. Readback text appears (callsign telephony + heading two seven zero).
- [ ] **AC5 — Manual:** Within ~2 seconds wall time at 1×, `DAL123` **starts a right turn** toward 270 (from heading 100: motion picks up a south component on the north-up PPI). Do not wait for roll-out on 270.
- [ ] **AC6 — Manual:** Reload. Click `DAL123`, type `H270`, Enter. Same as AC4–AC5.
- [ ] **AC7 — Manual:** Pause freezes tracks; 2× is visibly faster than 1×; command line can still type letters/digits when focused.
- [ ] **AC8 — Manual:** A reject (`ZZZ1 H270` or click-off then `H270`) shows `unable`; nobody else takes the turn.
- [ ] **AC9 — Manual:** No maps/datablocks/voice. Disclaimer still visible.

## Test plan

- Unit: none
- Integration: already T01-13
- Manual: AC2–AC9 in order on a desktop Chrome or Edge window. Record pass/fail in the implementation summary (not a new phase doc unless asked).

## Suggested files

- Glue only: `src/main.ts`, `src/ui/*`, `src/scope/ppi.ts` as needed
- Do not add application features beyond the script
