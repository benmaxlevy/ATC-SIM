# T03-03 Spoken phraseology grammar

**Phase:** 03 Voice
**Priority:** P0
**Size:** L
**Depends on:** none (needs phase 1 `Command` / `Instruction` types and typed parser to call as Path B fallback)
**Blocks:** T03-02, T03-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Spoken ATC English compiles to the frozen `Command` IR. Path **A** (spoken grammar → IR) is primary. Path **B** (fuzzy-map to typed tokens) runs only if A misses. Two JO 7110.65-shaped utterances are required fixtures.

## Context

`phases/_shared/command-ir.md` is frozen for phases 0–3. Voice and text both compile to `Command`. Typed tokens (`H270`, `D30`, …) stay the keyboard language.

`phases/03-voice/README.md` §3–4 is the spec: light normalizer, path A primary, path B fallback, telephony table, number rules. Read it before coding.

Parser remains **DOM-free** (`phases/_shared/architecture.md`).

## Research

Read **R01** (climb/descend and maintain, fly heading, turn left heading), **R03** (spoken digits), **R10** only to *avoid* ICAO “climb to.”

- Open: https://www.faa.gov/air_traffic/publications/atpubs/atc_html/ — search `descend and maintain`, `fly heading`, `turn left heading`.
- Search: `7110.65 phraseology heading altitude vector`
- Fixtures must match 7110.65-shaped English, not vice tokens (`D30` is path B only).
- Comment which paragraph/topic you used; do not claim full 7110.65 coverage.

## Scope

- `normalizeSpoken(text: string): string` — README §3.3 (fillers, ICAO digit words, number-slot homophones).
- Path A: grammar covering README §4.4 phrase → IR map (v1 instruction types).
- Callsign: telephony JSON (~10–20 airlines) + digit-by-digit flight number; optional selected callsign when omitted.
- Numbers: heading 3-digit; altitude thousand / thousand+hundred; speed 3-digit; 360 heading → 0.
- **Required fixtures (must have unit tests):**
  1. `"Delta one two three descend and maintain three thousand"` → `DAL123` + `ALTITUDE DESCEND 3000`.
  2. `"turn left heading two seven zero"` → `FLY_HEADING 270 LEFT` (callsign from selection in the test).
  3. Combined: `"Delta one two three turn left heading two seven zero descend and maintain three thousand"` → both instructions, one callsign.
- Path B fallback module: README §4.5 mapping; invoke only when A fails; if B fails, return a structured parse miss (no thrown exception).
- Integrate into the single `parseCommand` entry: when `source === "voice"`, try A then B; when `source === "text"`, existing tokenizer only (do not run spoken grammar on `H270`).

## Out of scope

- SpeechPort, capture, TTS, UI.
- LLM / fuzzy embeddings / third-party NLU.
- Extending `Instruction` with new types.
- Full 7110.65 coverage (holds, crossing restrictions, “expect ILS”, altimeter, etc.).
- Grouped flight numbers (`Delta one twenty three`) as a phase-exit requirement (best-effort OK).
- Teaching the typed tokenizer to accept English.

## Implementation notes

Keep spoken code under `src/parse/spoken/`. Prefer a small recursive-descent or ordered regex/token parser that is easy to test; a PEG library is allowed if it stays in parse and does not bloat the sim tick.

**Normalizer order** (stable for tests): lowercase → punctuation strip → fillers → ICAO aliases (`niner`/`tree`/`fife`/`oh`) → number-slot `to`/`too`→`two` and `for`→`four` when adjacent to number words.

**Homophone test:** `"heading to two seven zero"` and `"heading two seven zero"` both yield 270.

**Telephony:** data file, not a switch of 200 airlines. Unknown carrier word → miss `unknown_telephony`.

**Altitude “three thousand”:** 3000 ft, not FL30. Phase 1 typed `D30` means 3000 — Path B may emit `D30`; Path A should emit `altitudeFt: 3000` directly.

**Multiple instructions:** consume left-to-right; callsign only at start (or omitted). Do not require commas.

**PRESENT_HEADING, IDENT, SAY_*, SPEED, DIRECT, CLEARED_APPROACH:** implement if they fit cleanly; minimum bar is heading + altitude + callsign + combined utterance. Remaining v1 phrases in §4.4 should not 500 the parser — either parse or miss cleanly. Prefer implementing the full §4.4 table in this ticket so T03-12 is not blocked.

**Path B safety:** do not map a dangling number to `H` or `D` without a verb. If rewrite is ambiguous, miss.

Do not clamp illegal altitudes/speeds here; the pilot rejects them.

## Acceptance criteria

- [ ] **AC1 —** Given `"Delta one two three descend and maintain three thousand"` and `source: "voice"`, then `callsign === "DAL123"` and instructions equal `[{ type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }]` (expedite absent/false).
- [ ] **AC2 —** Given `"turn left heading two seven zero"` with `selectedCallsign: "DAL123"`, then `FLY_HEADING` `headingDeg === 270` `turn === "LEFT"` and `callsign === "DAL123"`.
- [ ] **AC3 —** Given the combined utterance in Scope, then two instructions in order (heading, then altitude) and a single callsign `DAL123`.
- [ ] **AC4 —** Given typed input `H270` with `source: "text"`, then the phase 1 tokenizer still runs and spoken grammar is not required to succeed on that string as English.
- [ ] **AC5 —** Given A cannot parse but Path B can (`"heading two seven zero"` → `H270` with selected callsign), then a valid `FLY_HEADING` is produced and `source` remains `"voice"`.
- [ ] **AC6 —** Given nonsense `"pizza the runway"`, then a parse miss (no throw) and no `instructions`.
- [ ] **AC7 —** Automated tests exist for AC1–AC3 (happy path) plus normalizer homophone heading.
- [ ] **AC8 — Research:** Fixtures match 7110.65-shaped English (`descend and maintain`, `turn left heading`). Comment cites R01; path B is documented as nonstandard salvage.

## Test plan

- Unit: fixtures above; `niner`/`tree`; `heading to two seven zero`; `one one thousand` → 11000; `three six zero` heading → 0; unknown telephony; text path regression (`L090`, `D30` if those tests already exist — do not delete them).
- Integration: none (DOM-free).
- Manual: none.

## Suggested files

- `src/parse/spoken/normalizer.ts`
- `src/parse/spoken/normalizer.test.ts`
- `src/parse/spoken/numbers.ts`
- `src/parse/spoken/telephony.ts`
- `src/parse/spoken/telephony.json`
- `src/parse/spoken/grammar.ts`
- `src/parse/spoken/grammar.test.ts`
- `src/parse/spoken/typed-fuzzy.ts`
- `src/parse/parse-command.ts` (thread voice vs text)
