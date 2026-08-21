# T03-03 Spoken phraseology grammar

**Phase:** 03 Voice
**Priority:** P0
**Size:** L
**Depends on:** none (needs phase 1 `Command` / `Instruction` types and typed parser)
**Blocks:** T03-02, T03-12, T03-14
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

One `parseCommand` runs the shared stage list (`phases/_shared/parse-pipeline.md`): normalize → typed tokenizer → Path A → Path B. Path C is T03-14 (skip here). Typed English in the command line is a tokenizer miss then A. Two JO 7110.65-shaped utterances are required fixtures.

## Context

`phases/_shared/parse-pipeline.md` is the freeze: **same order for text and voice**. `source` is the channel. `parseStage` is which stage won.

`phases/_shared/command-ir.md` — add optional `parseStage` on `Command` if missing.

Typed tokens stay the keyboard **language**; do not put English into `parseRadioText`. Path A owns English.

`phases/03-voice/README.md` §3–4: normalizer, Path A phrases, Path B safety. Parser remains **DOM-free**.

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
- Integrate **`parseCommand`** as `async` wrapping the stage list. Command line submit must `await` it (patch phase 1 handler). Default `pathC: false` — do not fetch.
- Set `parseStage` on ok results: `typed` | `spoken_a` | `spoken_b`.
- **Text English:** `source: "text"` + `"turn left heading two seven zero"` + selected callsign → `FLY_HEADING 270 LEFT`, `parseStage: "spoken_a"` (tokenizer miss, then A).
- **Text tokens:** `H270` still `parseStage: "typed"`; Path A is not required to parse that string as English.
- Voice uses the **same** list (ASR `H270` may win at typed; English wins at A; B last).
- Path B module: README §4.5; conservative (no dangling number → `H`/`D`). If B fails, structured miss (no throw).
- When `source === "text"`, still run A after typed miss (do **not** skip A for text).

## Out of scope

- SpeechPort, capture, TTS (except awaiting parse from the existing command line).
- Path C / LLM / `POST /parse` (T03-14).
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
- [ ] **AC4 —** Given typed input `H270` with `source: "text"`, then `parseStage === "typed"` and spoken grammar is not required to succeed on that string as English.
- [ ] **AC4b —** Given typed `"turn left heading two seven zero"` with `source: "text"` and `selectedCallsign: "DAL123"`, then `FLY_HEADING` 270 `LEFT`, `parseStage === "spoken_a"`.
- [ ] **AC5 —** Given A cannot parse but Path B can (`"heading two seven zero"` → tokens with selected callsign), then a valid `FLY_HEADING` is produced, `parseStage === "spoken_b"`, and `source` is whatever the caller passed.
- [ ] **AC6 —** Given nonsense `"pizza the runway"`, then a parse miss (no throw) and no `instructions`.
- [ ] **AC7 —** Automated tests exist for AC1–AC4b (happy path) plus normalizer homophone heading.
- [ ] **AC8 — Research:** Fixtures match 7110.65-shaped English (`descend and maintain`, `turn left heading`). Comment cites R01; path B is documented as nonstandard salvage.
- [ ] **AC9 —** `parseCommand(..., { pathC: false })` does not call fetch (or path-c module).

## Test plan

- Unit: fixtures above; typed English AC4b; `niner`/`tree`; `heading to two seven zero`; `one one thousand` → 11000; `three six zero` heading → 0; unknown telephony; text token regression (`L090`, `D30`).
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
- `src/parse/parse-command.ts` (ordered stages; `pathC` stub false)
