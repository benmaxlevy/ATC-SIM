# T02-123 FDB Fields 6–8 and TSAS Indicator Formatting

**Phase:** 02 Scope — datablock fidelity
**Priority:** P0
**Size:** L
**Depends on:** T02-122
**Blocks:** none
**Launch:** Implement this ticket only. Stop after acceptance.

## Goal

Add explicit formatting for Figure 2-20 Fields 6, 7, and 8, including TSAS
indicators, duplicate-beacon data, pointout data, and other documented optional
values. Format logic accepts generic input even when live simulation does not
yet provide the condition.

## Context

Fields 6–8 contain dense, condition-dependent data. The formatter must model
their documented grammar without pretending that absent simulator subsystems
exist. Runtime adapters may leave values empty; synthetic fixtures prove the
format contract.

TSAS means Terminal Sequencing and Spacing. FAA describes it as terminal-area
arrival metering and sequencing tied to runway delivery. TSAS values include
runway assignment, sequence number, advised speed, and early/late status.

## Research

- R05, [FAA TSAS description](https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap18_section_25.html): Terminal Sequencing and Spacing.
- R07, [CRC FDB data](https://docs.virtualnas.net/crc/stars/#full-data-blocks-fdbs): line 3 beacon mismatch and FDB time-sharing.
- R07, [CRC ATPA](https://docs.virtualnas.net/crc/stars/#atpa-automatic-terminal-proximity-alert): intrail distance and ATPA display context.
- User-provided Figure 2-20: exact Fields 6–8 values and priority text.

Trainer delta: fields are format-capable but no TSAS scheduler, ADS-B identity
service, MOA service, or coordination service is created by this ticket.

## Scope

- Define typed optional values for Field 6:
  `ATPA`, `NOWGT`, `*TPA`, `NO FP`, reported beacon code, `DB`, `DA`, `MOA`,
  `CSMM`, selected beacon code, and TSAS runway alias.
- Define typed optional values for Field 7:
  assigned altitude, beacon mismatch indication, advised airspeed, and
  early/late status.
- Define typed optional values for Field 8:
  `PO`, `UN`, `RD`, and pointout accept count.
- Implement documented priority/time-sharing within each field.
- Keep unsupported values absent rather than deriving guesses.
- Carry TSAS runway assignment, sequence number, advised speed, and early/late
  values as optional formatter input.
- Carry duplicate beacon state separately from assigned/reported mismatch.
- Add focused synthetic fixtures for every format branch.

## Out of scope

- TSAS sequencing, scheduling, ETA/STA calculation, or speed-advisory logic.
- ADS-B markers or target-address detection.
- MOA assignment, CSMM detection, beacon-code selection, or `NO FP` workflow.
- Pointout workflow changes or new coordination messages.
- New Field 2 glyphs.
- Facility-specific branches, parser, Command IR, DCB, or speech.

## Implementation notes

- Optional fields should be data-first and generic; no KDEM names in live paths.
- Use explicit discriminated values where two indicators cannot coexist.
- Preserve documented literals exactly: `NO FP`, `NOWGT`, `CSMM`, `MOA`, `DA`,
  `PO`, `UN`, `RD`.
- Document runtime-backed versus formatter-only fields in code comments or the
  existing later-implementation backlog when appropriate.
- Add analog-plus-delta comment in scope code.

## Acceptance criteria

- [ ] **AC1 —** Formatter returns explicit Fields 6–8 values with documented
  literals and omission of absent values.
- [ ] **AC2 —** Synthetic fixtures render every listed Field 6 indicator.
- [ ] **AC3 —** Synthetic fixtures render assigned altitude, advised speed,
  early/late, and every Field 8 pointout value.
- [ ] **AC4 —** TSAS runway, sequence, speed, and early/late values format
  independently and time-share deterministically.
- [ ] **AC5 —** Duplicate beacon condition is distinct from squawk mismatch.
- [ ] **AC6 —** No unsupported runtime condition is guessed or synthesized by
  the formatter.
- [ ] **AC7 — Research:** TSAS and datablock terminology cites R05/R07 and the
  supplied Figure 2-20.

## Test plan

- Unit: every Field 6–8 indicator, priority, truncation, and omission branch.
- Integration: complete synthetic FDB containing Fields 0–8.
- Manual: none required; no live TSAS or ADS-B behavior claimed.

## Suggested files

- `src/scope/datablock.ts`
- `src/scope/render/renderScopePaint.ts`
- `src/scope/test/datablockFidelity.integration.test.ts`
- `src/scope/test/renderScopePaint.test.ts`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
