# ATC-SIM user guide

Press **`F1`** in the app for the keyboard overlay.

Voice: [`speech-api/README.md`](../speech-api/README.md) (local models).

## URL query parameters

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

- `http://localhost:5173/?departures=auto&dep_rate=12` — Mixed traffic with STAR arrivals and active RW27 departures.
- `http://localhost:5173/?traffic=30&debug=fps` — 30-track stress test with FPS counter.
- `http://localhost:5173/?seed=2` — Seeded arrival schedule with reshuffled STAR slots.

## Frontend environment

Copy `.env.example` to `.env` in the repo root to override speech API endpoints:

| Variable | Default | Description |
|---|---|---|
| `VITE_STT_URL` | `http://127.0.0.1:8090/stt` | Speech-to-text |
| `VITE_TTS_URL` | `http://127.0.0.1:8090/tts` | Pilot readback TTS |
| `VITE_SPEECH_TOKEN` | *(empty)* | Optional shared-secret header for local speech-api |

Service-side env, models, and Path C: [`speech-api/README.md`](../speech-api/README.md).

## Features

### STARS TCW display

- **Radar PPI & camera**: North-up display with discrete range presets (5, 10, 15, 20, 30, 40, 50, 60 NM), camera panning/slewing, and single-click or airport recentering.
- **Datablocks**:
  - **Full datablocks (FDB)**: 3-line layout showing callsign/CID, Mode C reported altitude (hundreds of ft) & assigned altitude, ground speed (tens of kt), scratchpad, and climb/descent arrows.
  - **Limited datablocks (LDB)**: Compact track display for unowned or filtered targets.
  - **Leader lines (L1–L9)**: 9 compass keypad directions with 4 selectable lengths (0px, 24px, 36px, 48px), STARS leader clock directions (`*1`–`*8`), track-specific and fleet-wide leader direction commands (`*L(1-9)` / `*L(1-9)*` / `*L(1-9)U`), length adjustments (`/<0-7>`, `*LDR <0-7>`), and combined position/length setting.
- **Target history & prediction**:
  - Discrete radar history dots (0–9 dots sampled at 5-second intervals, set via `F8` or `*HIST <count>`).
  - Predicted Track Line (PTL): 0.5 to 15.0 minute forward ground track lookahead vector with global toggle (`F10` / `*PTL <min>`) and per-track PTL toggle (`*R`).
- **Target Proximity Alert (TPA)**: Selectable J-rings / separation halos (1–30 NM via `*J`) and ground-track predictive cones (1–30 NM via `*P`) for spacing management.
- **Compass Rose heading vectoring ring**: Outermost range ring overlay with 72 radial tick marks (5° minor, 10° medium, 30° major) and twelve 3-digit heading numerals (`360`, `030`, `060`, `090`, `120`, `150`, `180`, `210`, `240`, `270`, `300`, `330`) radially inward for rapid heading assignment and vectoring. Brightness is controlled via `BRITE CMP` (0% / OFF to 100%) and numeral font sizing follows `CHAR SIZE TOOLS` (11–15 px).
- **Display Control Bar (DCB)**: Green physical button matrix with MAIN and AUX menu switching, interactive wheel spinners (RANGE, RR, LDR DIR, LDR LEN, BRITE channels including CMP and BCN, CHAR SIZE including TOOLS, H_RATE, DWELL hover brightening, CURSOR HOME, CSR SPD, VOL alert volume, MODE FSL), altitude filters, and persistent local PREF slots stored in `localStorage`.
- **System Status Area (SSA)**: Top-left status showing UTC/sim time, altimeter setting (29.92), active altitude filter limits, and sensor mode. Relocatable via `<MULTI FUNC>S<SLEW LOCATION>` (`*S` + click) and resettable via Shift+click.
- **On-Scope System Lists**: Movable, draggable operational data windows including TAB List (`*T`), Tower Lists (`*P1`–`*P3`), VFR List (`*TV`), Video Maps Directory (`*TX`), Alert Status Box LA/CA/MCI (`*TM`), CRDA Status (`*TN`), Coast/Suspend (`*TC`), and Sign-On (`*TS`). All lists feature click-and-drag title headers, Shift+click default reset, collision warning frames, interactive row clicks, `F1` row drops, and persistent layout retention via DCB `PREF`. STARS system list commands strictly use authorized `<MULTI FUNC>` prefix syntax without aliases.

### Flight kinematics & FMS

- **Kinematic realism**: Fixed 3°/s standard rate turns with bank transitions, standard climb/descent rate profiles (1,500–2,500 fpm), and acceleration limits.
- **Lateral FMS**: Direct-to navigation (`DCT <FIX>`), fly-by waypoint sequencing, and procedure route transitions (`VIA <STAR>`, `CVIA <SID>`, `JOIN <PROC>`).
- **Vertical constraints**: `DESCEND_VIA` and `CLIMB_VIA` procedures with step-down crossing restriction compliance (`X <FIX> <ALTITUDE> [A|B]`).
- **Instrument approaches**: ILS localizer interception geometry with arming/capture modes (`APP ILS<RWY>`, `IL ILS<RWY>`, `EXP ILS<RWY>`), 3° glideslope descent tracking, and missed approach / go-around procedures (`GA`).
- **Compound vectoring clearances**: Simultaneous heading, altitude until established, and approach clearance (e.g. `DAL123 R240 A20 APP ILS27`).

### Safety alerting (CA, MSAW, MCI)

- **Conflict Alert (CA)**: Kinematic CPA prediction uses the active pair's lower airspace type (Type 1–4). An active unacknowledged CA, MSAW, or MCI displays a red inline `+` beside the ACID at 800 ms on / 800 ms off; acknowledged CA/MSAW stays solid. CA/MCI inhibit displays the normal upright `Δ`; MSAW inhibit displays `*`. Use the `CA` commands below; `F11` buffers `CA `.
- **Minimum Safe Altitude Warning (MSAW)**: Polygon-based Minimum Vectoring Altitude (MVA) floor checks that alert when aircraft descend below safe sector altitudes. `*LA` is only the altitude-filter command, not an MSAW inhibit.
- **Mode C Intruder (MCI)**: Alerts when an untracked VFR/Mode C transponder target penetrates protected airspace around tracked flights. Toggled on/off globally via `*MCI`.

### Simulated pilot & handoffs

- **Callsign resolution**: Matches callsigns via telephony name ("Delta 123"), ICAO code ("DAL123"), numeric tail ("123"), or currently hooked radar target.
- **Automated check-ins**: Staggered arrival and departure check-in radio calls:
  - STAR arrivals: *"Approach, Delta 123, descending via DEMO ONE arrival through one-one thousand (11000)"*.
  - SID departures: *"Departure, American 100, passing seven hundred climbing via the BAY ONE departure"*.
- **Inbound & departure handoff workflow**:
  - Inbound arrivals spawn in pending handoff state from Center (unowned green FDB) → Controller left-clicks the track (slew to accept) or uses `F3` (`INIT CNTL`) to accept → Track becomes owned (white FDB) → Radio frequency unlocked → Pilot checks in.
  - Rolling departures spawn off the active runway (~0.8 NM, 700 ft, 180 kt) under Tower handoff → Pilot checks in on departure frequency → Flies published SID climb profile.
- **Smart Shift+H / F5 handoff**: Context-sensitive handoff initiator:
  - Selected arrival on approach (< 5 NM from threshold): executes Tower handoff (sets `LANDING` mode and tower ownership cyan tint).
  - Selected climbing departure (>= 5000 ft or >= 12 NM): executes Center handoff (logs `handoff.center` and sets outbound white state).
- **Readbacks**: FAA JO 7110.65 digit grouping (e.g. "climb and maintain five thousand, Delta one twenty-three"), plus "unable" for invalid clearances.

## ATC command reference

Commands can be entered via the bottom command line prompt (`#command-line-input`) or spoken over Push-to-Talk (PTT).
Pressing `Tab` toggles focus between the command line and the radar scope (PPI / Preview Area).

> [!NOTE]
> Radio commands stay strictly on the command line or PTT audio channel and issue pilot instructions.
> Scope keys and STARS Preview Area commands stay on the radar display and never issue radio transmissions.

### Typed command syntax

Spaces between command letters and numeric parameters are optional (e.g. `H 240` or `H240`, `C 50` or `C50`).
If an aircraft is already selected on the scope, the callsign prefix is automatically populated in the input field.

| Category | Typed Syntax | Example | Description |
|---|---|---|---|
| **Heading** | `H <DEG>` | `DAL123 H 240` / `DAL123 H240` | Fly magnetic heading 240° (shortest turn) |
| | `L <DEG>` | `AAL456 L 090` / `AAL456 L90` | Turn left to heading 090° |
| | `R <DEG>` | `SWA789 R 180` / `SWA789 R180` | Turn right to heading 180° |
| | `T <DEG>L` / `T <DEG>R` | `DAL123 T 20L` / `DAL123 T20R` | Turn relative degrees left or right (1°–360°) |
| | `PH` | `DAL123 PH` | Fly present heading (cancels active turn) |
| **Altitude** | `C <HUNDREDS>` | `DAL123 C 50` / `DAL123 C50` | Climb and maintain 5,000 ft |
| | `D <HUNDREDS>` | `DAL123 D 30` / `DAL123 D30` | Descend and maintain 3,000 ft |
| | `A <HUNDREDS>` | `DAL123 A 20` / `DAL123 A20` | Maintain assigned altitude 2,000 ft |
| **Speed** | `S <KNOTS>` | `DAL123 S 210` / `DAL123 S210` | Maintain indicated airspeed 210 knots |
| **Direct / Route** | `DCT <FIX>` | `DAL123 DCT BAF` | Proceed direct to fix or navaid |
| | `VIA <STAR> [TRANS]` | `DAL123 VIA DEM1` / `VIA DEM1 RW27` | Descend via published STAR profile and transition |
| | `CVIA <SID> [TRANS]` | `AAL100 CVIA BAY1 OCTTA` | Climb via published SID profile and transition |
| | `JOIN <PROC> [TRANS]` | `DAL123 JOIN DEM1` | Join procedure at nearest waypoint leg |
| **Crossing** | `X <FIX> <ALT>` | `DAL123 X CAM 40` | Cross fix at 4,000 ft |
| | `X <FIX> <ALT>A` | `DAL123 X CAM 40A` | Cross fix at or above 4,000 ft |
| | `X <FIX> <ALT>B` | `DAL123 X CAM 40B` | Cross fix at or below 4,000 ft |
| **Approach** | `APP ILS<RWY>` | `DAL123 APP ILS27` | Cleared ILS Runway 27 approach (arms localizer + glideslope) |
| | `IL ILS<RWY>` | `DAL123 IL ILS27` | Intercept localizer only (clears localizer tracking, no glideslope) |
| | `EXP ILS<RWY>` | `DAL123 EXP ILS27` | Expect ILS Runway 27 approach |
| **Compound Clearance** | `<H> <A> APP ILS<RWY>` | `DAL123 R240 A20 APP ILS27` | Fly heading 240°, maintain 2,000 ft until established, cleared ILS 27 |
| **Transponder / Ident** | `I` | `DAL123 I` | Squawk ident (flashes target symbol for 5 seconds) |
| **Miscellaneous** | `GA` | `DAL123 GA` | Go around / execute published missed approach |
| | `SH` | `DAL123 SH` | Say current heading |
| | `SA` | `DAL123 SA` | Say current altitude |

> [!TIP]
> Transponder beacon assignment and radar handoffs are handled directly via scope controls:
> - **Inbound handoff accept**: Left-click the target symbol (slew accept) or press `F3` (`INIT CNTL`).
> - **Outbound handoff**: Press `F5` or `Shift+H` to initiate handoff to Tower (arrivals) or Center (departures).
> - **Beacon codes**: Correlate via Flight Plan List `[Index#]` slew-click or use STARS beacon select (`B45` / `*BCN 45`).

### Spoken phraseology (FAA JO 7110.65)

When using Push-to-Talk (PTT), speak clearances using standard FAA JO 7110.65 ATC phraseology:

| Clearance Type | Spoken Phrase Example |
|---|---|
| **Vector / Heading** | *"Delta one twenty-three, fly heading two four zero"* |
| **Turn Direction** | *"American four fifty-six, turn left heading zero niner zero"* |
| **Relative Turn** | *"Southwest seven eighty-nine, turn twenty degrees right"* |
| **Present Heading** | *"Delta one twenty-three, fly present heading"* |
| **Climb / Descend** | *"Delta one twenty-three, descend and maintain three thousand"* |
| **Maintain Altitude** | *"Delta one twenty-three, maintain four thousand"* |
| **Speed Adjustment** | *"Southwest seven eighty-nine, reduce speed to two one zero knots"* \| *"increase speed to two five zero knots"* |
| **Direct Fix** | *"Delta one twenty-three, cleared direct Barnes"* |
| **Descend Via STAR** | *"Delta one twenty-three, descend via the DEMO ONE arrival, runway two seven transition"* |
| **Climb Via SID** | *"American one zero zero, climb via the BAY ONE departure"* |
| **Crossing Restriction** | *"Delta one twenty-three, cross Cambridge at or above four thousand"* |
| **Approach Clearance** | *"Delta one twenty-three, turn right heading two four zero, maintain two thousand until established on the localizer, cleared ILS runway two seven approach"* |
| **Intercept Localizer** | *"Delta one twenty-three, fly heading two four zero, intercept Runway two seven localizer"* |
| **Ident** | *"Delta one twenty-three, squawk ident"* |
| **Go Around** | *"Delta one twenty-three, go around, fly published missed approach"* |
| **Say Heading / Altitude** | *"Delta one twenty-three, say heading"* \| *"Delta one twenty-three, say altitude"* |

## Controls & keybindings

### Scope controls & mouse interactions

| Action | Shortcut / Mouse Interaction | Description |
|---|---|---|
| **Range In / Range Out** | `PageUp` / `PageDown` or `Mouse Wheel` | Steps discrete range presets (5, 10, 15, 20, 30, 40, 50, 60 NM). *When TAB list (`*T`) is visible, PageUp/PageDown scrolls the list.* |
| **Pan / Slew Radar View** | `Right Click + Drag` or `Middle Click + Drag` | Pans the radar PPI camera. |
| **Center on Airport** | `Home` (or `Ctrl+F1`) | Snaps view center to airport reference (`KDEM ARP`). |
| **Center on Click** | `End` or `Double-Click PPI` | Centers view on the clicked world coordinate. |
| **Select Track** | `Left Click` on target symbol or datablock | Selects track; populates callsign in command line. |
| **Accept Inbound Handoff** | `Left Click` pending inbound track | Slew-accepts handoff from Center; turns target to owned white FDB. |
| **Deselect Track** | `Left Click` empty radar background | Clears track selection. Does not consume armed Preview commands. |
| **Switch Keyboard Focus** | `Tab` | Cycles keyboard focus between `#command-line-input` and the radar PPI / Preview Area. |
| **Move System List** | `Left Click + Drag` or `Middle Click + Drag` on list header | Repositions system list window. Middle-click drag shows all list bounding frames. |
| **Reset List Position** | `Shift + Left Click` on list title header | Snaps system list back to its adaptation default coordinate anchor. |
| **Drop List Row Entry** | `F1` (hold or armed) + `Left Click` on list entry row | Manually drops/deletes an entry from Tower List (`*P1`–`*P3`), VFR List (`*TV`), or TAB List (`*T`). |
| **Toggle Video Map Layer** | `Left Click` on map entry row in VIDEO MAPS list (`*TX`) | Instantly enables/disables clicked video map layer. |
| **Page List (`MORE: X/Y`)** | `Left Click` directly on `MORE: X/Y` in list header | Cycles forward to the next page of entries, wrapping back to page 1 at the end. |
| **Place Center (DCB)** | Click `PLACE CNTR` in DCB, then `Left Click` PPI | Sets view center to clicked world coordinate. |
| **Place Range Ring (DCB)** | Click `PLACE RR` in DCB, then `Left Click` PPI | Sets range ring origin to clicked world coordinate. |

### Scope keyboard shortcuts

Keys below are divided into **Always-On** shortcuts (which work regardless of whether the command line or PPI has focus) and **Scope-Focused** shortcuts (which require the radar PPI to have focus so letters do not type into the radio command line).

#### Always-on shortcuts

| Key | STARS Function | Action / Behavior |
|---|---|---|
| `PageUp` | Range In / List Scroll | Decreases radar range preset (5–60 NM). If a list displaying `MORE: X/Y` (such as TAB List `*T`) is open, scrolls up through pages. |
| `PageDown` | Range Out / List Scroll | Increases radar range preset (5–60 NM). If a list displaying `MORE: X/Y` (such as TAB List `*T`) is open, scrolls down through pages. |
| `Home` | Center Airport | Snaps display center to airport reference point. |
| `End` | Center Last Click | Snaps display center to last clicked world coordinate. |
| `?` / `Shift + /` / `Alt + F1` | Help Overlay | Toggles the in-app STARS keyboard shortcut help overlay. |
| `F1` (hold) | `<BCN CODE RD OUT>` / Drop Mode | Momentarily displays Mode 3/A beacon code in datablock line 1 (Beaconator) and arms list row drop (`f1DropArmed`). |
| `F3` | `<INIT CNTL>` Initiate Track | If track selected: immediately initiates track / owns target. If none selected: arms `INIT CNTL` command-then-slew. |
| `F4` | `<TERM CNTL>` Drop Track | If track selected: immediately drops track. If none selected: arms `TERM CNTL` command-then-slew. |
| `F5` / `Shift + H` | `<HND OFF>` Smart Handoff | Initiates handoff: Tower (for arrivals inside 5 NM) or Center (for climbing departures). |
| `F7` | `<MULTI FUNC>` Multi-Function | Types or appends `*` into the STARS Preview Area buffer. |
| `F8` | `<HIST>` History Dots | Toggles radar history trail dots (0 ↔ last non-zero dot count). |
| `F10` | `<PTL>` Predicted Track Line | Toggles global Predicted Track Line (`PTL ALL`). |
| `F11` | `<CA>` Conflict Alert | Buffers `CA ` in the Preview Area. Complete a CA command or press Enter for two-track slew inhibit. |
| `Insert` / `Ins` | `<PREF SET>` Preference Menu | Opens the DCB `PREF` configuration submenu. |
| `Tab` | Cycle Focus | Cycles keyboard focus between `#command-line-input` and radar scope PPI. |
| `Escape` | Cancel / Disarm | Cancels active Preview buffer, disarms slew actions, cancels list drag, closes DCB menus, or closes help. |
| `FPL` | `<FPL>` Flight Plan List | Toggles TAB List (`*T`) visibility. |
| `VFR` | `<VFR>` VFR List | Toggles VFR List (`*TV`) visibility. |

#### STARS DCB function key shortcuts (`Ctrl + F1`–`F11`)

| Key Combination | STARS Analog | Action |
|---|---|---|
| `Ctrl + F1` | `<CNTR>` Center | Snaps scope center to airport reference (`KDEM ARP`). |
| `Ctrl + F2` | `<MAPS>` Video Maps Menu | Opens DCB `MAPS` submenu. |
| `Ctrl + F3` | `<BRITE>` Brightness Menu | Opens DCB `BRITE` submenu (display channels, CMP, BCN, WX). |
| `Ctrl + F4` | `<LDR>` Leader Menu | Opens DCB `LDR` leader length submenu (0, 24, 36, 48 px). |
| `Ctrl + F5` | `<CHAR SIZE>` Font Size Menu | Opens DCB `CHAR SIZE` submenu (datablocks, lists, tools). |
| `Ctrl + F7` | `<SHIFT>` Menu Shift | Toggles DCB between `MAIN` and `AUX` menu rows. |
| `Ctrl + F8` | `<DCB>` Display Control Bar | Toggles DCB on-screen visibility. |
| `Ctrl + F9` | `<RNG RING>` Range Rings | Arms the DCB Range Ring (`RR`) interval spinner. |
| `Ctrl + F10` | `<RANGE>` Range Spinner | Arms the DCB `RANGE` NM spinner. |
| `Ctrl + F11` | `<WX>` Weather Toggle | Cycles weather radar reflectivity layers on/off. |

#### Scope-focused shortcuts (active when PPI is focused)

| Key | Action | Description |
|---|---|---|
| `T` | Datablock Tag | Toggles Full Datablock (FDB) ↔ Limited Datablock (LDB) on selected track (or all if none selected). |
| `M` | Mode C Toggle / Map Prefix | Tap `M` toggles Mode C reported altitude field on FDBs. Typing a map id afterwards (e.g. `M DEM1_27`) starts a video map buffer. |
| `H` | History Toggle | Toggles history dots (same as `F8`). |
| `L` then `1`–`9` | Leader Line Direction | 1.5 s chord window: sets datablock leader direction (1–9 numpad compass layout) on selected track. |
| `F` then `<floor>` Enter `<ceiling>` Enter | Altitude Filter Chord | 1.5 s chord window: enters altitude filter limits in 3-digit hundreds (e.g. `F` → `000` Enter → `150` Enter). |
| `B` then `<digits>` | Beacon Code Select | Table 30 beacon select chord (e.g. `B45` Enter for block 45; `B4501` for discrete). |
| `/` | Slew / Drop Prefix | Buffers `/` into Preview Area (drop track `TERM CNTL`, set leader length, or toggle PDB ↔ FDB). |
| `*` | Multi-Function Prefix | Buffers `*` into Preview Area for system lists, display commands, filters, and TPA chords. |
| `+` | Track Initiate Prefix | Buffers `+` into Preview Area (`INIT CNTL`). |

---

## STARS Preview Area commands

The **Preview Area** is the primary typed command buffer of the STARS terminal radar display. It defaults below the System Status Area (SSA), but has its own movable anchor.

### Operational conventions

1. **Activation**: Focus the radar PPI (via `Tab` or by clicking empty scope background). Typing `*`, `+`, `/`, letters, digits, and spaces buffers into `view.preview`.
2. **Rejection (`INV`)**: Unrecognized commands, out-of-range parameters, or illegal syntax immediately flash `<buffer> INV` for 2 seconds.
3. **Cancellation**: Pressing `Escape` clears active entry buffers, disarms slew modes, and cancels list repositioning.
4. **Target Slew Actions**: Commands that require a target (e.g. `CA`, `CA P <track>`, `CA E <track>`, `+`, `/`, `*1`–`*8`, `[Index#]`) arm a slew state and wait for a left-click on an aircraft target. Clicking an active CA target with an empty Preview Area acknowledges it; clicking empty scope background does **not** consume or cancel an armed command.

---

### Tracking, datablock, and correlation commands

| Command Syntax | Operator Action | System Result |
|---|---|---|
| `+` then click | Type `+`, click target symbol | Arms `INIT CNTL`; click initiates track / owns target (white FDB). Pending inbound: one-click accept+own. |
| `+ [FLID] Enter` | Type `+DAL123` or `+123` Enter | Resolves flight ID and initiates track directly with nothing selected. |
| `+ [FLID]` then click | Type `+DAL123`, click target | Correlates that FLID directly to the clicked radar target. |
| `/` then click **symbol** | Type `/`, click target symbol | Arms `TERM CNTL`; drops track ownership. |
| `/` then click **datablock** | Type `/`, click datablock text | Toggles Partial Data Block (PDB) ↔ Full Data Block (FDB). |
| `/ [FLID] Enter` | Type `/DAL123` Enter | Drops track ownership for specified flight ID. (`/ALL` or `TERM CNTL ALL` is `INV`). |
| `/<0-7>` then click | Type `/2`, click target | Sets leader line length for clicked target (`0`=0px, `1`=12px, `2`=24px, `3`=36px default, `4`=48px, etc.). |
| `/<0-7> [FLID] Enter` | Type `/2 DAL123` or `/0 123` Enter | Sets leader line length directly on specified aircraft. |
| `<1-9>` then click | Type `8`, click target | Sets leader line direction on clicked target (1–9 numpad compass layout). |
| `<1-9> [FLID] Enter` | Type `8 DAL123` or `6 123` Enter | Sets leader line direction directly on specified aircraft. |
| `<1-9>/<0-7>` then click | Type `8/2`, click target | Simultaneously sets both leader direction (8) and length step (2) on clicked target. |
| `<1-9>/<0-7> [FLID] Enter` | Type `8/2 DAL123` Enter | Simultaneously sets leader direction and length on specified aircraft. |
| `*L(1-9)` then click | Type `*L8`, click target | STARS leader line direction command: sets leader direction on clicked target. |
| `*L(1-9) [FLID] Enter` | Type `*L8 DAL123` Enter | Sets leader line direction directly on specified aircraft. |
| `*L(1-9) Enter` | Type `*L8` Enter | Sets leader line direction for **all owned tracks** under controller control. |
| `*L(1-9)* Enter` | Type `*L8*` Enter | Sets leader line direction for **all unowned tracks** in the facility. |
| `*L(1-9)U Enter` | Type `*L8U` Enter | Sets leader line direction for **all unassociated tracks** in the facility. |
| `*L(1-9)/<0-7>` click | Type `*L8/2`, click target | Sets leader line direction and length step via STARS `*L` syntax. |
| `*L(1-9)/<0-7> [FLID] Enter` | Type `*L8/2 DAL123` Enter | Sets leader line direction and length step directly on specified aircraft. |
| `*LDR <0-7> Enter` | Type `*LDR 3` or `*LDR 4` Enter | Sets global default leader line length (`view.leaderLengthPx`). |
| `*1`–`*8` then click | Type `*3`, click datablock | STARS leader clock direction (1 = NE clockwise through 8 = N). |
| `*0` then click | Type `*0`, click target | Resets leader line direction to the facility default. |
| `*F` then click | Type `*F`, click target | Toggles forced Full Data Block (FDB) display on that track. |
| `*F [FLID] Enter` | Type `*F DAL123` Enter | Toggles forced Full Data Block (FDB) on specified aircraft. |
| `*F Enter` | Type `*F` Enter with track selected | Toggles forced Full Data Block (FDB) on currently selected track. |
| `**F Enter` | Type `**F` Enter | Clears all forced Full Data Blocks across the entire airspace. |
| `*` then click | Type `*`, click target | Acknowledges a pending pointout, or toggles cyan target highlight. |
| `*B` then click | Type `*B`, click uncorrelated track | 5-second Mode 3/A beaconator readout on uncorrelated target symbol. |
| `[Index#]` then click target | Type `1` or `02`, click target symbol | **Manual Flight Plan Correlation**: Correlates flight plan `Index#` from TAB List (`*T`) to clicked radar target, setting FDB, owned state, and removing entry from the TAB list. |
| `[Index#]` then click target | Type `14`, click target symbol | **Promote VFR Entry**: Correlates VFR entry from VFR List (`*TV`) to clicked radar target. |
| `*DEL [Index#] Enter` | Type `*DEL 1` or `*DEL 02` Enter | Purges and deletes flight plan entry at specified numeric index from the TAB List (`*T`). |

---

### System lists & window manager

System lists are operational data windows rendered directly on the radar scope.

> [!IMPORTANT]
> STARS system list commands do not accept aliases and strictly require the exact prefix syntax specified below. Legacy or shortcut aliases (such as `*FL`, `*TAB`, `*VL`, `*VFR`, `*TL`, `*TL<ID>`, `*TLBED`, `*ML`, `*AL`, `*CR`, `*CRDA`, `*CS`, `*COAST`, `*SO`, `*SIGN_ON`, or `*SSA`) are unauthorized and will not be recognized.

#### Available system lists

| List Name | Authorized Command Prefix | Frame Title | Purpose & Operational Features |
|---|---|---|---|
| System Status Area | `<MULTI FUNC>S` (`*S`) | `SYSTEM STATUS AREA (S)` | System Status Area (sim time, altimeter, filter bounds). Cannot be toggled off; relocatable via `<MULTI FUNC>S<SLEW LOCATION>`. |
| TAB List | `<MULTI FUNC>T` (`*T`) | `TAB` / `FLIGHT PLAN (TAB)` | Departure proposals and unassociated tracks with discrete squawks. Features `MORE: X/Y` pagination. Type `[Index#]` + click target to correlate. Press `F1` + click row (or `*DEL [Index#] Enter`) to drop entry. |
| Tower List 1 | `<MULTI FUNC>P1` (`*P1`) | `TOWER 1 (P1)` / `[AIRPORT] TOWER` | Primary tower inbound arrival list and staged departures. Sorted by distance (departures 0 NM first, nearest arrivals ascending). Clears automatically on landing. |
| Tower List 2 | `<MULTI FUNC>P2` (`*P2`) | `TOWER 2 (P2)` | Auxiliary Tower List 2. |
| Tower List 3 | `<MULTI FUNC>P3` (`*P3`) | `TOWER 3 (P3)` | Auxiliary Tower List 3. |
| VFR List | `<MULTI FUNC>TV` (`*TV`) | `VFR LIST (TV)` | Active 1200 / VFR tracks with callsign, beacon code, and altitude. Type `[Index#]` + click target to promote. `F1` + click row drops entry. |
| LA/CA/MCI List | `<MULTI FUNC>TM` (`*TM`) | `LA/CA/MCI (TM)` | Safety alert notifications. Displays header `LA/CA/MCI` when idle; dynamically unfurls flashing `CA`, `LA`, and `MCI` rows when alerts trip. |
| COAST/SUSPEND List | `<MULTI FUNC>TC` (`*TC`) | `COAST/SUSPEND (TC)` | Tracks in coasting or suspended surveillance state with status indicator (`C`), squawk, and altitude. |
| SIGN ON List | `<MULTI FUNC>TS` (`*TS`) | `SIGN-ON (TS)` | Workstation sector sign-on roster and operating configuration. |
| VIDEO MAPS List | `<MULTI FUNC>TX` (`*TX`) | `VIDEO MAPS (TX)` / `ACTIVE MAPS` | Adapted video map directory with numeric slots and `> ` active indicator. Left-clicking any map row immediately toggles that map layer. DCB `MAPS -> CURRENT` switches between all maps and active maps. |
| CRDA STATUS List | `<MULTI FUNC>TN` (`*TN`) | `CRDA STATUS (TN)` | Converging Runway Display Aid stagger pairing status and runway configurations. |

#### Window manager & interaction standards

- **Click-and-Drag Repositioning**: Left-click or middle-click and drag any list title header (the drag handle) to reposition the window across the scope.
- **Bounding Frames Preview**: Holding middle-click draws bounding frame outlines for all active system lists.
- **Collision Warning Overlap Box**: If repositioned lists overlap, a distinct warning box renders around colliding lists until they are separated.
- **Quick Reset to Adaptation Default**: `Shift + Left Click` on the list title header immediately snaps the specified list (or SSA) back to its adaptation default coordinate anchor.
- **State Persistence**: Window positions, visibility states, and line limits persist across sessions via DCB `PREF` slots.
- **List Pagination (`MORE: X/Y`)**: For lists with paginated entries:
  - **Mouse Action**: Left-click directly on the `MORE: X/Y` text in the list header to cycle forward to the next page of entries, wrapping back to page 1 at the end.
  - **Keyboard Action**: Pressing `PageDown` or `PageUp` on the radar display scrolls through pages.

#### Authorized system list commands

System list commands in STARS do not accept aliases and use the exact prefix syntax specified below. Spaces between the command prefix and numeric line count are optional (e.g. `*T 15` or `*T15`).

| Command Syntax | Example / Operator Action | System Result |
|---|---|---|
| `<MULTI FUNC>S<SLEW LOCATION>` | `*S` then click scope | Relocates System Status Area (SSA) anchor (*SSA cannot be toggled off*). |
| `<MULTI FUNC>P<SLEW LOCATION>` | `*P` then left-click empty scope (no Enter) | Relocates Preview Area anchor independently of the SSA. |
| `<MULTI FUNC>T<ENTER>` | `*T Enter` | Toggles display of TAB list. |
| `<MULTI FUNC>T<SLEW LOCATION>` | `*T` then click scope | Relocates TAB list anchor. |
| `<MULTI FUNC>T(1-100)<ENTER>` | `*T 15` or `*T15 Enter` | Sets TAB list size (visible line limit clamped `1`–`100`). |
| `<MULTI FUNC>TV<ENTER>` | `*TV Enter` | Toggles display of VFR list. |
| `<MULTI FUNC>TV<SLEW LOCATION>` | `*TV` then click scope | Relocates VFR list anchor. |
| `<MULTI FUNC>TV(1-100)<ENTER>` | `*TV 15` or `*TV15 Enter` | Sets VFR list size (visible line limit clamped `1`–`100`). |
| `<MULTI FUNC>TM<ENTER>` | `*TM Enter` | Toggles display of LA/CA/MCI list. |
| `<MULTI FUNC>TM<SLEW LOCATION>` | `*TM` then click scope | Relocates LA/CA/MCI list anchor. |
| `<MULTI FUNC>TC<ENTER>` | `*TC Enter` | Toggles display of COAST/SUSPEND list. |
| `<MULTI FUNC>TC<SLEW LOCATION>` | `*TC` then click scope | Relocates COAST/SUSPEND list anchor. |
| `<MULTI FUNC>TC(1-100)<ENTER>` | `*TC 15` or `*TC15 Enter` | Sets COAST/SUSPEND list size (visible line limit clamped `1`–`100`). |
| `<MULTI FUNC>TS<ENTER>` | `*TS Enter` | Toggles display of SIGN ON list. |
| `<MULTI FUNC>TS<SLEW LOCATION>` | `*TS` then click scope | Relocates SIGN ON list anchor. |
| `<MULTI FUNC>TX<ENTER>` | `*TX Enter` | Toggles display of VIDEO MAPS list. |
| `<MULTI FUNC>TX<SLEW LOCATION>` | `*TX` then click scope | Relocates VIDEO MAPS list anchor. |
| `<MULTI FUNC>TN<ENTER>` | `*TN Enter` | Toggles display of CRDA STATUS list. |
| `<MULTI FUNC>TN<SLEW LOCATION>` | `*TN` then click scope | Relocates CRDA STATUS list anchor. |
| `<MULTI FUNC>P(1-3)<ENTER>` | `*P1 Enter`, `*P2 Enter`, or `*P3 Enter` | Toggles display of TOWER list 1, 2, or 3. |
| `<MULTI FUNC>P(1-3)<SLEW LOCATION>` | `*P1`, `*P2`, or `*P3` then click scope | Relocates TOWER list 1, 2, or 3 anchor. |
| `<MULTI FUNC>P(1-3) (1-100)<ENTER>` | `*P1 10`, `*P2 20`, or `*P3 15 Enter` | Sets TOWER list size (visible line limit clamped `1`–`100`). |

#### List entry & item management commands

| Command / Interaction | Example / Operator Action | System Result |
|---|---|---|
| `F1` then click list row | Hold `F1`, click entry row | Manually drops and removes entry from TOWER list (`*P1`–`*P3`), VFR list (`*TV`), or TAB list (`*T`). |
| `*DEL [Index#] Enter` | `*DEL 1 Enter` \| `*DEL 03 Enter` | Deletes flight plan entry at specified numeric index from TAB list (`*T`). |
| `[Index#]` then click target | `1` then click radar target | Correlates flight plan `Index#` from TAB list (`*T`) to clicked radar target. |
| `Shift + Left Click` list header | Click list title bar with Shift held | Snaps list (or SSA) back to its adaptation default coordinate anchor. |

---

### Conflict Alert controls

| Command Syntax | Operator Action | System Result |
|---|---|---|
| `CA K [track] Enter` | `CA K DAL123` Enter, or `CA K` Enter then slew-click | Toggles CA inhibit for one track; a normal upright `Δ` appears inline beside its ACID. |
| `CA Enter`, then two target clicks | Type `CA` Enter; click Track A then Track B | Toggles the pair-specific CA inhibit. Other pairs involving either track still alert. |
| `CA P [track1] [track2] Enter` | `CA P DAL123 AAL456` Enter; omit Track 2 to slew it; omit both to slew both | Adds the pair-specific CA inhibit. |
| `CA E [track1] [track2] Enter` | `CA E DAL123 AAL456` Enter; omit Track 2 to slew it; omit both to slew both | Removes the pair-specific CA inhibit. |
| Empty Preview Area, click active CA target | Slew-click the alerted target | Acknowledges that pair immediately: the tone stops when no other unacknowledged CA remains and the red inline `+` becomes steady. |
| `*MCI Enter` | Type `*MCI` Enter | **Toggle Mode C Intruder Alerting**: Globally toggles Mode C Intruder alerting on or off (`view.mciEnabled`). |

---

### Video maps commands

Video maps match adapted catalog numeric **slots** (`1`–`32`) or symbolic **IDs** (`LOC27`, `RWY`, `DEM1_27`, etc.).

| Command Syntax | Operator Action | System Result |
|---|---|---|
| `*D <slot|id> Enter` | `*D 1` or `*D LOC27` Enter | Toggles specified video map layer on or off. |
| `MAP <slot|id> Enter` | `MAP 2` or `MAP LOC27` Enter | Toggles specified video map layer directly. |
| `*D OFF <slot|id> Enter` | `*D OFF LOC27` Enter | Forces specified video map layer off. |
| `*D ALL Enter` | Type `*D ALL` Enter | Turns on all adapted video map layers. |
| `*D NONE Enter` | Type `*D NONE` Enter | Turns off all video map layers. |
| `MAP ALL OFF Enter` | Type `MAP ALL OFF` Enter | Turns off all video map layers (equivalent to DCB `MAPS -> CLR ALL`). |
| `M <id> Enter` | Tap `M` then type map id (within chord) | Toggles specified video map layer. |
| Bare `*D` Enter | Type `*D` Enter | Stays TPA (`*D` without token is an incomplete TPA prefix, returning `INV`). |

---

### Radar scope display & weather commands

| Command Syntax | Operator Action | System Result |
|---|---|---|
| `*C` then click | Type `*C` Enter, click PPI | Recenters scope display center on clicked world point. |
| `*OFF Enter` | Type `*OFF` Enter | Resets scope center to airport reference point (`KDEM ARP`). |
| `*RR <interval> Enter` | `*RR 2`, `*RR 5`, `*RR 10`, `*RR 20` Enter | Sets range-ring interval in nautical miles (`2`, `5`, `10`, or `20` NM). |
| `*RR C` then click | Type `*RR C` Enter, click PPI | Recenters range-ring origin on clicked world point. |
| `*RR OFF Enter` | Type `*RR OFF` Enter | Resets range-ring center back to scope view center. |
| `*PTL <minutes> Enter` | `*PTL 3` Enter (`0`–`15` min) | Sets global Predicted Track Line (PTL) lookahead duration in minutes. |
| `*R` then click | Type `*R` Enter, click target symbol | **Per-Track PTL**: Toggles Predicted Track Line for clicked track only, overriding global PTL setting. |
| `*HIST <count> Enter` | `*HIST 4` Enter (`0`–`9` dots) | Sets number of radar history trail dots displayed per track. |
| `*WX <level> Enter` | `*WX 1` through `*WX 6` Enter | Toggles individual VIP weather reflectivity levels 1 through 6 on/off. |
| `*WX ALL Enter` | Type `*WX ALL` Enter | Enables all weather reflectivity levels (VIP 1–6). |
| `*WX OFF Enter` | Type `*WX OFF` Enter | Turns off all weather reflectivity layers. |

---

### Altitude & beacon filters

| Command Syntax | Operator Action | System Result |
|---|---|---|
| `*F Enter` | Type `*F` Enter | Flashes current altitude filter bounds (`FILTER <floor> <ceiling>`) in Preview Area. Does not alter limits. |
| `*LA <floor><ceiling> Enter` | `*LA 000 150` Enter | Sets altitude filter floor and ceiling in 3-digit Mode C hundreds (`000` to `180`, floor ≤ ceiling). E.g. `000 150` = SFC to 15,000 ft. |
| `*BCN <code> Enter` | `*BCN 45` or `*BCN 4501` Enter | Adds octal beacon code filter (2-digit block `00`–`77` or 4-digit discrete `0000`–`7777`). |
| `*BCN DEL <code> Enter` | `*BCN DEL 45` Enter | Removes specified beacon code filter. |
| Scope-focus `B<digits> Enter` | PPI focused, `B45` Enter | Toggles beacon code block `"45"`. Targets matching block paint □. Second entry removes it. |
| Scope-focus `B<digits>` | PPI focused, `B4500` (auto-commits on 4 digits) | Toggles discrete beacon squawk `"4500"`. |

---

### Target Proximity Alert (TPA) & ATPA chords

Incomplete `*` prefixes (`*J`, `*P`, `*P3`, `*P5`, `*P10`, `*AI`, `*AE`, `*BE`, `*BI`) fall through to the `starsChord` parser on Enter:

| Command Syntax | Operator Action | System Result |
|---|---|---|
| `*J <miles>` | `*J 3` or `*J 5` Enter, click target | Sets per-track J-ring (separation halo) from 1 to 30 NM. `*J 0` clears the ring. |
| `**J Enter` | Type `**J` Enter | Clears all active J-rings across all tracks. |
| `*P<miles>` | `*P3`, `*P5`, `*P10`, or `*P2.5` click target | Sets ground-track TPA predictive lookahead cone (1 to 30 NM). |
| `*P` then click | Type `*P` Enter, click target | Clears the TPA cone from clicked target. |
| `<MULTI FUNC>P<SLEW LOCATION>` | Type `*P`, left-click empty scope (no Enter) | Relocates Preview Area. Clicking an aircraft with `*P` clears its TPA cone. |
| `*AI` click / `*AE` Enter | Slew click or Enter | Automated Terminal Proximity Alert (ATPA) inhibit / enable toggle. |

---

### Command overlaps & disambiguation

To prevent operator confusion between similar keyboard inputs, the simulator adheres to strict STARS disambiguation rules:

- **Tagging vs Lists**: Scope-focus `T` toggles datablock mode (FDB ↔ LDB). `<MULTI FUNC>T<ENTER>` (`*T Enter`) toggles the TAB list.
- **Tower Lists vs TPA Cones**:
  - `<MULTI FUNC>P(1-3)<ENTER>` (`*P1`, `*P2`, or `*P3 Enter`) toggles Tower Lists 1, 2, and 3.
  - Compact `*P3` followed by **slew-click on an aircraft target** activates a 3 NM TPA cone.
  - Compact `*P` followed by a left-click on empty scope relocates Preview Area immediately. Clicking an aircraft clears its TPA cone; `*P Enter` arms cone clearing for the next aircraft click.
- **Video Maps vs TPA**: `*D <id>` toggles video maps. Bare `*D` stays with TPA (`*D` / `*DE` / `*DI` / `*D+`).
- **Altitude Filters**: Scope-focus `F` begins the altitude filter entry chord. `*F Enter` flashes the filter limits readout. `*F then click` toggles forced FDB.
- **Beacon Commands**: Scope-focus `B##` toggles beacon select blocks. `*BCN ##` adds beacon filters. `*B then click` activates the 5-second Beaconator.
- **Mode C vs Video Maps**: Tap `M` toggles the Mode C altitude readout on FDBs. Typing `M` followed by a map name (e.g. `M DEM1_27`) toggles that map layer.
- **Alert Controls**: `CA K`, `CA`, `CA P`, and `CA E` control Conflict Alert inhibits; an empty-preview slew-click acknowledges CA. `*LA <floor><ceiling> Enter` sets altitude filter bounds only. `*MCI Enter` toggles Mode C Intruder alerting.

### Deferred commands backlog

Commands strictly deferred to future milestones (not parsed in the current release):
- Flight plan full edit modals: `*F [Callsign]`, `*V`, `*A`.
- Scratchpad editing commands and assigned altitude/heading/speed direct data block amendments.
- Multi-controller handoff chords and pointout TCP/consol/QL protocols (`+HOLD`, `+UNS`, `+R`, `/ALL`).
- Target Demand Metering (TDM) `*G`.
- Full list reference: [`phases/LATER-IMPLEMENTATION-BACKLOG.md`](../phases/LATER-IMPLEMENTATION-BACKLOG.md).
