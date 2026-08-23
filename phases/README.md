# Phases

Implementation plan for a **STARS-like, in-browser ATC trainer**: terminal radar, controller commands in (voice or text), simulated-pilot readbacks out. Hybrid: the world and scope run in the tab; speech is a swappable `SpeechPort`.

This folder is the source of truth for build order. Cursor canvases are summaries; if they disagree, **these files win**.

**To start work:**

- **Swarm (hours, many subagents):** paste [`phases/SWARM.md`](SWARM.md) into a new agent. The first swarm does **0 → 1 → 2** (T02-01–13). Phase 2 **polish** is T02-14–21 in `02-scope/README.md` (separate run).
- **Solo one phase:** paste that phase’s `AGENT.md` (see [LAUNCH.md](LAUNCH.md)).

Git: always-on project rule `.cursor/rules/ticket-git-workflow.mdc` — one `ticket/Txx-yy-…` branch per ticket, progressive commits, `--no-ff` merge into `master` when the ticket is done. Do not put ticket work on `master` directly.

## How to launch an agent

1. Open the phase folder (e.g. `phases/01-closed-loop/`).
2. Paste **`AGENT.md`** into a new agent as the full prompt.
3. To do a single ticket, paste that ticket file and say: implement only this ticket, stop when ACs are checked.

Do not start phase N until the previous phase README's **Phase exit** checklist is green.

| Phase | Folder | Tickets | Exit (short) | Depends on |
| --- | --- | --- | --- | --- |
| 0 Slice | [00-slice](00-slice/) | 10 | Repo boots, contracts frozen, KDEM stub, echoing command line | — |
| 1 Closed loop | [01-closed-loop](01-closed-loop/) | 14 | Type `DAL123 H270`, text readback, aircraft turns | 0 |
| 2 Scope | [02-scope](02-scope/) | 21 | STARS-like PPI: maps, datablocks, filters, a few keys | 1 |
| 3 Voice | [03-voice](03-voice/) | 15 | PTT → our speech-api → same parser → spoken readback | 1 (2 preferred) |
| 4 Procedures | [04-procedures](04-procedures/) | 15 | ILS intercept, DEMO ONE STAR, lite CA/MSAW; post-exit STAR spawn + check-in | 2 |
| 5 Training | [05-training](05-training/) | 12 | Practice score, replay, optional bad readbacks | 3 **and** 4 |

**87 tickets.** Phase 3 may overlap the tail of phase 2 (`SpeechPort` is isolated). Phase 5 must not start until 3 and 4 both exit. Skip `T03-11` (whisper-wasm) and `T04-11` (wind) unless you want them; none are required to exit their phase. T04-13–15 are a **post-exit addendum** (STAR entry spawn + check-in); they do not un-green the historical T04-01–12 exit. `T03-15` (always parse after STT) then `T03-14` (Path C `/parse`) when Path C salvage is named — not required to exit. Phase 2 **original** exit is T02-01–13; T02-14–21 are TCW polish (not voice). Voice quality path is **our** `speech-api` (HF weights, local inference) — no paid STT/TTS vendors. Parse is one stage list (`parse-pipeline.md`).

## Shared contracts

Read before any ticket:

| File | Freeze |
| --- | --- |
| [_shared/glossary.md](_shared/glossary.md) | Terms and units (PCG / STARS vocabulary) |
| [_shared/references.md](_shared/references.md) | 7110.65, CRC/vSTARS, vice, FOA STARS — search before coding |
| [_shared/architecture.md](_shared/architecture.md) | Browser-first Vite SPA, ENU NM, KDEM, packages |
| [_shared/parse-pipeline.md](_shared/parse-pipeline.md) | One parse stage list (typed → A → B → C) |
| [_shared/command-ir.md](_shared/command-ir.md) | Radio command schema (phase 4 may add VIA/CROSS) |
| [_shared/speech-port.md](_shared/speech-port.md) | ASR/TTS adapter |
| [_shared/non-goals.md](_shared/non-goals.md) | What not to build |
| [_shared/ticket-template.md](_shared/ticket-template.md) | Ticket shape |

## Folder layout (per phase)

```
phases/NN-name/
  README.md     Phase narrative, frozen decisions, exit checklist, ticket order
  AGENT.md      Copy-paste prompt for an implementation agent
  tickets/
    TNN-01-….md
    …
```

Ticket IDs are stable. Do not renumber; add `TNN-xx` at the end if you must extend.

## Ticket catalog

### Phase 0 — Slice

| ID | Title |
| --- | --- |
| T00-01 | Product freeze and disclaimer |
| T00-02 | Repo skeleton (Vite, TypeScript, Vitest) |
| T00-03 | Folder layout and public APIs |
| T00-04 | Coordinate system (ENU NM) |
| T00-05 | KDEM scenario JSON stub |
| T00-06 | Command IR types and fixtures |
| T00-07 | Null SpeechPort and DI hook |
| T00-08 | Session event log schema |
| T00-09 | Lint, format, `npm run ci` |
| T00-10 | Demo boot: dark shell, echo line |

### Phase 1 — Closed loop

| ID | Title |
| --- | --- |
| T01-01 | Sim clock and `stepWorld` |
| T01-02 | Aircraft state and intent types |
| T01-03 | Kinematics (heading, altitude, speed) |
| T01-04 | Spawn arrivals from scenario (`DAL123` hdg 100) |
| T01-05 | Text command parser |
| T01-06 | Callsign resolution and selection |
| T01-07 | Pilot agent validate and apply intent |
| T01-08 | Readback templates (do **before** T01-07) |
| T01-09 | Command line wired to parser |
| T01-10 | Crude Canvas2D PPI |
| T01-11 | Click-select track |
| T01-12 | Pause, sim rate 1× / 2× |
| T01-13 | Integration test: typed heading moves aircraft |
| T01-14 | Phase 1 playable slice (manual script) |

Implement **T01-08 before T01-07** (see that phase `AGENT.md`).

### Phase 2 — Scope

| ID | Title |
| --- | --- |
| T02-01 | Scope camera: range, pan, center |
| T02-02 | Map layers: runway, localizer, rings |
| T02-03 | Target symbol and history |
| T02-04 | Full and limited datablocks |
| T02-05 | Leader lines (L1–L9) |
| T02-06 | Altitude filter |
| T02-07 | Predicted track line |
| T02-08 | Ownership colors (F3 stub) |
| T02-09 | Keyboard map help overlay |
| T02-10 | Display control bar lite |
| T02-11 | Flight strips window |
| T02-12 | 30-target 60 FPS budget test |
| T02-13 | Phase 2 visual acceptance script |
| T02-14 | Video map catalog (per-airport JSON) |
| T02-15 | Trainer chrome off the TCW |
| T02-16 | DCB cell grid (visual grammar) |
| T02-17 | DCB MAPS, RANGE/CNTR, RR, LDR, CHAR SIZE, BRITE |
| T02-18 | Position symbol and history contrast |
| T02-19 | Datablock scratchpad, type, leader length |
| T02-20 | SSA status and on-PPI lists |
| T02-21 | TCW visual acceptance script |

### Phase 3 — Voice

| ID | Title |
| --- | --- |
| T03-01 | Capture AudioWorklet PTT |
| T03-02 | Transcript → parser (`source=voice`) |
| T03-03 | Spoken phraseology grammar (path A) |
| T03-04 | Web Speech adapter (opt-in prototype — not default) |
| T03-05 | HTTP client → our speech-api |
| T03-06 | Readback TTS playback |
| T03-07 | Radio FX graph |
| T03-08 | Low confidence and error UX |
| T03-09 | Latency metrics overlay |
| T03-10 | Settings: speech backend switch |
| T03-11 | Optional whisper-wasm spike (P2 — skip) |
| T03-12 | Phase 3 voice acceptance script |
| T03-13 | Self-hosted speech-api (HF weights, local inference) |
| T03-14 | Optional Path C parse on speech-api (P1 — size L; not exit) |
| T03-15 | Parse despite low STT confidence (P1 — before T03-14) |

### Phase 4 — Procedures

| ID | Title |
| --- | --- |
| T04-01 | Procedure JSON + KDEM navaids / ILS27 / DEMO ONE |
| T04-02 | Nav fix lookup |
| T04-03 | Lateral FMS: direct and fly-by |
| T04-04 | Descend/climb via and CROSS (patches Command IR) |
| T04-05 | Vector to intercept localizer |
| T04-06 | Glidepath and approach phase |
| T04-07 | Missed approach stub |
| T04-08 | CIFP subset importer (dev tool) |
| T04-09 | Conflict alert lite |
| T04-10 | MSAW lite |
| T04-11 | Constant wind (P1 — optional) |
| T04-12 | Phase 4 scenario: vector to ILS |
| T04-13 | STAR inbound geometry helpers (post-exit) |
| T04-14 | Seeded STAR inbound spawn (post-exit) |
| T04-15 | STAR descend-via check-in (post-exit) |

### Phase 5 — Training

| ID | Title |
| --- | --- |
| T05-01 | Session scoring model |
| T05-02 | Live score panel |
| T05-03 | Debrief report export JSON |
| T05-04 | Phraseology checker from IR |
| T05-05 | Imperfect pilot delays and errors |
| T05-06 | Unable responses |
| T05-07 | Replay recorder |
| T05-08 | Replay player |
| T05-09 | Second position stub and handoff |
| T05-10 | KDEM scenario brief |
| T05-11 | Accessibility and trainer settings |
| T05-12 | Phase 5 training acceptance script |
