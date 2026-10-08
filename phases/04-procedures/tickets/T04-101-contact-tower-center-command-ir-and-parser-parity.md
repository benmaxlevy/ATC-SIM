# T04-101 Contact Tower/Center Command IR and parser parity

**Phase:** 04 Procedures (communications-transfer addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-100
**Blocks:** T04-102
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Mission

Add controller-issued `CONTACT_TOWER` and `CONTACT_CENTER` instructions to the
closed Command IR and every parser path. These commands carry a facility name
for phraseology and readback only. They do not carry a frequency and do not
look up an individual facility.

## Research

- FAA JO 7110.65 §2-1-15, Control Transfer:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_1.html
  Control transfers occur at a prescribed or coordinated location, time, fix,
  or altitude and only after potential conflicts are addressed.
- FAA JO 7110.65 §2-1-17, Radio Communications:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_1.html
  Transfer phraseology identifies the facility/location and terminal function;
  frequency is normally included in real FAA operations.
- FAA JO 7110.65 §7-6-8, Control Transfer:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_6.html
  Approach instructs VFR aircraft to contact tower at a coordinated point.

Trainer delta: this slice intentionally omits frequency, individual facility
entities, catalog identity validation, and Raytheon STARS behavior. The facility
name is syntax/readback/log data only.

## Contract

### Exact IR

```ts
| { type: "CONTACT_TOWER"; facilityName: string }
| { type: "CONTACT_CENTER"; facilityName: string }
```

### Exact grammar and routing

- `CONTACT <facility-name> TOWER`
- `CONTACT <facility-name> CENTER`
- Facility name is required and contains 1–4 name tokens.
- Matching is case-insensitive; readback uses the canonical parsed name.
- `CONTACT TOWER` and `CONTACT CENTER` are incomplete and reject.
- A frequency is never accepted, including as an optional suffix.
- No alternate phrase aliases are added in this ticket.
- A transmission contains one instruction. Bundled contact plus another
  instruction rejects atomically.
- A syntactically valid but unknown facility name is retained as text; no
  facility catalog lookup occurs.

### Lifecycle and effects

Parsing and preview produce an instruction only. Runtime transfer gates and
side effects belong to T04-102. The parser must not move an aircraft, change
flight rules, edit a flight plan, change a beacon, terminate radar service, or
authorize Class B entry.

Readback clauses are deterministic:

- `N123 contact Atlanta tower`
- `N123 contact Atlanta center`

The existing callsign/radio routing wrapper remains responsible for associating
the instruction with an aircraft.

## Acceptance contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `N123 CONTACT ATLANTA TOWER` | Emits `CONTACT_TOWER` with `facilityName: "ATLANTA"` | No parser-side world mutation | None | JO §2-1-17 |
| `N123 CONTACT ATLANTA CENTER` | Emits `CONTACT_CENTER` with `facilityName: "ATLANTA"` | No parser-side world mutation | None | JO §2-1-17 |
| `N123 CONTACT ATHENS TOWER` | Emits tower IR with `ATHENS` | Name retained for readback/log only | No catalog identity check | Trainer delta |
| `N123 CONTACT TOWER` | Parse miss | No IR or runtime mutation | Required facility name missing | Grammar contract |
| `N123 CONTACT ATLANTA` | Parse miss | No IR or runtime mutation | Terminal function missing | Grammar contract |
| `N123 CONTACT ATLANTA TOWER 118.5` | Parse miss | No IR or runtime mutation | Frequency unsupported | User scope decision |
| `N123 CONTACT ATLANTA TOWER SQ 1200` | Parse miss | No partial contact or squawk effect | Bundled instruction forbidden | Single-instruction rule |
| Typed, Path A, Path B, Path C, and PTT forms | Same closed IR shape | Only channel/stage metadata may differ | Unsupported field or missing transcript evidence rejects | Path-C parity guard |

## Acceptance criteria

- [ ] Frontend Command IR and deterministic parser emit both exact instruction
  types with the exact field name.
- [ ] Path A, Path B, Path C, PTT, speech-api instruction set, prompt, GBNF,
  semantic validator, mock/contract tests, and live eval corpus agree.
- [ ] Parser precedence distinguishes TOWER and CENTER and never consumes a
  frequency or bundled second command.
- [ ] Incomplete, malformed, extra-frequency, ambiguous, and ordering cases
  reject without side effects.
- [ ] Readbacks, Help overlay, `docs/USER.md`, phase README, and shared
  Command IR/parse-pipeline contracts document exact forms and no-frequency
  behavior.
- [ ] `npm run ci` and `cd speech-api && SPEECH_API_MOCK=1 pytest` pass.

## Test plan

- Unit: exact positive forms, 1-token and 4-token facility names, missing
  facility/function, extra frequency, duplicate function, and bundled commands.
- Parity: browser, typed, Path A/B/C, PTT, speech mock, and eval-corpus IR
  equivalence.
- Manual: issue both commands with a synthetic eligible aircraft and verify
  exact readback text; verify `118.5` is not accepted.

## Non-goals

- Runtime eligibility or transfer effects (T04-102).
- Individual tower/center simulation or facility identity lookup.
- Frequency data, frequency validation, or optional frequency support.
- Pilot permission requests.
- Radar handoff UI, STARS functions, tower cab, ground traffic, or phase 5.

## Handoff

Return `READY TO MERGE` only after all parser-path parity checks, focused tests,
CI, speech mock pytest, and documentation checks pass. Return `BLOCKED` with the
exact missing dependency or failed gate otherwise.
