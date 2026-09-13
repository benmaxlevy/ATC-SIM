# T02-157 Help button and command documentation

**Phase:** 02 Scope  
**Priority:** P1  
**Size:** S  
**Depends on:** T02-156  
**Blocks:** None  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Replace keyboard F1 help with a visible Help button in the bottom-right chrome beneath the Voice Text button, and document the aligned commands.

## Scope

- Add an accessible Help button directly under the Voice Text button in the bottom-right UI.
- The button toggles the existing help overlay; preserve keyboard-independent access.
- Remove stale F1-help claims from README, phase docs, and `docs/USER.md`.
- Document F1 INIT CNTL, reserved F3 Track Suspend, F4 TERM CNTL, F7 MULTI FUNC, and the trainer delta for any retained aliases.
- Keep manual-only visual positioning validation honest if browser inspection is unavailable.

## Research

- Supplied `full_manual.pdf`, Appendix D, Table D-1, p. D-2: function-key meanings.
- Supplied `full_manual.pdf`, §2.9, pp. 2-36–2-42: keyboard/control initiation boundaries.

## Acceptance criteria

- [ ] Help button is bottom-right and directly below Voice Text.
- [ ] Clicking it opens/closes the existing overlay and does not alter radio/scope command state.
- [ ] Documentation contains no claim that F1 opens help or F3 initiates tracks.
- [ ] UI/component tests cover accessible name, location order, and toggle behavior.

## Test plan

- `npm run ci`; UI acceptance tests; manual browser positioning review if available.
