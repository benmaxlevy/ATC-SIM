# T02-83 DCB Controls and SSA Weather Acceptance

**Phase:** 02 Scope
**Priority:** P0
**Size:** S
**Depends on:** T02-81, T02-82
**Blocks:** None
**Launch:** Implement this ticket only after T02-81 and T02-82 are merged.

## Goal

Provide end-to-end automated integration tests for DCB `VOL`, `MODE FSL`, `BRITE BKC`, and SSA `WX`/`WX HIST` telemetry, update documentation, and remove completed gaps from `phases/LATER-IMPLEMENTATION-BACKLOG.md`.

## Scope

- **Automated Integration Tests**:
  - Verify DCB `VOL` spinner modulates `caAlertTone` audio gain and respects mute (0%).
  - Verify DCB `MODE FSL` cycles `MODE F` -> `MODE S` -> `MODE L` and toggles datablock display mode across tracks.
  - Verify `BRITE BKC` spinner adjusts background contrast and canvas clear color.
  - Verify SSA `WX` and `WX HIST` rendering and `SSA FILTER` `WX` toggle visibility.
  - Verify `PREF` correctly persists and restores `vol`, `modeFsl`, and `brite.bkc`.
- **Backlog & Docs Sync**:
  - Update `phases/LATER-IMPLEMENTATION-BACKLOG.md` to reflect shipped DCB `VOL`, `MODE FSL`, `BRITE BKC`, and SSA `WX`/`WX HIST` controls.
  - Record any manual operator leftovers (e.g. visual contrast / audio listening pass).

## Acceptance criteria

- [ ] **AC1 —** Comprehensive automated integration test suite passes covering all new DCB and SSA controls.
- [ ] **AC2 —** `phases/LATER-IMPLEMENTATION-BACKLOG.md` is updated.
- [ ] **AC3 —** Entire test suite (`npm test` and `npm run ci`) passes with 0 failures.
