# T02-190 IFR clearance route-window parser and grounding

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-189  
**Blocks:** T02-191, T02-192  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only; stop at configured boundary.

## Mission

Parse the route section after `VIA` as an ordered, arbitrarily long sequence.
Use `DIRECT` as an optional explicit connector. When a route fix or navaid is
catalog-grounded without `DIRECT`, assume a direct leg. Keep route parsing
separate from clearance-limit and optional-field parsing.

## Entry and grammar

The existing IFR clearance entry remains the only entry:

```text
<ACID> CLR|CLEARED TO <LIMIT> (AS FILED | ASFILED | VIA <ROUTE-SECTION>)
```

The route section begins immediately after `VIA` and ends at the next known
clearance section: `ALT`, `MAINTAIN`, `CLIMB`, `DESCEND`, `CLIMB VIA`,
`DESCEND VIA`, `FREQ`, `CONTACT`, `SQUAWK`, `EXPECT`, or the supported
clearance terminator. Existing optional fields remain ordered as
`ALT`, `CVIA`, `FREQ`, `SQ` after the route section.

Within the route section:

```text
DIRECT <fix-or-navaid>  => explicit direct segment
<fix-or-navaid>          => implicit direct segment
<procedure> [transition] => procedure segment, catalog-grounded
THEN                     => optional route separator
DIRECT                   => direct to the clearance limit when terminal
```

`AS FILED` and `RADAR VECTORS` remain exclusive access modes. A lone `VIA`
without a route body is a parse miss. A lone `VIA DIRECT` is valid and means
direct to the limit. A marker between route elements never creates a segment
by itself.

Grounding precedence is: explicit procedure/transition match, then current
`PROCEDURE`/`VIA` catalog context, then the first unambiguous fix/navaid
catalog match. Multi-word spoken aliases use the longest exact catalog match.
Ambiguous full-route segmentations do not guess.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `via direct` | Empty explicit route | No world mutation during parsing | `via` alone -> `PARSE_MISS` | FAA JO 7110.65 §4-2-1 |
| `via SWEPT HOUND` | `[DIRECT SWEPT, DIRECT HOUND]` | Preserve source order | Unknown body token -> `PARSE_MISS` | FAA JO 7110.65 §§4-4-1, 4-4-2 |
| `via direct SWEPT direct HOUND direct` | Same two direct segments | No special fix branch | Marker with no valid target -> `PARSE_MISS` | FAA JO 7110.65 §§4-2-5, 4-4-1 |
| `via SID1 NORTH HOUND` | `[PROCEDURE SID1/NORTH, DIRECT HOUND]` | Transition consumed only when catalog-valid | Ambiguous procedure or transition -> `PARSE_MISS` | FAA JO 7110.65 §§4-2-1, 4-4-2 |
| `via SWEPT HOUND ALT 7000 FREQ 125.5 SQ 1234` | Route ends before `ALT`; optionals parse in order | Optional fields remain separate | Optional field before route completion -> existing parse rejection | FAA JO 7110.65 §§4-2-1, 4-2-5 |
| Airport name/ICAO inside route section | No route segment emitted | Airport namespace remains clearance-limit-only | `PARSE_MISS`, no airport-as-fix fallback | Supplied STARS manual §§5.5.5 p. 5-95, 5.6.17 p. 5-167; trainer namespace rule |
| Two valid catalog segmentations | No command emitted | No state mutation | `PARSE_MISS`; do not choose by file order | Generic catalog ambiguity contract |

## Scope

- Add one reusable route-window scanner/grounder used by typed and spoken
  deterministic parser paths.
- Preserve Path A before Path B before Path C routing.
- Preserve tactical `CLEARED/PROCEED DIRECT` precedence outside IFR clearance
  syntax.
- Enumerate catalog phrase matches before selecting a complete segmentation;
  do not greedily truncate or impose a fixed chain length.
- Keep all identifier matching generic across airports, fixes, navaids,
  procedures, transitions, and spoken aliases.
- Update typed parser, spoken grammar, pattern matcher, parser grounding, and
  focused tests.
- Update `phases/_shared/parse-pipeline.md` with route-window boundaries,
  precedence, fallback routing, and rejection behavior.

## Acceptance criteria

- [ ] Arbitrary ordered chains parse without a one-fix/two-element branch.
- [ ] Explicit and implicit direct forms produce identical canonical segments.
- [ ] Multi-word aliases are matched as complete catalog phrases.
- [ ] Procedure/transition pairs are consumed only when catalog-valid.
- [ ] Optional fields are not swallowed by the route scanner.
- [ ] Unknown, ambiguous, malformed, incomplete, and airport route tokens
  return `PARSE_MISS`.
- [ ] Existing direct tactical commands and all current clearance forms remain
  correctly routed.

## Test plan

- Synthetic parameterized route windows with zero, one, three, and many legs.
- Typed and spoken parity for implicit/explicit `DIRECT`.
- Mixed fix/navaid/procedure/transition chains.
- Multi-word alias and longest-match cases.
- Route followed by each optional field and meaningful ordering permutations.
- Incomplete `VIA`, duplicate marker, unknown, airport, and ambiguous cases.
- Regression for `endeavor seventy one fourteen ... via direct swept direct`.
- `npm run ci`.

## Manual review

- Review clearance item ordering and route-window interpretation against FAA
  JO 7110.65 §§4-2-1 and 4-2-5.
- Review direct and point-to-point route semantics against §§4-4-1 and 4-4-2.
- Review displayed/issued route behavior against supplied STARS manual §§5.5.5
  p. 5-95 and 5.6.17 p. 5-167.
- Record implicit-direct syntax as ATC-SIM trainer grammar where it extends
  published phraseology.

## Non-goals

No fuzzy repair in deterministic paths, airway/radial/arc expansion,
geographic search, airport direct commands, route amendment semantics, cloud
LLM calls, or changes to tactical direct.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, including changed paths,
focused tests, `npm run ci`, and manual/FAA review notes. No merge or push by
worker.
