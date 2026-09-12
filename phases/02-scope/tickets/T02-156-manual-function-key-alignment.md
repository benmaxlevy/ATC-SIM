# T02-156 Manual function-key alignment

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-155  
**Blocks:** T02-157  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Align implemented function-key meanings with the supplied STARS manual while reserving unsupported Track Suspend behavior safely.

## Scope

- F1 invokes INIT CNTL.
- F3 is reserved for Track Suspend and must not invoke INIT CNTL; until suspend exists it is a safe no-op or explicit unsupported status.
- F4 remains TERM CNTL.
- F7 remains MULTI FUNC and aliases `*`.
- Preserve INIT CNTL command-then-slew/click semantics.
- Support the manual flight-plan modification identity/space/one-field grammar, including `A` scratchpad-1 and `+` scratchpad-2, while retaining documented trainer aliases where non-conflicting.

## Research

- Supplied `full_manual.pdf`, Appendix D, Table D-1, p. D-2: F1 = INIT CNTL, F3 = TRK SUSP, F4 = TERM CNTL, F7 = MULTI FUNC.
- Supplied `full_manual.pdf`, §5.4.1, p. 5-66: identity entry, slew, click.
- Supplied `full_manual.pdf`, §5.6.17, pp. 5-167–5-171: MULTI FUNC, M, identity, SPACE, one modification field.
- Supplied `full_manual.pdf`, §5.6.10, pp. 5-155–5-156: scratchpad-1 modification.

## Acceptance criteria

- [ ] F1/F3/F4/F7 behavior matches Table D-1; F3 does not initiate tracks.
- [ ] F1 identity entry arms INIT CNTL and requires target slew/click, matching §5.4.1.
- [ ] Manual `A` and `+` modification forms work with one field per command.
- [ ] Existing trainer aliases remain documented as aliases or are removed.
- [ ] Tests cover key routing and command-then-slew behavior.

## Test plan

- `npm run ci`; focused scope-key and preview parser tests.
