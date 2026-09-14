# T02-196 route matching acceptance and documentation

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-195  
**Blocks:** none  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only. Stop at the configured swarm boundary.

## Goal

Prove that tactical direct, deterministic route parsing, structured navaid
grounding, and constrained Path C produce the same canonical route behavior.
Document the supported forms and failure boundaries without changing route
execution or flight-plan semantics.

## Context

T02-189 through T02-192 established arbitrary ordered route segments. This
ticket covers the follow-up matching path end to end: the shared matcher must
resolve a route when possible, and Path C must receive enough evidence to
recover only a supported route when local parsing cannot form one complete
chain.

## Research

- **R01:** FAA JO 7110.65,
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/;
  Search: `FAA JO 7110.65 4-2-1 4-2-5 4-4-1 4-4-2`.
- **R02:** FAA Pilot/Controller Glossary,
  https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/;
  Search: `FAA glossary direct between NAVAIDs route`.
- **R07:** CRC STARS reference,
  https://docs.virtualnas.net/crc/stars/; Search: `CRC STARS route clearance`.

FAA/CRC sources inform terminology and route-order review. Shared matching,
implicit direct, and constrained Path C remain ATC-SIM trainer behavior.

## Contract

Supported forms remain:

```text
<ACID> CLR|CLEARED TO <LIMIT>
  VIA DIRECT
  VIA <fix/navaid/procedure chain>
  VIA RADAR VECTORS
  AS FILED
  [ALT <hundreds>] [CVIA] [FREQ <value>] [SQ <code>]
```

No preview, mode, shortcut, or modifier routing changes. Parser misses never
reach Command construction or application. Accepted routes use the existing
aircraft-owned active-clearance snapshot; editable flight-plan metadata stays
unchanged.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `united 8431 clear to Atlanta International Airport via kimmy swept direct` with supplied `KIMMY`,`SWEPT` | `UAL8431`, KATL, ordered `KIMMY`,`SWEPT` | Active route snapshot only after validation; plan unchanged | If KIMMY absent, `PARSE_MISS`; never `DIRECT ATL` | FAA JO 7110.65 §§ 4-2-1, 4-4-1 |
| Same route with unique `KIMMI`/`SWEPR` distance-1 repairs | Same canonical route; deterministic stage wins | No Path C call | Ambiguous repair -> `PARSE_MISS` | Trainer delta; R01 |
| NAVAID ident/name plus fix chain | Same typed/spoken/Path C IR | Ordered FMS visits and readback | Duplicate navaid name -> `PARSE_MISS` | R01; R02 |
| `via direct swept direct kimmy direct bluff direct` | Three ordered direct segments | Existing FMS/readback behavior | Omitted/concatenated candidate -> `PARSE_MISS` | FAA JO 7110.65 §§ 4-2-5, 4-4-1 |
| `cleared direct AHN` | Tactical `DIRECT AHN` | Existing tactical side effect only | Must not become IFR clearance | R01; Command IR separation |
| Invalid route with existing active clearance | Rejected atomically | Existing active route, plan, and aircraft state retained | Application error remains `UNABLE_ROUTE` where reached | Supplied manual § 5.5.5 p. 5-105, § 5.6.17 p. 5-167 |
| Route plus optionals in valid order | Route and `ALT`/`CVIA`/`FREQ`/`SQ` preserved | Existing optional side effects only | Reordered/duplicate fields remain rejected | FAA JO 7110.65 § 4-2-1 |

## Scope

- Add/extend one feature-level acceptance suite with synthetic catalog entries
  for fixes, navaids, aliases, ambiguity, and long chains.
- Cover typed, Path A, Path B, deterministic near-match, and Path C parity.
- Verify Path C receives grouped candidates and cannot return tactical direct,
  a concatenated ID, an airport route leg, or an omitted span.
- Verify active-clearance snapshot, FMS cursor, readback, and flight-plan
  immutability remain unchanged.
- Update Help and `docs/USER.md` with navaid ident/name behavior, route
  examples, implicit `DIRECT`, candidate-grounded Path C, and exact misses.

## Implementation notes

- Use synthetic minimal fixtures for generic matcher behavior; use committed
  KATL data only for the existing Atlanta regression.
- Preserve one acceptance/integration suite for the shipped feature.
- Help must say `PARSE_MISS`/unable behavior plainly and must not promise
  complete FAA/NAS speech understanding.
- No new scope key, preview state, Command IR type, or flight-plan mutation.

## Acceptance criteria

- [ ] Exact, alias, unique distance-1, and navaid-name routes are covered.
- [ ] Ambiguous, unknown, airport, concatenated, omitted, and tactical Path C
  outputs are rejected.
- [ ] Typed, spoken, and Path C routes produce equivalent canonical segments.
- [ ] FMS visits every route segment in order and readback preserves order.
- [ ] Invalid clearance retains prior active route and leaves the plan unchanged.
- [ ] Help and `docs/USER.md` describe the actual matcher/fallback behavior.
- [ ] `npm run ci` passes.
- [ ] `cd speech-api && SPEECH_API_MOCK=1 pytest` passes.
- [ ] Supplied-manual and FAA review records trainer deltas and no in-scope
  failures.

## Test plan

- Integration: exact Atlanta chain, three-plus chain, navaid alias chain,
  deterministic near-match, Path C recovery, and atomic rejection.
- Unit: readback zero/one/many route elements and parser error boundaries.
- Python: mock/eval corpus for supplied candidates and invalid near-misses.
- Manual: inspect Help and `docs/USER.md`; review route ordering and clearance
  item terminology against FAA JO 7110.65 §§ 4-2-1, 4-2-5, 4-4-1, 4-4-2 and
  supplied STARS manual § 5.5.5 p. 5-105 / § 5.6.17 p. 5-167.

## Help/docs

- `src/scope/keymap.ts` Help: route chains, optional `DIRECT`, navaid names,
  and constrained Path C wording.
- `docs/USER.md`: exact supported grammar, examples, catalog requirement,
  `PARSE_MISS`, and no-invention boundary.

## Out of scope

- New route semantics, airway/hold/vector expansion, airport search, cloud
  inference, new scenario rows, or changes to readback templates outside
  ordered route coverage.

## Suggested files

- `tests/integration/ifr-clearance-route-chain.test.ts`
- `src/parse/test/ifrClearance.test.ts`
- `src/parse/test/path-c.test.ts`
- `src/pilot/test/readback.test.ts`
- `speech-api/tests/test_parse.py`
- `speech-api/eval_parse.py`
- `src/scope/keymap.ts`
- `docs/USER.md`

## Handoff

Return exactly `READY TO MERGE` or `BLOCKED`, including changed paths, focused
tests, `npm run ci`, speech mock pytest, and manual-review notes. No merge or
push by worker. Captain performs the squash merge and final phase handoff.
