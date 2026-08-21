# T02-21 TCW visual acceptance script

**Phase:** 02 Scope
**Priority:** P0
**Size:** S
**Depends on:** T02-14, T02-15, T02-16, T02-17, T02-18, T02-19, T02-20
**Blocks:** none (phase-2 polish gate)
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A human on Chrome Windows can honestly say the workstation looks like a **cheap STARS trainer / vice-like TCW**, not a web app sitting on a radar. Phase 1 radio loop still works. This ticket adds no features.

## Context

T02-13 scored “terminal radar, not a game map” and was skip-with-reason. This script is the **polish gate** after DCB cells, chrome removal, symbols, SSA, and MAPS.

CRC/vice are **grammar** references. Do not fail on pixel mismatch with a NY STARS screenshot. Fail on: HTML toolbar DCB, disclaimer banner, zoom-to-cursor, OSM, airplane sprites, spoken-English-only command line, rainbow palette, red alerts.

## Research

Re-read `phases/_shared/references.md` required vs forbidden words, **R07**, **R08**, **R12**.

- Fail if chrome says zoom / label / sprite / OSM / HUD.
- Pass if a controller would say “cheap STARS trainer.”

## Scope

- Add nothing except a one-line F1 pointer if missing.
- Run the script against `npm run dev`. Re-run `npm test`.
- Record skip-with-reason only for GPU FPS (T02-12); do not skip the visual grammar items if a human is present.

### Script (order)

1. Boot: dark PPI, DCB **green cells** flush to the top, no disclaimer banner, no tutorial footer.
2. Not a game map: wheel changes **range** presets; center does not chase the cursor.
3. MAPS: numbered maps; coast/downwind/class B visible when on; rings dimmer than maps.
4. Targets: position symbol + letter stub; history dots readable; not airplane icons.
5. FDB: callsign + Mode C/GS (+ extra line from T02-19); leaders L1–L9.
6. FILTER / PTL / HIST from DCB cells; no `<input Apply>`.
7. F3/F4 colors; F3 does not read back.
8. SSA top-left: time, KDEM altimeter stub, FILTER, RANGE; list on glass not a right “FLIGHT STRIPS” dock.
9. Radio: command strip, `DAL123 H270` → readback + right turn. Scope cells produced **zero** extra readbacks.
10. Feel: cheap TCW / vice, not a moving map with labels.

## Out of scope

- New features, CRC pixel diffs, voice, ILS capture, weather, STARS font.

## Acceptance criteria

- [ ] **AC1 —** Manual: script 1–10 pass on Chrome Windows.
- [x] **AC2 —** `npm test` green; Command IR types unchanged vs phase 1.
- [x] **AC3 —** Scope/DCB during the script produced zero extra readbacks (only radio-focus).
- [x] **AC4 —** T00-01 disclaimer still reachable (F1 or first-run).
- [x] **AC5 — Research:** no zoom/label/sprite/OSM in chrome.

## Notes

AC1 skip-with-reason: no visual operator; human not watching Chrome. Live Windows Chrome script 1–10 was not run. Do not invent a visual pass or a “cheap STARS trainer” sign-off. T02-12 GPU FPS remains unsigned skip-with-reason.

AC2–AC5 automated: `src/ui/tcwVisualAcceptance.test.ts` plus existing heading-command, `scopeKeys.routing.test.ts`, DCB routing, F1 overlay / first-run disclaimer, and chrome greps. Command IR still six `Command` fields and 11 `INSTRUCTION_TYPES` (no `parseStage` in `types.ts`). `DAL123 H270` still accepts. DCB/scope mutations leave the session log empty until radio submit. T00-01 copy is first-run and in F1. Persistent chrome aria/placeholder/visible text has no zoom/label/sprite/OSM/HUD; DCB has no WX/PREF/SHIFT/CSA/CRDA/FMA cells; font stack is IBM Plex Mono / system mono.

F1 pointer: `HELP_KEYS_POINTER` already exists from T02-13. T02-15 keeps it off the glass (no tutorial footer). Overlay itself is F1.

## Test plan

- Unit: `src/ui/tcwVisualAcceptance.test.ts` (Command IR freeze, chrome greps, F1/first-run disclaimer).
- Integration: heading-command + DCB/scope routing (zero extra `command.accepted` until `DAL123 H270`).
- Manual: script 1–10. skip-with-reason this run (no visual operator).

## Suggested files

- `src/ui/tcwVisualAcceptance.test.ts`
- `phases/02-scope/README.md` polish checklist
