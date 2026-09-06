# T02-107: LA/CA/MCI Status Box (AL) Dynamic Alerts & Visual/Audio Controls

**Phase:** 2 Scope — STARS System Lists Architecture  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-103  
**Files:**
- `src/scope/systemLists.ts`
- `src/scope/previewParse.ts`
- `src/scope/previewArea.ts`
- `src/scope/ppi.ts`
- `src/scope/render/renderScopePaint.ts`
- `src/core/alerts/conflictAlert.ts`
- `src/core/world.ts`
- `src/scope/test/systemLists.operational.test.ts`
- `src/scope/test/systemListsAndDcb.integration.test.ts`

---

## Context & Purpose

The LA/CA/MCI Status Box (`AL`) is the automated safety-net notification window on the STARS PPI. It tracks:
- Minimum Safe Altitude Warnings (MSAW / Low Altitude: `LA`).
- Conflict Alerts (`CA`): Predicted loss of lateral and vertical separation between correlated tracks.
- Mode C Intrusion (`MCI`): Untracked or unassociated transponder targets penetrating an active IFR separation volume.

When idle, the list renders only its header `LA/CA/MCI`. When safety alerts trip, the box dynamically unfurls active alert rows. Alert rows flash in sync with datablocks and play an audible warning until resolved, acknowledged, or inhibited.

---

## Acceptance Criteria

1. **Header & Dynamic Unfurling:**
   - Idle state (no active alerts): Renders header `LA/CA/MCI`.
   - Alert active state: Dynamically unfurls rows beneath the header:
     ```text
     LA/CA/MCI
     CA AAL100 DAL628
     LA JBU389 015
     MCI 1200 UAL856
     ```
2. **Alert Formatting & Target Identification:**
   - `CA`: `CA [Callsign1] [Callsign2]` (lists both conflicting aircraft callsigns).
   - `LA`: `LA [Callsign] [AltitudeHundreds]` (callsign and current pressure altitude).
   - `MCI`: `MCI [IntruderSquawk/Callsign] [ProtectedCallsign]` (intruder beacon squawk or callsign alongside protected IFR flight).
3. **Synchronous Flashing & Warning Audio:**
   - Active alert text flashes synchronously with the target's radar data block (1 Hz STARS blink phase).
   - Triggers terminal audible alert sound while an uninhibited/unacknowledged conflict is active.
4. **Commands & Acknowledge/Inhibit Controls:**
   - `*AL [Click] Enter`: Repositions the alert status box.
   - `*AL D Enter`: Resets the alert box to its adaptation default anchor.
   - `*CA [Left-Click Radar Target]`: Acknowledges / inhibits Conflict Alert for the targeted track.
   - `*LA [Left-Click Radar Target]`: Inhibits Low Altitude alert for the targeted track.
   - `*MCI Enter`: Toggles Mode C Intruder alerting on/off.
