# T00-06 Command IR TypeScript types and fixtures

**Phase:** 00 Slice
**Priority:** P0
**Size:** M
**Depends on:** T00-03
**Blocks:** T00-08
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

`Command` and `Instruction` exist as TypeScript types that **match** `phases/_shared/command-ir.md`. Fixtures compile. The parser still throws.

## Context

Command IR is frozen for phases 0–3. Voice and text both compile to `Command` later; this ticket only checks types in. The **Pilot agent** is the only module allowed to change **Intent** from a `Command` (not implemented here).

Radio vs **Scope**: Command IR is radio-only (glossary).

After this ticket, update `@parse` `parseCommand` return type to `Command` **while keeping the throw** (T00-03 allowed `never`).

## Scope

- `src/core/command/types.ts` — copy the interfaces/types from `_shared/command-ir.md` (field names and union members must match).
- `src/core/command/fixtures.ts` — one fixture per `Instruction` `type` plus one multi-instruction `Command`.
- `src/core/command/instructions.ts` — `INSTRUCTION_TYPES` const array (runtime list of type strings) for tests.
- Re-export from `@core`.
- Vitest: fixtures satisfy `Command`; every instruction discriminant in the shared doc appears in `INSTRUCTION_TYPES`.
- Retype `parseCommand(): Command` (still throws). `applyCommand` should accept `Command` and still throw.

## Out of scope

- Parser tokens (`H270`, callsign matching, etc.).
- Validation ranges (heading/altitude/speed) — Pilot agent, phase 1. You may add **comment** pointers to the shared doc.
- Readback templates.
- Emitting session events (T00-08).
- Renaming `FLY_HEADING` or adding `VECTORS` / chat instructions.

## Implementation notes

Paste this shape into `types.ts` (keep comments that exist in the shared file):

```ts
export interface Command {
  id: string;
  issuedAtSimMs: number;
  callsign: string;
  instructions: Instruction[];
  sourceText: string;
  source: "text" | "voice";
}

export type TurnDir = "LEFT" | "RIGHT" | "SHORTEST";

export type Instruction =
  | { type: "FLY_HEADING"; headingDeg: number; turn: TurnDir }
  | { type: "TURN_DEGREES"; direction: "LEFT" | "RIGHT"; degrees: number }
  | { type: "PRESENT_HEADING" }
  | {
      type: "ALTITUDE";
      altitudeFt: number;
      verb: "CLIMB" | "DESCEND" | "MAINTAIN";
      expedite?: boolean;
    }
  | {
      type: "SPEED";
      speedKt: number;
      verb: "MAINTAIN" | "INCREASE" | "REDUCE";
    }
  | { type: "DIRECT"; fixId: string }
  | { type: "EXPECT_APPROACH"; approachId: string }
  | { type: "CLEARED_APPROACH"; approachId: string }
  | { type: "IDENT" }
  | { type: "SAY_HEADING" }
  | { type: "SAY_ALTITUDE" };
```

Do **not** add extra keys (`scratchpad`, `frequency`, `voiceId`) on `Command`.

### Fixtures

Use callsign `DAL123`, `issuedAtSimMs: 0`, `source: "text"`. Include:

- `FLY_HEADING` 270 `SHORTEST`
- `TURN_DEGREES` LEFT 20
- `PRESENT_HEADING`
- `ALTITUDE` DESCEND 3000
- `SPEED` MAINTAIN 210
- `DIRECT` fixId `"FIX01"`
- `EXPECT_APPROACH` / `CLEARED_APPROACH` approachId `"ILS27"`
- `IDENT`, `SAY_HEADING`, `SAY_ALTITUDE`
- Combined: `FLY_HEADING` + `ALTITUDE` on one `Command`

`INSTRUCTION_TYPES` must be a `as const` array of the 11 `type` strings. A test asserts `fixtures` cover every entry (e.g. set equality).

### `satisfies`

Prefer `export const fixtureFlyHeading = { ... } satisfies Command` so excess property checks stay on.

## Acceptance criteria

- [ ] **AC1 —** `Command` has `id`, `issuedAtSimMs`, `callsign`, `instructions`, `sourceText`, `source` only (no extra required fields).
- [ ] **AC2 —** `Instruction` union includes exactly the 11 `type` values listed in `_shared/command-ir.md` (`INSTRUCTION_TYPES` length 11, Vitest).
- [ ] **AC3 —** `TurnDir` is `"LEFT" | "RIGHT" | "SHORTEST"`; `FLY_HEADING` requires `headingDeg` and `turn`.
- [ ] **AC4 —** Fixtures file type-checks (`tsc --noEmit`) with at least one `Command` per instruction type.
- [ ] **AC5 —** A Vitest test builds a `Set` of `instruction.type` from fixtures and equals `new Set(INSTRUCTION_TYPES)`.
- [ ] **AC6 —** `parseCommand` is typed to return `Command` and still throws `phase 1` (Vitest).
- [ ] **AC7 —** Types live under `src/core` (not `src/parse`). `src/parse` imports `Command` from `@core`, not the other way around.

## Test plan

- Unit: `src/core/command/fixtures.test.ts`.
- Integration: `tsc --noEmit`.
- Manual: none.

## Suggested files

- `src/core/command/types.ts`
- `src/core/command/fixtures.ts`
- `src/core/command/instructions.ts`
- `src/core/command/fixtures.test.ts`
- `src/core/index.ts`
- `src/parse/index.ts` (return type)
- `src/pilot/index.ts` (param type)
