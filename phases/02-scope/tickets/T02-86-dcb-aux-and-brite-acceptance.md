# T02-86 DCB AUX and BRITE Controls Integration and Acceptance

**Phase:** 02 Scope
**Priority:** P0
**Size:** S
**Depends on:** T02-84, T02-85
**Blocks:** None
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Provide comprehensive automated end-to-end integration and acceptance tests verifying all newly enabled DCB controls across AUX (`H_RATE`, `DWELL`, `CURSOR HOME`, `CSR SPD`) and BRITE (`CMP`, `BCN`), verify zero regressions across existing DCB/scope functionality, and update documentation.

## Context

T02-84 and T02-85 enable live interactive controls on the AUX DCB and BRITE submenu. This ticket validates the complete interaction loop, PREF serialization/deserialization, layout placement, keyboard/mouse interactions, and documentation consistency.

## Scope

- **End-to-end Automated Test Suite**:
  - Test AUX toolbar rendering and interactions: `H_RATE` spinner wheel and drag stepping, `DWELL` cycling and hover datablock brightening, `CURSOR HOME` toggle state, `CSR SPD` stepping.
  - Test BRITE submenu rendering and interactions: `CMP` and `BCN` spinners stepping 0–100%.
  - Test PREF save, restore, and default round-tripping across all newly enabled channels and controls.
- **Documentation & Backlog**:
  - Update `phases/02-scope/README.md` and `docs/USER.md` with descriptions of the new DCB controls.

## Out of scope

- New radar rendering engines or unrelated UI changes.

## Acceptance criteria

- [ ] **AC1 —** Automated integration test suite covers all new AUX and BRITE controls.
- [ ] **AC2 —** PREF serialization/deserialization round-trips all new parameters cleanly.
- [ ] **AC3 —** Full test suite (`npm test`) passes with zero failures or regressions.
- [ ] **AC4 —** Phase 2 documentation accurately describes all active DCB controls.

## Test plan

- Integration: `src/scope/test/dcbAuxAndBriteAcceptance.test.ts`.
- Full suite: `npm test`.
