# T02-202 DCB state integrity and keyboard routing

**Phase:** 02 Scope (post-exit addendum)
**Priority:** P1
**Size:** M
**Depends on:** T02-200, T02-201
**Blocks:** T04-91
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Make DCB spinner cancellation restore coupled state and keep typed scope input
out of the radio preview path. Preserve the existing immediate mouse-wheel
behavior and all current DCB numeric limits.

## Context

The audit found that RR cancellation can enable hidden rings, PTL zero can leave
PTL enabled, typed `LDR_DIR` can update only the default instead of the selected
track, and Shift-modified digits can enter numeric capture. DCB remains a
scope-only surface: it must not construct Command IR or mutate pilot intent.

## Research

- **R07:** CRC STARS DCB documentation, including spinner accept/cancel,
  `RR #`, `PTL LNTH`, and `LDR DIR`: https://docs.virtualnas.net/crc/stars/
- Trainer delta: ATC-SIM ships a reduced DCB-lite implementation and retains
  its existing wheel-commit behavior; it does not claim NAS STARS parity.

## Scope

- Snapshot and restore all coupled state for RR, PTL, and leader-direction
  spinner actions.
- Set PTL enabled state from the committed value (`0` means disabled).
- Route typed `LDR_DIR` through the existing selected-track update path while
  retaining the configured default.
- Reject all modifier-bearing numeric keyboard input, including Shift, from
  spinner capture unless the existing scope key contract explicitly consumes it.
- Update focused tests and any affected scope help/documentation.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| RR spinner changed while rings hidden, then Escape/Clear | Original RR value and hidden state restored | `ringIntervalNm` and `showRings` return to snapshot | Cancel must not enable rings | CRC DCB spinner behavior, R07 |
| PTL spinner committed as `0` | PTL is disabled | `ptlMinutes = 0`, `ptlOn = false` | No enabled zero-length PTL | CRC `PTL LNTH`, R07 |
| Typed `LDR_DIR` with selected track | Direction applies through selected-track path and updates default as defined | No radio command or intent mutation | Invalid direction keeps prior state | CRC `LDR DIR`, R07 |
| Shift + numeric key while spinner armed | Scope routing policy handles or ignores it | Spinner buffer unchanged unless explicitly allowed | Must not leak into radio preview | Phase 2 keyboard contract |
| Mouse-wheel step | Existing immediate wheel behavior remains | Existing baseline/buffer semantics preserved | Do not regress T02-201 acceptance | Existing DCB acceptance |

## Acceptance criteria

- [ ] RR cancellation restores interval, visibility, and any related map state.
- [ ] PTL value `0` disables PTL; positive values enable it.
- [ ] Typed leader direction updates the selected track through the existing
  scope path and preserves default-direction semantics.
- [ ] Shift, Ctrl, and Alt modifier tests prove no unintended numeric capture.
- [ ] Existing wheel behavior and numeric limits remain green.
- [ ] No DCB path constructs Command IR, calls the parser, or mutates intent.
- [ ] `npm run ci` passes.

## Test plan

- Unit: DCB reducer/setter tests for snapshot restoration, PTL zero, leader
  direction, and modifier routing.
- Integration: extend `dcbSpinnerKeyboardAcceptance.test.ts` for the above
  lifecycle cases.
- Manual: verify hidden RR rings, PTL zero, leader direction, and Shift input in
  the STARS-like scope; record trainer delta only.

## Suggested files

- `src/scope/dcb/dcbMenu.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/dcb/test/dcbSpinnerKeyboard.test.ts`
- `src/ui/dcb/test/dcbSpinnerKeyboardAcceptance.test.ts`
- `docs/USER.md`

## Out of scope

- Command IR, parser, speech, pilot intent, or kinematics changes.
- New DCB controls, full NAS STARS behavior, or preference-host redesign.
