# T02-200 DCB spinner numeric keyboard entry state and routing

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** none  
**Blocks:** T02-201  
**Merge target:** `feature/sattelite-traffic`  
**Launch:** Implement this ticket only; stop at configured boundary.

## Mission

Allow typing numeric values on the keyboard/numeric keypad into selected DCB
adjustment (spinner) buttons, adhering to STARS TI 6191.409 §2.6 and command
sections. While an adjustment button is armed, digit keys buffer locally; Enter
commits the validated value and unarms; Escape/Clear reverts to the pre-adjustment
initial value without committing; Backspace edits the buffer.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Arm `RANGE`, type `120`, press `ENTER` | Set camera range to 120 NM | Camera range = 120; spinner disarms; cursor restored | Value < 6 or > adapted max (512 TCW) reverts without mutation | §2.6 p. 2-22; §4.4.1 p. 4-33 |
| Arm `RR`, type `10`, press `ENTER` | Set range ring spacing to 10 NM | `rrIntervalNm = 10`; spinner disarms | Value not in {2, 5, 10, 20} reverts without mutation | §6.1.1 p. 6-8 |
| Arm `LDR_LEN`, type `3`, press `ENTER` | Set leader line length to 3 | `leaderLength = 3`; spinner disarms | Value > 7 or < 0 reverts without mutation | §4.7.1 p. 4-95 |
| Arm `PTL`, type `2.5`, press `ENTER` | Set PTL minutes to 2.5 | `ptlMinutes = 2.5`; spinner disarms | Value not in 0.0..5.0 in 0.5 steps reverts | §6.3.4 p. 6-16 |
| Arm spinner, type digits, press `BACKSPACE` | Delete last buffered digit | `buffer = buffer.slice(0, -1)` | Empty buffer on Backspace is no-op | §2.5 p. 2-12 |
| Arm spinner, press `ESCAPE` or `CLEAR` | Abort adjustment | Parameter reverts to `initialValue`; spinner disarms | No camera or settings mutation | §2.5 p. 2-12; §2.6 p. 2-22 |
| Arm spinner, mouse wheel delta | Incremental step (existing behavior) | Preserves existing mouse wheel spinner | Clears or syncs typed buffer | §2.6 p. 2-22 |

## Research

Authoritative sources:
- `/home/ben/Documents/stars refs/full_manual.pdf`:
  - §2.6 "Display Control Bars Description", p. 2-22 (PDF p. 78): Adjustment buttons
    depress on selection and hide cursor; trackball vertical movement adjusts value,
    or exact value entered via keyboard numeric keypad; Enter/left-click freezes value.
  - §2.5 "Screen Description (Preview Area / Enter / Clear)", pp. 2-11–2-13:
    Clear / Escape cancels active adjustment and reverts parameter.
  - §4.4.1 "Change display range", p. 4-33: 6 to adapted max (512 nmi TCW).
  - §6.1.1 "Change range ring spacing", p. 6-8: {2, 5, 10, 20} nmi.
  - §4.7.1 "Change leader line length", p. 4-95: 0 to 7.
  - §6.3.4 "Change Predicted track line value", p. 6-16: 0.0 to 5.0 min (0.5 steps).

## Scope

- In `src/scope/dcb/dcbMenu.ts`:
  - Extend `DcbSpinnerState` with `buffer: string` and `initialValue: number | null`.
  - Add helper functions to append characters (`0`-`9`, `.`), backspace, cancel,
    and commit validated values for each supported spinner cell type (`RANGE`, `RR`,
    `LDR_LEN`, `PTL`, `VOL`, `CSR_SPD`, `HISTORY`, `HRATE`, etc.).
  - Preserve existing `stepDcbSpinner` mouse wheel behavior.
- In `src/scope/scopeKeys.ts`:
  - When `view.dcbSpinner.armed` is true, route digits, `.`, `Backspace`, `Enter`,
    and `Escape` to the spinner handler before preview-area or radio input.
  - Ensure other modifiers and unconsumed keys do not corrupt the buffer.
- Add focused unit tests in `src/scope/dcb/test/dcbSpinnerKeyboard.test.ts`.

## Non-goals

- Physical pointer lock or hardware trackball driver simulation.
- Voice recognition changes or Command IR changes (DCB adjustment is local scope display state only).
- Re-architecting un-armed preview area commands.

## Acceptance criteria

- [x] Selecting a spinner button arms numeric entry; typing digits updates buffer.
- [x] Pressing Enter validates and applies range, range rings, leader length, and PTL values according to STARS limits.
- [x] Pressing Escape or Clear cancels the adjustment and restores the initial value.
- [x] Backspace removes the most recent character.
- [x] Mouse wheel continues to work for adjustment while armed.
- [x] Focused tests cover valid entries, out-of-range rejections, decimal points for PTL, Backspace, and Escape.
