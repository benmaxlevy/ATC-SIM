# T02-140 ATPA Predicted Alert Threshold and Color

**Phase:** 02 Scope — TPA / ATPA fidelity
**Priority:** P0
**Depends on:** T02-139

## Goal

Align implemented ATPA Alert behavior with the supplied STARS manual.

## Scope

- Promote a predicted in-trail violation within 24 seconds to `alert`.
- Preserve the 45-second Warning threshold and actual-separation Alert behavior.
- Give ATPA Alert graphics/readouts a distinct orange color from CA/MSAW red.
- Update focused tests and stale expectations.

## Acceptance criteria

- A predicted violation at 24 seconds or less returns `alert`.
- A predicted violation over 24 and through 45 seconds returns `warning`.
- ATPA Alert uses a distinct orange palette value; CA/MSAW remains red.
- Existing ATPA pairing, wake, readout, and cone tests remain green.

## Manual reference

TI 6191.409 Rev. 30, §6.21, pp. 6-158–160; §2.12, p. 2-59.

