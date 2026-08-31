# Later implementation backlog

This is the backlog of follow-ups implied by features that are already shipped.
It is intentionally not a list of untouched phases or features that have never
been started.

## Scope and display

### Authored radar sites — live SITE/SSA chrome, no live sensors (T04-45 / T02-75 / T02-76 / T02-77)

Visible now: scenario JSON may declare trainer-authored `radarSites` (`id`,
`name`, `kind` `asr`|`airport`, ENU or lat/lon, `rangeNm` default 60,
`periodMs` default 4800). The loader validates rows and normalizes position
to local NM via `latLonToNm` and the scenario ARP. Omitted or empty
`radarSites` loads as `[]`, which is implicit FUSED (no site-selection
entries, not “no surveillance”). KDEM and KATL ship airport-at-ARP plus one
remote ASR using invented trainer ids (`KDEM-APT` / `KDEM-REMOTE`,
`KATL-APT` / `KATL-REMOTE`). T02-75 samples FUSED / MULTI / `{ siteId }`
display reports, freezes PPI / datablock / PTL / ATPA pose on the last
report, records history on report arrival, and paints the FUSED puck,
MULTI rectangle perpendicular to PTL / history, and single-site range-sized
rectangle (green far-side line ~30% longer than the block; outline when very
far). T02-77 binds those rows onto the
live view at boot and session apply (`radarSites` from the loaded scenario;
unknown stored SITE id → FUSED). MAIN SITE is enabled: submenu FUSED /
MULTI / one cap per adapted site; MAIN text is `SITE FUSED`, `SITE MULTI`,
or `SITE <id>`; SSA radar word follows that live mode. PREF persists SITE
display mode only and falls back to FUSED for an unknown stored site id.
PREF named sets (T02-73) and per-track PTL (T02-74) are shipped.

Deliberately missing:

- live sensor / network-health telemetry. SSA keeps the `OK/OK/NA` stub.
- 30-second coast after a missed report. Out of coverage drops immediately.
- aural ATPA (CA remains the only conflict audio).

WX mosaic stays the other swarm (T02-68–72). Do not fold weather paint or
IEM/mosaic work into SITE follow-ups.

Constraints later work must keep:

- sites stay trainer fixtures, not NAS adaptation or official FAA ids;
- no `src/` import of `tools/cifp-import`; no airport-id site branch;
- empty `[]` remains implicit FUSED; range checks at report time belong
  to the sampler, not a KDEM-only fallback;
- World / FMS / CA / MSAW stay 20 Hz truth; display consumers keep last
  report pose. No 30 s coast.

### Real ATPA pairing and predicted geometry

Live now: catalog volumes walked by `approachId` (T02-43), in-trail pairing
and predicted monitor/warning/alert status on `world.alerts.atpa` (T02-44),
predicted cones (T02-45), datablock in-trail distance plus A/TPA cone mileage
(T02-46), and four real AUX TPA/ATPA cells (T02-47). R07 has no system-wide
ATPA on/off — a feature paints when `atpa[feature]` is on. Alert Cones gates
alert and warning; Monitor Cones is monitor-only. `AtpaState.on` remains in
PREF v2 as an unused leftover.

Later work must keep:

- volumes as data, walked by `approachId` — no facility id branch;
- CA as T04-09 datablock text (no 3 NM halo; circles on this scope are TPA
  J-rings);
- no aural ATPA tone (CA remains the only conflict audio);
- TPA J-rings and the `TPA_MI` spinner frozen as T02-28 (2 / 3 / 5 / 10 NM).

Wake-category minima, adapted 2.5 NM extras, per-position adaptation, TDW
white monitor, and authored-vs-NAS volumes stay in **ATPA separation
criteria not yet modeled** below.

### ATPA separation criteria not yet modeled

T02-44 ships in-trail pairing and predicted monitor/warning/alert status
(`world.alerts.atpa`) using **basic radar separation only**. Visible now:
`evaluateAtpa` reads `basicSeparationNm` / `reducedSeparationNm` /
`reducedWithinNm` from each catalog volume, pairs eligible tracks inside an
enabled volume, and classifies status from current distance plus linear
closure (R07 45 s warning / 24 s alert). Cone length is therefore identical
for a heavy leader and a light leader.

Deliberately missing, each of which later work must keep the JSON-minima
path and must **not** invent numbers from model recall:

- **Wake-category in-trail minima.** R07 says cone length is "the distance
  required by wake category or basic radar separation" but publishes no
  matrix — its CWT A–I table is only the datablock category letter with a
  weight range. `Aircraft.wakeCategory` is already the FDB letter; do not
  let `requiredSeparationNm` read it until a cited table (JO 7110.65 or
  facility adaptation) is in-repo. T02-50 greps `src/core/alerts/atpa.ts`
  and live ATPA paths for `wakeCategory`; keep that gate.
- **Adapted 2.5 NM eligibility** beyond "both tracks inside
  `reducedWithinNm` of the threshold along the final." Real STARS reduces
  only under extra conditions (leader type, runway occupancy, facility
  authorization). Keep the volume JSON fields; extend the predicate, do
  not hardcode 2.5.
- **Per-position ATPA adaptation.** We are a single TCP, so there is no
  "adapted to display" matrix. A multi-controller trainer must not assume
  every position sees the same volume enablement.
- **TDW white monitor variant.** The tower display workstation paints the
  monitor cone white; this trainer has no TDW. Scope ATPA monitor stays
  TPA blue until a TDW surface exists.
- **Aural ATPA alerting.** No ATPA tone. CA (T04-09) remains the only
  conflict audio; do not reuse the CA tone for in-trail ATPA.
- **Volumes as authored trainer geometry** rather than imported NAS
  adaptation. KDEM `atpa-volumes.json` is hand-authored. A second airport
  still adds a JSON row walked by `approachId`; do not special-case KDEM
  or invent an importer that silently fills unsourced sizes.

### Richer TPA controls

Shipped in T02-48 / T02-49: per-track `*J` / `*P` rings and ground-track cones
(1–30 NM, session state not PREF), `**J` / `**P` clear-all, and size-readout
inhibit. DCB TPA_MI stays 2/3/5/10. F7 `<MULTI FUNC>` inhibit commands stay
deferred under "Manual Inhibit Commands and Safety Inhibit Glyphs". Preview
Area command holes (including those MULTIFUNC chords) are listed under
**STARS preview area — commands not parsed**.

### STARS preview area — commands not parsed / deferred

The Seventeenth Swarm (T02-61–67) implements the core single-controller STARS keyboard command set:
- `<TRK>` (`+`) and `<SLEW>` (`/`) track initiation, callsign association, and track dropping
- `<ENTER>` inbound handoff acceptance; `<MULTI>` (`*`) pointout acknowledgement and cyan highlight
- Data block mode toggling (`/` click **datablock** for PDB ↔ FDB; `/` click **symbol** drops owned track), leader line direction (`* [1-8]` / `* 0`), and beacon readout (`*B` **click** is T02-66 5s beaconator on uncorrelated; bare `*B` **Enter** is TPA `*B INV`)
- System list management (`* T`, `* TV`, `* TC`, `* TS`, `* P1`–`P3`, `* TM`, `* TX`, `* TN`), visible line limits (`[1-100]`), and click relocation (`* [List] [Click]` / `* S [Click]`)
- Video map toggles (`* D [ID]`, `* D OFF [ID]`, `* D ALL`, `* D NONE`, `M [ID]`)
- Scope display manipulation (`* C [Click]`, `* OFF`, `* RR [Spacing]`, `* RR C [Click]`, `* RR OFF`, `* PTL [Min]`, `* HIST [0-9]`)
- Altitude filters (`* F`, `* LA [Floor] [Ceiling]`) and beacon filters (`* BCN [Code]`, `* BCN DEL [Code]`)
- TPA / ATPA standard chords (`* J [Radius]`, `* P [Miles]`, `* J 0` / `* P` clear, `* AI [Click]`, `* AE Enter`). Compact `*P3` is a 3 NM cone; spaced `* P3` is Tower list 3. All pseudo-text or dot commands have been removed.

The following specialized or multi-subsystem command sets remain deliberately deferred to later phases:

1. **Flight Plan Amendments & Modals:**
   - `* F [Callsign] <ENTER>`: Open flight plan creation / amendment modal.
   - `* V [Callsign] <ENTER>`: Create VFR flight plan.
   - `* A [Callsign] <ENTER>`: Create abbreviated flight plan.
   - `* DEL <ENTER> [Click Target]`: Delete flight plan / drop flight plan association.

2. **Scratchpads & Tactical Target Autopilot Overrides:**
   - `* [Text] <ENTER> [Click Target]`: Set Scratchpad 1 (up to 3 characters).
   - `* /[Text] <ENTER> [Click Target]`: Set Scratchpad 2.
   - `* [Alt] <ENTER> [Click Target]`: Set assigned altitude (e.g. `* 050`).
   - `* H[Heading] <ENTER> [Click Target]`: Set assigned heading (e.g. `* H240`).
   - `* S[Speed] <ENTER> [Click Target]`: Set assigned airspeed (e.g. `* S210`).

3. **Advanced Track States & Unsupported Blocks:**
   - `+ HOLD <ENTER> [Click Target]`: Place target into coast/suspend state.
   - `+ UNS <ENTER> [Click Scope]`: Create an Unsupported Data Block at cursor coordinates.
   - `+ R <ENTER> [Click Target]`: Reposition kinematic track coordinates.
   - `/ ALL <ENTER>`: Drop track on all owned targets simultaneously.

4. **Multi-Controller Networking & Coordination:**
   - `[Handoff ID] <ENTER> [Click Target]`: Initiate handoff to external TCP or sector.
   - `[Handoff ID] <ENTER> [Click Target]`: Redirect incoming handoff to another controller.
   - `/ <ENTER> [Click Target]`: Retract / cancel initiated handoff.
   - `[TCP ID] * [Click Target]`: Initiate point out to specified controller.
   - `/ * [Click Target]`: Reject / recall point out.
   - `INIT CONSOL [Sector ID] <ENTER>` / `DECONSOL [Sector ID] <ENTER>`: Sector consolidation and de-consolidation.
   - `DISP CONSOL <ENTER>`: Display active facility consolidations list.
   - `QL [Sector ID] <ENTER>` / `QL OFF [Sector ID] <ENTER>`: Enable / disable Quick Look for specified sector.
   - `ZDE [Callsign] <ENTER>` / `ZCL [Callsign] <ENTER>`: Electronic departure coordination messaging to Tower.

5. **Weather Radar Simulation:**
   - `* WX [1-6] <ENTER>`: Toggle precipitation reflectivity levels 1 through 6.
   - `* WX ALL <ENTER>` / `* WX OFF <ENTER>`: Enable / disable all weather overlay levels.

6. **Converging Runway Display Aid (CRDA):**
   - `* CRDA ON [Pair ID] <ENTER>`: Activate CRDA runway pair configuration.
   - `* CRDA OFF [Pair ID] <ENTER>`: Deactivate CRDA runway pair.
   - `* CRDA DISP <ENTER>`: Display active CRDA configuration matrix.

7. **Tower Display Mode (TDM):**
   - `* G [Click Data Block]`: Toggle TDM ground target data block format.
   - `* G [1-8] [Click Data Block]`: Set TDM ground target leader line direction.

8. **Conflict Alert Manual Inhibit:**
   - `* K [Click Target]`: Inhibit Conflict Alert on specific target.
   - `* K ALL <ENTER>`: Inhibit Conflict Alert on all targets.

**Shipped vs deferred collisions (do not regress):**
- Idle F is the altitude-filter chord (`beginFilterEntry`). `*F` Enter is T02-65 FILTER readout and does **not** open the deferred `*F [Callsign]` flight-plan modal.
- `*BCN` / `*BCN DEL` are T02-65 beacon filters. Bare `*B` Enter is TPA (`*B INV`). Live `*B` click is T02-66 beaconator.
- Compact `*P1`/`*P2`/`*P3` (and `*P5`/`*P10`) are TPA cone miles. Tower lists require a space: `* P1`–`* P3`. `*PTL` is PTL minutes.

Constraints later work must keep: never Command IR; radio line isolated; reject unknown rather than no-op; data-first catalog; self-hosted speech.

### Track lifecycle and multi-controller networking

The STARS CRC Scope Fidelity Addendum (T02-34–38) shipped the complete radar
display fidelity model: target symbol shapes (`◇`, `*`, `V`, `□`, Sector IDs),
LDB with 5s ground speed queries, PDB for unowned associated tracks, FDB
dynamic time-sharing (~2.5s cycle) and Line 3 assigned altitudes `A<alt>`,
inbound/outbound handoff blinking and 3-click progression, pointout lifecycle
(offer, accept, `UN` reject, `**` convert), and cyan track highlight.

Possible future follow-ups:
- multi-controller peer networking / live inter-facility handoffs across multiple browser sessions;
- quick-look multi-facility track filters;
- host automated flight-plan amendments and route conformance monitoring.

### SSA and GI data beyond trainer stubs

SSA currently includes a fixed trainer altimeter/site status stub, and GI text
comes from authored facility JSON. Later work could provide:

- live or scenario-driven site-fused weather/altimeter data;
- richer facility status and ATIS-style updates;
- source timestamps, stale-data handling, and filtering.

### SSA Alert Triangle (`▼`) Operational State & Lifecycle

The solid inverted triangle `▼` at the top of the SSA is permanently rendered in red (`PALETTE.alert`), tightly enclosed in a thin green border with no margin.
* **Follow-up Verification & Modeling:**
  1. Verify and refine alert state mappings triggering the red indicator across all subsystem fault conditions (surveillance data link loss, emergency squawks 7700/7600/7500, active CA/MSAW, and multi-sensor processing failure).
  2. Implement visual blink/acknowledgment cycles if specified by terminal STARS facility adaptation.

### Multi-Airport Satellite Altimeter Matrix in SSA

In multi-airport terminal operations (such as Boston A90 TRACON), the SSA displays rows of altimeter readings for the primary airport and up to 5 configured satellite towered airports:
```text
BOS 30.17 BED 30.17 OWD 30.18
BVY 30.17 LWM 30.19
```
* **Required Implementation:**
  1. Automated weather sensor telemetry integration for primary and satellite towered airports configured in the facility adaptation.
  2. Formatting in 3-airport chunks on dedicated SSA lines.
  3. Dynamic barometric altimeter updates matching active weather simulation.

### Quicklook (`QL`) Status & Facility-Wide Sector Filtering

In real STARS operations, the SSA includes a Quicklook indicator (`QL: ALL` or `QL: <sector>`) showing whether the workstation is monitoring all sector tracks or filtering data blocks to assigned control sectors:
* **Required Implementation:**
  1. Keyboard command `Q <sector>` / `Q ALL` to toggle quicklook display modes.
  2. Scope datablock filtering and handoff routing based on active quicklook configuration.
  3. Displaying `QL: ALL` or `QL: <sectors>` in the SSA.

Any live-data design must preserve the self-hosted speech rule and must not
silently introduce a metered vendor dependency.

### PTL targeting

Per-track PTL is shipped (`*R` plus click, session map, not PREF). Global ALL /
OWN / LNTH / `*PTL` minutes and F7 stay as they are. Remaining follow-ups are
additional duration presets and richer prediction geometry.

### DCB capabilities currently represented as disabled chrome

The trainer DCB now includes disabled WX, VOL, MODE FSL, and unpopulated map
slots. SITE is live (FUSED / MULTI / adapted sites). Later implementations
may give the remaining cells real behavior:

- weather layers and weather-data lifecycle;
- audio/display mode controls that remain separate from OS volume;
- additional catalog-backed maps and map management;
- fuller CRC-style DCB workflows.

Do not fill empty map slots with OSM or add weather paint as an incidental
change; each capability needs its own data and acceptance criteria.

### PREF SAVE AS named sets

Shipped: SAVE AS collects a short alphanumeric name through the preview-area /
status-line buffer (CRC analog, R07). Enter writes the first empty slot, or the
last slot when the 32-slot table is full. Esc cancels with no write. Digit-only
names are rejected (FIL reserved). MAIN shows the active set name; slot caps
show the stored name. No `window.prompt`, no HTML `<input>`.

Still not a NAS preference host. Slash names such as `22/27` are not typeable
(alphanumeric only). Per-track PTL and TPA stay session state and are not
persisted in PREF. WX `wxLevels` stay the other swarm.

### Manual Inhibit Commands and Safety Inhibit Glyphs

STARS CRC supports manual per-track inhibition commands via the `<MULTI FUNC>` (F7) keypad interface:
- `<MULTI FUNC>M<SLEW>`: Toggles display of Mode C altitude for a specific track.
- `<MULTI FUNC>C<SLEW>`: Inhibits Conflict Alert for a specific track (rendering `▲` after the aircraft callsign).
- `<MULTI FUNC>...`: Inhibits MSAW for a specific track (rendering `*` after the aircraft callsign).
- `<MULTI FUNC>Y(###)<SLEW>`: Enters a pilot-reported altitude (rendering `*` after altitude numbers).

These manual invocation commands and the corresponding `▲` and `*` Line 1 glyphs are skipped for now and preserved for later implementation when a full STARS `<MULTI FUNC>` keyboard chord parser is introduced. Typed Preview Area holes that include these chords are listed under **STARS preview area — commands not parsed** rather than duplicated here.

### Tactical and Expanded Special Purpose Codes (SPCs)

STARS CRC supports additional Special Purpose Codes beyond standard emergency squawks:
- **Expanded Transponder SPCs**: `7777` (`MI` - Military Intercept) and `7400` (`LL` - Lost Link / UAS).
- **Tactical Controller-Assigned SPCs**:
  - `OD`: Opposite Direction operations (head-on runway operations).
  - `ME`: Medical Emergency declared without transponder squawk.
  - `MF`: Minimum Fuel status.
  - `LN`: Medevac / LifeGuard priority flight.

These expanded and tactical SPC codes are deferred for future specialized scenario modules. Existing core emergency squawks (`7700` `EM`, `7600` `RF`, `7500` `HJ`) remain fully active.

### CRDA Ghost Prediction and Dynamic Runway Configuration Pairing (RPC)

Visible now: `CRDA STATUS` in-scope list formatting RPC pairs 1–6 (e.g., `1  BOS 27/22L`, `2  BOS 27/33L`, `3  BOS 4L/15R`, etc.) and active SSA status (`*S1 BOS 27/22L`).

Deferred to future simulation phases:
- **Live Ghost Target Generation**: Mathematical projection of master runway approach tracks onto slave runway approach centerlines based on threshold crossing time estimates.
- **Stagger Cones & Tie Lines**: Dynamic display of spacing cones and connecting tie lines between real aircraft and projected ghosts for converging and dependent runway operations.
- **STARS Table 26 CRDA Keyboard Grammar**: Keyboard commands for pairing activation/deactivation, spacing distance adjustment, and runway configuration switching.

### Multi-Airport Tower Sequencing and Strip-Less Automation

Visible now: In-scope `TOWER 1`, `TOWER 2`, and `TOWER 3` list panes rendering dynamic aircraft approach sequences sorted by distance to airport threshold.

Deferred to future simulation phases:
- **Automated Slot Sequencing**: Time-based metering and automated arrival slot management across multiple satellite airports.
- **Tower Display Workstation (TDW) Inter-Facility Coordination**: Direct sequence handoffs between TRACON radar controller and Tower local/ground controllers without flight progress strips.
- **Dynamic Multi-Airport Adaptation**: Auto-populating runway designations, ILS/RNAV approach identifiers, and tower list airport identifiers based on active scenario airport configuration.

### Surveillance Drop-Out Coast/Suspend Track Lifecycle (30s Timeout)

Visible now: `COAST/SUSPEND` list formatting displaying track status (`C` for Coasting), transponder beacon code, and last received Mode C altitude in hundreds of feet.

Deferred to future simulation phases:
- **30-Second Target Drop Timeout**: Automated detection of radar/ADS-B target signal loss, moving the track into the Coast list after 30 seconds of missing surveillance returns.
- **Dead-Reckoning Extrapolation**: Kinematic position extrapolation along the last known ground track vector during the coast period.
- **Automated Target Re-Correlation**: Seamless track resumption and full datablock restoration when radar returns resume on the assigned squawk code.

### Terminal Control Position (TCP) Sign-On and Multi-Controller Authentication

Visible now: `SIGN-ON` list rendering the current TCP display subset, sector ID, and Zulu sign-on timestamp (e.g., `1D  0311`).

Deferred to future simulation phases:
- **Sign-On/Sign-Off Keyboard Commands**: Formal controller authentication chords (`SO <TCP> <OPERATOR_ID>`) with session duration tracking and relief briefings.
- **Multi-Position Sector Consolidation**: Dynamically combining or de-combining sector boundaries and transferring owned track lists between TCPs.

### SSA Multi-Sensor Fusion Telemetry and Network Health

Visible now: SSA header layout rendering alert indicator `[▼]`, subset `(1)`, Zulu time + altimeter, network-health stub plus live radar word (`OK/OK/NA FUSED` / `MULTI` / selected site id), beacon blocks, red SPC alerts, range + PTL, dual altitude filters, and satellite airport altimeters. Network health is still the `OK/OK/NA` stub, not live sensors.

Deferred to future simulation phases:
- **Live Multi-Sensor Radar Health Telemetry**: Dynamic degradation to `NA/NA/NA` with sensor-specific failover when individual radar heads disconnect.
- **Automated Beacon Bank Exhaustion Tracking**: Dynamic allocation and exhaustion warnings for discrete transponder code banks.

## Procedures

### CIFP importer — unsupported ARINC behaviors (T04-31)

Visible now: `tools/cifp-import` reads a **local** CIFP file (comma-separated
T04-08 subset or 132-char ARINC 424-18) into `NormalizedCifpSource` and emits
`ProcedureCatalog` with supported SID, STAR, and approach fields. Source
`latDeg` / `lonDeg` is preserved; scenario ENU is derived only at catalog emit.
`NormalizedSid` (runway / common / enroute) is exported for T04-33. Runtime
`src/` does not import this tool or parse ARINC 424.

Deliberately missing, each of which later work must keep as diagnostics — never
silent straight-line TF conversion:

- **RF, holds, arcs, procedure turns.** Path terminators `RF`, `HA`/`HF`/`HM`,
  `AF`, `PI` are counted in `skippedByType` and omitted from catalog legs.
- **Heading / course-unterminated legs.** `CA`/`CD`/`CI`/`CR`, `VA`/`VD`/`VI`/
  `VM`/`VR`, `FA`/`FC`/`FD`/`FM` are skipped the same way.
- **Continuation-record payloads.** Primary records only; `*-CONT` rows are
  skip-counted.
- **SID flying from imported CIFP.** Catalog `sids` may be non-empty. FMS
  climb-via / SID route following for those imported rows is not this tool.
- **Live FAA cycle download, chart scrape, vendor APIs.** Input stays a local
  path. Full CIFP/NASR cycles stay out of git (`.cifp/`).

Constraints later work must keep:

- one conversion path: local CIFP → normalized IR → existing catalog schema;
- no `src/` import of `tools/cifp-import`; no airport-id runtime branches;
- KDEM remains the authored default scenario;
- unsupported legs stay explicit skips, not flattened geometry.

### CIFP national source storage and pack-generation boundary (T04-32)

Visible now: `tools/cifp-import/spatialIndex.ts` exports `selectByRadius` and
`CifpRadiusSeed` (airport ARP origin, `radiusNm` in nautical miles,
source `latDeg` / `lonDeg` only). Radius is a geographic seed. It does not
walk SID/STAR/approach references and does not contain every procedure leg.
`buildSpatialIndex` keys records by ICAO and `identity.key`. Runtime `src/`
does not import this tool.

Deliberately missing:

- **Procedure-reference closure (T04-33).** Out-of-radius fixes named by a
  selected SID/STAR/approach stay in the full source until closure pulls them.
- **National CIFP / derived national index in git.** A full cycle or a
  nationwide source/index dump must stay on disk under gitignored `.cifp/`
  or `tools/cifp-import/out/`. Only synthetic fixtures under `testdata/cifp/`
  belong in the repo.
- **Browser or network fetch.** No Vite import, no CDN, no vendor API, no
  chart scrape.

Constraints later work must keep:

- one local path: CIFP on disk → `NormalizedCifpSource` → radius seed →
  closure → existing catalog schema;
- no `src/` import of `tools/cifp-import`; no airport-id runtime branches;
- KDEM remains the authored default scenario;
- seed coordinates stay source lat/lon; ENU only at catalog emit;
- national source/index files stay gitignored and are never bundled.

### CIFP radius seed vs procedure-reference closure (T04-33)

Visible now: `tools/cifp-import/closure.ts` accepts a duck-typed `ClosureSeed`
(airport plus optional `radiusNm` plus `selected` record arrays) and
`closeProcedureReferences` recursively includes SID / STAR / approach
references from the full normalized source. SID **runway transitions** are
walked with common and enroute legs. `catalogWriter.ts` writes the existing
catalog `files` layout. Tests prove a far SID runway-transition fix outside
the seed radius is present after closure, and that an unrelated airport
procedure is excluded.

Deliberately missing:

- **Great-circle radius selection.** T04-32 owns `spatialIndex.ts`. This
  ticket does not compute NM distance or drop points by radius. `radiusNm` on
  the seed is metadata for later wiring.
- **Radius-based deletion after closure.** Once a procedure is selected, its
  required fixes/navaids stay even when they sit outside the seed radius.
- **Runtime national catalog or browser CIFP fetch.** Closure stays in the
  developer tool. `src/` does not import it.
- **New RNAV / hold / RF flying.** Unsupported path terminators remain
  diagnostics, not catalog TF legs.

Constraints later work must keep:

- radius is seed only — never a silent procedure truncate;
- look up missing refs in the full source, not only `seed.selected`;
- fail or report missing / ambiguous / cross-airport refs with procedure and
  source-record names;
- emit the existing `files` layout and preserve source lat/lon;
- no airport-id runtime branches; KDEM stays the authored default.

### Generic CIFP pack CLI (T04-34)

Visible now: `npm run cifp:pack` (and `cli.ts pack`) parses a **local**
fixed-width CIFP, seeds by ARP radius, closes SID/STAR/approach refs, and
writes the existing ICAO `files` layout. `--sids` / `--stars` /
`--approaches` select `ClosurePolicy.kind === "explicit"`; omit them for
`airport-all`. `--dry-run` reports seed vs closure counts and unsupported
records without writing. `extract-katl-slice.ts` is a thin default-flag
wrapper (`--airport KATL`, `--radius 40`) that only calls generic pack.
`src/scenario/data/katl/` is the committed trainer catalog pack; west/east
scenario JSON is registered in playable inventory. Video maps are a separate
CRC conversion pack loaded through generic `loadVideoMapSet("KATL")` (T04-39),
not CIFP-emitted. Authored trainer MVA is a uniform 3000 ft floor (not FAA
source data).

Deliberately missing:

- **KATL ATPA, telephony.** Catalog JSON and authored scenario/spawn files
  are separate. Maps are not CIFP-emitted (CRC pack is T04-39). Never point
  KATL at KDEM maps.
- **Operational / FAA KATL MVA.** Shipped chart is a uniform 3000 ft trainer
  box over the ±60 NM training area, not source sector minima.
- **Heading-only vector SID flying (`ATL2`).** Unsupported CIFP path
  terminators stay skipped; empty named-fix SIDs are omitted from the pack.
- **SID flying, RNAV / hold / RF FMS, live FAA download, chart scrape.**

Constraints later work must keep:

- one generic pipeline — no `if (icao === "KATL")` parse or runtime branch;
- KDEM remains the authored default;
- national CIFP / intermediates stay gitignored (`.cifp/`,
  `tools/cifp-import/out/`);
- `src/` never imports this tool.

### STAR descend-via transition selection

Visible now: STAR arrivals follow catalog enroute legs and, when an active
runway is available, the generic route builder joins a matching runway
transition at the common fix. This keeps ATL arrivals on their published feeder
paths without a facility-specific branch.

Deliberately missing: controller command support to say **descend via
<STAR>**, then select or amend a transition—primarily a runway transition—or
to change that transition while the aircraft is already on the STAR. Current
`PROCEDURE` / `VIA_STAR` state carries one STAR transition reference from the
scenario or spawn assignment.

Later work must keep:

- transition lookup data-driven through the loaded catalog;
- enroute/common/runway legs joined only at matching common fixes;
- existing authored routes, runway-aware spawning, vectors, and KDEM behavior;
- no airport-id branch, chart scrape, or silent straight-line substitute for
  unsupported procedure legs.

### CIFP pack integration acceptance (T04-35)

Visible now: every listed playable scenario loads its catalog through
generic `loadCatalog`. Map-backed entries also load `loadVideoMapSet`; KATL
uses `videoMapSet: "KATL"` (T04-39 CRC pack). KDEM remains the authored default. `loadCatalog(dir)`
is unchanged. CIFP-derived packs interchange with authored catalogs via
`parseCatalogFiles` (same parser). Synthetic second-facility testdata
(`testdata/catalog-packs/kbbb/`) and `tools/cifp-import/pack.integration.test.ts`
prove no facility-id branch and that SID/STAR/approach refs outside the seed
radius remain after pack write. `extract-katl-slice.ts` stays a thin
default-flag wrapper. `src/scenario/data/katl/` is the committed trainer
catalog pack. `src/scenario/katl.json` and `katl-08.json` author west/east
flows from that catalog and are session-visible inventory entries. Maps and
ATPA stay outside CIFP catalog JSON. Trainer MVA is a uniform 3000 ft floor,
not FAA source data.

Deliberately missing:

- **`faa:update` live download.** Input stays a local path. CI and this
  ticket did not regenerate from an official FAA cycle (no authorized
  local CIFP in the environment). Record a skip-with-reason; do not claim
  cycle regeneration was tested.
- **RNAV / hold / RF flying** from imported CIFP. Unsupported path
  terminators stay diagnostics, not TF legs.
- **SID flying from imported CIFP.** Catalog `sids` may be non-empty. FMS
  climb-via for those imported rows is not this ticket.
- **Browser CIFP fetch, national dump in git, T04-11 wind, phase 5.**

Constraints later work must keep:

- one conversion path: local CIFP → pack → existing catalog schema;
- no `src/` import of `tools/cifp-import`; no airport-id runtime branches;
- KDEM remains the authored default and boots without CIFP;
- radius is seed only; closure keeps out-of-radius procedure refs;
- maps, spawns, MVA, ATPA, and telephony stay authored, not CIFP-emitted.

### KATL A80 video maps (T04-36–42)

Visible now: committed trainer pack under `src/scenario/video-maps/KATL/`
(catalog, per-map JSON, manifest, `groups.json` sidecar, attribution).
Playable `katl.json` / `katl-08.json` set `videoMapSet: "KATL"` and load
through generic `loadVideoMapSet` / `loadVideoMapGroups`. Catalog `id` is
the CRC ULID; `starsId` is DCB/command identity; `dcbNumber` is omitted.
Default group is `groups.json` `sourceIndex` 0. GEO MAPS lists all 90 maps,
including 17 GEO-only ULIDs in `mapsAbsentFromGroups`. `*D ALL` / `*D NONE` /
CLR ALL / CURRENT walk the full inventory. CRC A/B is `map` / `mapDim`.
Runtime does not read CRC or import the converter.

Deliberately missing:

- **Chrome visual leftover (T04-41 / T04-42).** Automated tests pass. The
  operator MAPS / GEO / BRITE walk is `test.skip` skip-with-reason (no
  visual operator). Do not invent a pass.
- **`faa:update` live download, SID flying, RNAV / hold / RF FMS.** CIFP
  catalog rows stay as T04-35. Unsupported path terminators stay diagnostics.

Constraints later work must keep:

- no `if (icao === "KATL")` runtime branch; KDEM stays the authored default;
- do not densify CRC ULID / `starsId` identity to 1–30;
- do not commit local CRC cache JSON/GeoJSON;
- `src/` never imports `tools/crc-videomap-import`; no runtime vNAS fetch.

## Voice

### Live Path C tie salvage (T03-20)

Visible now: unique Haynes / AJ / ILS 26R snap locally (`spoken_a` / `spoken_b`)
against a synthetic catalog. A within-margin tie misses locally and, with
`pathC: true`, an injected Path C receives the retrieved candidate cluster
(cap 16), not file-order 64 and not the whole pack. STT `X-ATC-Fixes` is
omitted or a tiny high-value prior (T03-19).

Deliberately missing: live Path C tie salvage against a real `speech-api`
`POST /parse` model on a Haynes-like **tie** (not unique snap) was not run
this ticket. Chrome PTT p50 (T03-12 E10) was not measured.

Constraints later work must keep:

- one salvage model, same `POST /parse`, miss-only, schema-checked Command IR;
- retrieved cluster 8–16, never `ids().slice(0, 64)` or the whole pack;
- unique high-margin snap stays local;
- self-hosted `speech-api` only; no paid STT/TTS/LLM hosts;
- synthetic catalogs in generic tests; no KATL production counts.

## Explicit boundary

This document does not pull in untouched phase work such as scoring/replay,
constant-wind simulation, a licensed STARS typeface, or other
features that have not been partially implemented in the shipped slices.
