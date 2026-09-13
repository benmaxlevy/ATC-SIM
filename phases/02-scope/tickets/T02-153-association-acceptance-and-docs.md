# T02-153 Association acceptance, documentation, and manual audit

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** S  
**Depends on:** T02-152  
**Blocks:** None  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Close the feature with integrated acceptance coverage and concise operator documentation.

## Research

- Recheck supplied `full_manual.pdf`, §§2.9, 2.12, 5.4.1, 5.5.7, 5.6.15, and 5.6.17 after implementation.
- Event-driven squawk correlation is a documented trainer behavior, not a claim that STARS mandates automatic correlation.

## Scope

- Document plan-side association authority, reported versus assigned beacon, and the aircraft-scoped squawk-update trigger.
- Add one integrated acceptance suite covering canonical lifecycle and absence of list/render auto-association.
- Run an independent manual review of every changed command/display behavior and record honest manual-only leftovers.
- Keep the later backlog accurate after final code-path audit.

## Out of scope

- Pilot clearance execution; that remains later implementation work.

## Acceptance criteria

- [ ] Documentation states correlation does not occur from list rendering, redraw, or periodic scans.
- [ ] Integrated tests cover unique, zero, ambiguous, invalid, and `1200` correlation plus lifecycle cleanup.
- [ ] `npm run ci` passes.
- [ ] `$check-stars-manual '/home/ben/Documents/stars refs/full_manual.pdf'` is run against this ticket and final diff; mismatches are fixed or recorded.

## Test plan

- `npm run ci`; independent manual-review subagent using the supplied PDF.

## Suggested files

- Relevant `src/**` tests/docs, `phases/LATER-IMPLEMENTATION-BACKLOG.md`, and user command documentation
