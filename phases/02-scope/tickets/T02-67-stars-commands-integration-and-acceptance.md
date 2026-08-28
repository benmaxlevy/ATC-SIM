# T02-67 STARS Keyboard Commands Integration & Acceptance

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-61, T02-62, T02-63, T02-64, T02-65, T02-66
**Blocks:** None
**Launch:** Implement this ticket only after T02-61 through T02-66 are merged.

## Goal

Provide the capstone integration test suite and acceptance verification for the complete STARS keyboard command pipeline (T02-61–66), proving end-to-end correctness across buffer parsing, system list toggling and relocation, video map toggling, scope manipulation, altitude filter controls, target tracking, datablock modes, invalid command handling, and strict focus isolation from the radio command line.

## Context

This is the integration verification ticket for the Seventeenth Swarm (STARS Keyboard Commands & Preview Area Expansion). It ensures that all 15 sections of the vNAS CRC STARS command set operate smoothly on a live `ScopeView` and `World` instance without regressions to existing simulation subsystems.

## Research

- **Analog:** CRC STARS Command Reference (docs.virtualnas.net/crc/stars — R07).
- **Glossary:** Full STARS Command Matrix, Live Preview Execution, Focus Isolation, Regression Guard.
- **Trainer delta:** Unified test suite in `src/scope/starsCommands.integration.test.ts` and `src/ui/starsCommandsAcceptance.test.ts`.

## Scope

- Create `src/scope/starsCommands.integration.test.ts`:
  - Test command sequences: list toggling (`*T`, `*TV`, `*P1`), line resizing (`*T 15`), and relocation clicks (`*S [Click]`).
  - Test video map toggling by slot (`*D 1`), ID (`*D LOC27`), and bulk commands (`*D ALL`, `*D NONE`).
  - Test scope centering (`*C [Click]`, `*OFF`), range rings (`*RR 5`, `*RR C [Click]`, `*RR OFF`), PTL duration (`*PTL 3`), and history dots (`*HIST 4`).
  - Test altitude filter readout (`*F`) and limits (`*LA 000 150`).
  - Test beacon code additions (`*BCN 45`) and removals (`*BCN DEL 45`).
  - Test tracking initiation (`+ [Click]`), drop (`/ [Click]`), and handoff accept (`Enter [Click]`).
  - Test datablock toggles (`/ [Click DB]`) and leader lines (`* 3 [Click DB]`, `* 0 [Click DB]`).
  - Test error handling: ensure invalid syntax (e.g. `*XYZ`, `*T 999`, `*D 99`) triggers `<buffer> INV` flash and no state mutation.
- Create UI acceptance test in `src/ui/starsCommandsAcceptance.test.ts`:
  - Verify `<Tab>` toggling between scope and radio command line.
  - Verify typing in `#command-line-input` never mutates `ScopeView.preview`.
  - Verify scope-focus typing never inserts text into `#command-line-input`.
- Update `phases/LATER-IMPLEMENTATION-BACKLOG.md` ensuring all deferred features are cleanly cited.

## Acceptance criteria

- [ ] **AC1 —** All valid STARS commands execute correctly against real `ScopeView` and `World` state in integration tests.
- [ ] **AC2 —** Invalid command strings produce `<buffer> INV` rejection flash and do not corrupt display state.
- [ ] **AC3 —** Focus cycling via `<Tab>` preserves strict isolation between scope commands and radio commands.
- [ ] **AC4 —** Full test suite (`npm test`) passes with 100% green status across all test suites.
- [ ] **AC5 —** `phases/LATER-IMPLEMENTATION-BACKLOG.md` accurately documents all unmodeled/deferred command sets.

## Test plan

- Integration: `src/scope/starsCommands.integration.test.ts`
- UI Acceptance: `src/ui/starsCommandsAcceptance.test.ts`
- Full regression: `npm test`

## Suggested files

- `src/scope/starsCommands.integration.test.ts`
- `src/ui/starsCommandsAcceptance.test.ts`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
