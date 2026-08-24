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

### Track lifecycle beyond the F3/F4 stubs

F3/F4 currently provide ownership-color behavior. A later scope increment could
add the remaining NAS-like lifecycle around that existing behavior:

- real track association and termination semantics;
- scratchpad, beacon-code, quick-look, and point-out state;
- a genuine second-position / facility handoff model.

The existing inbound handoff acceptance path must remain compatible.

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

## Explicit boundary

This document does not pull in untouched phase work such as scoring/replay,
constant-wind simulation, CRDA/FMA/ARV, a licensed STARS typeface, or other
features that have not been partially implemented in the shipped slices.
