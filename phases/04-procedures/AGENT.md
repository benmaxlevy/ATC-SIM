# Phase 4 implementation agent

Copy everything below the line into a new agent. That agent implements **this entire phase** in ticket order and stops at phase exit.

---

You are implementing **Phase 4 (Procedures)** of ATC-SIM, an in-browser STARS-like ATC trainer.

Workspace: the ATC-SIM repo root.

## Read first (obey; do not reopen)

- `phases/_shared/glossary.md`
- `phases/_shared/references.md` — **R01** vectors/approaches; **R05/R01** CA/MSAW; **R11** CIFP. Search before inventing alert names.
- `phases/_shared/architecture.md`
- `phases/_shared/command-ir.md`
- `phases/_shared/speech-port.md`
- `phases/_shared/non-goals.md`
- `phases/_shared/ticket-template.md`
- `phases/README.md`
- `phases/04-procedures/README.md` ← narrative, frozen numbers, exit checklist
- Every file in `phases/04-procedures/tickets/`

Do **not** edit other phase folders except: if a ticket adds Command IR variants, you **must** patch `phases/_shared/command-ir.md` in the **same PR** as the TypeScript union (see T04-04, optionally T04-07). Do not rename existing IR types.

Do **not** start phase 5. Do not scrape charts. Do not fetch CIFP at runtime. Do not commit a full FAA CIFP cycle. Do not implement a live `faa:update` / NASR pull.

## Product goal

Aircraft fly published geometry; the scope warns.

KDEM remains the default facility. The facility catalog is **ICAO-generic JSON** (`src/scenario/data/kdem/` is the first instance: vors, ndbs, ils, fixes, procedures, empty sids). Do not hardcode `"KDEM"` as the only legal `airportId`. Do not build a live FAA fetch. `DIRECT`, `EXPECT_APPROACH`, and `CLEARED_APPROACH` must change intent (phase 1 may have accepted and no-op’d them). STAR: 2–3 fixes, at-or-above, then vectors. ILS 27: the 7110.65 clearance *heading, maintain (alt) until established, cleared ILS approach runway 27* must parse, read back, and fly (hold alt until loc, then GS from below). CA lite and MSAW lite (yellow then red). CIFP importer is a **dev tool** proven on a frozen fixture. Wind is P1 and not required to exit.

Pilot agent is the only module that turns a `Command` into intent. `stepWorld` is the only module that integrates kinematics. Alerts are pure functions. Scope never talks to the FMS.

## Constraints

- TypeScript strict. Vitest. DOM-free tests for `core` / `parse` / `pilot` / importer.
- Fixed timestep 20 Hz via `stepWorld(world, dt)`. No server tick.
- Units: NM, feet MSL, knots, degrees `[0, 360)`, sim ms.
- IAS treated as TAS; optional wind (T04-11) affects ground velocity only.
- Heading / turn / altitude / speed instructions still **cancel** published lateral path (see phase README state machine).
- Training/entertainment labeling stays visible.
- Quality bar still applies: 30 arrivals at 60 FPS; command → next physics step.

## Ticket order (do not skip ACs)

Implement one ticket at a time. Check every AC. Do not start a downstream ticket early except where the phase README says work can proceed in parallel **and** its Depends-on is already done.

1. `tickets/T04-01-procedure-json-schema-kdem-ils27-star.md`
2. `tickets/T04-02-nav-fix-lookup.md`
3. `tickets/T04-03-lateral-fms-direct-fly-by.md`
4. `tickets/T04-04-descend-climb-via-crossing-alts.md` (IR extension: patch `_shared/command-ir.md` same PR)
5. `tickets/T04-05-vector-to-intercept-localizer.md`
6. `tickets/T04-06-glidepath-approach-phase.md`
7. `tickets/T04-07-missed-approach-stub.md` (if you add `GO_AROUND`, patch `_shared` same PR)
8. `tickets/T04-08-cifp-subset-importer.md` (parallel after T04-01 is OK)
9. `tickets/T04-09-conflict-alert-lite.md` (can start in parallel with 01)
10. `tickets/T04-10-msaw-lite.md` (after T04-01)
11. `tickets/T04-11-constant-wind-optional.md` (**P1 — skip if exiting without wind**)
12. `tickets/T04-12-phase-4-scenario-vector-ils-tower.md`
13. `tickets/T04-13-star-inbound-geometry.md` (post-exit; helpers only)
14. `tickets/T04-14-seeded-star-inbound-spawn.md` (after T04-13)
15. `tickets/T04-15-star-descend-via-checkin.md` (after T04-13; may parallel T04-14)

T04-08 is required for historical phase exit (fixture tests, no network). T04-11 is not. T04-13–15 are a post-exit addendum: do not un-green T04-01–12.

## Suggested files (create as needed; match phase 0 layout)

- `src/scenario/data/kdem/` — `catalog.json`, `vors.json`, `ndbs.json`, `ils.json`, `fixes.json`, `procedures.json` (committed demo data; T04-01 loads them)
- `src/scenario/procedures/schema.ts`
- `src/scenario/data/kdem-mva.json`
- `src/core/nav/fixRegistry.ts`
- `src/core/nav/geometry.ts` (courses, fly-by, loc deviation, GS height)
- `src/core/fms/lateral.ts`
- `src/core/fms/vertical.ts`
- `src/core/alerts/conflictAlert.ts`
- `src/core/alerts/msaw.ts`
- `src/core/wind.ts`
- `src/parse/` token extensions
- `src/pilot/` apply DIRECT / APP / EXP / VIA / CROSS / GA
- `src/scope/` CA/MSAW colors, tower stub control
- `tools/cifp-import/`
- `testdata/cifp/frozen-subset.cifp`
- `testdata/cifp/frozen-subset.expected.json`

## Stop when

Every box on **Phase exit** in `phases/04-procedures/README.md` is true, including `npm test` green and the T04-12 manual script.

Then stop. Do not implement session scoring, imperfect pilots, or a second TCP (phase 5). Do not add RNAV, holds, weather, CRDA, ARV, or a second runway.
