# T02-131 PDB Manual Field Projection

**Phase:** 02 Scope — datablock fidelity  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-130  
**Blocks:** T02-132, T02-133  
**Launch:** Implement this ticket only. Stop after acceptance and manual review.

## Mission

Align Partial Datablock (PDB) presentation with TI 6191.409 Rev. 30 Figure
2-22 while preserving the existing compatibility API and trainer constraints.

## Research

User-supplied `TI 6191.409 Rev. 30`, §2.12, Figure 2-22, p. 2-69:

- Field 0: cautions.
- Field 1: Mode-C altitude or documented status value.
- Field 2: receiving handoff TCP.
- Field 3: ground speed followed by aircraft category.
- Field 4: Ident indicator.

The manual also states on p. 2-59 that PDBs normally represent the reduced
data presentation for associated tracks not owned by the current position.

Trainer delta: no new alert, Ident, surveillance, handoff, or pointout state
is created. Values without current runtime backing remain empty.

## Scope

- Add a generic PDB projection from existing track/formatter values.
- Keep `formatPartialDatablock().line1` for existing callers unless a
  compatibility-preserving structured extension is required.
- Keep existing Mode C hiding, speed suppression, scratchpad/time-share, and
  TCP inputs only where phase README behavior requires them.
- Keep aircraft type and requested altitude out of PDB output.
- Add synthetic unit/integration coverage for empty, Mode C, TCP, speed,
  category, hidden Mode C, and suppressed-speed cases.

## Acceptance criteria

- [ ] PDB physical order matches Figure 2-22 for values currently available.
- [ ] PDB does not display aircraft type or requested altitude.
- [ ] Existing `suppressPdbSpeed` behavior remains green.
- [ ] Existing compatibility callers and FDB/LDB output remain green.
- [ ] No new runtime state, alert, SPC, Ident, or handoff behavior is added.
- [ ] Tests use synthetic fixtures and cover absent values without dead text.
- [ ] Manual review uses only the supplied PDF and records p. 2-69 findings.

## Tests

- `src/scope/test/datablock.test.ts`
- `src/scope/test/datablockFidelity.integration.test.ts`
- Focused scope tests, then `npm run ci` after merge.

## Non-goals

- New SPCs or alert types.
- New Ident source.
- Pointout, quicklook, ADS-B, FMA, TSAS runtime, parser, Command IR, speech,
  DCB, networking, or facility-specific behavior.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, with changed paths,
progressive commits, focused test results, and manual visual leftovers.
