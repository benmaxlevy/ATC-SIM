# T03-29 Deterministic alias callsign grounding

**Phase:** 03 Voice  
**Priority:** P0  
**Size:** L  
**Depends on:** T03-27  
**Blocks:** T03-30, T03-31  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Accept canonical N-number and authored alias callsigns in the shared typed and
spoken parser, resolve both to one canonical live aircraft, and fail closed on
unknown or ambiguous aliases.

## Context

The shared parser is used by typed and voice input. Current roster grounding
accepts canonical strings and airline numeric suffixes, but not aircraft aliases.
The parser must return canonical `callsignToken`; aliases must never enter
Command IR or world state.

## Research

- R01: [FAA JO 7110.65 §2-3-5](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_3.html)
  — canonical civil identities such as N-numbers.
- R03: [FAA AIM §4-2-4](https://www.faa.gov/air_traffic/publications/atpubs/aip_html/chap4_section_2.html)
  — model/manufacturer plus registration spoken form.
- Trainer delta: alias resolution is a deterministic live-roster convenience;
  exact full alias tails are required and no session abbreviation is modeled.

## Scope

- Extend parser roster options with canonical callsign plus authored aliases.
- Support `N123`, `November one two three`, `Skyhawk 123`, and
  `Skyhawk one two three` in existing callsign slots.
- Increase spoken N-number digit parsing from four to five digits.
- Preserve existing airline telephony and unique numeric suffix behavior.
- Apply precedence: exact canonical > exact alias+tail > existing unique suffix
  > selected fallback only when no explicit callsign exists.
- Return `PARSE_MISS` for unknown/ambiguous alias grounding.
- Preserve pilot-level `UNKNOWN_CALLSIGN` and `AMBIGUOUS_CALLSIGN` only for
  commands that reach pilot resolution without a parser miss.
- Add tests for ordering, incomplete forms, duplicate aliases, and side effects.

## Exact forms and rejection behavior

- Valid: `Skyhawk 123 H270`, `Skyhawk one two three turn left heading 270`.
- Incomplete: `Skyhawk` → `PARSE_MISS`.
- Malformed: `Skyhawk 12X` → `PARSE_MISS`.
- Unknown alias: `Citation 123` without authored live candidate → `PARSE_MISS`.
- Ambiguous alias: multiple live candidates → `PARSE_MISS`.
- Alias in arbitrary instruction text is not a callsign.
- Selected aircraft is never used to resolve an explicit alias.

## Out of scope

- N-prefix abbreviation to longer registrations.
- Alias-only callsigns.
- Fuzzy alias repair or Path C model inference.
- Changes to Command IR instruction types.

## Implementation notes

Keep `src/parse` DOM-free. Use a structured candidate type such as
`{ callsign, aliases }`; retain the existing canonical-only option for callers
that do not need aliases. Do not add a separate parser for voice.

No preview/mode state exists. On `PARSE_MISS`, no command dispatch or aircraft
mutation is allowed.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `N123 H270` | Canonical `N123` command | Existing heading mutation only | Unknown roster identity follows existing behavior | R01 §2-3-5 |
| `Skyhawk 123 H270` | Returns canonical `callsignToken: N123` | Same command as canonical form | No candidate → `PARSE_MISS` |
| `Skyhawk one two three` | Same canonical result | No alias stored in Command IR | Bad number → `PARSE_MISS` |
| `Skyhawk` | No callsign result | No selected fallback | Incomplete → `PARSE_MISS` |
| Two matching aliases | No parse result | No aircraft mutation | Ambiguous → `PARSE_MISS` |
| `123 H270` with unique airline suffix | Existing suffix behavior | Existing command path | Ambiguous suffix remains `PARSE_MISS` |
| `N12345 H270` | Five-digit canonical N-number | Complete value preserved | Six digits rejected |
| `turn Skyhawk 123 heading 270` | Alias accepted only if this is an existing callsign slot | Normal command only | Alias in unsupported slot → `PARSE_MISS` |

## Acceptance criteria

- [ ] **AC1:** Canonical and alias forms compile to the same canonical token.
- [ ] **AC2:** Five-digit spoken N-numbers parse without truncation.
- [ ] **AC3:** Unknown, incomplete, malformed, and ambiguous aliases return
  exact `PARSE_MISS` and never dispatch.
- [ ] **AC4:** Existing airline callsign and suffix tests remain green.
- [ ] **AC5:** Tests cover field/order variants and selected-aircraft safety.
- [ ] **AC6:** Command IR contains only canonical callsign values.
- [ ] **AC7 — Research:** Parser comments document FAA identity analog and
  exact-tail trainer delta.

## Test plan

- Unit: spoken alias grammar, five-digit N-number grammar, candidate grounding.
- Integration: `parseCommand` plus pilot dispatch for canonical/alias/ambiguous.
- Manual: type and speak canonical and alias examples in the command line/PTT.

## Help/docs

T03-31 owns Help and `docs/USER.md`; this ticket provides test examples for
those surfaces.

## Suggested files

- `src/parse/spoken/telephony.ts`
- `src/parse/parse-command.ts`
- `src/parse/path-c.ts` shared candidate types if needed
- `src/speech/voice-loop.ts`
- `src/pilot/handleRadioText.ts`
- parser/pilot tests

