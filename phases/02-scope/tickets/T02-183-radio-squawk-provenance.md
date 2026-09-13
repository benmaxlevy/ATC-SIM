# T02-183 Radio squawk provenance

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-176, T02-180  
**Blocks:** none  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only.

## Mission

Restore the deliberate separation between controller radio transponder
assignment and manually edited flight-plan beacon data. Radio squawk, including
clearance optional `SQ`, must never update `FlightPlan.assignedBeacon`.

| Input/form | Expected action/result | State/side effect | Error/negative case | Evidence |
| --- | --- | --- | --- | --- |
| `SQ 2222` | aircraft assigned/pending report changes | plan beacon unchanged | mismatch remains observable | STARS §2.12 |
| clearance `SQ 2222` | same aircraft-only behavior | plan beacon unchanged | no accidental correlation | JO §5-2-1 |
| manual plan beacon edit | plan changes | later matching report correlates | radio never substitutes edit | trainer law |

## Scope

- Remove radio/clearance squawk writes to `FlightPlan.assignedBeacon`.
- Preserve immediate aircraft assignment, delayed reported code, IDENT
  separation, and existing manual plan-beacon editing path.
- Test intended mismatch/no-correlation then manual beacon edit plus matching
  report correlation. Update user docs and T02-176/T02-180 completion notes.

## Non-goals

Automatic flight-plan editing, beacon allocation redesign, correlation rule
changes, or surveillance timing changes.

## Acceptance criteria

- [ ] `ASSIGN_SQUAWK` and clearance optional `SQ` never mutate plan beacon.
- [ ] Aircraft delayed report behavior remains intact and mismatch is testable.
- [ ] Manual plan beacon update remains the only plan-side path and can later
  correlate a matching report.

## Test plan

Pilot/core correlation units for direct radio and clearance SQ paths; focused
manual mismatch regression; `npm run ci`; supplied-manual review §2.12 and
Appendix A-5.

