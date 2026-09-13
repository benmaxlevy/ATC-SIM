# T02-154 Live squawk correlation paths

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-150  
**Blocks:** T02-155  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Route every currently available aircraft squawk mutation through the aircraft-scoped correlation helper.

## Scope

- Preserve reported squawk as surveillance state.
- Wire spawn, replay, scenario, and other existing update paths without adding pilot execution.
- Preserve unique-match-only behavior; zero, ambiguous, invalid, and `1200` remain unassociated.
- Carry a scheduled plan’s assigned beacon into its spawned aircraft where the existing data contract supports it.
- Document unreachable future pilot/surveillance sources in the later backlog.

## Research

- Supplied `full_manual.pdf`, §5.4.1, pp. 5-66–5-67: explicit identity plus slew/click association.
- Supplied `full_manual.pdf`, §5.5.7, pp. 5-116–5-119: pending discrete-beacon plan state.
- Automatic squawk correlation is an explicit trainer delta, not a manual claim.

## Acceptance criteria

- [ ] Every existing in-scope squawk write invokes the common update path.
- [ ] A spawned aircraft with a scheduled assigned beacon can correlate only on its own reported squawk update.
- [ ] No list, render, tick, or global scan performs correlation.
- [ ] Tests cover spawn/update, unrelated aircraft, duplicates, and `1200`.

## Test plan

- `npm run ci`; focused spawn and correlation tests.
