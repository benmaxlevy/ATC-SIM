# T04-94 VFR Class B clearance Command IR and parser parity

**Phase:** 04 Procedures (VFR Class B clearance)
**Priority:** P0
**Size:** M
**Depends on:** T04-93
**Blocks:** T04-95
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Add the closed Command IR and deterministic typed/spoken/Path C grammar for
controller-issued VFR Class B clearances, the explicit denial instruction
`REMAIN OUTSIDE BRAVO AIRSPACE`, and the altitude-restoration instruction
`RESUME APPROPRIATE VFR ALTITUDES`.

The feature remains VFR-only. These instructions never create IFR clearance,
flight-plan, beacon, or service state.

## Research

- **R01:** FAA JO 7110.65 §7-9-2, VFR aircraft in Class B:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_9.html
  Required forms include `CLEARED THROUGH/TO ENTER/OUT OF BRAVO AIRSPACE`,
  optional `VIA (route)`, `MAINTAIN (altitude) WHILE IN BRAVO AIRSPACE`, and
  `REMAIN OUTSIDE BRAVO AIRSPACE`.
- **R01:** FAA JO 7110.65 §7-9-7, VFR altitude assignments, same source.
- **R01:** FAA JO 7110.65 §2-1-18, approval/denial/standby semantics:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_1.html
- **R03:** AIM §3-2-3, Class B entry, transit, and departure requirements:
  https://www.faa.gov/air_traffic/publications/aim_html/chap3_section_2.html

Trainer delta: route names are catalog-grounded fixes/navaids only; visual
landmarks, VFR corridors, and `CLEARED AS REQUESTED` request context are not
part of this slice.

## Command contract

Add to `Instruction`:

```ts
| {
    type: "CLASS_B_CLEARANCE";
    operation: "THROUGH" | "TO_ENTER" | "OUT_OF";
    route?: Array<{ type: "DIRECT"; fixId: string }>;
    altitudeFt?: number;
  }
| { type: "REMAIN_OUTSIDE_BRAVO" }
| { type: "RESUME_APPROPRIATE_VFR_ALTITUDES" }
```

Canonical grammar is identical for typed text and spoken Path A/B:

```text
CLEARED TO ENTER BRAVO AIRSPACE
CLEARED INTO BRAVO AIRSPACE
CLEARED TO ENTER CLASS BRAVO AIRSPACE
CLEARED INTO CLASS BRAVO AIRSPACE
CLEARED TO ENTER THE BRAVO AIRSPACE
CLEARED INTO THE BRAVO AIRSPACE
CLEARED TO ENTER THE CLASS BRAVO AIRSPACE
CLEARED INTO THE CLASS BRAVO AIRSPACE
CLEARED TO ENTER BRAVO AIRSPACE VIA <FIX> THEN <FIX>
CLEARED INTO BRAVO AIRSPACE VIA <FIX> THEN <FIX>
CLEARED TO ENTER CLASS BRAVO AIRSPACE VIA <FIX> THEN <FIX>
CLEARED INTO CLASS BRAVO AIRSPACE VIA <FIX> THEN <FIX>
CLEARED TO ENTER THE BRAVO AIRSPACE VIA <FIX> THEN <FIX>
CLEARED INTO THE BRAVO AIRSPACE VIA <FIX> THEN <FIX>
CLEARED TO ENTER THE CLASS BRAVO AIRSPACE VIA <FIX> THEN <FIX>
CLEARED INTO THE CLASS BRAVO AIRSPACE VIA <FIX> THEN <FIX>
CLEARED TO ENTER BRAVO AIRSPACE VIA <FIX> THEN <FIX> MAINTAIN <ALTITUDE> WHILE IN BRAVO AIRSPACE
CLEARED INTO BRAVO AIRSPACE VIA <FIX> THEN <FIX> MAINTAIN <ALTITUDE> WHILE IN BRAVO AIRSPACE
CLEARED TO ENTER CLASS BRAVO AIRSPACE VIA <FIX> THEN <FIX> MAINTAIN <ALTITUDE> WHILE IN BRAVO AIRSPACE
CLEARED INTO CLASS BRAVO AIRSPACE VIA <FIX> THEN <FIX> MAINTAIN <ALTITUDE> WHILE IN BRAVO AIRSPACE
CLEARED TO ENTER THE BRAVO AIRSPACE VIA <FIX> THEN <FIX> MAINTAIN <ALTITUDE> WHILE IN BRAVO AIRSPACE
CLEARED INTO THE BRAVO AIRSPACE VIA <FIX> THEN <FIX> MAINTAIN <ALTITUDE> WHILE IN BRAVO AIRSPACE
CLEARED TO ENTER THE CLASS BRAVO AIRSPACE VIA <FIX> THEN <FIX> MAINTAIN <ALTITUDE> WHILE IN BRAVO AIRSPACE
CLEARED INTO THE CLASS BRAVO AIRSPACE VIA <FIX> THEN <FIX> MAINTAIN <ALTITUDE> WHILE IN BRAVO AIRSPACE
CLEARED THROUGH BRAVO AIRSPACE [VIA <FIX> THEN <FIX>] [MAINTAIN <ALTITUDE> WHILE IN BRAVO AIRSPACE]
CLEARED OUT OF BRAVO AIRSPACE [VIA <FIX> THEN <FIX>] [MAINTAIN <ALTITUDE> WHILE IN BRAVO AIRSPACE]
REMAIN OUTSIDE BRAVO AIRSPACE
RESUME APPROPRIATE VFR ALTITUDES
```

Rules:

- Optional fields occur only in order: `VIA` route, then `MAINTAIN` altitude.
- `TO_ENTER` accepts exactly the eight listed wording variants: `TO ENTER` or
  `INTO`, with or without `THE`, and with or without `CLASS` before `BRAVO`.
  The selected variant may carry the same optional `VIA` and `MAINTAIN`
  suffixes.
- `THROUGH` and `OUT OF` remain canonical-only; do not add equivalent aliases
  in this ticket.
- `VIA` requires at least one catalog-grounded fix or navaid.
- `THEN` is the only route connector.
- `BRAVO AIRSPACE` must be present; `CLEARED THROUGH BRAVO` is incomplete.
- `RESUME APPROPRIATE VFR ALTITUDES` is a zero-argument instruction; it takes
  no route or altitude value.
- `CLEARED AS REQUESTED` is intentionally unsupported until a Class B request
  record exists.
- No compact aliases are added.
- Bare `CLEARED INTO BRAVO` and unsupported fuzzy paraphrases remain misses.
- `CLASS_B_CLEARANCE` and `REMAIN_OUTSIDE_BRAVO` take precedence over generic
  `IFR_CLEARANCE`, `DIRECT`, `MAINTAIN_VFR`, and request-control matching;
  `RESUME_APPROPRIATE_VFR_ALTITUDES` takes precedence over generic altitude
  matching.
- Spoken or Path C route identifiers must be selected from supplied catalog
  evidence. Tied, unknown, airport-only, or evidence-free names are misses.
- Route parsing must preserve transcript order and reject leftover tokens.

Readback proposal:

```text
(callsign) cleared through Bravo airspace
(callsign) cleared to enter Bravo airspace via DEM then KPDK, maintain three thousand while in Bravo airspace
(callsign) remain outside Bravo airspace
(callsign) resume appropriate VFR altitudes
```

The readback is trainer-generated from the accepted instruction; it is not
claimed as a verbatim pilot-response template in JO 7110.65.

## Acceptance contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `DAL123 CLEARED TO ENTER BRAVO AIRSPACE` | `CLASS_B_CLEARANCE { operation: "TO_ENTER" }` | Parse only; no world mutation | Missing `AIRSPACE` → `PARSE_MISS` | R01 §7-9-2 |
| Any of the eight listed `TO_ENTER` variants, with valid suffixes | Same `TO_ENTER` instruction shape | Parse only; no world mutation | Bare `CLEARED INTO BRAVO`, `THROUGH` aliases, `OUT OF` aliases, or fuzzy paraphrase → `PARSE_MISS` | R01 §7-9-2 |
| `DAL123 CLEARED THROUGH BRAVO AIRSPACE VIA DEM THEN KPDK` | Ordered `DIRECT` route legs | IDs preserve transcript order | Unknown/tied/airport-only route name → `PARSE_MISS` | R01 §7-9-2; catalog grounding |
| `... MAINTAIN THREE THOUSAND WHILE IN BRAVO AIRSPACE` | `altitudeFt: 3000` | Parse only; no flight-rule mutation | Altitude before `VIA`, malformed altitude, or leftover text → `PARSE_MISS` | R01 §7-9-7 |
| `DAL123 CLEARED OUT OF BRAVO AIRSPACE` | `operation: "OUT_OF"` | Parse only | No operation phrase or wrong airspace name → `PARSE_MISS` | R01 §7-9-2 |
| `DAL123 REMAIN OUTSIDE BRAVO AIRSPACE` | `REMAIN_OUTSIDE_BRAVO` | Parse only | `remain clear of bravo` is not accepted unless explicitly added as an alias later | R01 §7-9-2 |
| `DAL123 RESUME APPROPRIATE VFR ALTITUDES` | `RESUME_APPROPRIATE_VFR_ALTITUDES` | Parse only; T04-95 restores saved VFR altitude state | Arguments or a different altitude phrase → `PARSE_MISS` | R01 §7-9-7 |
| `CLEARED THROUGH BRAVO AIRSPACE VIA` | Parse miss | No mutation | Incomplete route → `PARSE_MISS` | Grammar test |
| `CLEARED THROUGH BRAVO AIRSPACE MAINTAIN 3000 VIA DEM` | Parse miss | No mutation | Optional-field order violation → `PARSE_MISS` | Grammar test |
| Path A/B/Path C/PTT equivalent | Same instruction shape | Only `parseStage` differs | Unsupported type, extra key, unlisted ID, or ambiguity → miss | Command IR parity |

## Acceptance criteria

- [ ] `CLASS_B_CLEARANCE`, `REMAIN_OUTSIDE_BRAVO`, and
  `RESUME_APPROPRIATE_VFR_ALTITUDES` exist in the frontend union and
  `INSTRUCTION_TYPES`.
- [ ] Typed, spoken Path A/B, Path C, GBNF, prompt, validator, mock tests, and
  eval corpus agree on the closed shapes.
- [ ] Route grounding uses supplied catalog fixes/navaids only.
- [ ] Callsign resolution and existing IFR-clearance parsing remain unchanged.
- [ ] No parser path emits an IFR instruction, changes `flightRules`, or edits
  a flight plan for these forms.
- [ ] Help/reference docs state VFR-only behavior and unsupported forms.

## Test plan

- Parser unit tests: all eight `TO_ENTER` aliases with no suffix, `VIA`, and
  `MAINTAIN`; incomplete, malformed, ambiguous, unknown, airport-only,
  wrong-order, duplicate, bare, fuzzy, and leftover-token cases.
- Cross-path tests: typed, Path A, Path B, Path C, and speech-api mock parity.
- Regression tests: `IFR_CLEARANCE`, `DIRECT`, `MAINTAIN_VFR`, request controls,
  and existing Class B cancellation behavior.
- Resume tests: exact zero-argument phrase, rejected arguments, typed/spoken/
  Path C parity, and precedence over generic altitude matching.
- Manual review: JO 7110.65 §§7-9-2 and 7-9-7; AIM §3-2-3.

## Suggested files

- `src/core/command/types.ts`
- `src/parse/parse-command.ts`
- `src/parse/spoken/grammar.ts`
- `src/parse/spoken/pattern-matcher.ts`
- `src/parse/path-c.ts`
- `src/pilot/readback.ts`
- `speech-api/parse_engine.py`
- `speech-api/parse_grammar.gbnf`
- `speech-api/tests/test_parse.py`
- `phases/_shared/command-ir.md`
- `phases/_shared/parse-pipeline.md`
- `docs/USER.md`

## Out of scope

- `CLEARED AS REQUESTED`.
- Pilot Class B request scheduling, approval, standby, or `UNABLE` lifecycle.
- Visual landmarks, VFR corridors, SVFR, VFR-on-top, Class C/D authorization.
- Runtime state, geometry, route execution, or boundary events; T04-95 owns those.

## Handoff

Return exactly `READY TO MERGE` or `BLOCKED`, including focused parser tests,
speech mock pytest, changed paths, and manual citation status.
