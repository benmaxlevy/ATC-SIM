# Glossary

Use these terms in tickets, UI, and code. Do not invent synonyms. Definitions follow FAA PCG / 7110.65 / STARS public docs; see `references.md`.

| Term | Meaning | Source |
| --- | --- | --- |
| **STARS-like** | Visual/UX analog of an FAA terminal radar workstation. Not the Raytheon STARS product. | R04, T00-01 |
| **Scope** | The plan-view PPI plus datablocks, maps, and command line. | R07 (CRC “STARS display”) |
| **PPI** | North-up (unless noted) 2D radar picture. Distances in nautical miles. | Radar convention; R07 |
| **Datablock** | Full or limited data block: callsign / altitude / speed attached to a **track** by a **leader**. Never “label.” | R02 PCG; R07 FDB/LDB |
| **Full datablock (FDB)** | Two-line block (v1: callsign + Mode C / assigned / GS). | R07 |
| **Limited datablock (LDB)** | Mode C hundreds only. | R07 |
| **Leader** | Line from target symbol to datablock. Directions L1–L9 analog. | R07 |
| **Track** | Displayed target from simulated position. v1: 1:1 with aircraft, no sensor error. | R05 / R07 |
| **Mode C** | Reported pressure altitude (here: kinematics altitude) shown in **hundreds of feet**. | R02; R01 beacon/Mode C |
| **Altitude filter** | Min/max Mode C window; out-of-filter tracks keep a symbol, lose FDB/leader. | R05; R07 |
| **Predicted track line (PTL)** | Straight 1-minute ground-track predictor. Not a turn-radius curve. | R07 |
| **History** | Discrete position dots vs sim time. Not a phosphor bloom. | R07 |
| **Initiate track** | STARS/CRC: associate target with a plan. **Our F3:** ownership color stub only. | R07; trainer delta |
| **DCB** | Display Control Bar. We ship **DCB-lite**. | R07 |
| **Digital / video map** | Sparse facility lines (runway, loc feather, rings). Not OSM. | R04; R07 |
| **Localizer feather** | Approach-course fan on the map. | R07 maps |
| **Flight strip** | Flight-progress strip analog (callsign + assigned values). | R02 |
| **Command IR** | Structured radio instruction. Voice and text both compile to this. | `command-ir.md` |
| **parseStage** | Which compiler won: `typed` \| `spoken_a` \| `spoken_b` \| `llm_c`. | `parse-pipeline.md` |
| **SpeechPort** | Adapter for ASR in and TTS out. | `speech-port.md` |
| **Pilot agent** | Validates a command, emits a **readback**, then mutates intent. | R01 readback; trainer |
| **Intent** | Assigned heading, altitude, speed, route. | — |
| **Kinematics** | How the aircraft moves toward intent. | — |
| **Readback** | Pilot repetition of the clearance. Template-generated in phases 1–3. | R01; R02 |
| **Vector** | Heading instruction for radar identification/navigation. | R01; R02 |
| **PTT** | Push-to-talk. Capture on key-down, ASR on key-up. | Radio ops |
| **Facility** | One airport + one approach position for v1. | R04 TRACON |
| **Scenario** | Spawn rules, active runway, maps, traffic mix. | trainer |
| **CIFP** | FAA Coded Instrument Flight Procedures. Phase 4. | R11 |
| **CA** | Conflict alert. Phase 4 lite. | R01; R05 |
| **MSAW** | Minimum safe altitude warning. Phase 4 lite. | R01; R02; R05 |
| **CRC keys** | vNAS Consolidated Radar Client STARS map. Reference, not 1:1 spec. | R07 |

See `phases/_shared/references.md` for URLs, search fallbacks, and forbidden UI words (no “zoom,” “label,” “sprite”).

## Units (frozen)

| Quantity | Unit | Notes |
| --- | --- | --- |
| Lateral | nautical miles, true north | Display may show magnetic later; v1 true = magnetic at demo field. |
| Altitude | feet MSL | Flight levels are `FL` + hundreds; store feet. |
| Speed | knots IAS (treat as TAS in v1) | No wind until phase 4. |
| Heading | degrees `[0, 360)` | `360` normalizes to `0`. |
| Time | milliseconds of sim time | Wall clock is only for PTT/ASR latency. |
| Sim rate | `1.0` = real time | Phase 1 must support `1` and `2`. |

## Voice vs automation

Controllers issue **radio commands** (heading, altitude, speed, approach) to the pilot agent.

Controllers also issue **scope commands** (track, range, altitude filter) that never become a readback.

Keep these pipelines separate. The Command IR is radio-only.
