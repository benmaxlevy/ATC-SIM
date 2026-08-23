# T02-30 DCB addendum visual acceptance

**Phase:** 02 Scope (post-exit addendum)
**Priority:** P0
**Size:** S
**Depends on:** T02-22, T02-23, T02-24, T02-25, T02-26, T02-27, T02-28, T02-29
**Blocks:** none (DCB addendum gate)
**Launch:** Implement this ticket only. Do not start other work.

## Goal

A human on Chrome Windows can say the DCB is a **cheap STARS DCB** (MAIN/AUX/submenus, disabled WX, local PREF), not a website toolbar. Automated greps/tests prove grammar. Phase 1 radio loop still works. **This ticket adds no features.**

## Context

T02-21 scored TCW polish (green cells, no HUD chrome) and forbade WX/PREF/SHIFT. T02-22–29 lifted those as **trainer chrome**. This script is the addendum gate. CRC is grammar, not pixels.

## Research

Re-read **R07** DCB, **R12** (what not to look like), `phases/_shared/references.md` required vs forbidden words.

- Fail: HTML toolbar, `<input>`, Apply, zoom-to-cursor, OSM, weather mosaic, CRDA/FMA cells, STARS `.ttf`.
- Pass: green cells, SHIFT MAIN/AUX, disabled WX, PREF 1–8, FILTER still altitude, `DAL123 H270` still radio.

## Scope

- Add a script (below) to this ticket and a thin automated stand-in `dcbAddendumAcceptance.test.ts` (or extend `tcwVisualAcceptance.test.ts`).
- Re-run `npm test`. Do not add DCB features.
- Manual AC skip-with-reason if no visual operator — do **not** invent a visual pass.

### Script (order)

1. Boot: dark PPI, green DCB on the glass, no tutorial footer.
2. MAIN: RANGE spinner (presets only), PLACE CNTR / OFF CNTR, RR / PLACE RR / RR CNTR, map 1–6, disabled WX1–4, FILTER, SHIFT, PREF, SSA FILTER, GI TEXT, MODE/SITE disabled if present.
3. SHIFT → AUX: VOL disabled, HISTORY spinner, DCB TOP/LEFT/RIGHT/BOTTOM, PTL length / OWN / ALL, TPA/ATPA. SHIFT back.
4. MAPS submenu: 1–30, CLR ALL, GEO/CURRENT, DONE/Esc.
5. BRITE / CHAR SIZE submenus: at least one wired channel each; WX/WXC/BKC disabled or inert.
6. PREF: SAVE / DEFAULT does not prompt a browser dialog.
7. Dock LEFT: PPI still north-up; range circle not covered by the bar.
8. WX cells do not paint weather. No OSM.
9. Radio: `DAL123 H270` → readback + turn. DCB clicks → **zero** extra readbacks.
10. Feel: cheap STARS DCB / vice, not a web settings ribbon.

## Out of scope

- New features, CRC pixel match, weather, CRDA, STARS font, phase 5.

## Acceptance criteria

- [ ] **AC1 —** Manual: script 1–10 on Chrome Windows. skip-with-reason allowed; do not invent a pass.
- [ ] **AC2 —** `npm test` green; Command IR types unchanged vs phase 1.
- [ ] **AC3 —** DCB/scope clicks produce zero extra `command.accepted` until a radio submit.
- [ ] **AC4 —** Grep: DCB has SHIFT, PREF, WX; WX buttons disabled; no CSA/CRDA/FMA/OSM cells; no STARS `.ttf`; no `<input>` / Apply in DCB.
- [ ] **AC5 — Research:** no zoom/label/sprite/OSM/HUD in persistent chrome copy.

## Notes

T02-21 historical freeze (no SHIFT/PREF/WX) is **amended** by T02-22–29. Do not re-fail T02-21 greps that were already updated. This ticket only confirms the addendum grammar.

## Test plan

- Unit/grep: `dcbAddendumAcceptance.test.ts` (or extended tcw file).
- Integration: heading-command + DCB routing (no extra accept).
- Manual: script 1–10.

## Suggested files

- `src/ui/dcbAddendumAcceptance.test.ts` (new) or `src/ui/tcwVisualAcceptance.test.ts`
- `phases/02-scope/README.md` (tick addendum checklist items you actually proved; leave manual boxes skip-with-reason)
