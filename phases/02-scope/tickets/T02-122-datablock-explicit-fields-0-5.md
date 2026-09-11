# T02-122 Explicit FDB Fields 0–5 and Field 5 Data Grammar

**Phase:** 02 Scope — datablock fidelity
**Priority:** P0
**Size:** L
**Depends on:** none
**Blocks:** T02-123, T02-124
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Replace concatenated datablock strings with a generic, explicit field model
matching the supplied Figure 2-20. Implement formatting for Fields 0 through 5,
including SPC, TSAS sequence data, scratchpad/exit data, and Field 5's
time-shared flight data.

## Context

The current formatter is an intentional trainer approximation and does not
define the documented field grammar. This ticket establishes the format
contract independently of current runtime backing state. Synthetic fixtures may
populate fields that live simulation does not yet produce.

The supplied Figure 2-20 is authoritative for field placement and terminology.
CRC confirms that FDB line 1 contains the callsign and line 2 time-shares Mode C,
scratchpads, ground speed, aircraft type, requested altitude, and handoff data.

## Research

- R02, [FAA Pilot/Controller Glossary](https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/): official `datablock` and `Mode C` terminology.
- R05, [FAA FOA STARS chapter](https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap12_section_6.html): STARS display-data context.
- R07, [CRC STARS data blocks](https://docs.virtualnas.net/crc/stars/#data-blocks): FDB/PDB fields and time-sharing.
- R07, [CRC category indicators](https://docs.virtualnas.net/crc/stars/#category-indicator-facilities-wo-cwt): GS suffix grammar.
- R07, [CRC SPCs](https://docs.virtualnas.net/crc/stars/#special-purpose-codes): SPC identifiers and meanings.
- User-provided Figure 2-20: exact Field 0–5 layout, TSAS data, exit gate/fix, and Field 5 alternatives.

Trainer delta: format model follows Figure 2-20, but remains STARS-like and
does not claim NAS compatibility.

## Scope

- Define typed explicit fields for Field 0, Field 1, Field 2, Field 3, Field 4,
  and Field 5.
- Keep callsign in Field 1; place SPC in Field 0.
- Support Field 0 safety alerts/cautions and optional TSAS sequence number.
- Support Field 3 alternatives: Mode C, scratchpad, exit gate, and exit fix.
- Support Field 4 special indicators and an optional TCP value without
  truncating a two-character value.
- Support Field 5 alternatives: ground speed, duplicate beacon indicator,
  flight rules, category, aircraft count, aircraft type, and requested altitude.
- Define deterministic priority and time-sharing for mutually exclusive values.
- Preserve absent values as absent; formatter must not invent runtime state.
- Keep Field 1 ADS-B markers out of scope.
- Keep existing Field 2 glyph set unchanged.

## Out of scope

- Field 6, 7, or 8 indicators; T02-123 owns those.
- New Field 2 glyphs; specifically no FMA `▼` or RNP `>` addition.
- ADS-B equipment/data-loss markers.
- TSAS scheduling, runway sequencing, speed-advisory calculation, or timing
  logic. This ticket formats optional TSAS input only.
- Exit-fix selection from procedure geometry. This ticket formats explicit input.
- Command IR, parser, DCB, speech, or facility-specific branches.

## Implementation notes

- Prefer a structured formatter result that can render logical fields without
  forcing every field into the legacy `line1`/`line2`/`line3` shape.
- Keep compatibility adapters only where existing callers need them; tests for
  the new contract should assert fields directly.
- Normalize field strings to documented character limits and uppercase.
- `exitGate` and `exitFix` are explicit optional values. Do not infer either
  from the last route fix.
- `duplicateBeacon` is a display condition, not assigned/reported squawk
  mismatch. Accept explicit duplicate-code state.
- Add an analog-plus-delta comment in scope code.

## Acceptance criteria

- [ ] **AC1 —** Formatter returns explicit Field 0–5 data with empty optional
  fields omitted.
- [ ] **AC2 —** SPC values render in Field 0; callsign remains Field 1.
- [ ] **AC3 —** Field 3 formats Mode C, scratchpad, exit gate, and exit fix as
  mutually time-shared alternatives.
- [ ] **AC4 —** Field 5 formats GS, `DB`, flight rules, category, aircraft
  count, aircraft type, and requested altitude with deterministic precedence.
- [ ] **AC5 —** Synthetic fixtures cover every Field 0–5 value and empty-field
  combinations without relying on KDEM production data.
- [ ] **AC6 —** No ADS-B marker or new Field 2 glyph is emitted.
- [ ] **AC7 — Research:** Code comments cite CRC analog and STARS-like trainer
  delta; glossary terms are used.

## Test plan

- Unit: field normalization, optional omission, priority, and time-sharing.
- Integration: formatter output consumed by scope rendering without changing
  radio/parser behavior.
- Manual: none required; visual review belongs in later acceptance work.

## Suggested files

- `src/scope/datablock.ts`
- `src/scope/render/renderScopePaint.ts`
- `src/scope/test/datablockFidelity.integration.test.ts`
- `src/scope/test/renderScopePaint.test.ts`
