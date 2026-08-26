# Later implementation backlog

This is the backlog of follow-ups implied by features that are already shipped.
It is intentionally not a list of untouched phases or features that have never
been started.

## Scope and display

### Real ATPA pairing and predicted geometry

The DCB currently exposes an ATPA toggle, but `ATPA` is deliberately a stored
no-op. Implement later:

- in-trail pairing and sequencing;
- predicted separation / closure calculations;
- controller-selected ATPA thresholds;
- predicted rings, cones, or alert geometry;
- appropriate audio and datablock alerts.

Keep this separate from TPA: TPA's controller-selected 2/3/5/10 NM J-rings
already work. Do not turn the TPA ring into an automatic CA halo.

### Richer TPA controls

The shipped TPA implementation supports selected-track rings, or owned-track
rings when nothing is selected. Possible follow-ups are the CRC `*J` keyboard
chord, explicit target selection for multi-ring use, and richer ring styling.

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

These manual invocation commands and the corresponding `▲` and `*` Line 1 glyphs are skipped for now and preserved for later implementation when a full STARS `<MULTI FUNC>` keyboard chord parser is introduced.

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
