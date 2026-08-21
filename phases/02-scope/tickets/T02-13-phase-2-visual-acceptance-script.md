# T02-13 Phase 2 visual acceptance script

**Phase:** 02 Scope
**Priority:** P0
**Size:** S
**Depends on:** T02-01, T02-02, T02-03, T02-04, T02-05, T02-06, T02-07, T02-08, T02-09, T02-10, T02-11, T02-12
**Blocks:** none (phase 2 exit)
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A human (or implementation agent with a browser) walks a **fixed script** and can honestly say the workstation looks like a **terminal radar**, not a game map. Phase 1 radio loop still works. This ticket is the phase-2 gate; it does not add features.

## Context

Phase README exit checklist and frozen visual grammar. CRC/vice are references — **do not** fail the script because a pixel does not match a CRC screenshot. Fail if range is a cursor-zoom, if the palette is rainbow, if maps are OSM, if scope keys produce readbacks, or if datablocks are floating game labels.

All ACs are **Manual** except where a regression test already exists from earlier tickets (re-run `npm test`).

## Research

Re-read `phases/_shared/references.md` **Required vs forbidden words** and **R12**. During the script, fail the run if any chrome says zoom / label / sprite / OSM.

- Open CRC STARS (**R07**) and vice (**R08**) in another window **only** to judge *grammar* (dark PPI, FDB, leaders, rings, feather).
- Search: `STARS TCW screenshot` is optional; do not pixel-match.

## Scope

- Add nothing to the product except, if missing, a one-line **in-app** pointer: F1 lists keys (T02-09). Do not write a second markdown guide in `docs/`.
- Execute the script below against `npm run dev`.
- Confirm training/entertainment disclaimer from T00-01 still visible.
- Confirm `npm test` green.

### Script (run in order)

1. **Boot.** Dark full-viewport shell. Disclaimer visible. Command line at bottom. PPI black, not gray-white. No console errors.
2. **Not a game map.** No zoom-to-cursor: park the mouse in a corner, wheel up/down — center stays put; range readout steps 5–60 presets only. No rotation. North-up (feather east of rwy 27).
3. **Maps.** At 20 NM: runway 27, loc feather ~10 NM east, rings at 5 NM steps, optional coastline polyline. Palette green on black. Toggle RING off via DCB-lite; rings vanish.
4. **Targets.** Square symbols, history dots behind the path when HIST on. Not airplane icons.
5. **Datablocks.** Two-line monospace: callsign; hundreds + GS. Issue `C30` to an aircraft at higher altitude; assigned hundreds appear when ≥100 ft different. `T` (scope focus) → limited (no callsign).
6. **Leaders.** Scope focus, `L` `6` on selected: line east. `L` `5`: overlay. Radio focus: `L090` readback + left turn, leaders unchanged.
7. **Filter.** Set 070–080 (keys or DCB). Traffic outside loses datablock but keeps symbol.
8. **PTL.** F7 or DCB: 1 min line along heading. Off by default until toggled.
9. **Ownership.** Unowned white. Select, F3 → green. F4 → white. Yellow selection box. **No red.** F3 does not speak a readback.
10. **Help.** F1: overlay, `TRAINER KEYS — NOT CRC`, sim still moving.
11. **Strips.** Right dock: assigned H/A/S; click selects; filter does not remove strips.
12. **Radio still king.** Click command line, `DAL123 H270` (valid spawn callsign): text readback, target turns within 2 s sim. Scope never generated that readback.
13. **Budget.** Opt-in 30 traffic (`?traffic=30` or equivalent). Note FPS from T02-12. Default scenario still 4–8 after reload without the flag.
14. **Feel check (subjective but blocking).** If a VATSIM controller would say “that’s a moving map with labels,” **fail** and list the tell (zoom-to-cursor, bright HUD, proportional font, OSM, airplane sprites). If they would say “cheap STARS trainer,” **pass**.

## Out of scope

- New features, screenshot golden files, CRC pixel diffs, voice (phase 3), ILS capture (phase 4).

## Implementation notes

Implementers should tick the ACs in this file (or report them) as they run the script. Fix regressions in the owning ticket’s module; do not patch in a one-off “acceptance-only” hack.

## Acceptance criteria

- [ ] **AC1 —** Manual: script steps 1–12 all pass on Chrome Windows.
- [ ] **AC2 —** Manual: step 13 recorded (30-target FPS or skip-with-reason if hardware unavailable; then AC4 from T02-12 must already be signed by someone with an iGPU).
- [ ] **AC3 —** Manual: step 14 pass (terminal radar, not game map).
- [x] **AC4 —** `npm test` green; Command IR types unchanged vs phase 1.
- [ ] **AC5 —** Scope keys during the script produced **zero** extra readbacks (only radio-focus commands did).
- [ ] **AC6 —** Disclaimer still visible; app still labeled training/entertainment.
- [ ] **AC7 —** Phase README exit checklist can be ticked green.
- [ ] **AC8 — Research:** During the script, no chrome uses zoom / label / sprite / OSM. Grammar matches CRC/vice (dark PPI, FDB, leaders) without pixel-matching.

## Notes

AC4: `npm test` exit 0 (429 passed, 1 skipped). Re-ran `src/parse`, `src/core/kinematics.test.ts`, and `tests/integration/heading-command.test.ts` (49 passed). Command IR: `src/core/command/types.ts` last changed in T00-06; `fixtures.test.ts` still asserts the six frozen `Command` fields and 11 `INSTRUCTION_TYPES`.

Automated proof (do not treat as live Chrome): radio vs scope (`scopeKeys.routing.test.ts`, `scopeKeys.test.ts` — scope keys never `command.accepted` / `parseCommand`; radio-focus `L090` / `DAL123 H270` still parse); palette frozen hex, no red (`ownership.test.ts`, `renderScope.test.ts`); default spawn 6 in 4–8 (`spawn.test.ts`); 30-track CI budget (`renderScope.bench.test.ts`); keymap footer `TRAINER KEYS — NOT CRC` (`keymap.test.ts`, `ScopeHelpOverlay.test.ts`); disclaimer copy + shell mount (`disclaimer-copy.test.ts`, `submitCommand.test.ts`); forbidden chrome words (`DisplayControlBar.test.ts` AC9, `renderScope.test.ts` AC8/AC9).

Disclaimer vs DCB: CSS keeps `.disclaimer` as a flex sibling above `.ppi-column` / `.dcb-lite` (not `position: absolute` over the bar). No layout change. In-app pointer added: `F1 lists keys.`

AC1–AC3 / AC5–AC8 skip-with-reason: human asleep; no GPU/visual operator; live Chrome Windows script steps 1–14 were not watched. Do not invent a visual pass. T02-12 AC4 (Chrome iGPU p50 FPS) is also unsigned skip-with-reason, so AC2 cannot claim a GPU sign-off. Re-run `npm run dev` in Chrome at 1080p (optional `?traffic=30&debug=fps`) when a human is awake.

AC7 leftover: phase README items proven by tests are ticked; **T02-13 manual script sign-off stays unchecked.**

## Test plan

- Unit: none new (unless a trivial `keymap` completeness check failed — fix in T02-09).
- Integration: re-run parser + kinematics tests.
- Manual: this entire ticket.

## Suggested files

- None required. Optional: `src/ui` copy tweak if disclaimer was covered by the DCB. Prefer layout fix over deleting the disclaimer.
