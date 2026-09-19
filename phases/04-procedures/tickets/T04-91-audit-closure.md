# T04-91 Audit closure, documentation, and verification gates

**Phase:** 04 Procedures (satellite traffic remediation)
**Priority:** P0
**Size:** M
**Depends on:** T02-202, T04-88, T04-89, T04-90
**Blocks:** none
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Stop at the configured swarm boundary.

## Goal

Close the audit with integrated acceptance, honest manual evidence, clean
documentation, and reproducible verification gates. This ticket owns no new
runtime behavior; it proves the preceding remediation slices together.

## Context

The audit found whitespace/check failures and a speech mock pytest invocation
that timed out in the audit environment, while the recorded swarm status lists a
later successful speech run. The final gate must establish the current branch’s
actual result and must not treat a timeout as a pass.

## Research

- **R01/R03/R07/R11:** Reuse the citations and trainer deltas from T02-202 and
  T04-86 through T04-90; no new domain behavior is introduced.
- Repository quality rules: `AGENTS.md`, `phases/_shared/architecture.md`,
  and `phases/_shared/non-goals.md`.

## Scope

- Add or extend one integrated acceptance suite covering regional load, VFR
  destination selection, visual rejection/arrival, IFR cancellation, and DCB
  state behavior.
- Update `docs/USER.md`, phase README addenda, and ticket/manual evidence with
  exact trainer limitations; extend the existing backlog only for visible
  callable behavior still lacking execution.
- Remove branch-introduced whitespace and EOF issues reported by
  `git diff --check`.
- Run and record `npm run ci`, focused acceptance tests, and
  `cd speech-api && SPEECH_API_MOCK=1 pytest`; diagnose any hang or timeout.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Full synthetic regional/VFR session | All remediation contracts pass together | Existing IFR behavior remains stable | Any invalid data fails visibly | Integrated acceptance |
| `npm run ci` | Green typecheck/lint/format/test gate | No generated artifacts staged | Any failure blocks handoff | Repository rule |
| Speech mock pytest | Completes with exit 0 | No hanging subprocess or leaked session | Timeout is failure, not pass | Repository speech rule |
| `git diff --check` | No new whitespace/EOF errors | Docs/tickets are clean | Any warning is fixed before handoff | Repository hygiene |
| KATL manual run where available | Evidence records scenario, seed, source cycle, and limitations | No unsupported certification claim | Missing local/live source is recorded as skipped | T04-76/T04-82 manual contracts |

## Acceptance criteria

- [ ] One integrated acceptance file covers the full corrected feature path.
- [ ] `docs/USER.md` and relevant phase documentation describe the corrected
  behavior and explicitly state that Class B entry approval is not supported.
- [ ] `git diff --check` is clean for this remediation slice.
- [ ] `npm run ci` passes.
- [ ] Speech mock pytest completes successfully; any environment prerequisite or
  resolved hang is recorded in the handoff.
- [ ] Manual evidence is recorded honestly, including unavailable live-source,
  STARS-manual, speech, or performance checks.

## Test plan

- Unit: no new unit pile; rely on ticket-level regression tests.
- Integration: one synthetic integrated acceptance file, plus KATL data contract
  acceptance where committed facility data is required.
- Manual: both configured KATL runway cases when local data/session access is
  available; otherwise record the exact skipped evidence and reason.

## Suggested files

- `tests/integration/satellite-traffic-acceptance.test.ts`
- `tests/integration/vfr-population.test.ts`
- `src/ui/dcb/test/dcbSpinnerKeyboardAcceptance.test.ts`
- `docs/USER.md`
- `phases/04-procedures/README.md`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`

## Out of scope

- New runtime features, Class B approval, tower cab, scoring, speech providers,
  live FAA downloads, or later phase work.

## Closure evidence

- Integrated acceptance: `tests/integration/satellite-traffic-acceptance.test.ts`
  covers regional boot, VFR destination selection, visual rejection/touchdown,
  IFR cancellation/Class B protection, and DCB state restoration.
- Focused acceptance: 13 tests passed.
- `npm run ci`: passed (240 files, 2,608 tests passed; 4 skipped).
- `git diff --check master`: passed after removing branch-introduced whitespace
  and EOF issues.
- Speech mock: `SPEECH_API_MOCK=1 pytest` passed with the temporary repository
  venv using FastAPI 0.115.12 / Starlette 0.46.2 (94 passed, 1 warning). The
  unconstrained latest dependency resolution hung in the first TestClient
  contract test; that timeout is not treated as a pass.
- Manual evidence: the supplied TI 6191.409 Rev. 30 manual was reviewed for
  satellite-arrival list behavior (§2.15.5, printed pp. 2-96–2-97), VFR plan
  inputs/results (§5.5.10, pp. 5-128–5-139), interfacility VFR plans
  (§5.5.13, p. 5-139), destination-airport assignment (§5.7.6, p. 5-193),
  and handoff acceptance (§§5.1.11–5.1.12, pp. 5-22–5-23). Those sections do
  not define this trainer's generated traffic, autonomous visual touchdown,
  IFR cancellation, or Class B approval policy; no contradiction was found.
  Live KATL/browser sessions, speech-latency measurement, 60-FPS performance
  observation, and live-source/facility fidelity checks require local runtime
  access and remain unclaimed by automated tests.
- Class B entry approval is not supported and is not implemented.
