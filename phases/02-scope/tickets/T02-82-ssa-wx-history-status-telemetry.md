# T02-82 SSA WX and WX HIST Status Telemetry

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-81
**Blocks:** T02-83
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Display live radar weather mosaic status, update timestamps, and history indicators in the SSA header, while supporting DCB SSA FILTER toggling.

## Context

In FAA STARS Status and System Advisory (SSA) displays:
- Weather mosaic radar status indicates whether live weather surveillance is active and the timestamp/age of the current NEXRAD composite (`WX: ON/OFF` or `WX <time>Z`, `WX HIST <age>M`).
- If weather radar mosaic data exceeds a staleness threshold (e.g. 15+ minutes old), the SSA displays a stale/warning indicator.
- The `SSA FILTER` submenu on the DCB contains a `WX` toggle allowing controllers to hide/show weather status in the SSA.

## Scope

- **SSA Weather Status Rendering**:
  - In `src/scope/ssa/`, render weather status on the designated SSA status row when weather is enabled.
  - Display current mosaic timestamp (e.g. `WX 1432Z` or `WX ON`) and age (`WX HIST 3M`).
  - Flag stale mosaic data (e.g. amber highlight or warning text if age exceeds 15 minutes).
- **SSA FILTER Integration**:
  - Connect `SSA FILTER` `WX` toggle to control visibility of SSA weather status fields without altering time or altimeter lines.
- **Graceful Fallback**:
  - When WX mosaic is disabled (`wxLevels` all off or mosaic not loaded), display clean `WX OFF` or omit the history indicator without throwing errors.

## Out of scope

- DCB `VOL`, `MODE FSL`, and `BRITE BKC` implementation (T02-81).
- Weather pilot steering / aircraft avoidance kinematics.
- Multi-feature acceptance (T02-83).

## Acceptance criteria

- [ ] **AC1 —** SSA renders weather status and `WX HIST` age when WX mosaic is active.
- [ ] **AC2 —** SSA displays stale warning when weather mosaic data exceeds 15 minutes.
- [ ] **AC3 —** DCB `SSA FILTER` `WX` toggle cleanly toggles SSA weather status visibility.
- [ ] **AC4 —** All tests pass with zero regressions across SSA and weather layers.
