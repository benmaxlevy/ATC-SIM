# T02-142 KDEM ATPA Status Bench

**Phase:** 02 Scope — TPA / ATPA acceptance
**Priority:** P0
**Depends on:** T02-140

## Goal

Make the committed KDEM ATPA scenario visibly exercise monitor, warning, and
alert cones at startup.

## Scope

- Adjust only authored KDEM ATPA arrival positions, speeds, and CWT categories.
- Preserve the existing wake matrix and ATPA volume adaptation.
- Assert all three statuses from the loaded scenario after `stepWorld(world, 0)`.

## Acceptance criteria

- The loaded KDEM ATPA scenario produces one monitor, one warning, and one
  alert ATPA pair at the initial world evaluation.
- The warning and alert pairs use wake-derived minima.
- Off-final arrivals remain outside the ATPA volume.

