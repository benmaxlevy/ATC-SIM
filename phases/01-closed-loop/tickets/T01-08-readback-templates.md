# T01-08 Readback templates

**Phase:** 01 Closed loop
**Priority:** P0
**Size:** M
**Depends on:** T01-02, T00-06
**Blocks:** T01-07, T01-09
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A pure function turns `(callsign, instructions, aircraftSnapshot)` into a single deterministic readback string using FAA digit grouping. Combined instructions share one callsign at the start, comma-separated. No TTS. No World mutation.

## Context

`phases/_shared/command-ir.md` Readback templates (phase 1):

- `FLY_HEADING 270 SHORTEST` → `{callsign} heading two seven zero`
- `ALTITUDE DESCEND 3000` → `{callsign} descend and maintain three thousand`
- Combined: join with comma, callsign once at the start.
- FAA digit grouping (eleven, twelve, … thousand). Spell callsign as airline telephony if mapped, else char-by-char.

Implement **this ticket before T01-07**. The pilot agent must call this formatter; do not stringify JSON as a readback.

Error readbacks for rejects are also specified here so T01-07 can reuse them.

## Research

Read **R01** (JO 7110.65 readback / altitude / heading phraseology), **R02** (readback), **R03** (digits), **R08** (vice readback window — tone, not tokens).

- Open: https://www.faa.gov/air_traffic/publications/atpubs/atc_html/ — search `read back`, `descend and maintain`, `fly heading`.
- Search: `7110.65 2-4 readback altitudes headings` and `FAA AIM numbers spoken`
- **Required wording:** `descend and maintain`, `climb and maintain`, `heading two seven zero` (digit-by-digit headings). Not “go down to,” “turn to face,” “confirm.”
- Telephony: FAA/ICAO airline names; letters via phonetic. Do not invent cute callsign speech.
- Keyboard tokens stay vice-inspired (`C30`); the *spoken* readback is 7110.65, not `climb three zero`.

## Scope

- `formatCallsignSpeech(callsign: string): string`
- `formatReadback(args: { callsign: string; instructions: Instruction[]; aircraft: Pick<Aircraft, "headingDeg" | "altitudeFt"> }): string`
- `formatRejectReadback(args: { callsign?: string; reason: string }): string`
- Digit / number speech helpers used by both.
- Small airline telephony map (minimum below). Unknown 3-letter prefix: spell letters with the NATO/FAA phonetic **or** char-by-char English letter names — **freeze FAA phonetic for letters**.

### Telephony map (minimum)

| ICAO | Speech |
| --- | --- |
| DAL | delta |
| AAL | american |
| UAL | united |
| SWA | southwest |
| JBU | jetblue |
| NKS | spirit |
| FFT | frontier |
| ASA | alaska |
| FDX | fedex |
| UPS | u p s |

Digits in the callsign: FAA (`9` → **niner**, `0` → **zero**). Example: `DAL123` → `delta one two three`.

Unknown `XYZ99` → `x-ray yankee zulu niner niner`.

### Heading

Each digit, three wide, `0` stored heading → **three six zero**.

| Deg | Speech |
| --- | --- |
| 0 | three six zero |
| 90 | zero niner zero |
| 270 | two seven zero |
| 5 | zero zero five |

`FLY_HEADING` with `LEFT` → `{cs} turn left heading {h}`  
`RIGHT` → `{cs} turn right heading {h}`  
`SHORTEST` → `{cs} heading {h}` (no turn word)

`TURN_DEGREES` → `{cs} turn left {n} degrees` / `turn right {n} degrees` (`20` → `two zero`)

`PRESENT_HEADING` → `{cs} fly present heading`

### Altitude

Always “and maintain” after climb/descend.

| Ft | Speech |
| --- | --- |
| 3000 | three thousand |
| 4500 | four thousand five hundred |
| 10000 | one zero thousand |
| 11000 | one one thousand |
| 10500 | one zero thousand five hundred |

- `CLIMB` → `climb and maintain {alt}`
- `DESCEND` → `descend and maintain {alt}`
- `MAINTAIN` → `maintain {alt}`

No “flight level” (v1 ceiling 18000 spoken as altitude).

### Speed

`SPEED MAINTAIN` → `maintain {digits} knots` (`210` → `two one zero knots`)

### Others

- `IDENT` → `ident`
- `SAY_HEADING` → `heading {current heading speech}` (from aircraft snapshot, not assigned)
- `SAY_ALTITUDE` → `{current altitude speech}` (no “say” in the pilot’s mouth: `{cs} three thousand` if at 3000)
- `CLEARED_APPROACH` `ILS27` → `cleared i l s two seven approach` (spell ILS as letters `i l s`, runway 27 as `two seven`)

### Combined

`formatReadback` for `[FLY_HEADING 270 SHORTEST, ALTITUDE DESCEND 3000, SPEED 210]`:

`delta one two three heading two seven zero, descend and maintain three thousand, maintain two one zero knots`

No extra period required. Lowercase except we do not care about capitalization in tests: **normalize expected strings to lowercase** and compare `result.toLowerCase()`.

### Rejects

Include callsign speech when known:

| Reason | Text (lowercase) |
| --- | --- |
| `UNKNOWN_CALLSIGN` | `unable, unknown callsign` |
| `AMBIGUOUS_CALLSIGN` | `unable, ambiguous callsign` |
| `NO_CALLSIGN_OR_SELECTION` | `unable, no aircraft selected` |
| `HEADING` | `{cs} unable heading` |
| `ALTITUDE` | `{cs} unable altitude` |
| `SPEED` | `{cs} unable speed` |
| `EMPTY` | `unable, say again` |
| `CLIMB_NOT_ABOVE` / `DESCEND_NOT_BELOW` | `{cs} unable altitude` |
| `PARSE` | `unable, say again` |

If callsign unknown, omit `{cs}`.

## Out of scope

- TTS, SpeechPort, radio FX, delayed/wrong readbacks (Phase 5).
- Scratchpad / scope messages.
- Full 7110.65 exception list.

## Implementation notes

All functions DOM-free in `src/pilot/readback.ts`.

`niner` for 9 everywhere (headings, altitudes’ digits above 10k, speeds, callsigns).

Tests should be table-driven. Do not call `stepWorld`.

## Acceptance criteria

- [ ] **AC1 —** `formatCallsignSpeech("DAL123")` lowercased is `delta one two three`.
- [ ] **AC2 —** `FLY_HEADING 270 SHORTEST` for DAL123 → contains `delta one two three` and `heading two seven zero`, no `turn left/right`.
- [ ] **AC3 —** `FLY_HEADING 90 LEFT` → includes `turn left heading zero niner zero`.
- [ ] **AC4 —** `ALTITUDE DESCEND 3000` → `descend and maintain three thousand`.
- [ ] **AC5 —** Combined heading + descend + speed: one callsign at start, commas, no repeated callsign.
- [ ] **AC6 —** `SAY_HEADING` uses **current** `headingDeg` from snapshot (e.g. 45 → `zero four five`), not an assigned field.
- [ ] **AC7 —** `formatRejectReadback({ reason: "AMBIGUOUS_CALLSIGN" })` is `unable, ambiguous callsign`.
- [ ] **AC8 —** Vitest DOM-free; `npm test` green.
- [ ] **AC9 — Research:** Templates use `descend and maintain` / digit headings; a file comment cites JO 7110.65 (R01) vs vice tokens (R08).

## Test plan

- Unit: telephony; heading table including 0 → three six zero; altitude table; combined; SAY_*; IDENT; ILS27; rejects.
- Integration: none
- Manual: none

## Suggested files

- `src/pilot/readback.ts`
- `src/pilot/telephony.ts`
- `src/pilot/digits.ts`
- `src/pilot/readback.test.ts`
- `src/pilot/index.ts`
