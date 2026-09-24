# T04-93 IFR cancellation route-replan acceptance and docs

**Phase:** 04 Procedures (satellite traffic follow-up)
**Priority:** P0
**Size:** M
**Depends on:** T04-92
**Blocks:** none
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Stop at the configured swarm boundary.

## Goal

Prove the corrected IFR-cancellation behavior end to end and make the user,
phase, and backlog documentation match the new boundary: outside Class B,
cancel IFR and route VFR around Bravo; inside Class B, remain IFR because VFR
Class B clearance is not implemented.

## Research

- **R01:** FAA JO 7110.65 §4-2-10, IFR cancellation response:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap4_section_2.html
- **R01:** FAA JO 7110.65 §7-9-2, VFR Class B clearance and phraseology:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_9.html
- **R03:** AIM §5-1-15, canceling IFR and separate VFR procedures:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap5_section_1.html
- **Trainer delta:** generated traffic, deterministic route repair, and
  integrated acceptance are trainer behavior; they do not model a tower cab,
  certified separation, or VFR Bravo authorization.

## Scope

- Extend the existing single satellite-traffic integration acceptance file,
  not a second feature-specific acceptance pile, to cover:
  - outside Bravo + current route unsafe + safe replan → pilot report,
    acknowledgment, VFR state, and safe replacement route;
  - outside Bravo + no safe replacement → exact rejection and unchanged state;
  - inside Bravo → exact rejection and unchanged IFR state;
  - service, beacon, manual flight-plan, and parser/readback preservation.
- Update `docs/USER.md` and `phases/04-procedures/README.md` to describe route
  repair outside Bravo and the continued absence of Class B clearance.
- Update `phases/LATER-IMPLEMENTATION-BACKLOG.md` so route replanning is no
  longer listed as missing after T04-92, while controller-issued VFR clearances
  through/into Class B remain a separate deferred item.
- Add a short supersession note to T04-75/T04-89 only if needed to prevent
  their historical “unsafe existing route always rejects” wording from being
  read as the current contract. Do not rewrite historical ticket evidence.
- Record manual evidence honestly: browser/live KATL observation is manual;
  synthetic integration and swept-path assertions are automated.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Synthetic outside-Bravo IFR pickup with ambient route through Bravo | Pilot reports cancellation; controller acknowledges | Aircraft becomes VFR and follows rewritten route outside Bravo | Existing unsafe route is not itself a rejection | JO 7110.65 §4-2-10; trainer delta |
| Synthetic outside-Bravo cancellation with no safe replacement | Command rejected | IFR clearance, route, plan, service, and beacon unchanged | Exact `CANCELLATION: unable to establish safe VFR continuation` | Unit/integration evidence |
| Synthetic inside-Bravo cancellation | Command rejected | Aircraft remains IFR and unchanged | Exact `CANCELLATION: cannot cancel IFR inside Class B airspace` | JO 7110.65 §7-9-2 |
| `IFR cancellation received` typed/spoken/Path C forms | Existing IR and readback remain unchanged | No parser or speech contract changes | Malformed/missing-pending behavior stays existing | Existing parity suite |
| Backlog/documentation review | Docs describe route repair plus deferred VFR Bravo clearance | No claim of Class B authorization | No stale statement that all unsafe current routes reject | Manual doc review |

## Acceptance criteria

- [x] One integrated acceptance file proves successful outside-Bravo route
  replacement and autonomous VFR continuation.
- [x] The same file proves no-safe-route and inside-Bravo atomic rejection.
- [x] Existing command/parser/readback behavior remains covered and unchanged.
- [x] `docs/USER.md`, `phases/04-procedures/README.md`, and relevant ticket
  notes distinguish route repair from Class B clearance.
- [x] The backlog keeps controller VFR clearances through/into Class B as
  deferred and names explicit authorization, parser parity, execution, and
  conformance as future work.
- [x] `npm run ci` and `git diff --check` pass.
- [x] Manual KATL/browser evidence is either recorded with seed/callsign or
  explicitly marked unavailable; no automated test is presented as live proof.

## Closure evidence

- Automated integration, cancellation, navigation, and full CI gates pass.
- Manual KATL/browser evidence is unavailable in this worker run; no automated
  test is presented as live proof.

## Test plan

- **Integration:** extend `tests/integration/satellite-traffic-acceptance.test.ts`
  with the complete outside/inside/no-route matrix and route-safety assertions.
- **Focused:** run cancellation, VFR navigation, request queue, and integrated
  acceptance tests after T04-92.
- **Docs/hygiene:** run `git diff --check`; inspect all changed claims against
  the FAA citations and current code.
- **Manual:** repeat the outside-Bravo redirected-route and inside-Bravo
  rejection observations in a browser session when regional data is available.

## Suggested files

- `tests/integration/satellite-traffic-acceptance.test.ts`
- `docs/USER.md`
- `phases/04-procedures/README.md`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
- `phases/04-procedures/tickets/T04-75-pilot-ifr-cancellation.md`
- `phases/04-procedures/tickets/T04-89-ifr-cancellation-class-b-safety.md`

## Out of scope

- Runtime Class B clearance/entry approval or a new VFR clearance command.
- New parser/speech behavior, tower simulation, scoring, or later phases.
- Rewriting unrelated historical ticket evidence or adding a second integration
  suite for the same shipped feature.

## Handoff

Return exactly `READY TO MERGE` or `BLOCKED`, including CI, focused acceptance,
diff-check, and manual evidence status.
