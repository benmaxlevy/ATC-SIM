# T02-40 STARS FDB ground speed tens and category indicators

**Phase:** 02 Scope (STARS CRC fidelity addendum)
**Priority:** P1
**Size:** M
**Depends on:** T02-35, T02-36
**Blocks:** T02-41, T02-43
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Align ground speed formatting and category indicators on FDB and PDB datablocks with STARS CRC specifications (docs.virtualnas.net/crc/stars):
- **Ground Speed in Tens of Knots**: Format ground speed as two digits representing tens of knots (e.g. `18` for 180 kt, `25` for 250 kt, `09` for 90 kt) via `formatGroundSpeedTens()`.
- **Wake / RNAV / CWT Category Indicators**: Append single-letter category suffix directly to the ground speed field (e.g. `18H` for Heavy, `25R` for RNAV, `19B` for B757, `21J` for Super/A380, `14L` for Light, or CWT classes `A`–`I`).
- **Flight Category Suffixes**:
  - `V` appended for VFR flights when applicable (e.g. `11V`).
  - `E` appended for enroute / overflight aircraft where configured.
- **PDB Ground Speed Suppression**: Support facility / preference option (`suppressPdbSpeed`) to omit ground speed from PDB Line 2 when configured.

## Context

In FAA STARS TRACON systems, ground speed is customarily displayed in tens of knots rather than 3-digit knots to conserve datablock character width and maintain rapid scan readability. Aircraft wake turbulence classes (`H`, `J`, `B`, `M`, `L`) or RNAV capability (`R`) are appended immediately to the ground speed string on Line 2. PDBs can optionally suppress ground speed display depending on sector preferences.

## Research

Read **docs.virtualnas.net/crc/stars** (Full Data Blocks, Ground Speed, Category Indicators, Partial Data Blocks).
- Search: `STARS ground speed tens formatGroundSpeedTens wake category indicator H B R suppressPdbSpeed`
- **Terms:** **ground speed tens**, **wake category**, **RNAV indicator**, **CWT category**, **flight category suffix**, **suppress PDB speed**.
- Comment: Ground speed displays as 2 digits in tens (e.g. 18 for 180 kt) plus wake/RNAV suffix (18H, 25R).

## Scope

- Implement `formatGroundSpeedTens(speedKt: number, options?: GroundSpeedOptions): string` in `src/scope/datablock.ts`:
  - Round to nearest 10 kt: $\text{tens} = \lfloor(\text{speedKt} + 5) / 10\rfloor$.
  - Pad to 2 digits (e.g. `90` kt -> `"09"`, `180` kt -> `"18"`, `250` kt -> `"25"`, `320` kt -> `"32"`).
  - Append wake category or RNAV suffix if provided (`H`, `B`, `R`, `J`, `M`, `F`, `L`, or CWT `A`–`I`), e.g. `"18H"`, `"25R"`.
  - Support flight category suffix (`V` for VFR, `E` for enroute overflights) when appropriate.
- Update FDB Line 2 ground speed formatting:
  - Replace raw 3-digit ground speed with `formatGroundSpeedTens(...)`.
- Update PDB Line 2 ground speed formatting:
  - Apply `formatGroundSpeedTens(...)`.
  - Add `suppressPdbSpeed?: boolean` option to `PartialDatablockOpts` and scope display preferences; when true, omit the ground speed field from PDB Line 2.
- Update LDB click-to-query ground speed formatter to use consistent tens formatting.

## Out of scope

- Multi-phase Line 2 time-sharing rotation (T02-41).
- Conflict Alert inhibit glyphs on Line 1 (T02-42).
- Dynamic CWT separation distance ring generation.

## Implementation notes

- Modify `src/scope/datablock.ts`, `src/scope/trackDisplay.ts`, `src/scope/renderScope.ts`.
- Update and add test coverage in `src/scope/datablock.test.ts`, `src/scope/renderScope.test.ts`.

## Acceptance criteria

- [ ] **AC1 —** `formatGroundSpeedTens` formats speeds into 2-digit tens with standard rounding (e.g. 184 kt -> `18`, 186 kt -> `19`, 94 kt -> `09`).
- [ ] **AC2 —** Wake turbulence and RNAV category indicators append directly to ground speed (e.g. `18H`, `25R`, `14L`, `21J`).
- [ ] **AC3 —** VFR flight category suffix `V` is appended when tracking VFR aircraft without conflicting wake indicators.
- [ ] **AC4 —** FDB Line 2 displays tens-based ground speed with category suffix.
- [ ] **AC5 —** PDB Line 2 reflects tens-based speed and respects `suppressPdbSpeed` configuration.
- [ ] **AC6 —** Automated unit tests cover rounding boundaries, single/double digit tens padding, and category suffix precedence.

## Test plan

- Unit tests for `formatGroundSpeedTens` across speed ranges (0 to 600+ kt) and rounding boundaries.
- Unit tests for category suffix formatting (`H`, `B`, `R`, `J`, `L`, `V`, `E`).
- Unit tests for `formatPartialDatablock` with `suppressPdbSpeed = true` and `false`.

## Suggested files

- `src/scope/datablock.ts`
- `src/scope/datablock.test.ts`
- `src/scope/trackDisplay.ts`
- `src/scope/renderScope.ts`
