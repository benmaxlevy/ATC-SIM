# T03-28 Pilot spoken-alias output

**Phase:** 03 Voice  
**Priority:** P0  
**Size:** M  
**Depends on:** T03-27  
**Blocks:** T03-31  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Make pilot-originated calls use the preferred aircraft alias when available,
otherwise retain canonical N-number speech. Canonical state and logging never
change.

## Context

`formatCallsignSpeech` already handles alias-shaped strings, but runtime
aircraft currently do not carry aliases as separate data. Pilot check-in,
readback, VFR requests, and IFR pickup requests must use one alias-aware
formatter instead of embedding aliases in `callsign`.

## Research

- R03: [FAA AIM §4-2-4](https://www.faa.gov/air_traffic/publications/atpubs/aip_html/chap4_section_2.html)
  — model/manufacturer plus registration; drop `N` when model/name is spoken.
- R01: [FAA JO 7110.65](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/)
  — readback and aircraft identity terminology.
- Trainer delta: the simulator selects the preferred authored alias; it does
  not model communication-history abbreviation state.

## Scope

- Add alias-aware formatting that accepts canonical callsign plus aliases.
- Format `N123` + `Skyhawk` as `Skyhawk one two three`.
- Format `N172SP` + `Skyhawk` as `Skyhawk one seven two Sierra Papa`.
- Use canonical N-number speech when no alias exists.
- Route check-in, readback, VFR request, and IFR pickup output through the
  alias-aware formatter.
- Preserve heavy-aircraft and existing airline formatting.
- Add unit and integration coverage for all seven VFR aliases.

## Out of scope

- Controller parser grounding.
- Abbreviated tails or communication-session state.
- Non-N registrations.
- GBNF or Path C changes.

## Implementation notes

The formatter must derive the spoken registration tail from canonical N-number
data and must never accept a pre-expanded alias as the authoritative callsign.
No preview/mode state or command lifecycle is introduced.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `N123` + `Skyhawk` | `Skyhawk one two three` | Text/audio only | Canonical callsign remains `N123` | R03 §4-2-4 |
| `N172SP` + `Skyhawk` | `Skyhawk one seven two Sierra Papa` | No world mutation | Tail letters cannot be dropped | R03 §4-2-4 |
| `N123` with no alias | Existing N-number output | No new metadata | No guessed aircraft name | R01 identity |
| `DAL123` | Existing `Delta 123` output | Airline behavior unchanged | Alias data never overrides airline telephony | Existing tests |
| Alias in check-in/request/readback | Same preferred alias appears | Canonical logs unchanged | Any formatter failure falls back safely to canonical form | Manual radio review |

## Acceptance criteria

- [ ] **AC1:** Pilot output uses the preferred alias for every current VFR type.
- [ ] **AC2:** No-alias and airline regressions pass.
- [ ] **AC3:** Five-digit N-number output is complete and not truncated.
- [ ] **AC4:** Check-in, readback, VFR request, and IFR pickup paths use the
  same alias-aware formatter.
- [ ] **AC5:** Tests prove output changes do not mutate canonical callsign.
- [ ] **AC6 — Research:** Code comments identify FAA model/manufacturer analog
  and simulator alias-selection delta.

## Test plan

- Unit: alias formatter, five-digit N-numbers, suffix letters, no alias.
- Integration: pilot check-in/readback/request output for `C172` and one
  representative from each remaining VFR profile.
- Manual: read generated radio text/audio and confirm alias plus complete tail.

## Help/docs

T03-31 documents that pilots use `alias + registration tail` when profile data
exists and canonical N-number otherwise.

## Suggested files

- `src/pilot/telephony.ts`
- `src/pilot/readback.ts`
- `src/pilot/checkinQueue.ts`
- `src/pilot/vfrRequestQueue.ts`
- `src/speech/tts-text.ts`
- pilot/TTS tests

