# T02-132 LDB Existing Field 0 Display

**Phase:** 02 Scope — datablock fidelity  
**Priority:** P0  
**Size:** S  
**Depends on:** T02-131  
**Blocks:** T02-133  
**Launch:** Implement this ticket only. Stop after acceptance and manual review.

## Mission

Expose only existing SPC and safety-alert state in Limited Datablock (LDB)
Field 0, matching TI 6191.409 Rev. 30 Figure 2-23.

## Research

User-supplied `TI 6191.409 Rev. 30`, §2.12, Figure 2-23, p. 2-70:

- Field 0: special conditions, safety alerts, and cautions.
- Field 1: reported beacon code.
- Field 3: Mode-C altitude.
- Field 5: ground speed.

Manual §2.12, pp. 2-59–60, describes LDBs for unassociated tracks and the
conditions under which special-condition indicators can appear.

Repository-backed scope is limited to existing `EM`, `RF`, `HJ`, `LA`, and
`CA` state. No new manual indicators are added.

## Scope

- Make current `getSpecialPurposeCode()` values available in LDB Field 0.
- Project existing renderer-provided `LA`/`CA` state into LDB Field 0 where
  current runtime already supplies it.
- Preserve normal beacon + Mode C output.
- Preserve queried Mode C + ground speed output.
- Preserve beacon inhibition behavior.
- Keep Field 0 separate from beacon and altitude text.
- Add synthetic tests for empty, SPC, safety-alert, queried, and inhibited
  cases.

## Acceptance criteria

- [ ] Existing `EM`, `RF`, and `HJ` render in LDB Field 0.
- [ ] Existing `LA` and `CA` render in LDB Field 0 when supplied by current
  runtime state.
- [ ] No `MI`, `LL`, or other new SPC/alert value is introduced.
- [ ] Normal, queried, and beacon-inhibited LDB behavior remains green.
- [ ] Field 0 is physically separate from beacon and altitude fields.
- [ ] Manual review uses only the supplied PDF and records p. 2-70 findings.

## Tests

- `src/scope/test/datablock.test.ts`
- `src/scope/test/datablockFidelity.integration.test.ts`
- Focused scope tests, then `npm run ci` after merge.

## Non-goals

- New SPC mappings or alert evaluation.
- New blinking or acknowledgment workflow.
- Pointout, quicklook, ADS-B, FMA, RNP, TSAS, parser, Command IR, speech,
  DCB, networking, or facility-specific behavior.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, with changed paths,
progressive commits, focused test results, and manual visual leftovers.
