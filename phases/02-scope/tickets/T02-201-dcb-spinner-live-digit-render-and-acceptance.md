# T02-201 DCB spinner live digit rendering and integration acceptance

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-200
**Blocks:** none
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only; stop at configured boundary.

## Mission

Render the live typed numeric buffer inside the active DCB button cell label
while armed, provide visual feedback during adjustment, and add end-to-end
integration acceptance tests for DCB numeric keyboard typing across all
supported spinner buttons.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Arm `RANGE`, type `12` | DCB cell readout displays `12` while typing | Button label shows active buffer | Empty buffer displays current camera range | §2.6 p. 2-22 |
| Arm `RR`, type `20` | DCB cell readout displays `20` | Button label shows active buffer | Invalid input reverts display on Enter | §6.1.1 p. 6-8 |
| Arm `PTL`, type `3.` | DCB cell readout displays `3.` | Button label shows active buffer | Partial decimal input formatted properly | §6.3.4 p. 6-16 |
| Wheel step while buffer active | Overwrites or updates buffer to new step | Value steps predictably | None | §2.6 p. 2-22 |
| Help / docs updated | `docs/USER.md` documents DCB numeric typing | Documentation updated | None | Project rules |

## Research

Authoritative sources:
- `/home/ben/Documents/stars refs/full_manual.pdf`:
  - §2.6 "Display Control Bars Description", p. 2-22: The active value or entered
    value is displayed in the button label.
  - §4.4.1 "Change display range", p. 4-33: Entered value shown in `<RANGE nn>` button.
  - §6.1.1 "Change range ring spacing", p. 6-8: Current spacing on `<RR nn>` button.

## Scope

- In `src/ui/dcb/DisplayControlBar.tsx`, `DisplayControlBarMenus.tsx`, `dcbChrome.tsx`:
  - When a cell's spinner is armed and has non-empty buffer, render the buffer in
    place of the normal formatted value (or format it clearly).
- In `docs/USER.md`:
  - Document that DCB adjustment buttons can be typed into directly using numeric
    keys and committed with Enter or aborted with Escape.
- Add comprehensive integration acceptance tests in
  `src/ui/dcb/test/dcbSpinnerKeyboardAcceptance.test.ts` verifying:
  - Arming `<RANGE>`, typing digits, pressing Enter updates camera range.
  - Arming `<RR>`, typing digits, pressing Enter updates range ring spacing.
  - Arming `<LDR LEN>`, typing digit, pressing Enter updates leader line length.
  - Arming `<PTL>`, typing digits, pressing Enter updates PTL minutes.
  - Typing invalid values reverts cleanly without changing settings.
  - Escape cleanly aborts and restores prior value.
  - Mouse wheel still functions while armed.

## Non-goals

- Adding new DCB menus or changing layout dimensions.
- Speech API modifications.

## Acceptance criteria

- [x] DCB button displays the in-progress typed buffer while armed.
- [x] Full suite of acceptance tests passes for keyboard numeric adjustment.
- [x] Documentation in `docs/USER.md` updated.
- [x] `npm run ci` passes without regressions.
