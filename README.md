# ATC-SIM

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.4-646CFF.svg)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg)](https://reactjs.org/)
[![Vitest](https://img.shields.io/badge/Vitest-3.2-yellow.svg)](https://vitest.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Speech--API-009688.svg)](https://fastapi.tiangolo.com/)

An in-browser, high-fidelity **STARS-like (Standard Terminal Automation Replacement System)** radar air traffic control simulator and training workstation. It replicates terminal radar (TRACON) operations with 60 FPS Canvas2D PPI rendering, typed and spoken ATC command parsing (FAA JO 7110.65 phraseology), realistic flight kinematics and FMS procedural navigation, simulated pilot voice readbacks with VHF radio acoustic DSP, and real-time safety alerting (Conflict Alert & MSAW).

> [!IMPORTANT]
> **DISCLAIMER**: This simulator is built for **training and entertainment purposes only**. It is not certified for National Airspace System (NAS) operational use, is not FAA equipment, and is not affiliated with the Federal Aviation Administration or Raytheon Technologies. The user interface is a STARS-like visual and functional analog. See [`docs/DISCLAIMER.md`](docs/DISCLAIMER.md) and [`docs/PRODUCT.md`](docs/PRODUCT.md) for details.

---

## Table of Contents

- [Quick Start](#quick-start)
  - [Prerequisites](#prerequisites)
  - [Installation & Dev Server](#installation--dev-server)
  - [URL Query Parameters](#url-query-parameters)
- [Environment Configuration](#environment-configuration)
- [Voice & Local Speech Subsystem (`speech-api`)](#voice--local-speech-subsystem-speech-api)
  - [Zero-Cloud Architecture](#zero-cloud-architecture)
  - [Setting Up the Local Speech Server](#setting-up-the-local-speech-server)
  - [Endpoints](#endpoints)
- [Features & Capabilities](#features--capabilities)
  - [STARS TCW Display Emulation](#stars-tcw-display-emulation)
  - [Flight Kinematics & FMS Navigation](#flight-kinematics--fms-navigation)
  - [Safety Alerting (CA & MSAW)](#safety-alerting-ca--msaw)
  - [Simulated Pilot Agent & Handoffs](#simulated-pilot-agent--handoffs)
- [ATC Command Reference](#atc-command-reference)
  - [Typed Command Syntax](#typed-command-syntax)
  - [Spoken Phraseology (FAA JO 7110.65)](#spoken-phraseology-faa-jo-711065)
- [Controls & Keybindings](#controls--keybindings)
  - [Scope Controls & Mouse Interaction](#scope-controls--mouse-interaction)
  - [Scope Keypad Shortcuts](#scope-keypad-shortcuts)
  - [Preview Area](#preview-area)
    - [INIT / TERM / beacon select](#init--term--beacon-select)
    - [Tracking, handoff, and datablock](#tracking-handoff-and-datablock)
    - [System lists](#system-lists)
    - [Video maps](#video-maps)
    - [Scope display](#scope-display)
    - [Altitude and beacon filters](#altitude-and-beacon-filters)
    - [TPA / ATPA chords](#tpa--atpa-chords)
- [System Architecture](#system-architecture)
  - [Overview](#overview)
  - [Multi-Stage Parse Pipeline](#multi-stage-parse-pipeline)
  - [Coordinate System](#coordinate-system)
- [Aeronautical Data & CIFP Importer](#aeronautical-data--cifp-importer)
- [Development & Testing](#development--testing)
- [Documentation Index](#documentation-index)
- [License](#license)

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
| `departures` | `?departures=auto` \| `?departures=off` \| `?departures=true` \| `?departures=false` | Configure dynamic departure spawning policy (`auto` generates departures off active runway; `off` disables). |
| `dep_rate` | `?dep_rate=15` | Departure generation rate in aircraft per hour (default: `12`). |
| `dep_count` | `?dep_count=10` | Maximum number of departure aircraft to spawn in the session. |
| `seed` | `?seed=42` | PRNG seed for deterministic arrival and departure generation (default: `1`). |
| `scenario` | `?scenario=kdem-ils27` | Airspace scenario to load (default: KDEM TRACON Runway 27). |
| `debug` | `?debug=fps` | Displays real-time performance HUD showing canvas FPS, track count, and tick duration. |
| `voice` | `?voice=http` \| `?voice=web` \| `?voice=null` | Force active speech backend (`http` local server, browser `web`, or headless `null`). |

Examples:
- `http://localhost:5173/?departures=auto&dep_rate=12` — Mixed traffic scenario with STAR arrivals and active RW27 departures.
- `http://localhost:5173/?traffic=30&debug=fps` — 30-track stress test with real-time FPS counter.
- `http://localhost:5173/?seed=2` — Seeded arrival schedule with reshuffled STAR slots.

---

## Environment Configuration

Configuration templates are provided for both the frontend SPA and the local Python speech service.

### Frontend (`.env`)

Copy `.env.example` to `.env` in the root directory if you wish to override speech API endpoints:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `VITE_STT_URL` | `http://127.0.0.1:8090/stt` | Endpoint for speech-to-text audio transcription |
| `VITE_TTS_URL` | `http://127.0.0.1:8090/tts` | Endpoint for pilot readback audio synthesis |
| `VITE_SPEECH_TOKEN` | *(empty)* | Optional shared-secret header for local speech-api |

### Speech Service (`speech-api/.env`)

The local Python speech service is configured via `speech-api/.env` (copy from `speech-api/.env.example`).

```bash
cd speech-api
cp .env.example .env
```

It supports configuring custom STT/TTS model weights, preloaded voice rosters, CUDA offloading, and custom local `.gguf` models for Path C salvage parsing. For the full environment variable reference and configuration guide, see [`speech-api/README.md`](speech-api/README.md).

---

## Voice & Local Speech Subsystem (`speech-api`)

### Zero-Cloud Architecture

ATC-SIM enforces a strict **zero paid/metered API policy**. All speech-to-text, text-to-speech, and language salvage models run 100% locally on your machine via the bundled Python service in [`speech-api/`](speech-api/).

- **STT (Speech-to-Text)**: [Qwen3-ASR](https://huggingface.co/Qwen/Qwen3-ASR-1.7B) running locally through `qwen-asr`. Uses ATC callsign, fix, and procedure context to bias transcription.
- **TTS (Text-to-Speech)**: [Piper TTS](https://github.com/OHF-Voice/piper1-gpl) with ONNX Runtime using high-speed multi-speaker medium voices (`en_US-lessac-medium`), assigning distinct voices to different airline callsigns.
- **Path C Salvage Parser**: [llama-cpp-python](https://github.com/abetlen/llama-cpp-python) running quantized `MaziyarPanahi/Qwen3-4B-Instruct-2507-GGUF` with GBNF grammar-constrained decoding. Loads by default and operates solely as fallback salvage when deterministic parsers miss.

### Setting Up the Local Speech Server

1. Navigate to `speech-api` and create a virtual environment:
   ```bash
   cd speech-api
   python3 -m venv .venv
   source .venv/bin/activate   # On Windows: .venv\Scripts\activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
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
- **Display Control Bar (DCB)**: Authentic green physical button matrix with MAIN and AUX menu switching, interactive wheel spinners (RANGE, RR, LDR DIR, LDR LEN, BRITE, CHAR SIZE), altitude filters, and persistent local PREF slots stored in `localStorage`.
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
- **Automated Check-Ins**: Staggered arrival and departure check-in radio calls:
  - STAR arrivals: *"Approach, Delta 123, descending via DEMO ONE arrival through one-one thousand (11000)"*.
  - SIDs departures: *"Departure, American 100, passing seven hundred climbing via the BAY ONE departure"*.
- **Inbound & Departure Handoff Workflow**:
  - Inbound arrivals spawn in pending handoff state from Center (unowned green FDB) → Controller left-clicks the track, uses Preview Area `F3` INIT CNTL, **or** idle scope `Enter` then click (`HO ACCEPT`) to accept → Track becomes owned (white FDB) → Radio frequency unlocked → Pilot checks in.
  - Rolling departures spawn off the active runway (~0.8 NM, 700 ft, 180 kt) under Tower handoff → Pilot checks in on departure frequency → Flies published SID climb profile.
- **Smart Shift+H Handoff**: Context-sensitive handoff initiator:
  - Selected arrival on approach (< 5 NM from threshold): executes Tower handoff (sets `LANDING` mode and tower ownership cyan tint).
  - Selected climbing departure (>= 5000 ft or >= 12 NM): executes Center handoff (logs `handoff.center` and sets outbound white state).
- **Realistic Readbacks**: Generates verbal readbacks following FAA JO 7110.65 digit grouping (e.g. "climb and maintain five thousand, Delta one twenty-three"), plus "unable" responses for invalid clearances.

---

## ATC Command Reference

Commands can be entered via the bottom command line prompt or spoken over Push-to-Talk (PTT).

### Typed Command Syntax

Typed commands **below** are **radio Command IR** only (command line or PTT). Inbound accept is a **scope** action: left-click the track, Preview Area `F3` INIT CNTL, or idle scope `Enter` then click — not a radio token.

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

### Scope Keypad Shortcuts

| Key | Function |
|---|---|
| `L` then `1`–`9` | Set datablock leader line direction (Numpad compass positions) |
| `T` | Toggle Full Datablock (FDB) ↔ Limited Datablock (LDB) |
| `M` | Toggle Mode C altitude field |
| `F` | Set Altitude Filter band (`F` → min hundreds → `Enter` → max hundreds → `Enter`) |
| `H` | Toggle radar history trail dots (0 ↔ last count) |
| `F1` | Open keyboard help cheatsheet (CRC analog: beaconator hold; not MULTIFUNC) |
| `F3` | INIT CNTL: selected track owns now; nothing selected arms command-then-slew (`INIT CNTL`, never `"F3"`); type FLID then Enter or slew. Color/ownership stub, not NAS associate. Pending inbound: accept+own. |
| `F4` | TERM CNTL: selected track drops now; nothing selected arms command-then-slew (`TERM CNTL`, never `"F4"`); type FLID then Enter or slew. Trainer drop. `TERM CNTL ALL` is `INV`, not drop-all. |
| `F7` | Toggle Predicted Track Line (`PTL ALL`) |
| `F8` | Cycle radar history dot count |
| `Tab` | Cycle keyboard focus between the PPI (scope / Preview Area) and `#command-line-input` |
| `/` | **Scope focus:** Preview Area drop (`TERM CNTL`) or PDB ↔ FDB on a datablock click — not a radio-focus steal. **Radio focus:** leftover character for the command line. |
| `Shift + H` | Contextual smart handoff: Tower (for arrivals on final) or Center (for climbing departures) |

### Preview Area

The Preview Area is the typed **scope** buffer painted under the SSA (CRC analog). It is **not** the radio command line. With PPI focus, `*` `+` `/` and alnum/space buffer into `view.preview` and paint live under the SSA. `<Tab>` is the only focus switcher between the PPI and `#command-line-input`. Scope keys never emit Command IR, readback, or intent. Radio typing never mutates the Preview Area. `DAL123 H270` still turns.

Unknown or incomplete commit flashes `<buffer> INV` (reject, never parse-and-no-op). Backspace edits; Esc cancels to idle (live preview > live `*` chord > DCB). Empty PPI click does not consume an armed tracking command. No `window.prompt`, no extra HTML `<input>`.

Trainer F3 is a color/ownership stub (unowned green FDB → owned white FDB), not NAS associate. F4 is trainer drop, not NAS terminate. Pending inbound + INIT CNTL or idle `Enter` then click still accepts the handoff.

#### INIT / TERM / beacon select

| Command | What the operator does | What happens |
| --- | --- | --- |
| F3 INIT CNTL (arm) | `F3` with nothing selected | Preview paints `INIT CNTL` (never the literal `"F3"`). Next target click owns **that** track (white FDB). Pending inbound: one click accept+own. |
| F3 implied | `F3` with a track already selected | Owns the selection immediately. Preview may flash `INIT CNTL` then clear. |
| F3 + FLID + Enter | `F3`, type full callsign / numeric tail / unique 4-digit squawk, Enter | Owns that aircraft with nothing selected. Unknown or ambiguous → brief `INV`, no apply. |
| F3 + FLID + slew | `F3`, type FLID, click a target | Applies only if the FLID uniquely matches that track; else `INV`. |
| F4 TERM CNTL (arm) | `F4` with nothing selected | Preview paints `TERM CNTL` (never `"F4"`). Next target click drops **that** track. |
| F4 implied | `F4` with a track selected | Drops the selection now. |
| F4 + FLID + Enter | `F4`, type FLID, Enter | Drops the resolved aircraft. `TERM CNTL ALL` is `INV`, not drop-all. |
| Scope-focus `B` + two digits + Enter | PPI focused, `B` `4` `5` Enter | Toggles CODE BLOCK `"45"`. Unassociated squawks starting with `45` paint □. Second `B45` Enter removes it. |
| Scope-focus `B` + four digits | PPI focused, `B4500` (four digits may auto-commit) | Toggles discrete `"4500"`. Matching unassociated paints □; unmatched stays `*`. |
| Incomplete `B` Enter | Bare `B`, one digit, or three digits then Enter | `INV`; select list unchanged. |
| Radio-focus `B` | Command line focused, type `B` | Literal character. Never always-on. |

Idle `F` (no star) still starts the altitude-filter chord (`F` → min hundreds → Enter → max hundreds → Enter). That is not `*F`.

#### Tracking, handoff, and datablock

| Command | What the operator does | What happens |
| --- | --- | --- |
| `+` then click | Scope-focus `+`, click a target | Arms `INIT CNTL`; click owns that track. Live `+` click also completes. |
| `+ [FLID]` Enter then click | `+DAL123` Enter, then click | Associates that FLID to the clicked track (`resolveScopeFlid`). |
| `/` then click **symbol** | Scope-focus `/`, click the target symbol | Arms `TERM CNTL`; click drops an owned track. |
| `/` then click **datablock** | Scope-focus `/`, click the datablock (not the symbol) | Toggles PDB ↔ FDB. |
| Idle Enter then click | Empty scope buffer, `Enter`, click inbound | Arms `HO ACCEPT`; click accepts the inbound handoff. Live `*T` / `*D LOC27` Enter still commit those commands instead. |
| `*` then click | Scope-focus `*`, click a target | Acks a pending pointout, or toggles cyan highlight. Bare `*` Enter still goes to TPA (`starsChord`). |
| `*1`–`*8` then click | `*3` then click a datablock | STARS leader clock (1 = NE clockwise through 8 = N). Idle `L` then `1`–`9` is the old keypad compass and is unchanged. |
| `*0` then click | `*0` then click | Resets leader direction to the facility default. |
| `*B` then click | `*B`, click an uncorrelated track | 5 s Mode 3/A beaconator readout. Bare `*B` Enter stays TPA (`*B INV`). |
| `+HOLD` / `/ALL` | Type those strings, Enter | `INV`. Not coast-all / drop-all. |

#### System lists

Spaces optional (`*T` = `* T`). Line limit is `1`–`100`.

| Command | What the operator does | What happens |
| --- | --- | --- |
| `*T` / `*TAB` Enter | Scope-focus `*T` Enter | Toggles TAB flight-plan list. |
| `*TV` Enter | | Toggles VFR list. |
| `*TC` Enter | | Toggles Coast/Suspend list. |
| `*TS` Enter | | Toggles Sign-On list. |
| `* P1` / `* P2` / `* P3` Enter | Space after `*` | Toggles Tower lists 1–3. Compact `*P3` is a 3 NM cone, not this list. |
| `*TM` Enter | | Toggles Alert list. |
| `*TX` Enter | | Toggles Maps directory list. |
| `*TN` Enter | | Toggles CRDA status list (the list window, not CRDA geometry). |
| `*T 15` Enter | `*T` `1` `5` Enter | Sets TAB visible-line limit to 15. `*T 0` / `*T 999` → `INV`, no mutation. |
| Live `*T` then click | Type `*T`, click the PPI (no Enter) | Relocates TAB to the click. |
| `*S` then click | Type `*S` (Enter optional), click | Relocates SSA. Does not toggle SSA off. |

#### Video maps

Maps match catalog **slot** `1`–`32` or **id** (`LOC27`, `RWY`, `DEM1_27`, …).

| Command | What the operator does | What happens |
| --- | --- | --- |
| `*D 1` / `*D LOC27` Enter | | Toggles that map. |
| `*D OFF LOC27` Enter | | Forces that map off. |
| `*D ALL` / `*D NONE` Enter | | All maps on / all off. |
| Bare `*D` Enter | `*D` with no token | Stays TPA (`*D` / `*DE` / `*DI` / `*D+` are incomplete prefixes of TPA, not a map toggle). Unknown id / slot `99` → `INV`. |
| Tap `M` | Single `M` with scope focus | Still toggles Mode C. |
| `M DEM1_27` Enter | `M` then a map id (within the chord window) | Toggles that map. Not assign-code `M ####`. |

#### Scope display

DCB spinner lists are unchanged: RR `[2, 5, 10]`, PTL `0.5 / 1 / 2 / 4`. Keyboard may use a wider set.

| Command | What the operator does | What happens |
| --- | --- | --- |
| `*C` then click | `*C` Enter (or live `*C`), click PPI | Recenters the scope on the click. |
| `*OFF` Enter | | Off-centers / resets scope center. |
| `*RR 5` Enter | `*RR` then `2`, `5`, `10`, or `20` | Sets range-ring interval (NM). Other numbers → `INV`. |
| `*RR C` then click | | Places range-ring center on the click. |
| `*RR OFF` Enter | | Clears range-ring center. |
| `*PTL 3` Enter | Minutes `0`–`15` | Sets PTL duration. `*PTL` is not TPA `*P`. |
| `*HIST 4` Enter | Dots `0`–`9` | Sets history-dot count. |

#### Altitude and beacon filters

| Command | What the operator does | What happens |
| --- | --- | --- |
| `*F` Enter | | Flashes current `FILTER` min–max hundreds. Does **not** mutate limits and does **not** open a flight-plan modal. |
| `*LA 000 150` Enter | Three-digit hundreds, floor then ceiling, `0`–`180`, floor ≤ ceiling | Writes altitude-filter limits. Incomplete `*LA` Enter → `INV`. |
| `*BCN 45` Enter | 2-digit block or 4-digit discrete, octal `0`–`7` | Adds a beacon-select code (same list as `B##` / `B####`). |
| `*BCN DEL 45` Enter | | Removes that code. Incomplete `*BCN` Enter → `INV`. |

#### TPA / ATPA chords

Unchanged T02-49 slew chords. Incomplete `*` prefixes (`*J`, `*P`, `*P3`, `*P5`, `*P10`, `*AI`, `*AE`, `*BE`, `*BI`) still fall through to `starsChord` on Enter. A live `*` TPA hint still wins over idle preview.

| Command | What the operator does | What happens |
| --- | --- | --- |
| `*J [1–30]` / `*J 0` | | Per-track J-ring; `0` clears. `**J` clear-all. |
| `*P3` / `*P5` / `*P10` / `*P2.5` | `*P` then miles, Enter or click the target | Ground-track TPA cone 1–30 NM. Bare `*P` clears that track's cone. |
| `*AI` click / `*AE` Enter | | ATPA inhibit / enable per T02-49. |

**Mnemonic collisions (do not mix these up):**

- Idle `T` = FDB ↔ LDB. `*T` = TAB list.
- Compact `*P1`–`*P3` = TPA cone miles. Spaced `* P1`–`* P3` = tower lists. `*PTL` = PTL minutes.
- `*D token` = maps. Bare `*D` = TPA.
- Idle `F` = filter chord. `*F` Enter = FILTER readout (not `*F [Callsign]` flight plan).
- `*BCN` = beacon filter. Bare `*B` Enter = TPA. `*B` click = beaconator.
- Tap `M` = Mode C. `M [map id]` = map toggle.

Deferred (not parsed here): flight-plan modals `*F [Callsign]` / `*V` / `*A` / `*DEL`; scratchpads and assigned alt/hdg/spd; `+HOLD` / `+UNS` / `+R` / `/ALL`; multi-controller handoff / pointout TCP / consol / QL; `*WX`; `*CRDA` geometry; TDM `*G`; CA inhibit `*K`. Full list: **STARS preview area — commands not parsed / deferred** in [`phases/LATER-IMPLEMENTATION-BACKLOG.md`](phases/LATER-IMPLEMENTATION-BACKLOG.md).

---

## System Architecture

### Overview

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

1. **Deterministic 20 Hz Simulation**: The physical simulation updates at a constant 20 Hz via an accumulator-based physics clock decoupled from rendering. Core logic is pure TypeScript with no DOM dependencies.
2. **60 FPS Canvas2D Scope Rendering**: The PPI radar scope is rendered via high-performance Canvas2D supporting dense traffic with history trails, leader lines, datablocks, J-rings, and vector maps.
3. **React TCW Shell Overlay**: Manages the surrounding workstation workspace: Display Control Bar (DCB), Flight Progress Strips, Command Line, System Status Area (SSA), and menus.

### Multi-Stage Parse Pipeline

Commands from keyboard input or transcribed speech are evaluated through a robust 4-stage pipeline:

```
User Input (Text or Spoken Audio)
  │
  ├──► [Stage 0: Normalization] (Telephony expansion, number word translation, whitespace cleanup)
  │
  ├──► [Stage 1: Typed Shorthand] (Fast STARS token parser: H240, C50, S210, APP ILS27)
  │      └─► Hit? ──► Return Command IR (parseStage: "typed")
  │
  ├──► [Stage 2: Path A - Spoken Grammar] (Deterministic FAA JO 7110.65 spoken English grammar)
  │      └─► Hit? ──► Return Command IR (parseStage: "spoken_a")
  │
  ├──► [Stage 3: Path B - Fuzzy Rewrite] (Spoken-to-typed phonetic and alias salvage)
  │      └─► Hit? ──► Return Command IR (parseStage: "spoken_b")
  │
  └──► [Stage 4: Path C - Local LLM Salvage] (Optional GBNF grammar-constrained llama.cpp /parse)
         └─► Hit? ──► Validate JSON against Command IR schema ──► Return (parseStage: "llm_c")
```

All parsed instructions resolve to strongly typed Command IR structures (`HeadingInstruction`, `AltitudeInstruction`, `SpeedInstruction`, `DirectInstruction`, `ApproachInstruction`, `CrossInstruction`, `HandoffInstruction`, etc.).

### Coordinate System

- **Plane**: Local East-North-Up (ENU) tangent plane in nautical miles (`NmEastNorth`: `xNm` East, `yNm` North) centered at the Airport Reference Point (ARP).
- **Headings**: True/Magnetic heading degrees `[0, 360)` where `000°` = North (+y world), `090°` = East (+x world).
- **Display Mapping**: North-up PPI maps +y (world North) to -y (canvas up). See [`docs/COORDINATE-SYSTEM.md`](docs/COORDINATE-SYSTEM.md).

---

## Aeronautical Data & CIFP Importer

ATC-SIM includes an offline developer tool that converts a locally available
FAA Coded Instrument Flight Procedures (CIFP) ARINC 424 file into simulator
JSON catalogs. It covers supported SIDs, STARs, approaches, fixes, and
navaids. The browser never downloads or parses CIFP.

```bash
# Generate one catalog JSON from a local CIFP file
npm run cifp:import -- --in .cifp/FAACIFP18 --out tools/cifp-import/out/catalog.json

# Generate a scenario-ready ICAO catalog pack
npm run cifp:pack -- --in .cifp/FAACIFP18 --airport KATL --radius 40 --out src/scenario/data/katl

# Preview selection without writing files
npm run cifp:pack -- --in .cifp/FAACIFP18 --airport KATL --radius 40 \
  --sids SID1,SID2 --stars STAR1 --approaches ILS26L --out tools/cifp-import/out/katl --dry-run
```

On Windows PowerShell, use `npm.cmd run cifp:pack -- ...` when forwarded
arguments are consumed by the PowerShell `npm` shim.

Pack generation first selects records within radius of airport ARP, then
recursively includes every referenced SID, STAR, and approach fix/navaid.
Radius is a seed, not a procedure boundary. Use `--sids`, `--stars`, and
`--approaches` for explicit flow selection; omit all three to include all
supported procedures for that airport.

Processed data can define:
- Airports, Runways, Displaced Thresholds, and Localizer/Glideslope geometry
- Waypoints, Navaids (VOR/DME, NDB), and Enroute Fixes
- SIDs (Standard Instrument Departures) and STARs (Standard Terminal Arrivals)
- Instrument Approach Plates (ILS, RNAV, Visual)

Input CIFP files and generated intermediate output belong in `.cifp/` and
`tools/cifp-import/out/`; both are gitignored. Do not commit FAA cycles,
national derived dumps, chart data, or source files. Only intentionally
reviewed trainer packs belong under `src/scenario/data/<icao>/`. The committed
KATL pack is catalog JSON plus `src/scenario/katl.json` / `katl-08.json`.
Those configurations are in playable inventory (KDEM stays default). Video
maps remain absent; do not point KATL at KDEM maps. Authored trainer MVA is a
uniform 3000 ft floor, not FAA source data. ATPA and telephony remain
separate authored data.

See [`tools/cifp-import/README.md`](tools/cifp-import/README.md) for supported
record types, SID/STAR/approach selection, reproducibility, legal boundaries,
and synthetic offline fixtures.

---

## Development & Testing

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

- **Core & Kinematics Tests**: Unit tests verifying fixed timestep integration, standard rate turn limits, altitude crossing restrictions, and localizer capture math.
- **Parser Test Suite**: Thousands of unit tests verifying JO 7110.65 spoken phrases, vice token variations, and rejection of malformed clearances.
- **Integration Tests**: Tests full radio command execution against simulation state in `tests/integration/`.
- **Python Tests**: Unit tests in `speech-api/tests/` verifying FastAPI endpoints, WAV encoding, and GBNF parsing.

---

## Documentation Index

- [`docs/COORDINATE-SYSTEM.md`](docs/COORDINATE-SYSTEM.md) — Tangent plane ENU coordinate math and projection formulas.
- [`docs/DISCLAIMER.md`](docs/DISCLAIMER.md) — Legal notice and non-FAA operational disclaimer.
- [`docs/PRODUCT.md`](docs/PRODUCT.md) — Product scope and parameters.
- [`speech-api/README.md`](speech-api/README.md) — In-depth setup, Docker instructions, and configuration for the local speech service.

---

## License

This project is licensed under the MIT License — see the repository license file for details.
