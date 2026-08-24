# T02-33 DCB physical-replica visual acceptance

**Phase:** 02 Scope (post-exit visual-replica addendum)  
**Priority:** P0  
**Size:** S  
**Depends on:** T02-31, T02-32  
**Blocks:** none (physical-replica gate)  
**Launch:** Implement this ticket only. Do not add DCB features.

## Goal

On supported desktop Chrome, MAIN visibly reads as a compact two-row STARS-like DCB with physical caps, correct grouping, six inert WX caps, and no web-toolbar artifacts. Automated checks protect the structure; a human visual pass records the result honestly.

## Context

T02-30 checked the functional trainer addendum and deliberately did not require a pixel-oriented visual match. T02-31–32 supersede that limitation for MAIN's physical arrangement and cap treatment. This gate validates that limited replica scope without asserting that the trainer is a licensed or compatible STARS workstation.

## Research

Re-read **R07**, **R12**, T02-31, and T02-32.

- Search: `vNAS CRC STARS DCB MAIN`
- **Terms:** **DCB**, **MAIN**, **range**, **video map**, **leader**. Not ribbon, settings bar, or HUD.
- Comment: visual grammar is a trainer approximation of a physical DCB; it is not a pixel-perfect or proprietary STARS clone.

## Scope

- Add/update an automated DCB acceptance test that asserts the T02-31 descriptor's rows, columns, spans, six map bindings, six disabled WX cells, MODE FSL/SITE FUSED disabled semantics, and the T02-32 normal/pressed/disabled classes/tokens.
- Add this manual Chrome Windows script:
  1. At 1440×900, boot MAIN. Confirm a two-row compact DCB with separated raised dark-olive caps and off-white text.
  2. Read left-to-right: RANGE; PLACE CNTR/OFF CNTR; RR; PLACE RR/RR CNTR; MAPS; map matrix 1–6; WX1–WX6; BRITE; LDR DIR/LDR; CHAR SIZE; MODE FSL; PREF 22/27; SITE FUSED; SSA FILTER/GI TEXT FILTER; SHIFT.
  3. Confirm quick maps are 3 × 2 with solid surfaces—no neon stripes.
  4. Toggle an available map, arm a RANGE spinner, and pan off center. Confirm each uses the inset cap and an enabled label; disabled WX/MODE/SITE remain muted and inert.
  5. Open MAPS, BRITE, CHAR SIZE, PREF, SSA FILTER, and GI TEXT FILTER; DONE/Esc returns MAIN and the physical MAIN arrangement returns unchanged.
  6. At 804×900, confirm the DCB remains usable without hidden or overlapping physical caps. Record a layout limitation rather than silently shrinking/removing controls.
  7. Enter `DAL123 H270`; confirm the normal radio readback/turn and zero DCB-generated readbacks.
- Store screenshots only as untracked QA evidence unless the user explicitly asks to version an approved artifact.
- Update T02-30's acceptance reference to identify this ticket as the superseding physical-replica gate; do not rewrite its historical functional result.

## Out of scope

- New DCB actions, weather, STARS fonts/assets, an exact source-image pixel diff, other display menus, or changes to phase-2 PPI colors.

## Acceptance criteria

- [ ] **AC1 —** Automated test proves MAIN's two-row descriptor, 22-column visual sequence, four stacked pairs, 3 × 2 quick maps, and WX1–WX6/MODE/SITE disabled status.
- [ ] **AC2 —** Automated test proves normal, pressed, and disabled cap styles are distinguishable and quick maps have no raster/stripe background.
- [ ] **AC3 —** Chrome Windows manual script steps 1–7 are recorded pass or skip-with-reason; no visual pass is invented.
- [ ] **AC4 —** `npm test` is green; DCB clicks yield zero `command.accepted` events and `DAL123 H270` remains green.
- [ ] **AC5 — Research:** test/copy calls the product STARS-like and avoids claiming a STARS clone or FAA/STARS font.

## Test plan

- Unit/DOM: physical layout and style-token assertions.
- Integration: DCB routing plus heading command.
- Manual: Chrome Windows at 1440×900 and 804×900.

## Suggested files

- `src/ui/dcbPhysicalReplicaAcceptance.test.ts`
- `src/ui/DisplayControlBar.test.ts`
- `phases/02-scope/tickets/T02-30-dcb-addendum-visual-acceptance.md`
- `phases/02-scope/README.md`
