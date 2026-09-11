# T02-141 FDB Primary SPC Color

**Phase:** 02 Scope — datablock fidelity
**Priority:** P0
**Depends on:** T02-140

## Goal

Render primary Special Condition codes in FDB Field 0 with the manual’s alert
color while retaining yellow for caution indicators.

## Scope

- Paint primary SPCs (`EM`, `RF`, `HJ`, `LL`) red in FDB Field 0.
- Keep secondary caution indicators yellow.
- Add focused renderer coverage.

## Acceptance criteria

- FDB primary SPC text uses the safety-alert red palette.
- FDB caution text remains yellow.
- LDB, CA/MSAW, datablock geometry, and existing SPC text remain unchanged.

## Manual reference

TI 6191.409 Rev. 30, §2.12, p. 2-59; Figure 2-20, pp. 2-66–67.

