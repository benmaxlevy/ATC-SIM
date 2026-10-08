# T03-27 Aircraft spoken-alias data and runtime propagation

**Phase:** 03 Voice  
**Priority:** P0  
**Size:** M  
**Depends on:** `none`  
**Blocks:** T03-28, T03-29, T03-30, T03-31  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Add explicit spoken aircraft aliases to the generic aircraft profile JSON and
propagate them to every current VFR aircraft without replacing the canonical
N-number callsign.

## Context

`Aircraft.callsign` is the canonical roster/state identity. Existing VFR types
are data-driven from `generalAviation` in
`src/core/performance/aircraft-profiles.json`; no facility-specific branch is
allowed. The alias is presentation and parser-grounding data only.

## Research

- R01: [FAA JO 7110.65](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/)
  — controller aircraft identity remains canonical.
- R03: [FAA AIM §4-2-4](https://www.faa.gov/air_traffic/publications/atpubs/aip_html/chap4_section_2.html)
  — pilots may state type/model/manufacturer plus registration characters and
  drop the `N` prefix when the type/model/manufacturer is spoken.
- Trainer delta: aliases are explicit simulator data; this is not a claim that
  the trainer implements every real-world abbreviated-call-sign rule.

## Scope

- Add `spokenAliases?: readonly string[]` to the profile override/data types.
- Populate all current `generalAviation` profiles:
  `BE36=Bonanza`, `C172=Skyhawk`, `C182=Skylane`, `C208=Caravan`,
  `DA40=Diamond`, `PA28=Archer`, `SR22=Cirrus`.
- Validate aliases as non-empty words/phrases and preserve stable preferred
  order; never derive them by parsing `representativeVariant`.
- Add `spokenAliases` to `Aircraft`/`AircraftInit` or the equivalent generic
  runtime propagation seam used by VFR spawning.
- Preserve canonical uppercase `callsign` in state, logs, datablocks, and
  command objects.
- Add a generic registry accessor for aliases; no KDEM or facility branch.
- Add profile/runtime tests proving all VFR catalog keys receive aliases.

## Out of scope

- Callsign parsing or roster grounding.
- Pilot sentence formatting.
- Path C, GBNF, speech-api, or UI Help changes.
- Non-N registrations, airline aliases, or new VFR types.

## Implementation notes

Use explicit profile data, not aliases inferred from aircraft-type strings.
Multiple aliases are supported for future data, but the first alias is the
preferred pilot name. Empty aliases are invalid when the field is present.

No preview/mode state, modifier routing, lifecycle transition, or command
payload is introduced by this data-only ticket.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `C172` profile lookup | Returns `spokenAliases: ["Skyhawk"]` | Runtime aircraft receives alias separately from `callsign` | Missing/empty alias is rejected by schema validation | R03 §4-2-4 |
| `N123` VFR aircraft | Runtime identity remains `N123` | Alias metadata only | Alias must never become `Skyhawk 123` in `callsign` | R01 aircraft identity |
| All seven `generalAviation` keys | Each has a preferred spoken alias | Generic VFR spawns inherit it | No hard-coded type switch | Data inspection |
| Unknown/non-VFR type | Existing profile fallback remains | No guessed alias | No alias inferred from display text | Generic profile contract |

## Acceptance criteria

- [ ] **AC1:** Profile types expose validated optional `spokenAliases`.
- [ ] **AC2:** Every current VFR profile has the approved alias data.
- [ ] **AC3:** Every VFR spawn carries aliases without changing canonical callsign.
- [ ] **AC4:** Synthetic profile tests cover missing, empty, duplicate, and
  multiple-alias values.
- [ ] **AC5:** No facility-specific alias branch exists.
- [ ] **AC6 — Research:** A code comment records FAA identity analog plus the
  trainer alias delta.

## Test plan

- Unit: profile parsing/validation, registry lookup, `createAircraft`.
- Integration: synthetic VFR spawn receives aliases and preserves N-number.
- Manual: inspect each seven JSON entries and confirm no live path uses an
  alias as canonical identity.

## Help/docs

No user-facing Help change belongs here; T03-31 owns the user surfaces.

## Suggested files

- `src/core/performance/types.ts`
- `src/core/performance/registry.ts`
- `src/core/performance/aircraft-profiles.json`
- `src/core/aircraft.ts`
- `src/scenario/vfrTraffic.ts`
- profile/runtime tests

