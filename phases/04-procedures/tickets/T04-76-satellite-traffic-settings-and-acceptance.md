# T04-76 Satellite traffic settings and acceptance

**Phase:** 04 Procedures (satellite traffic addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-69, T04-70, T04-71, T04-72, T04-73, T04-74, T04-75
**Blocks:** none
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start a later phase or swarm.

## Goal

Expose the approved VFR population and request controls in session setup and
verify the complete Atlanta satellite-traffic experience. A controller can work
a generated aircraft from its first request through flight following, IFR pickup,
IFR cancellation, and service termination or a simulated tower transfer.

## Context

T04-69 and T04-70 own reproducible FAA data generation and regional loading.
T04-71 owns traffic configuration, aircraft motion, and population accounting.
T04-72 owns request selection and scheduling. T04-73 through T04-75 own exact
radio contracts and operational transitions. This ticket integrates those
contracts; it must not introduce a competing scheduler, command grammar, or
aircraft service state.

The approved feature uses full phrases for new commands in typed and spoken
input. Existing shortcuts, including `SQ`, `I`, and `CLR`, retain their meanings.
The branch spelling `feature/sattelite-traffic` is intentional user input.

## Research

- **R01:** FAA JO 7110.65, section 5-3, Radar Identification; section 7-6,
  Basic Radar Service to VFR Aircraft; section 7-9, Class B Service:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_3.html
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_6.html
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_9.html
- **R01:** paragraphs 4-2-8, 4-2-9, and 4-2-10 cover VFR/IFR transition,
  airfile handling, and cancellation; paragraph 5-1-13 covers radar-service
  termination:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap4_section_2.html
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_1.html
- **R03:** FAA AIM, paragraph 5-1-15, Canceling IFR Flight Plan:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap5_section_1.html
- **R11:** Use the exact FAA source manifests and effective dates produced by
  T04-69. Do not claim a current airport inventory from stale weather entries.
- Trainer deltas: deterministic virtual pilots; configurable workload rather
  than observed traffic statistics; other airspace/tower coordination assumed;
  only Atlanta Bravo avoidance enforced by the shipped adaptation; VMC for
  generated IFR cancellation; no tower cab, ground traffic, or certification.
- HTML references use printed paragraph/section identifiers. Record document
  edition and those identifiers during manual review; do not invent PDF pages.

## UI and persistence contract

- Extend `src/ui/controls/session-setup.tsx` and the shared session schema in
  `src/scenario/sessionSetup.ts`. Show initial VFR count, soft target population,
  independent entries/hour, maximum population, named-zone weights, flight mix,
  aircraft/altitude mix supported by T04-71, flight-following percentage,
  IFR-pickup percentage, combined new-request cap/hour, and IFR-cancellation
  percentage. Reuse the existing seed control.
- Labels and helper text distinguish a population from a rate. Explain that
  target replenishment and scheduled entries are separate sources, both bounded
  by maximum population. Use the exact pacing and cap rules from T04-71/72.
- Reuse upstream validation and exact error strings. Never silently clamp a
  percentage, silently normalize an invalid sum, or start a partially configured
  session. Normalizing valid positive relative zone weights is allowed.
- Apply follows the existing session-setup apply/new-session behavior. Cancel
  and Escape discard draft edits and restore focus. No live traffic-edit mode
  or new scope modifier is introduced by this ticket.
- Existing stored sessions without VFR fields continue loading with VFR
  disabled. New VFR settings round-trip without changing IFR arrival/departure
  settings. Keep existing scenario/seed query precedence and `traffic=N`
  benchmark behavior; introduce no new URL grammar.
- Show unavailable regional-data capability explicitly when appropriate. A
  scenario without required data must not appear to offer working VFR spawning.
  Do not add a KATL conditional to UI capability checks.
- Use existing radio log/status surfaces for requests and responses, including
  text-only mode. A request does not reveal an ACID on an unassociated radar
  target, auto-create a strip, or silently initiate a STARS track.
- Help remains a reference surface, not a hidden action executor. DCB controls
  continue calling `@scope` only.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Valid initial count, target, entries/hour, maximum, and zone weights | Session uses the exact configured population policy | One new session with repeatable seed | Invalid combinations show T04-71 validation; no partial apply | Trainer configuration; T04-71 contract |
| Flight following 30%, IFR pickup 20% | Exclusive initial categories; remaining 50% are ambient | T04-72 selection stream only | Sum above 100% rejects with T04-72 error | Trainer workload policy |
| New-request cap zero | No new service requests are transmitted | Aircraft still fly; replies and cancellation reports remain possible | No hourly catch-up burst after changing setup | Trainer workload policy; R01 section 7-6 |
| Cancel or Escape after draft edits | Dialog closes and returns focus | No world or persisted-setting change | Enter in another control must not submit a scope command | Existing session-setup interaction |
| Legacy stored session without VFR fields | Existing session still loads | VFR disabled; IFR settings retained | Malformed new fields use shared validation/fallback policy | Existing session persistence contract |
| `N123AB radar contact 5 miles from ABC` with a valid identification candidate | T04-73 processes identification and informational position | No relocation or navigation change | Incomplete/ambiguous suffix follows T04-73 rejection contract | R01 section 5-3; user-approved position suffix |
| Generated flight-following request through identification and service termination | Full text/voice interaction is usable | Radio/service changes obey T04-73; no implicit scope association | Busy radio, ignored request, duplicate instruction, and stale aircraft handled | R01 sections 5-3, 7-6; paragraph 5-1-13 |
| Generated IFR pickup, later pilot cancellation and acknowledgment | Aircraft flies IFR then resumes valid VFR continuation | T04-74/75 operational rules and service transitions | No pickup through malformed clearance; no generated cancellation in Bravo | R01 paragraphs 4-2-8 through 4-2-10; R03 paragraph 5-1-15 |
| Satellite arrival and simulated tower transfer | Arrival completes using that destination's geometry | Aircraft removed only after completion or valid exit | No primary-airport runway/threshold substitution | T04-70 destination contract; documented tower stub |
| Long session, pause, rate change, restart, speech service unavailable | Traffic remains bounded and usable with typed input | Queues/reset callbacks stay in the current session | No stale speech callback mutates a restarted session | Shared architecture/speech contracts |

## Acceptance criteria

- [ ] All listed controls are wired to upstream schemas and schedulers, with
  units, accessible labels, and visible validation. Saved values round-trip.
- [ ] Legacy settings and unsupported scenarios work without VFR regressions.
- [ ] Full-phrase commands and existing shortcuts work through typed input and
  PTT. Informational radar-contact positions do not affect aircraft navigation.
- [ ] One synthetic integrated acceptance file exercises the whole feature,
  including silent traffic, flight following, IFR pickup/cancellation, rejection,
  service termination, and destination completion.
- [ ] Minimal parameterized geometry tests prove no swept-path Bravo entry;
  generic suites do not depend on Atlanta map counts, IDs, or coordinates.
- [ ] A generated Atlanta data/contract acceptance file verifies source-backed
  destinations, source provenance, and preservation of existing scenario routes.
  Keep facility-specific assertions out of generic unit/component suites.
- [ ] Long-session acceptance verifies bounded pending requests, fair radio
  scheduling, cleanup, seed repeatability, and zero/cap behavior. New RNG draws
  do not change legacy IFR traffic for the same seed.
- [ ] **Manual:** Complete both KATL runway configurations with ambient VFR and
  at least one flight-following, pickup, cancellation, and satellite arrival.
  Inspect Bravo shelf crossings/avoidance and demonstrate other airspace is
  permitted under the documented tower-coordination assumption.
- [ ] **Manual:** Check radio input, logged command/result, pilot reply, and scope
  visibility together. Record test scenario/seed, FAA edition/paragraphs, and
  any unavailable live-speech/performance evidence explicitly.
- [ ] `npm run ci` and speech mock pytest pass. Record the existing 30-target
  rendering benchmark and a representative mixed-traffic manual performance
  sample; do not claim unmeasured frame rates or speech latency.

## Documentation and suggested files

- `src/ui/controls/session-setup.tsx`
- `src/scenario/sessionSetup.ts`
- `src/ui/shell.tsx` (wiring only; use focused supporting modules)
- `src/ui/overlays/ScopeHelpOverlay.tsx` and `src/scope/keymap.ts` (existing help data)
- `src/scenario/test/` and one focused feature acceptance file
- `docs/USER.md`: controls, full phrases, pilot requests, service/rules
  distinction, cancellation, no VFR KATL arrival through Bravo, trainer deltas
- `phases/04-procedures/README.md`: add the completed feature contract without
  deleting historical phase text
- `tools/cifp-import/README.md`: link upstream reproducible regional generation
  workflow; no hand-filled FAA airport or airspace values
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`: only if in-scope visible/callable
  behavior still lacks execution; extend an existing subsection when applicable

## Out of scope

New command aliases, live mid-session settings editing, drawing zones on scope,
ground clearance requests, VFR Bravo clearances, full terrain/weather emergencies,
military/private destination expansion, traffic scoring, tower cab, paid speech,
unrelated UI polish, or a later swarm.

## Test and handoff requirements

Use upstream focused tests and the integrated acceptance paths above. Run
`npm run ci` before application/test/tool commits and
`SPEECH_API_MOCK=1 pytest` from `speech-api` when speech contracts change. Never
skip hooks. Stage explicit owned paths only; preserve unrelated artifacts.

Worker implements exactly this ticket on its isolated ticket branch, makes
progressive gated commits, never merges/spawns/pushes, and returns exactly
`READY TO MERGE` or `BLOCKED` with test evidence and manual leftovers. The captain
owns final target-branch CI and the phase handoff.
