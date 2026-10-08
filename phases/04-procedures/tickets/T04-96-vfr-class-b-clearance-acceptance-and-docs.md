# T04-96 VFR Class B clearance acceptance and documentation

**Phase:** 04 Procedures (VFR Class B clearance)
**Priority:** P0
**Size:** M
**Depends on:** T04-95
**Blocks:** none
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Stop at the configured swarm boundary.

## Goal

Prove the complete VFR Class B clearance workflow, including explicit
`REMAIN OUTSIDE BRAVO AIRSPACE` and `RESUME APPROPRIATE VFR ALTITUDES`, and
align user/phase/backlog documentation.

## Research

- **R01:** FAA JO 7110.65 §7-9-2, Class B clearance phraseology and leaving
  notification:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_9.html
- **R01:** FAA JO 7110.65 §7-9-3, Class B routing and temporary leave/reentry,
  same source.
- **R01:** FAA JO 7110.65 §7-9-7, altitude assignments, same source.
- **R03:** AIM §3-2-3, Class B entry/transit/departure:
  https://www.faa.gov/air_traffic/publications/aim_html/chap3_section_2.html

Trainer delta: synthetic fixtures and deterministic routing prove behavior; the
sim remains training/entertainment software and does not claim FAA certification.

## Scope

- Extend one integrated acceptance file; do not create a second acceptance pile.
- Cover VFR-only `TO_ENTER`, `THROUGH`, `OUT_OF`, and `REMAIN_OUTSIDE_BRAVO`.
- Cover `RESUME_APPROPRIATE_VFR_ALTITUDES` and automatic resume on exit when a
  Class B-specific altitude assignment existed.
- Prove entered/exited/conformance events and exact FAA-required exit notice.
- Prove no automatic radar-service termination or squawk change.
- Update `docs/USER.md`, `phases/04-procedures/README.md`,
  `phases/_shared/command-ir.md`, `phases/_shared/parse-pipeline.md`, and the
  existing Class B subsection of `phases/LATER-IMPLEMENTATION-BACKLOG.md`.
- Do not create a new backlog addendum for `REMAIN_OUTSIDE_BRAVO`; it is part of
  this slice. Update the existing subsection only after implementation is real.

## Acceptance contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Synthetic VFR `TO_ENTER` outside Bravo | Accepted and enters | VFR remains VFR; accepted/entered events | IFR or already inside → exact rejection | R01 §7-9-2 |
| Synthetic VFR `THROUGH VIA FIX THEN FIX` | Completes transit | Route conformance and exit event | Route misses required boundary semantics → atomic rejection | R01 §§7-9-2/3 |
| Synthetic VFR `OUT_OF` inside Bravo | Exits | Clearance ends at exit; FAA leaving notice logged | Outside at issue → exact rejection | R01 §7-9-2; AIM §3-2-3 |
| Synthetic VFR `REMAIN OUTSIDE BRAVO AIRSPACE` | Remains outside | Existing safe route preserved or deterministic safe suffix applied | Inside/no safe continuation → exact rejection | R01 §7-9-2 |
| `RESUME APPROPRIATE VFR ALTITUDES` after Class B altitude assignment | Restores appropriate VFR altitude | Clears the temporary Class B altitude; no service/squawk change | No saved assignment or IFR → exact rejection | R01 §7-9-7 |
| No explicit clearance with entry-directed route | Entry blocked | Existing autonomous avoidance remains active | No implicit authorization from `MVFR`, radar contact, or cancellation | Backlog contract |
| Exit boundary crossing | Required notification only | `LEAVING (name) BRAVO AIRSPACE` | No automatic `RADAR SERVICE TERMINATED` or `SQ VFR` | R01 §§7-9-2/3 |
| Active clearance plus `H`/`DCT` | Route amendment | VFR state and services preserved | Invalid operation/path → atomic rejection | R01 §§7-9-2/3 |
| Typed/Path A/B/Path C/PTT | Same observable result | Closed-union parity | Missing/ambiguous route evidence → parse miss | Parser parity suite |
| Eight approved `TO_ENTER` wording variants | Same `TO_ENTER` result | Alias normalization preserves suffix order | Bare `CLEARED INTO BRAVO` and fuzzy paraphrases → parse miss | R01 §7-9-2 |

## Acceptance criteria

- [ ] One integrated acceptance file proves all four command forms.
- [ ] Tests prove all supported clearances keep aircraft operationally VFR.
- [ ] Tests prove `REMAIN_OUTSIDE_BRAVO` is an active slice feature, not a
  future backlog item.
- [ ] Tests prove explicit and exit-triggered
  `RESUME_APPROPRIATE_VFR_ALTITUDES` restore VFR altitude behavior only after a
  Class B-specific assignment.
- [ ] Tests prove required exit notification and no optional automatic service/
  squawk changes.
- [ ] Tests prove route amendment, conformance, boundary events, altitude
  validation, and atomic rejection.
- [ ] Existing outside-Bravo IFR cancellation/replan behavior remains green.
- [ ] Existing backlog subsection is updated in place; no duplicate addendum is
  added.
- [ ] Help, user docs, phase README, shared contracts, `npm run ci`, speech mock
  pytest, and `git diff --check` pass.

## Test plan

- Integration: synthetic regional Class B session covering enter, through, out,
  remain-outside, amendment, entry without clearance, exit notification, and
  explicit/automatic VFR altitude resume.
- Parser: valid/incomplete/malformed/ambiguous/order/parity matrix from T04-94.
- Regression: IFR cancellation, flight following, radar contact, beacon, and
  editable flight plan.
- Manual: record seed/callsign, command text, VFR state, route, altitude
  restoration, events, exit notification, and absence of automatic
  service/squawk mutation. Review JO 7110.65 §§7-9-2, 7-9-3, 7-9-7 and AIM
  §3-2-3.

## Suggested files

- `tests/integration/satellite-traffic-acceptance.test.ts`
- `src/core/test/vfrNavigation.test.ts`
- `src/pilot/test/classBclearance.test.ts`
- `docs/USER.md`
- `phases/04-procedures/README.md`
- `phases/_shared/command-ir.md`
- `phases/_shared/parse-pipeline.md`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`

## Out of scope

- `CLEARED AS REQUESTED` request lifecycle.
- Class C/D, SVFR, VFR-on-top, visual landmarks, VFR corridors, tower cab,
  terrain/weather, certified separation, and phase 5.
- New backlog addendum for `REMAIN_OUTSIDE_BRAVO`.

## Handoff

Return exactly `READY TO MERGE` or `BLOCKED`, including focused acceptance,
full CI, speech mock pytest, diff-check, documentation review, and manual
evidence status.
