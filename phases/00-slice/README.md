# Phase 0 — Slice

Stand up a **browser-only** ATC-SIM repo that boots, freezes the v1 contracts in TypeScript, and shows a dark **Scope** chrome (disclaimer + empty **PPI** placeholder + command line). No aircraft motion, no parser, no radio.

This folder is the implementation plan. An agent executing the phase must follow `AGENT.md` and the tickets under `tickets/`. Shared contracts in `phases/_shared/` win over this file if they ever disagree; this file must not reopen those contracts.

## Why this phase exists

Later phases assume a running Vite app, a documented coordinate system, a loadable **KDEM** **Scenario**, typed **Command IR**, a **SpeechPort** that does not crash the boot path, and a session event log. Without that slice, phase 1 cannot hook “typed heading → **Readback** → **Intent** → **Kinematics**” into anything real.

Phase 0 is deliberately thin: **prove the skeleton and freeze the seams**. If the seams move after this phase, every downstream ticket is invalid.

## Goals

When this phase exits, all of the following are true:

1. A single Vite + TypeScript (strict) app lives at the repo root. `npm run dev` and `npm test` work.
2. Source is laid out as `src/core`, `src/parse`, `src/pilot`, `src/scope`, `src/speech`, `src/scenario`, `src/ui` with documented barrel public APIs. Not a monorepo.
3. World lateral math is a documented local ENU tangent plane with unit tests (nautical miles, true north).
4. **KDEM** (Demo Field) exists as JSON: runway **27**, magnetic variation **0°**, field elevation **0 ft**, one ILS 27 stub, one downwind spawn stub.
5. **Command IR** exists as TypeScript types that match `phases/_shared/command-ir.md` plus fixtures. Nothing compiles a string into a `Command` yet.
6. `NullSpeechPort` is constructed at boot via a DI hook. The sim does not import vendor ASR/TTS SDKs.
7. Session event log types include `command.accepted` and `command.rejected` as specified in the Command IR contract.
8. The UI is labeled **training / entertainment only** with the frozen disclaimer copy.
9. The visible demo is a dark full-viewport **Scope** shell: disclaimer, empty **PPI** placeholder, command line that **echoes** submitted text. No console errors.

## Frozen decisions (do not reopen)

These are closed. Tickets may *implement* them; they must not *redesign* them.

| Decision | Freeze |
| --- | --- |
| Runtime | Browser-first. Vite SPA, one HTML entry. **No server tick.** Physics (later) is `stepWorld(world, dt)` in the tab. |
| Language | TypeScript, `strict: true`. |
| Tests | Vitest. `src/core`, `src/parse`, `src/pilot` must stay DOM-free. |
| Layout | **Single Vite app**, not a monorepo. Folders under `src/` as in `phases/_shared/architecture.md`. |
| UI kit | React 18 for `src/ui` chrome only. The **PPI** is a Canvas2D host (placeholder `div`/`canvas` in phase 0); do not draw maps or **Track**s yet. |
| Demo **Facility** | Fictional **KDEM**, mag var **0°**, field elev **0 ft**, one runway **27**, ILS 27 id `ILS27`. ARP geodetic origin **0°N, 0°E**. |
| Coordinates | Chosen and documented in **T00-04**: local ENU, `xNm` east / `yNm` north of ARP, altitude feet MSL separate. True = magnetic at KDEM. |
| Disclaimer | Exact copy in T00-01; must appear in the UI by T00-10. |
| **SpeechPort** | Interface + `null` impl in phase 0. `transcribe` throws; `synthesize` returns silence. App still boots. |
| **Command IR** | Types checked in matching `_shared/command-ir.md`. Parser is phase 1. |
| Voice vs automation | Command IR is **radio-only**. **Scope** keys never become a **Readback**. |
| Product claim | Training / entertainment. Not an FAA device, not STARS, not NAS-certified. |

Units, terms, and non-goals: `phases/_shared/glossary.md`, `phases/_shared/non-goals.md`.

## What this phase is not

Do **not** implement any of the following (they belong to later phases or are non-goals):

- Text/**PTT** parser, **Pilot agent**, **Intent**, **Kinematics**, `stepWorld`
- Real **PPI** (maps, **Datablock**s, **Track**s, range rings, leader lines)
- CRC keys, altitude filters, strips
- Any non-null **SpeechPort**, microphone capture, TTS playback, radio FX
- CIFP, real airports, wind, CA/MSAW
- Scoring, bad **Readback**s, LLM pilots
- Server, Cloudflare Workers, microservice split
- Cloning STARS internals or copyrighted charts

See `phases/_shared/non-goals.md`.

## Architecture snapshot (phase 0 only)

```
index.html
    │
    ▼
src/main.tsx  ──createApp({ speech: NullSpeechPort })──► src/ui (shell)
                                                         ├─ disclaimer (frozen copy)
                                                         ├─ src/scope PPI placeholder
                                                         └─ command line (echo only)

src/core      coords, Command types, SessionLog
src/scenario  kdem.json
src/speech    SpeechPort + NullSpeechPort
src/parse     barrel; parseCommand throws “phase 1”
src/pilot     barrel; applyCommand throws “phase 1”
```

`requestAnimationFrame` / fixed timestep physics is **not** required to pass phase 0. T00-10 may use React state only. Do not invent a Redux store.

## Ticket order

Implement **in this order**. Do not skip. Do not start a ticket until its dependencies are done.

| ID | Title | Size | Depends on | Blocks |
| --- | --- | --- | --- | --- |
| [T00-01](tickets/T00-01-product-freeze-and-disclaimer.md) | Product freeze and disclaimer | S | none | T00-10 |
| [T00-02](tickets/T00-02-repo-skeleton-vite-typescript-vitest.md) | Repo skeleton Vite TypeScript Vitest | M | none | T00-03, T00-09 |
| [T00-03](tickets/T00-03-folder-layout-and-public-apis.md) | Folder layout and public APIs of packages | M | T00-02 | T00-04, T00-05, T00-06, T00-07, T00-08, T00-10 |
| [T00-04](tickets/T00-04-coordinate-system-and-unit-tests.md) | Coordinate system and unit tests | M | T00-03 | T00-05 |
| [T00-05](tickets/T00-05-kdem-scenario-json-stub.md) | KDEM scenario JSON stub | S | T00-04 | T00-10 |
| [T00-06](tickets/T00-06-command-ir-typescript-types-and-fixtures.md) | Command IR TypeScript types and fixtures | M | T00-03 | T00-08 |
| [T00-07](tickets/T00-07-null-speech-port-and-di-hook.md) | Null SpeechPort and DI hook | M | T00-03 | T00-10 |
| [T00-08](tickets/T00-08-session-event-log-schema.md) | Session event log schema | S | T00-06 | T00-10 |
| [T00-09](tickets/T00-09-tooling-lint-format-ci.md) | Tooling: lint format ci script | S | T00-03 | T00-10 |
| [T00-10](tickets/T00-10-phase-0-demo-boot.md) | Phase 0 demo boot (blank scope shell + command line that echoes) | M | T00-01, T00-05, T00-07, T00-08, T00-09 | phase exit |

T00-01 and T00-02 have no code dependency on each other; still run **01 then 02** so the disclaimer copy exists before the app skeleton. T00-04 and T00-06 are independent after T00-03; still run **04 then 05 then 06** as listed.

## Risks

| Risk | Why it matters | Mitigation in this phase |
| --- | --- | --- |
| Coordinate system left “TBD” | Phase 1 kinematics and phase 2 **PPI** will pick incompatible units. | T00-04 freezes ENU NM and tests round-trip at KDEM. |
| Speech SDK imported in `core` / `ui` | Breaks the adapter rule; app cannot boot without a vendor. | T00-07: only `src/speech` implements ports; boot uses `null`. |
| Parser or **Pilot agent** “just a little” | Pulls phase 1 into the slice; exit criteria become mushy. | `parse` / `pilot` barrels throw a phase-1 error; command line **echoes**. |
| Monorepo / extra packages | Splits tsconfig and CI for no v1 gain. | Single Vite app; path aliases only. |
| Disclaimer missing or paraphrased | Legal/product non-goal: must not look like an FAA device. | T00-01 freezes copy; T00-10 renders that exact string. |
| DOM in `core` tests | Prevents headless CI and reuse from workers later. | Vitest node environment for core/parse/pilot. |
| Scenario JSON too “real” | CIFP, copyrighted maps, extra runways. | KDEM stub only: rwy 27, empty video maps, one spawn. |

## Phase exit checklist

Do not open phase 1 until every box is true.

- [ ] `npm test` exits 0 (Vitest).
- [ ] `npm run typecheck` exits 0 (`tsc --noEmit`).
- [ ] `npm run lint` exits 0.
- [ ] `npm run ci` runs typecheck + lint + test and exits 0.
- [ ] `npm run dev` serves the app with no browser console errors on load.
- [ ] UI is dark, full viewport (no Vite default counter demo).
- [ ] Frozen training/entertainment disclaimer is visible without scrolling the **PPI**.
- [ ] Empty **PPI** placeholder occupies the remaining center of the **Scope**.
- [ ] Command line is at the bottom; submitting text **echoes** it (status/echo line). Echo does **not** call `parseCommand` or mutate **Intent**.
- [ ] Boot constructs `NullSpeechPort` via the DI hook (breakpoint or unit test on `createApp`).
- [ ] `src/scenario` loads `kdem.json` (unit test): ICAO `KDEM`, rwy `27`, mag var `0`, field elev `0`.
- [ ] `Command` / `Instruction` TypeScript types match `phases/_shared/command-ir.md`; fixtures compile.
- [ ] Session log can append `command.accepted` and `command.rejected` (unit tests).
- [ ] Coordinate helpers: lat/lon ↔ NM east/north, heading normalize, unit tests green.
- [ ] No parser, **Kinematics**, maps, **PTT**, or non-null **SpeechPort** shipped.

## How to run (after exit)

```bash
npm install
npm test
npm run dev
```

Open the printed local URL. Confirm the exit UI by eye (T00-10 manual ACs).

## Handoff to phase 1

Phase 1 (**Closed loop**) may:

- Implement `parseCommand` (vice-inspired tokens in `command-ir.md`)
- Implement **Pilot agent** validation + template **Readback**s
- Implement `stepWorld` and heading/altitude/speed **Kinematics**
- Wire the command line to parser → pilot → log `command.accepted` / `command.rejected`

Phase 1 must not:

- Replace KDEM, the ENU coordinate system, or Command IR field names
- Require a server tick
- Skip the `SpeechPort` adapter (text still bypasses speech)
