# ATC-SIM

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.4-646CFF.svg)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg)](https://reactjs.org/)
[![Vitest](https://img.shields.io/badge/Vitest-3.2-yellow.svg)](https://vitest.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Speech--API-009688.svg)](https://fastapi.tiangolo.com/)

An in-browser, high-fidelity **STARS-like (Standard Terminal Automation Replacement System)** radar air traffic control simulator and training workstation. It replicates terminal radar (TRACON) operations with 60 FPS Canvas2D PPI rendering, typed and spoken ATC command parsing ([FAA JO 7110.65](phases/_shared/references.md) phraseology), realistic flight kinematics and FMS procedural navigation, simulated pilot voice readbacks with VHF radio acoustic DSP, and real-time safety alerting (Conflict Alert & MSAW).

> [!IMPORTANT]
> **DISCLAIMER**: This simulator is built for **training and entertainment purposes only**. It is not certified for National Airspace System (NAS) operational use, is not FAA equipment, and is not affiliated with the Federal Aviation Administration or Raytheon Technologies. The user interface is a STARS-like visual and functional analog. See [`docs/DISCLAIMER.md`](docs/DISCLAIMER.md) and [`docs/PRODUCT.md`](docs/PRODUCT.md) for frozen project boundaries.

---

## Table of Contents

- [Quick Start](#quick-start)
  - [Prerequisites](#prerequisites)
  - [Installation & Dev Server](#installation--dev-server)
  - [URL Query Parameters](#url-query-parameters)
- [System Architecture](#system-architecture)
  - [Directory Layout](#directory-layout)
  - [Simulation & Rendering Architecture](#simulation--rendering-architecture)
  - [Multi-Stage Parse Pipeline](#multi-stage-parse-pipeline)
  - [Coordinate System](#coordinate-system)
- [Features & Capabilities](#features--capabilities)
  - [STARS TCW Display Emulation](#stars-tcw-display-emulation)
  - [Flight Kinematics & FMS Navigation](#flight-kinematics--fms-navigation)
  - [Safety Alerting (CA & MSAW)](#safety-alerting-ca--msaw)
  - [Simulated Pilot Agent & Handoffs](#simulated-pilot-agent--handoffs)
- [ATC Command Reference](#atc-command-reference)
  - [Typed Command Syntax](#typed-command-syntax)
  - [Spoken Phraseology (FAA JO 7110.65)](#spoken-phraseology-faa-jo-711065)
- [Controls & Keybindings](#controls--keybindings)
- [Voice & Local Speech Subsystem (`speech-api`)](#voice--local-speech-subsystem-speech-api)
  - [Zero-Cloud Architecture](#zero-cloud-architecture)
  - [Setting Up the Local Speech Server](#setting-up-the-local-speech-server)
  - [Endpoints](#endpoints)
- [Aeronautical Data & CIFP Importer](#aeronautical-data--cifp-importer)
- [Development, Testing & CI](#development-testing--ci)
- [Implementation Roadmap & Phased Execution](#implementation-roadmap--phased-execution)
- [Documentation Index](#documentation-index)

---

## Quick Start

### Prerequisites

- **Node.js**: `v20.0.0+`
- **npm**: `v10.0.0+`
- **Python**: `3.11+` *(Optional, required only for local speech recognition/synthesis and Path C salvage parsing)*

### Installation & Dev Server

```bash
# Clone and install dependencies
git clone https://github.com/benmaxlevy/ATC-SIM.git
cd ATC-SIM
npm install

# Start the Vite development server
npm run dev
```

Open your browser to `http://localhost:5173`.

### URL Query Parameters

Customize simulation scenarios, traffic volume, random seeding, and debug overlays directly via URL search parameters:

| Parameter | Type / Example | Description |
|---|---|---|
| `traffic` | `?traffic=30` | Number of initial arrival aircraft to spawn (e.g. `30` for a high-density stress test). |
| `seed` | `?seed=42` | PRNG seed for deterministic arrival generation and slot entry times (default: `1`). |
| `scenario` | `?scenario=kdem-ils27` | Airspace scenario to load (default: KDEM TRACON Runway 27). |
| `debug` | `?debug=fps` | Displays real-time performance HUD showing canvas FPS, track count, and tick duration. |
| `voice` | `?voice=http` \| `?voice=web` \| `?voice=null` | Force active speech port backend (`http`, browser `web`, or headless `null`). |

Examples:
- `http://localhost:5173/?traffic=30&debug=fps` — 30-track stress test with real-time FPS counter.
- `http://localhost:5173/?seed=2` — Seeded arrival schedule with reshuffled STAR slots.

---

## System Architecture

```mermaid
flowchart TD
    subgraph Browser / Client [Vite SPA - Browser Runtime]
        subgraph UI [React UI Shell]
            Shell[STARS TCW Shell]
            DCB[Display Control Bar]
            Strips[Flight Strip Bay]
            CmdLine[Command Line & PTT Input]
        end

        subgraph CanvasEngine [Radar Scope Engine]
            Canvas[Canvas2D Viewport]
            Renderer[renderScope.ts - 60 FPS PPI]
            Maps[Layered Vector Video Maps]
        end

        subgraph SimEngine [Core Simulation - Fixed 20 Hz]
            Clock[Fixed Timestep Clock]
            World[World State Model]
            FMS[FMS & Kinematics Engine]
            Alerts[CA & MSAW Detectors]
            Handoff[Sector Handoff Coordinator]
        end

        subgraph CommandPipeline [Command & Pilot System]
            Parser[4-Stage Parse Pipeline]
            Pilot[Virtual Pilot Agent]
            CheckIn[STAR Arrival Check-In Queue]
        end

        subgraph AudioSubsystem [Web Audio DSP Graph]
            PTT[AudioWorklet 16kHz PCM Capture]
            RadioFX[VHF Bandpass Filter + Static + Clicks]
            CATone[Square-Wave Conflict Alert Tone]
        end
    end

    subgraph SpeechAPI [Local Speech Server - speech-api/]
        Whisper[Faster-Whisper STT]
        Piper[Piper ONNX TTS Engine]
        PathC[llama.cpp GBNF Salvage /parse]
    end

    CmdLine -->|Typed Token / Text| Parser
    PTT -->|Audio Blob| Whisper
    Whisper -->|Transcript| Parser
    Parser -->|Command IR| Pilot
    Pilot -->|Intent Mutations| World
    Pilot -->|Verbal Readback| Piper
    Piper -->|Audio Buffer| RadioFX
    RadioFX -->|Squelch / Sound| Shell
    World -->|20 Hz Physics| FMS
    World --> Alerts
    Alerts -->|Conflict Detected| CATone
    World -->|Track Geometry| Renderer
    Renderer --> Canvas
    DCB -->|Zoom / Filter / Maps| Renderer
```

### Directory Layout

```text
ATC-SIM/
├── docs/                        # Architecture, coordinate system, and legal disclaimers
│   ├── COORDINATE-SYSTEM.md     # Tangent plane ENU math (NmEastNorth)
│   ├── DISCLAIMER.md            # Mandatory legal notice
│   └── PRODUCT.md               # Frozen v1 product parameters
├── phases/                      # Phased implementation roadmaps, tickets, and swarm configs
│   ├── _shared/                 # Authoritative contracts: Command IR, Parse Pipeline, Architecture
│   ├── 00-slice/ to 05-training/# Phase ticket specifications (T00-01 to T05-12)
│   ├── LAUNCH.md                # Agent briefing and execution instructions
│   └── SWARM.md                 # Multi-agent swarm orchestration guide
├── speech-api/                  # Local FastAPI STT/TTS and GBNF LLM parsing service
│   ├── app.py                   # FastAPI server endpoints (/health, /stt, /tts, /parse)
│   ├── engines.py               # Faster-Whisper, Piper TTS, and llama-cpp wrappers
│   ├── parse_grammar.gbnf       # BNF grammar for Command IR v0 JSON decoding
│   └── download_weights.py      # Hugging Face weights downloader
├── src/                         # Frontend TypeScript/React SPA
│   ├── app/                     # Composition root: createApp, audio wiring, tone generator
│   ├── core/                    # (@core) Pure 20 Hz simulation engine (no DOM dependencies)
│   │   ├── clock.ts             # Fixed timestep physics accumulator
│   │   ├── world.ts             # World state, traffic stepping, simulation rate
│   │   ├── aircraft.ts          # Aircraft models, target states, lateral/vertical intent
│   │   ├── kinematics.ts        # Turn rates, standard rate turns, climb/descent, speeds
│   │   ├── command/             # Command IR types and schema definitions
│   │   ├── fms/                 # Direct-to, STAR tracking, ILS intercept, glidepath, missed approach
│   │   ├── alerts/              # Conflict Alert (CA) and MSAW safety logic
│   │   └── nav/                 # Fix registry, waypoints, along-track geometry, lead turns
│   ├── parse/                   # (@parse) 4-stage command parser (Typed, Path A, Path B, Path C)
│   ├── pilot/                   # (@pilot) Virtual pilot agent, validation, readback generator
│   ├── scenario/                # (@scenario) Airspace scenarios, KDEM STAR spawn, MVA charts
│   ├── scope/                   # (@scope) Canvas2D STARS TCW radar renderer, DCB, symbology, keymap
│   ├── speech/                  # (@speech) Web Audio DSP, AudioWorklet PTT, SpeechPort adapters
│   └── ui/                      # (@ui) React shell, Display Control Bar, Flight Strips, Overlays
├── testdata/                    # Catalogs, sample CIFP data, scenario fixtures
├── tests/                       # Integration tests (e.g. end-to-end command-to-kinematics)
└── tools/
    └── cifp-import/             # FAA Coded Instrument Flight Procedures (CIFP) ARINC 424 importer
```

### Simulation & Rendering Architecture

1. **Deterministic Fixed-Timestep Simulation**:
   - The physical simulation updates at a constant **20 Hz** (`SIM_DT_S = 0.05s`, `PHYSICS_HZ = 20`) via an accumulator-based time step decoupled from display frame rates.
   - Core domain logic in `@core`, `@parse`, and `@pilot` is completely free of DOM references, allowing fast, headless execution in Vitest.
2. **60 FPS Canvas2D Scope Rendering**:
   - The PPI scope is rendered using HTML5 Canvas2D optimized for high track densities (tested for 30+ simultaneous tracks at 60 FPS).
   - Renders radar history dots, predicted track lines (PTL), leader lines, full/limited datablocks (FDB/LDB), J-rings, and vector maps.
3. **React TCW Shell Overlay**:
   - React manages the surrounding STARS TCW workspace: the physical-replica Display Control Bar (DCB), Flight Progress Strip bay, Command Line input, System Status Area (SSA), and dialogs.

### Multi-Stage Parse Pipeline

ATC commands from keyboard input and transcribed speech are evaluated through a rigorous 4-stage pipeline defined in [`phases/_shared/parse-pipeline.md`](phases/_shared/parse-pipeline.md):

```
User Input (Text or Voice Audio)
  │
  ├──► [Stage 0: Normalization] (telephony expansion, number word translation, whitespace cleanup)
  │
  ├──► [Stage 1: Typed Shorthand] (fast vice/STARS token parser: H240, C50, S210, APP ILS27)
  │      └─► Hit? ──► Return Command IR (parseStage: "typed")
  │
  ├──► [Stage 2: Path A - Spoken Grammar] (deterministic FAA JO 7110.65 spoken English parser)
  │      └─► Hit? ──► Return Command IR (parseStage: "spoken_a")
  │
  ├──► [Stage 3: Path B - Fuzzy Rewrite] (spoken-to-typed phonetic salvage)
  │      └─► Hit? ──► Return Command IR (parseStage: "spoken_b")
  │
  └──► [Stage 4: Path C - Local LLM Salvage] (optional GBNF grammar-constrained llama.cpp /parse)
         └─► Hit? ──► Validate JSON against Command IR schema ──► Return (parseStage: "llm_c")
```

Every parsed instruction maps directly to the strongly typed [Command IR union](phases/_shared/command-ir.md) (`HeadingInstruction`, `AltitudeInstruction`, `SpeedInstruction`, `DirectInstruction`, `ApproachInstruction`, `CrossInstruction`, `HandoffInstruction`, etc.).

### Coordinate System

- **Plane**: Local East-North-Up (ENU) tangent plane in nautical miles (`NmEastNorth`: `xNm` East, `yNm` North) centered at the Airport Reference Point (ARP).
- **KDEM Demo Field ARP**: Origin `(0, 0)` at `0°N, 0°E` (1 NM = 1 arc-minute; magnetic variation 0°).
- **Headings**: True/Magnetic heading degrees `[0, 360)` where `000°` = North (+y world), `090°` = East (+x world).
- **Display Mapping**: North-up PPI maps +y (world North) to -y (canvas up). See [`docs/COORDINATE-SYSTEM.md`](docs/COORDINATE-SYSTEM.md).

---

## Features & Capabilities

### STARS TCW Display Emulation

- **Radar PPI & Camera**: North-up display with discrete range presets (5, 10, 15, 20, 30, 40, 50, 60 NM), camera panning/slewing, and single-click or airport recentering.
- **Datablocks**:
  - **Full Datablocks (FDB)**: 3-line layout showing Callsign/CID, Mode C reported altitude (hundreds of ft) & assigned altitude, ground speed (tens of kt), scratchpad, and climb/descent arrows.
  - **Limited Datablocks (LDB)**: Compact track display for unowned or filtered targets.
  - **Leader Lines (L1–L9)**: 9 compass keypad directions with 4 selectable lengths (0px, 24px, 36px, 48px).
- **Target History & Prediction**:
  - Discrete radar history dots (0–5 dots sampled at 5-second intervals).
  - Predicted Track Line (PTL): 1.0 to 4.0 minute forward ground track lookahead vector (`OWN` or `ALL`).
- **Target Proximity Alert (TPA)**: Selectable J-rings / separation halos (3 NM / 5 NM) for spacing management.
- **Display Control Bar (DCB)**: Authentic green physical button matrix with MAIN and AUX menu switching, interactive wheel spinners (RANGE, RR, LDR DIR, LDR LEN, BRITE, CHAR SIZE), altitude filters, and 8 persistent local PREF slots stored in `localStorage`.
- **System Status Area (SSA)**: Real-time top-left status display showing UTC/Sim time, altimeter setting (29.92), active altitude filter limits, and sensor mode.

### Flight Kinematics & FMS Navigation

- **Kinematic Realism**: Fixed 3°/s standard rate turns with bank transitions, standard climb/descent rate profiles (1,500–2,500 fpm), and acceleration limits.
- **Lateral FMS**: Direct-to navigation (`DCT <FIX>`), fly-by waypoint sequencing, and STAR route transitions.
- **Vertical Constraints**: `DESCEND_VIA` and `CLIMB_VIA` procedures with step-down crossing restriction compliance (`CROSS <FIX> <ALTITUDE> [AT|AT_OR_ABOVE|AT_OR_BELOW]`).
- **Instrument Approaches**: ILS localizer interception geometry with arming/capture modes, 3° glideslope descent tracking, and missed approach / go-around procedures (`GA`).

### Safety Alerting (CA & MSAW)

- **Conflict Alert (CA)**: Continuous evaluation of lateral (< 3.0 NM) and vertical (< 1,000 ft) aircraft separation. Triggers visual flashing in datablocks, red target highlighting, and continuous Web Audio square-wave warning beeps.
- **Minimum Safe Altitude Warning (MSAW)**: Polygon-based Minimum Vectoring Altitude (MVA) floor checks that alert when aircraft descend below safe sector altitudes.

### Simulated Pilot Agent & Handoffs

- **Callsign Resolution**: Matches callsigns via telephony name ("Delta 123"), ICAO code ("DAL123"), numeric tail ("123"), or currently hooked radar target.
- **Automated Check-Ins**: Staggered STAR arrival check-in radio calls as aircraft enter the TRACON sector.
- **Inbound Handoff Workflow**: Inbound arrivals spawn in pending handoff state from Center (unowned green FDB) → Controller clicks track or presses `F3` to accept → Track becomes owned (white FDB) → Radio frequency unlocked → Pilot checks in.
- **Realistic Readbacks**: Generates verbal readbacks following FAA JO 7110.65 digit grouping (e.g. "climb and maintain five thousand, Delta one twenty-three"), plus "unable" responses for invalid or aerodynamically impossible clearances.

---

## ATC Command Reference

Commands can be entered via the bottom command line prompt or spoken over Push-to-Talk (PTT).

### Typed Command Syntax

Prefix with callsign or click a radar target first:

| Category | Typed Syntax | Example | Description |
|---|---|---|---|
| **Heading** | `H <DEG>` | `DAL123 H 240` | Fly magnetic heading 240° |
| | `L <DEG>` / `R <DEG>` | `AAL456 L 090` | Turn left to heading 090° |
| | `T <DEG>L` / `T <DEG>R` | `SWA789 T 20L` | Turn 20 degrees left (relative) |
| | `PH` | `DAL123 PH` | Fly present heading |
| **Altitude** | `C <HUNDREDS>` | `DAL123 C 50` | Climb and maintain 5,000 ft |
| | `D <HUNDREDS>` | `DAL123 D 30` | Descend and maintain 3,000 ft |
| | `A <HUNDREDS>` | `DAL123 A 20` | Maintain 2,000 ft |
| **Speed** | `S <KNOTS>` | `DAL123 S 210` | Maintain 210 knots indicated airspeed |
| | `S <KNOTS>+` / `S <KNOTS>-` | `DAL123 S 180+` | Maintain 180 knots or greater / less |
| **Direct / Route** | `DCT <FIX>` | `DAL123 DCT BAF` | Proceed direct to fix/waypoint |
| | `VIA <STAR>` | `DAL123 VIA DEM1` | Descend via published STAR profile |
| | `JOIN <STAR>` | `DAL123 JOIN DEM1` | Join procedure at nearest leg |
| **Crossing** | `X <FIX> <ALT>` | `DAL123 X CAM 40` | Cross fix at 4,000 ft |
| | `X <FIX> <ALT>A` / `B` | `DAL123 X CAM 40A` | Cross fix at or above / at or below 4,000 ft |
| **Approach** | `APP ILS<RWY>` | `DAL123 APP ILS27` | Cleared ILS Runway 27 approach |
| | `IL ILS<RWY>` | `DAL123 IL ILS27` | Intercept localizer Runway 27 |
| | `EXP ILS<RWY>` | `DAL123 EXP ILS27` | Expect ILS Runway 27 approach |
| **Compound ILS**| `<H> <A> APP ILS<RWY>` | `DAL123 R240 A20 APP ILS27` | Turn right 240, maintain 2000 until established, cleared ILS 27 |
| **Transponder** | `SQ <CODE>` | `DAL123 SQ 4201` | Squawk transponder beacon code |
| | `I` / `ID` | `DAL123 I` | Squawk ident (flashes target symbol) |
| **Handoff** | `HO <SECTOR>` | `DAL123 HO TWR` | Initiate handoff to Tower / Center |
| | `F3` / `Enter` | `DAL123` + `F3` | Accept inbound handoff / track ownership |
| **Miscellaneous**| `GA` | `DAL123 GA` | Go around / execute missed approach |
| | `SH` / `SA` | `DAL123 SH` | Say heading / say altitude |

### Spoken Phraseology (FAA JO 7110.65)

| Clearance | Spoken Phrase Example |
|---|---|
| Vector | *"Delta one twenty-three, fly heading two four zero"* |
| Turn | *"American four fifty-six, turn left heading zero niner zero"* |
| Climb / Descend | *"Delta one twenty-three, descend and maintain three thousand"* |
| Speed | *"Southwest seven eighty-nine, reduce speed to two one zero knots"* |
| Direct | *"Delta one twenty-three, cleared direct Barnes"* |
| Descend Via | *"Delta one twenty-three, descend via the DEMO ONE arrival"* |
| Approach Clearance | *"Delta one twenty-three, turn right heading two four zero, maintain two thousand until established on the localizer, cleared ILS runway two seven approach"* |
| Go Around | *"Delta one twenty-three, go around, fly published missed approach"* |

---

## Controls & Keybindings

Press **`F1`** at any time in the app to open the interactive keyboard help overlay.

### Scope Controls & Mouse Interaction

| Action | Shortcut / Mouse |
|---|---|
| **Range In / Range Out** | `PageUp` / `PageDown` or `Mouse Wheel` (5, 10, 15, 20, 30, 40, 50, 60 NM) |
| **Pan / Slew Radar View** | `Right Click + Drag` or `Middle Click + Drag` |
| **Center View on Airport** | `Home` |
| **Center View on Click** | `End` or `Double-Click PPI` |
| **Select Track / Accept Handoff**| `Left Click` target symbol or datablock |
| **Deselect Track** | `Left Click` empty radar background |
| **Switch Focus (Command / PPI)** | `Tab` |

### Scope Keypad Shortcuts (When PPI is Focused)

| Key | Function |
|---|---|
| `L` then `1`–`9` | Set datablock leader line direction (Numpad compass positions) |
| `T` | Toggle Full Datablock (FDB) ↔ Limited Datablock (LDB) |
| `M` | Toggle Mode C altitude field |
| `F` | Set Altitude Filter band (`F` → min hundreds → `Enter` → max hundreds → `Enter`) |
| `H` | Toggle radar history trail dots (0 ↔ last count) |
| `F1` | Open keyboard help cheatsheet |
| `F3` / `F4` | Accept / drop track ownership |
| `F7` | Toggle Predicted Track Line (`PTL ALL`) |
| `F8` | Cycle radar history dot count |
| `/` | Immediately focus radio command line |
| `Shift + H` | Issue Tower handoff to aircraft established on final |

---

## Voice & Local Speech Subsystem (`speech-api`)

### Zero-Cloud Architecture

ATC-SIM enforces a strict **zero paid/metered API policy**. All speech-to-text, text-to-speech, and language salvage models run 100% locally on your machine via the bundled Python service in [`speech-api/`](speech-api/).

- **STT (Speech-to-Text)**: [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper) (CTranslate2) running `Systran/faster-whisper-small.en` or `base.en`. Uses `X-ATC-Fixes` headers to bias transcription toward active airspace waypoints.
- **TTS (Text-to-Speech)**: [Piper TTS](https://github.com/rhasspy/piper) with ONNX Runtime using high-speed multi-speaker medium voices (`en_US-lessac-medium`), assigning distinct voices to different airline callsigns.
- **Path C Salvage Parser**: [llama-cpp-python](https://github.com/abetlen/llama-cpp-python) running quantized `Qwen2.5-1.5B-Instruct-GGUF` (~1.2 GB) with GBNF grammar-constrained decoding (`parse_grammar.gbnf`). Operates solely as fallback salvage when deterministic parsers miss.

### Setting Up the Local Speech Server

1. Navigate to the `speech-api` directory and create a virtual environment:
   ```bash
   cd speech-api
   python3 -m venv .venv
   source .venv/bin/activate   # On Windows: .venv\Scripts\activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   # Optional: install llama-cpp-python for Path C local LLM parsing
   pip install -r requirements-parse.txt
   ```
3. Download open weights from Hugging Face:
   ```bash
   python download_weights.py
   ```
4. Start the speech API server:
   ```bash
   uvicorn app:app --host 127.0.0.1 --port 8090
   ```

### Endpoints

| Method | Path | Request Body | Response | Description |
|---|---|---|---|---|
| `GET` | `/health` | — | `{ "ok": true, "sttModel": "...", "ttsVoice": "...", "parse": "ready" }` | Health check & model status |
| `POST` | `/stt` | `audio/wav` (PCM 16kHz) | `{ "text": "...", "confidence": 0.95 }` | Transcribe controller speech |
| `POST` | `/tts` | `{ "text": "...", "voiceId": "..." }` | `audio/wav` binary stream | Synthesize pilot readback |
| `POST` | `/parse` | `{ "text": "...", "context": { ... } }` | Command IR JSON | Optional GBNF salvage parser |

---

## Aeronautical Data & CIFP Importer

ATC-SIM includes an automated tool to ingest FAA Coded Instrument Flight Procedures (CIFP) in ARINC 424 format into simulator JSON catalogs:

```bash
# Run CIFP procedure extraction tool
npm run cifp:import
```

Processed data lives in [`testdata/catalogs/`](testdata/catalogs/) and [`src/scenario/data/`](src/scenario/data/), defining:
- Airports, Runways, Displaced Thresholds, and Localizer/Glideslope geometry
- Waypoints, Navaids (VOR/DME, NDB), and Enroute Fixes
- SIDs (Standard Instrument Departures) and STARs (Standard Terminal Arrivals)
- Instrument Approach Plates (ILS, RNAV, Visual)

---

## Development, Testing & CI

### Available Scripts

```bash
# Run Vitest unit & integration test suites
npm test

# Run Vitest in interactive watch mode
npm run test:watch

# Strict TypeScript type check
npm run typecheck

# ESLint check
npm run lint

# Prettier format check & auto-format
npm run format:check
npm run format

# Run full CI suite (typecheck + lint + format:check + tests)
npm run ci
```

### Testing Strategy

- **Core & Kinematics Tests**: Vitest unit tests verifying Euler integration, standard rate turn limits, altitude crossing restriction satisfaction, and localizer capture math.
- **Parser Test Suite**: Thousands of unit tests verifying JO 7110.65 spoken phrases, vice token variations, and rejection of malformed clearances.
- **Integration Tests**: [`tests/integration/`](tests/integration/) tests full radio command execution against simulation state.
- **Python Tests**: Unit tests in `speech-api/tests/` verifying FastAPI endpoints, WAV encoding, and GBNF parsing.

---

## Implementation Roadmap & Phased Execution

ATC-SIM development is divided into **6 sequential phases** (comprising 98 granular ticket specifications):

| Phase | Directory | Description | Status |
|---|---|---|---|
| **Phase 00** | [`phases/00-slice/`](phases/00-slice/) | **Thin Vertical Slice**: Coordinate math, basic world state, typed parser stub, Canvas2D skeleton. | Shipped |
| **Phase 01** | [`phases/01-closed-loop/`](phases/01-closed-loop/) | **Playable Closed Loop**: 20 Hz physics accumulator, virtual pilot agent, flight kinematics, typed parser, readbacks. | Shipped |
| **Phase 02** | [`phases/02-scope/`](phases/02-scope/) | **STARS TCW Display**: Authentic CRT look, FDB/LDB datablocks, leader lines, video maps, DCB button matrix, 60 FPS Canvas2D. | Shipped |
| **Phase 03** | [`phases/03-voice/`](phases/03-voice/) | **Voice Pipeline**: PTT capture, Web Audio radio DSP graph, local `speech-api` (Whisper STT + Piper TTS), JO 7110.65 grammar. | Shipped |
| **Phase 04** | [`phases/04-procedures/`](phases/04-procedures/) | **Procedures & Airspace**: CIFP procedures, STAR descent-via navigation, ILS localizer/glideslope capture, Conflict Alert (CA), MSAW. | Shipped |
| **Phase 05** | [`phases/05-training/`](phases/05-training/) | **Training & Evaluation**: Controller scoring, phraseology checking, pilot human factor latency/errors, session recorder & replay. | Active |

### How to Launch an Implementation Agent

To implement a phase or ticket using an AI coding agent:
- **Solo Phase**: Read [`phases/LAUNCH.md`](phases/LAUNCH.md) and copy `phases/NN-name/AGENT.md` into the agent's briefing prompt.
- **Swarm Orchestration**: See [`phases/SWARM.md`](phases/SWARM.md), [`phases/SWARM-CAPTAIN.md`](phases/SWARM-CAPTAIN.md), and [`phases/SWARM-STATUS.md`](phases/SWARM-STATUS.md).
- **Git Protocol**: Every ticket is developed on a `ticket/<id>-<slug>` branch off `master` and squash-merged with one commit per ticket ([Workflow Rules](phases/LAUNCH.md)).

---

## Documentation Index

- [`docs/COORDINATE-SYSTEM.md`](docs/COORDINATE-SYSTEM.md) — Tangent plane ENU coordinate math and projection formulas.
- [`docs/DISCLAIMER.md`](docs/DISCLAIMER.md) — Legal notice and non-FAA operational disclaimer.
- [`docs/PRODUCT.md`](docs/PRODUCT.md) — Frozen product scope and parameters.
- [`phases/_shared/architecture.md`](phases/_shared/architecture.md) — System architecture and dataflow specifications.
- [`phases/_shared/command-ir.md`](phases/_shared/command-ir.md) — Command IR schema and typed token specifications.
- [`phases/_shared/parse-pipeline.md`](phases/_shared/parse-pipeline.md) — 4-stage command parser pipeline design.
- [`phases/_shared/speech-port.md`](phases/_shared/speech-port.md) — SpeechPort abstraction and Web Audio graph.
- [`phases/_shared/references.md`](phases/_shared/references.md) — FAA JO 7110.65, STARS TCW, and VATSIM CRC reference citations.
- [`phases/_shared/glossary.md`](phases/_shared/glossary.md) — Domain terminology and frozen physical units.
- [`phases/_shared/non-goals.md`](phases/_shared/non-goals.md) — Explicit system boundaries and anti-patterns.
- [`speech-api/README.md`](speech-api/README.md) — In-depth setup, Docker instructions, and configuration for the local speech service.

---

## License

This project is licensed under the MIT License — see the repository license file for details.
