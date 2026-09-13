# T02-124 Datablock TCP One- or Two-Character Adaptation

**Phase:** 02 Scope — datablock fidelity
**Priority:** P1
**Size:** S
**Depends on:** T02-122
**Blocks:** none
**Launch:** Implement this ticket only. Stop after acceptance.

## Goal

Format Field 4 TCP values with the documented one- or two-character adaptation,
preserving values such as `1N` while retaining one-character values such as `N`.

## Context

Figure 2-20 states that the owning TCP can be adapted to one or two characters.
CRC defines a TCP as a subset plus sector ID; common examples are two-character
values such as `1D`.

## Research

- R07, [CRC TCP terminology](https://docs.virtualnas.net/crc/stars/#important-terms-and-concepts): TCP subset and sector ID.
- R07, [CRC FDB fields](https://docs.virtualnas.net/crc/stars/#full-data-blocks-fdbs): handoff character in the FDB.
- User-provided Figure 2-20: Field 4 one-/two-character adaptation.

Trainer delta: this ticket formats existing or explicit TCP input; it does not
add inter-facility handoff behavior.

## Scope

- Accept one- or two-character TCP values.
- Normalize uppercase and remove unsupported characters.
- Preserve two display cells; do not reduce `1N` to `1` or `N`.
- Render Field 4 with stable character-cell positioning in FDB/PDB output.
- Test empty, one-character, and two-character values.

## Out of scope

- Handoff protocol, acceptance, redirect, or networking.
- New Field 2 glyphs.
- Parser or Command IR changes.

## Implementation notes

- Prefer a generic `formatTcp` helper with a two-character maximum.
- Do not special-case KDEM or a specific sector.
- Add analog-plus-delta comment in scope code.

## Acceptance criteria

- [ ] **AC1 —** `N` renders as `N`.
- [ ] **AC2 —** `1N` renders intact as `1N`.
- [ ] **AC3 —** Lowercase and invalid input normalize deterministically.
- [ ] **AC4 —** FDB and PDB Field 4 positioning remains stable.
- [ ] **AC5 — Research:** TCP terminology and trainer delta cite R07.

## Test plan

- Unit: TCP normalization and one-/two-character formatting.
- Integration: complete synthetic FDB/PDB field model.
- Manual: none required.

## Suggested files

- `src/scope/datablock.ts`
- `src/scope/render/renderScopePaint.ts`
- `src/scope/test/datablockFidelity.integration.test.ts`
