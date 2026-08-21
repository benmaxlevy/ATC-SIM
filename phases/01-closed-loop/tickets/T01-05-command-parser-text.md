# T01-05 Command parser text

**Phase:** 01 Closed loop
**Priority:** P0
**Size:** L
**Depends on:** T00-06 (Command IR TypeScript types)
**Blocks:** T01-06, T01-07, T01-09
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A DOM-free function compiles a typed radio line into an optional callsign token plus `Instruction[]`. It implements the Phase 1 token table. It does not resolve callsigns against traffic, does not validate ATC limits, and does not mutate intent.

## Context

`phases/_shared/command-ir.md` — Parser rules (text, phase 1). Typed commands are **vice-inspired, not vice-compatible**. Voice vs text both compile to `Command`; this ticket only handles text tokenization.

`Command.source` and `issuedAtSimMs` are filled by the command-line / pilot pipeline later. Parser output is a smaller DTO.

Callsign optional if a track is selected — **selection is T01-06**. Parser only detects whether the first token looks like a callsign.

## Research

Read **R08** (vice ATC instruction tables: `H`, `C`/`D`/`A`, `L`/`R` headings).

- Open: https://pharr.org/vice/ — “ATC Instructions (Keyboard)” / STARS TG commands.
- Search: `vice STARS TG H270 C30 climb descend`
- These are **radio tokens**, not scope keys. Spoken English is phase 3 (**R01**).
- Comment: inspired by vice; not a vice file parser.

## Scope

- `parseRadioText(sourceText: string): ParseResult`
- Case-insensitive; trim; collapse internal whitespace to single spaces.
- Token table (number after letter is hundreds of feet for altitude, knots for speed, degrees for heading/turn):

| Input | Instruction |
| --- | --- |
| `H270` / `H 270` | `{ type: "FLY_HEADING", headingDeg: 270, turn: "SHORTEST" }` |
| `L090` / `L 090` | `{ type: "FLY_HEADING", headingDeg: 90, turn: "LEFT" }` |
| `R180` / `R 180` | `{ type: "FLY_HEADING", headingDeg: 180, turn: "RIGHT" }` |
| `T20L` / `T 20 L` | `{ type: "TURN_DEGREES", direction: "LEFT", degrees: 20 }` |
| `T20R` / `T 20 R` | `{ type: "TURN_DEGREES", direction: "RIGHT", degrees: 20 }` |
| `C30` / `C 30` | `{ type: "ALTITUDE", altitudeFt: 3000, verb: "CLIMB" }` |
| `D30` | `DESCEND` 3000 ft |
| `A30` | `MAINTAIN` 3000 ft |
| `S210` / `S 210` | `{ type: "SPEED", speedKt: 210, verb: "MAINTAIN" }` |
| `PH` | `{ type: "PRESENT_HEADING" }` |
| `I` | `{ type: "IDENT" }` |
| `SH` | `{ type: "SAY_HEADING" }` |
| `SA` | `{ type: "SAY_ALTITUDE" }` |
| `APP ILS27` | `{ type: "CLEARED_APPROACH", approachId: "ILS27" }` |

- Combined: `H270 D30 S210` → three instructions, left-to-right.
- Callsign extraction:
  - Full: `/^[A-Z]{3}[0-9]{1,4}[A-Z]?$/` as **first** token → `callsignToken`.
  - Suffix: first token `/^[0-9]{1,4}[A-Z]?$/` → `callsignToken` (e.g. `123`).
  - Otherwise `callsignToken = null` and first token is an instruction.
- Heading `360` → `headingDeg: 0`. Headings `0`–`359` stored as parsed (leading zeros OK: `H090` → 90).
- `ParseResult` is `{ ok: true, callsignToken, instructions, sourceText }` or `{ ok: false, error: string, sourceText }`.
- Parse **fails** (ok false) when: empty line; unknown token; `H`/`L`/`R`/`C`/`D`/`A`/`S`/`T` missing its number; `APP` missing approach id; heading digits parse to a number **> 360** (361+); turn degrees not in `1–360`; leftover junk.
- Parser **does not** reject altitude 500 ft or speed 400 — that is the pilot agent. Parser **does** require the numeric token to be an integer.
- Do not implement spoken English (“heading two seven zero”). That is Phase 3.

## Out of scope

- Callsign uniqueness / selected track.
- Building a full `Command` with `id` / `issuedAtSimMs` (pilot or session layer).
- Fuzzy matching, aliases (`HDG`, `TURN LEFT`), vice command files.
- `DIRECT`, `EXPECT_APPROACH` tokens.

## Implementation notes

Suggested DTO (do not confuse with `Command`):

```ts
export type ParseResult =
  | {
      ok: true;
      callsignToken: string | null;
      instructions: Instruction[];
      sourceText: string;
    }
  | { ok: false; error: string; sourceText: string };
```

Preserve original `sourceText` (pre-uppercase) on the result for logs; match internally on the uppercased copy.

Disambiguation traps:

- `I` is IDENT, never a callsign (callsigns have 3 letters or are numeric suffixes).
- `H270` is an instruction, not a callsign (only one letter).
- `DAL123` then `H270` is callsign + instruction.
- `APP` must consume the **next** token; `APP` alone fails.
- `T20L` can be one token; also allow `T 20 L`.

Altitude: `C30` → 30 × 100 = 3000. `C100` → 10000. `C180` → 18000.

Keep `src/parse` free of `World` and DOM.

Error strings: stable codes preferred for tests, e.g. `UNKNOWN_TOKEN`, `EMPTY`, `BAD_HEADING`, `MISSING_NUMBER`, `MISSING_APPROACH_ID`. Human text can wrap the code.

## Acceptance criteria

- [ ] **AC1 —** `parseRadioText("DAL123 H270")` ok, `callsignToken === "DAL123"`, one `FLY_HEADING` 270 `SHORTEST`.
- [ ] **AC2 —** `parseRadioText("H 270")` ok, `callsignToken === null`, same heading instruction.
- [ ] **AC3 —** `L090`, `R180`, `T20L`, `C30`, `D30`, `A30`, `S210`, `PH`, `I`, `SH`, `SA`, `APP ILS27` each produce the IR in the table (one test table / `it.each`).
- [ ] **AC4 —** `dal123 h270 d30 s210` (mixed case) → callsign `DAL123`, three instructions in order.
- [ ] **AC5 —** `H360` → `headingDeg === 0`. `H361` → `ok: false`.
- [ ] **AC6 —** `""`, `"   "`, `"H"`, `"XYZ"`, `"APP"` → `ok: false`. Nobody needs World for this.
- [ ] **AC7 —** `"123 H270"` → `callsignToken === "123"` (resolution is T01-06).
- [ ] **AC8 —** Vitest in `src/parse` is DOM-free and listed in `npm test`.

## Test plan

- Unit: full token table; spacing variants; combined; failures; case fold; H360.
- Integration: none
- Manual: none

## Suggested files

- `src/parse/parseRadioText.ts`
- `src/parse/tokens.ts`
- `src/parse/parseRadioText.test.ts`
- `src/parse/index.ts`
