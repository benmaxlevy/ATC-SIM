# T03-31 Callsign alias acceptance, Help, and documentation

**Phase:** 03 Voice  
**Priority:** P0  
**Size:** M  
**Depends on:** T03-27, T03-28, T03-29, T03-30  
**Blocks:** none  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Prove the complete canonical/alias callsign feature and update every required
user-facing and shared contract surface.

## Context

The feature changes typed English, spoken grammar, pilot speech, Path C
grounding, and five-digit N-number behavior. Help and `docs/USER.md` must teach
the actual syntax without claiming unsupported abbreviation behavior.

## Research

- R01: [FAA JO 7110.65](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/)
  — identity/readback terminology.
- R03: [FAA AIM §4-2-4](https://www.faa.gov/air_traffic/publications/atpubs/aip_html/chap4_section_2.html)
  — aircraft model/manufacturer plus registration speech.
- Trainer delta: exact alias plus complete tail is required; no session-based
  abbreviation or non-N registration support.

## Scope

- Add one focused integrated acceptance file covering all seven VFR aliases.
- Update `src/ui/overlays/ScopeHelpOverlay.tsx` and its tests with examples:
  `N123`, `Skyhawk 123`, and alias ambiguity behavior.
- Update `docs/USER.md` with canonical/alias input and pilot-output rules.
- Update `phases/03-voice/README.md` callsign grammar and five-digit limit.
- Update `phases/_shared/parse-pipeline.md` grounding precedence and Path C
  canonical-output rule.
- Update `speech-api/README.md` Path C alias-candidate contract if T03-30
  changes its documented context.
- Ensure the feature is not added to the later implementation backlog as an
  unimplemented item after shipping.
- Run focused tests, `npm run ci`, speech-api mock pytest, and `git diff --check`.

## Exact forms and rejection behavior

- Valid: `N123 H270`, `Skyhawk 123 H270`, and spoken equivalents.
- Incomplete: `Skyhawk` → `PARSE_MISS`; no selected fallback.
- Ambiguous: two matching aliases → `PARSE_MISS`; no mutation.
- Unknown: unlisted alias → `PARSE_MISS` or existing pilot unknown-callsign
  behavior where parser grounding is intentionally absent.
- Unsupported: short N-prefix abbreviation and incomplete alias tails are not
  documented or accepted.

## Out of scope

- New runtime behavior outside callsign identity/presentation.
- Controller workflow changes unrelated to callsigns.
- New aircraft profiles beyond the seven current VFR types.
- STARS UI claims or operational certification claims.

## Implementation notes

No preview/mode state exists for callsign aliases. The Help reference must say
that the alias is selected from aircraft data and that the canonical N-number
remains the underlying aircraft identity.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `N123 H270` | Canonical command succeeds | Targets `N123` | Unknown identity follows existing error | R01 identity |
| `Skyhawk 123 H270` | Alias command succeeds | Targets canonical `N123` | Unknown alias → `PARSE_MISS` |
| Pilot `N123` with alias | Output says `Skyhawk one two three` | State/logs retain `N123` | No alias uses N-number |
| `Skyhawk` | No command | No mutation | Incomplete → `PARSE_MISS` |
| Duplicate alias match | No command | No selected-aircraft fallback | Ambiguous → `PARSE_MISS` |
| Five-digit `N12345` | Parses and displays fully | No truncation | Six-digit form rejected |

## Acceptance criteria

- [ ] **AC1:** One integrated acceptance suite covers controller input, pilot
  output, all seven aliases, canonical preservation, ambiguity, unknown,
  incomplete, and five-digit cases.
- [ ] **AC2:** Help overlay contains valid examples and rejection rules.
- [ ] **AC3:** `docs/USER.md` documents canonical N-number versus alias usage.
- [ ] **AC4:** Phase README and shared parse pipeline match implementation.
- [ ] **AC5:** Speech API README and GBNF/Path C documentation are consistent.
- [ ] **AC6:** `npm run ci` passes.
- [ ] **AC7:** `cd speech-api && SPEECH_API_MOCK=1 pytest` passes.
- [ ] **AC8:** `git diff --check` passes.
- [ ] **AC9 — Research:** User-facing terms use `callsign`, `readback`,
  `aircraft`, and `N-number`; no unsupported STARS/NAS claim is added.

## Test plan

- Unit: Help copy and parser/pilot regression tests.
- Integration: synthetic seven-type callsign alias acceptance.
- API: speech mock/eval tests from T03-30.
- Manual: type and speak canonical/alias forms; inspect pilot readback and Help.

## Help/docs

This ticket owns:

- `src/ui/overlays/ScopeHelpOverlay.tsx`
- `src/ui/overlays/test/ScopeHelpOverlay.test.ts`
- `docs/USER.md`
- `phases/03-voice/README.md`
- `phases/_shared/parse-pipeline.md`
- `speech-api/README.md` as needed

## Suggested files

- `src/parse/test/aircraftCallsignAliasAcceptance.test.ts`
- `src/pilot/test/aircraftCallsignAliasAcceptance.test.ts`
- `src/ui/overlays/ScopeHelpOverlay.tsx`
- `src/ui/overlays/test/ScopeHelpOverlay.test.ts`
- `docs/USER.md`
- phase/shared/speech documentation

