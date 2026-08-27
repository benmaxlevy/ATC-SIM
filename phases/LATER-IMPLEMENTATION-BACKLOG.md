# Later implementation backlog

This is the backlog of follow-ups implied by features that are already shipped.
It is intentionally not a list of untouched phases or features that have never
been started.

## Scope and display

### Real ATPA pairing and predicted geometry

Live now: catalog volumes walked by `approachId` (T02-43), in-trail pairing
and predicted monitor/warning/alert status on `world.alerts.atpa` (T02-44),
predicted cones (T02-45), datablock in-trail distance plus A/TPA cone mileage
(T02-46), and four real AUX TPA/ATPA cells plus master (T02-47). A feature
paints only when `atpa.on && atpa[feature]`. Alert Cones gates alert and
warning; Monitor Cones is monitor-only. The four cells stay clickable with
master off so PREF can store a setup.

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

### STARS preview area — commands not parsed

Visible now: `FIL` altitude chord, L1–L9 leader, T02-49 `*` Table 36 TPA/ATPA
chords, and the Preview Area buffer (readout + machine). F3 / F4 still apply
immediately to the selected track (color/ownership stubs) until T02-52 wires
INIT CNTL / TERM CNTL. Beacon `B##` / `B####` (Table 30 CODE BLOCK / discrete)
are parsed as display filters. The buffer is display-only — not the radio
command line.

Deliberately unparsed CRC tables / commands — later work, **not** stubs this
trainer accepts:

- `TERM CNTL ALL`
- typed TCP / `Δ` handoffs and recall
- **all** pointouts (`UN` / `**` stay radio + click; do not add preview PO)
- quicklook `Q`
- scratchpad `Y` / `+` undo
- per-track PTL `R`
- per-track Mode C / MULTIFUNC `M` `C` `Y` (see **Manual Inhibit Commands
  and Safety Inhibit Glyphs** — do not duplicate that parser here)
- assigned / filed alt `MΔ` / `++`
- assign-code `M ####` / `M(####)`
- beacon LDB `BE` / `BI`
- leader-by-TCP / `L11` global typed
- relocate preview / lists
- typed range 6–256 and 1/3 NM steps
- typed map ID
- WX overlays
- dual assoc / unassoc `FC`
- TAB / VFR / COAST / CA / SIGN-ON / TOWER / CRDA lists
- RBL `*T` / min-sep / `.find` `.center` `.rings`
- GI / ATIS `S` type-in
- FP dump `D`
- consolidation
- coordination
- TDM
- CRDA Table 26
- CA `K` / force SPC
- highlight remains middle-click (T02-37)

Constraints later work must keep: never Command IR; `*` chords remain T02-49;
radio line unchanged; reject unknown rather than no-op; data-first catalog;
self-hosted speech.

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

Any live-data design must preserve the self-hosted speech rule and must not
silently introduce a metered vendor dependency.

### PTL targeting

The predicted track line is currently global, with OWN/ALL display controls.
Possible follow-ups are per-track PTL selection, additional duration presets,
and richer prediction geometry.

### DCB capabilities currently represented as disabled chrome

The trainer DCB now includes disabled WX, VOL, MODE, SITE, and unpopulated map
slots. Later implementations may give those cells real behavior:

- weather layers and weather-data lifecycle;
- audio/display mode controls that remain separate from OS volume;
- additional catalog-backed maps and map management;
- fuller CRC-style DCB workflows.

Do not fill empty map slots with OSM or add weather paint as an incidental
change; each capability needs its own data and acceptance criteria.

### PREF SAVE AS named sets

SAVE AS currently auto-names the first empty slot `PREF n` and forbids
`window.prompt` / HTML `<input>`. CRC STARS prompts for a preference-set name,
then writes the first available slot.

Later: after SAVE AS, collect a short name via a PPI/status-line chord (same
grammar as the altitude FILTER `FIL` prompt). Enter commits to the first empty
slot (slot 8 if all eight are full). Esc cancels. Do not use a browser dialog
or an HTML text field. Slot caps should show the stored name once it exists.

MAIN already shows the active set name on the PREF cap.

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

## Explicit boundary

This document does not pull in untouched phase work such as scoring/replay,
constant-wind simulation, CRDA/FMA/ARV, a licensed STARS typeface, or other
features that have not been partially implemented in the shipped slices.
