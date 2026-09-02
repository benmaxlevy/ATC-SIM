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
  - **Leader lines (L1–L9)**: 9 compass keypad directions with 4 selectable lengths (0px, 24px, 36px, 48px).
- **Target history & prediction**:
  - Discrete radar history dots (0–5 dots sampled at 5-second intervals).
  - Predicted Track Line (PTL): 1.0 to 4.0 minute forward ground track lookahead vector (`OWN` or `ALL`).
- **Target Proximity Alert (TPA)**: Selectable J-rings / separation halos (3 NM / 5 NM) for spacing management.
- **Compass Rose heading vectoring ring**: Outermost range ring overlay with 72 radial tick marks (5° minor, 10° medium, 30° major) and twelve 3-digit heading numerals (`360`, `030`, `060`, `090`, `120`, `150`, `180`, `210`, `240`, `270`, `300`, `330`) radially inward for rapid heading assignment and vectoring. Brightness is controlled via `BRITE CMP` (0% / OFF to 100%) and numeral font sizing follows `CHAR SIZE TOOLS` (11–15 px).
- **Display Control Bar (DCB)**: Green physical button matrix with MAIN and AUX menu switching, interactive wheel spinners (RANGE, RR, LDR DIR, LDR LEN, BRITE channels including CMP and BCN, CHAR SIZE including TOOLS, H_RATE, DWELL hover brightening, CURSOR HOME, CSR SPD, VOL alert volume, MODE FSL), altitude filters, and persistent local PREF slots stored in `localStorage`.
- **System Status Area (SSA)**: Top-left status showing UTC/sim time, altimeter setting (29.92), active altitude filter limits, and sensor mode.

### Flight kinematics & FMS

- **Kinematic realism**: Fixed 3°/s standard rate turns with bank transitions, standard climb/descent rate profiles (1,500–2,500 fpm), and acceleration limits.
- **Lateral FMS**: Direct-to navigation (`DCT <FIX>`), fly-by waypoint sequencing, and STAR route transitions.
- **Vertical constraints**: `DESCEND_VIA` and `CLIMB_VIA` procedures with step-down crossing restriction compliance (`CROSS <FIX> <ALTITUDE> [AT|AT_OR_ABOVE|AT_OR_BELOW]`).
- **Instrument approaches**: ILS localizer interception geometry with arming/capture modes, 3° glideslope descent tracking, and missed approach / go-around procedures (`GA`).

### Safety alerting (CA & MSAW)

- **Conflict Alert (CA)**: Continuous evaluation of lateral (< 3.0 NM) and vertical (< 1,000 ft) aircraft separation. Triggers visual flashing in datablocks, red target highlighting, and continuous Web Audio square-wave warning beeps.
- **Minimum Safe Altitude Warning (MSAW)**: Polygon-based Minimum Vectoring Altitude (MVA) floor checks that alert when aircraft descend below safe sector altitudes.

### Simulated pilot & handoffs

- **Callsign resolution**: Matches callsigns via telephony name ("Delta 123"), ICAO code ("DAL123"), numeric tail ("123"), or currently hooked radar target.
- **Automated check-ins**: Staggered arrival and departure check-in radio calls:
  - STAR arrivals: *"Approach, Delta 123, descending via DEMO ONE arrival through one-one thousand (11000)"*.
  - SID departures: *"Departure, American 100, passing seven hundred climbing via the BAY ONE departure"*.
- **Inbound & departure handoff workflow**:
  - Inbound arrivals spawn in pending handoff state from Center (unowned green FDB) → Controller left-clicks the track, uses Preview Area `F3` INIT CNTL, **or** idle scope `Enter` then click (`HO ACCEPT`) to accept → Track becomes owned (white FDB) → Radio frequency unlocked → Pilot checks in.
  - Rolling departures spawn off the active runway (~0.8 NM, 700 ft, 180 kt) under Tower handoff → Pilot checks in on departure frequency → Flies published SID climb profile.
- **Smart Shift+H handoff**: Context-sensitive handoff initiator:
  - Selected arrival on approach (< 5 NM from threshold): executes Tower handoff (sets `LANDING` mode and tower ownership cyan tint).
  - Selected climbing departure (>= 5000 ft or >= 12 NM): executes Center handoff (logs `handoff.center` and sets outbound white state).
- **Readbacks**: FAA JO 7110.65 digit grouping (e.g. "climb and maintain five thousand, Delta one twenty-three"), plus "unable" for invalid clearances.

## ATC command reference

Commands can be entered via the bottom command line prompt or spoken over Push-to-Talk (PTT).

### Typed command syntax

Typed commands below are radio Command IR (command line or PTT). Inbound accept is scope: left-click the track, Preview Area `F3` INIT CNTL, or idle scope `Enter` then click.

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

### Spoken phraseology (FAA JO 7110.65)

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

## Controls & keybindings

### Scope controls & mouse

| Action | Shortcut / Mouse |
|---|---|
| **Range In / Range Out** | `PageUp` / `PageDown` or `Mouse Wheel` (5, 10, 15, 20, 30, 40, 50, 60 NM) |
| **Pan / Slew Radar View** | `Right Click + Drag` or `Middle Click + Drag` |
| **Center View on Airport** | `Home` |
| **Center View on Click** | `End` or `Double-Click PPI` |
| **Select Track / Accept Handoff**| `Left Click` target symbol or datablock |
| **Deselect Track** | `Left Click` empty radar background |
| **Switch Focus (Command / PPI)** | `Tab` |

### Scope keypad shortcuts

| Key | Function |
|---|---|
| `L` then `1`–`9` | Set datablock leader line direction (Numpad compass positions) |
| `T` | Toggle Full Datablock (FDB) ↔ Limited Datablock (LDB) |
| `M` | Toggle Mode C altitude field |
| `F` | Set Altitude Filter band (`F` → min hundreds → `Enter` → max hundreds → `Enter`) |
| `H` | Toggle radar history trail dots (0 ↔ last count) |
| `F1` | Keyboard overlay |
| `F3` | INIT CNTL: selected track owns now; nothing selected arms command-then-slew; type FLID then Enter or slew. Pending inbound: accept+own. |
| `F4` | TERM CNTL: selected track drops now; nothing selected arms command-then-slew; type FLID then Enter or slew. `TERM CNTL ALL` is `INV`. |
| `F7` | Toggle Predicted Track Line (`PTL ALL`) |
| `F8` | Cycle radar history dot count |
| `Tab` | Cycle keyboard focus between the PPI (scope / Preview Area) and `#command-line-input` |
| `/` | **Scope focus:** Preview Area drop (`TERM CNTL`) or PDB ↔ FDB on a datablock click. **Radio focus:** leftover character for the command line. |
| `Shift + H` | Contextual smart handoff: Tower (for arrivals on final) or Center (for climbing departures) |

### Preview Area

The Preview Area is the typed **scope** buffer under the SSA. With PPI focus, `*` `+` `/` and alnum/space buffer into `view.preview`. `<Tab>` switches PPI and `#command-line-input`. Scope keys do not emit Command IR, readback, or intent. Radio typing does not mutate the Preview Area.

Unknown or incomplete commit flashes `<buffer> INV`. Backspace edits; Esc cancels to idle (live preview > live `*` chord > DCB). Empty PPI click does not consume an armed tracking command.

F3 owns (unowned green FDB → owned white FDB). F4 drops. Pending inbound + INIT CNTL or idle `Enter` then click accepts the handoff.

#### INIT / TERM / beacon select

| Command | What the operator does | What happens |
| --- | --- | --- |
| F3 INIT CNTL (arm) | `F3` with nothing selected | Preview paints `INIT CNTL`. Next target click owns **that** track (white FDB). Pending inbound: one click accept+own. |
| F3 implied | `F3` with a track already selected | Owns the selection immediately. Preview may flash `INIT CNTL` then clear. |
| F3 + FLID + Enter | `F3`, type full callsign / numeric tail / unique 4-digit squawk, Enter | Owns that aircraft with nothing selected. Unknown or ambiguous → brief `INV`, no apply. |
| F3 + FLID + slew | `F3`, type FLID, click a target | Applies only if the FLID uniquely matches that track; else `INV`. |
| F4 TERM CNTL (arm) | `F4` with nothing selected | Preview paints `TERM CNTL`. Next target click drops **that** track. |
| F4 implied | `F4` with a track selected | Drops the selection now. |
| F4 + FLID + Enter | `F4`, type FLID, Enter | Drops the resolved aircraft. `TERM CNTL ALL` is `INV`, not drop-all. |
| Scope-focus `B` + two digits + Enter | PPI focused, `B` `4` `5` Enter | Toggles CODE BLOCK `"45"`. Unassociated squawks starting with `45` paint □. Second `B45` Enter removes it. |
| Scope-focus `B` + four digits | PPI focused, `B4500` (four digits may auto-commit) | Toggles discrete `"4500"`. Matching unassociated paints □; unmatched stays `*`. |
| Incomplete `B` Enter | Bare `B`, one digit, or three digits then Enter | `INV`; select list unchanged. |
| Radio-focus `B` | Command line focused, type `B` | Literal character. |

Idle `F` (no star) starts the altitude-filter chord (`F` → min hundreds → Enter → max hundreds → Enter).

#### Tracking, handoff, and datablock

| Command | What the operator does | What happens |
| --- | --- | --- |
| `+` then click | Scope-focus `+`, click a target | Arms `INIT CNTL`; click owns that track. Live `+` click also completes. |
| `+ [FLID]` Enter then click | `+DAL123` Enter, then click | Associates that FLID to the clicked track (`resolveScopeFlid`). |
| `/` then click **symbol** | Scope-focus `/`, click the target symbol | Arms `TERM CNTL`; click drops an owned track. |
| `/` then click **datablock** | Scope-focus `/`, click the datablock (not the symbol) | Toggles PDB ↔ FDB. |
| `/<0-7>` then click | `/<0-7>` then click a target | Sets leader line length for that track (`0`=overlay 0px, `1`=12px, `2`=24px, `3`=36px default, `4`=48px, etc.). |
| `/<0-7> [FLID]` Enter | `/2 DAL123` or `/0 123` Enter | Sets leader line length directly on that aircraft. |
| `<1-9>` then click | Scope-focus `1`–`9` then click a target | Sets data block position / leader line direction on that track (numpad compass positions). |
| `<1-9> [FLID]` Enter | `8 DAL123` or `6 123` Enter | Sets data block position directly on that aircraft. |
| `<1-9>/<0-7>` then click | `8/2` then click a target | Sets both leader line direction and length on that track. |
| `<1-9>/<0-7> [FLID]` Enter | `8/2 DAL123` Enter | Sets both leader line direction and length directly on that aircraft. |
| `*L(1-9)` then click | `*L8` then click a target | Sets leader line direction on that track. |
| `*L(1-9) [FLID]` Enter | `*L8 DAL123` Enter | Sets leader line direction directly on that aircraft. |
| `*L(1-9)` Enter | `*L8` Enter | Sets leader line direction for all owned tracks. |
| `*L(1-9)*` Enter | `*L8*` Enter | Sets leader line direction for all unowned tracks. |
| `*L(1-9)U` Enter | `*L8U` Enter | Sets leader line direction for all unassociated tracks. |
| `*L(1-9)/<0-7>` then click / `*L(1-9)/<0-7> [FLID]` Enter | `*L8/2` click or `*L8/2 DAL123` Enter | Sets both leader line direction and length. |
| `*LDR <0-7>` Enter | `*LDR 4` Enter | Sets global default leader line length (`view.leaderLengthPx`). |
| `*R` then click | `*R` Enter (or live `*R`), click a track | Toggles Predicted Track Line (PTL) for that track only (overriding global ALL/OWN). |
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

Incomplete `*` prefixes (`*J`, `*P`, `*P3`, `*P5`, `*P10`, `*AI`, `*AE`, `*BE`, `*BI`) fall through to `starsChord` on Enter.

| Command | What the operator does | What happens |
| --- | --- | --- |
| `*J [1–30]` / `*J 0` | | Per-track J-ring; `0` clears. `**J` clear-all. |
| `*P3` / `*P5` / `*P10` / `*P2.5` | `*P` then miles, Enter or click the target | Ground-track TPA cone 1–30 NM. Bare `*P` clears that track's cone. |
| `*AI` click / `*AE` Enter | | ATPA inhibit / enable per T02-49. |

**Overlaps:**

- Idle `T` = FDB ↔ LDB. `*T` = TAB list.
- Compact `*P1`–`*P3` = TPA cone miles. Spaced `* P1`–`* P3` = tower lists. `*PTL` = PTL minutes.
- `*D token` = maps. Bare `*D` = TPA.
- Idle `F` = filter chord. `*F` Enter = FILTER readout (not `*F [Callsign]` flight plan).
- `*BCN` = beacon filter. Bare `*B` Enter = TPA. `*B` click = beaconator.
- Tap `M` = Mode C. `M [map id]` = map toggle.

Deferred (not parsed here): flight-plan modals `*F [Callsign]` / `*V` / `*A` / `*DEL`; scratchpads and assigned alt/hdg/spd; `+HOLD` / `+UNS` / `+R` / `/ALL`; multi-controller handoff / pointout TCP / consol / QL; `*WX`; `*CRDA` geometry; TDM `*G`; CA inhibit `*K`. Full list: **STARS preview area — commands not parsed / deferred** in [`phases/LATER-IMPLEMENTATION-BACKLOG.md`](../phases/LATER-IMPLEMENTATION-BACKLOG.md).
