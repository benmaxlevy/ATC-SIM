# T02-89 Compass Rose Integration and Acceptance

**Phase:** 02 Scope
**Priority:** P0
**Size:** S
**Depends on:** T02-87, T02-88
**Blocks:** None
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Provide comprehensive automated end-to-end integration and acceptance tests verifying the complete STARS Compass Rose overlay across geometry generation, map cache building, canvas rendering, `BRITE CMP` brightness modulation, `CHAR SIZE TOOLS` scaling, and PREF persistence, ensuring zero regressions across the codebase.

## Context

T02-87 and T02-88 introduce the complete Compass Rose navigation aid for heading vectoring on the STARS radar scope. This ticket validates the full rendering loop, brightness stepping, font size changes, PREF persistence, and updates project documentation.

## Scope

- **End-to-end Automated Test Suite**:
  - Test compass rose rendering: 72 radial tick marks (5° minor, 10° medium, 30° major), twelve 3-digit heading labels (`360`, `030`, `060`, `090`, `120`, `150`, `180`, `210`, `240`, `270`, `300`, `330`).
  - Test `BRITE CMP` modulation from 0% (OFF) to 100%.
  - Test `CHAR SIZE TOOLS` font sizing updates.
  - Test PREF slot serialization, storage, and restore.
- **Documentation & Backlog**:
  - Update `phases/02-scope/README.md` and `docs/USER.md`.

## Out of scope

- New unrelated UI elements or simulation mechanics.

## Acceptance criteria

- [ ] **AC1 —** Automated integration test suite covers all compass rose features and edge cases.
- [ ] **AC2 —** PREF serialization/deserialization round-trips all compass rose parameters cleanly.
- [ ] **AC3 —** Full test suite (`npm test`) passes with zero failures or regressions.
- [ ] **AC4 —** Phase 2 documentation accurately describes the Compass Rose overlay.

## Test plan

- Integration: `src/scope/test/compassRoseAcceptance.test.ts`.
- Full suite: `npm test`.
