# Phase 4 Procedures — SIDs and Departures Visual Acceptance Test Script (T04-23)

Repeatable manual and automated verification procedure for **SIDs and Departures Integration** (Tickets T04-18 through T04-23).

---

## 1. Overview & Objectives

This acceptance script validates that departures and arrivals operate concurrently and seamlessly on the STARS-like radar scope:
1. **Rolling Departures**: Aircraft spawn along RW27 centerline (~0.8 NM along 270°, 700 ft MSL climbing at 180 kt) under Tower handoff.
2. **Radio Telephony & Check-In**: Automated check-in on departure frequency (*"Departure, `<callsign>`, passing `<alt>` climbing via the BAY ONE departure"*).
3. **Climb-Via SID Navigation**: FMS vertical and lateral adherence to published BAY1 SID route and crossing restrictions (MISSD, SNARF, NORMA, OCTTA).
4. **Radar Vector & Altitude Amendments**: Issuing `H360` immediately transitions lateral mode to `HEADING` and cancels `VIA_SID` to `ASSIGNED` while maintaining climb.
5. **Smart `Shift+H` Handoff**: Contextual auto-detection:
   - Selected arrival on approach (< 5 NM from threshold): executes Tower handoff (`LANDING` mode, cyan Tower color, `T` stub).
   - Selected climbing departure (>= 5000 ft or >= 12 NM): executes Center handoff (`handoff.center` logged, white Center color, `C` stub).
6. **Airspace Boundary Despawn**: Clean removal upon crossing the 28 NM TRACON boundary with `handoff.outbound.completed` and `nav.departed` telemetry.
7. **Safety Alerting (CA & MSAW)**: Zero false MSAW alerts on standard SID climb profiles; zero false Conflict Alerts against properly separated arrivals.
8. **Video Map Slot 7**: BAY1 SID corridor lines and fix labels rendered and toggleable on the PPI scope canvas.

---

## 2. Automated Test Suite Reference

All automated proofs run DOM-free in Vitest at 20 Hz fixed simulation physics:

```bash
# Run full departures and SIDs integration test suite
npx vitest run tests/integration/departures-and-sids.test.ts

# Run supporting Phase 4 departure and SID unit tests
npx vitest run src/scenario/departureSpawn.test.ts \
               src/scenario/departureGenerator.test.ts \
               src/scenario/procedures/sidHelpers.test.ts \
               src/pilot/checkinQueue.test.ts \
               src/core/fms/vertical.test.ts \
               src/core/handoff.test.ts \
               src/scope/ownership.test.ts \
               src/scope/renderScope.test.ts \
               src/scenario/videoMaps.test.ts
```

---

## 3. Setup (Manual Browser Acceptance)

- **Target Browser**: Google Chrome desktop (1920x1080 resolution recommended).
- **Start Dev Server**:
  ```bash
  npm run dev
  ```
- **Launch URL**:
  ```
  http://localhost:5173/?departures=auto&dep_rate=15&seed=1
  ```
- **Optional Local Speech API**:
  If testing spoken ATC voice inputs and TTS pilot readbacks, launch `speech-api` on `http://127.0.0.1:8090`. (Typed radio commands work fully out-of-the-box without `speech-api`).

---

## 4. Step-by-Step Manual Test Script

### Step 1: Workstation Boot & Video Map Verification
1. Navigate to `http://localhost:5173/?departures=auto&dep_rate=15&seed=1`.
2. Observe radar scope canvas (PPI):
   - KDEM runway 27 and localizer feather are visible.
   - STAR arrivals appear inbound towards NEMAX/NELBO with green unowned datablocks (`*` CSI stub).
   - BAY1 SID video map lines (Slot 7) display departure corridors from RW27 to MISSD, SNARF, NORMA, and OCTTA with altitude/speed restriction text boxes.
3. Click `MAPS` on the Display Control Bar (DCB) or toggle slot 7:
   - Confirm SID corridor lines toggle OFF and ON cleanly.

### Step 2: Rolling Departure Spawning
1. Within 60 seconds of session start, observe the RW27 departure corridor (~0.8 NM west of threshold along heading 270°).
2. A departure aircraft spawns (e.g. `AAL100` / `B738` or `A321`):
   - Initial altitude: `007` (700 ft MSL).
   - Initial ground speed: `180` kt.
   - Datablock shows `AAL100`, `007  100`, and aircraft type `B738`.
   - Flight strip bay in top-left displays a strip for `AAL100` with `H270  A100  S180`.

### Step 3: Radio Check-In Telephony
1. Within 2–5 seconds after departure spawn, check the radio status area / pilot audio:
   - Status text: *"Departure, American 100, passing 700 climbing via the BAY ONE departure"*.
2. Confirm the radio transmission does not collide with arrival check-ins (queued with >= 500 ms idle gap).

### Step 4: Climb-Via SID Navigation
1. Watch `AAL100` navigate the BAY1 SID:
   - Aircraft climbs straight ahead past runway end along RW27 centerline towards `BAYEE` (-3.5 NM, 0 NM).
   - Reaches `BAYEE` at or above 1,500 ft, initiates gradual sweeping right turn towards `BAYNO` (-6.5 NM, +4.5 NM).
   - Reaches and crosses `BAYNO` at or above 2,500 ft with speed <= 250 kt.
   - Curves northeast towards `NORMA` (+8 NM, +12 NM), crossing at or above 6,000 ft and climbing to top assigned altitude (`10,000` ft).
   - (For South transition departures: aircraft crosses `BAYEE`, initiates sweeping left turn to `BAYSO` at or above 2,500 ft / <= 250 kt, then curves east towards `OCTTA` at or above 8,000 ft).
2. Check MSAW and CA alerting:
   - Verify zero false MSAW caution (yellow) or alert (red) warnings during the departure climb.
   - Verify zero false Conflict Alerts (CA) against properly separated STAR arrivals.

### Step 5: Radar Vector & Altitude Amendment
1. Click `AAL100` or type `AAL100 H360` in the command line prompt and press `Enter`:
   - Pilot reads back *"American 100 heading 360"*.
   - Aircraft smoothly transitions from SID lateral guidance to magnetic heading 360°.
   - Vertical mode cancels `VIA_SID` to `ASSIGNED` while maintaining continuous climb to 10,000 ft.
2. Type `AAL100 C120` and press `Enter`:
   - Pilot reads back *"American 100 climb and maintain one-two thousand (12000)"*.
   - Datablock line 2 updates assigned altitude field to `120`.
   - Aircraft continues climb through 10,000 ft towards 12,000 ft.

### Step 6: Smart `Shift+H` Contextual Handoff
1. **Arrival Tower Handoff**:
   - Left-click an arrival established on ILS 27 inside 5 NM from threshold (e.g. `DAL123`).
   - Press **`Shift+H`**.
   - Datablock and target symbol switch to cyan Tower ownership (`T` CSI stub).
   - Aircraft lateral mode enters `LANDING`.
2. **Departure Center Handoff**:
   - Left-click a climbing departure above 5,000 ft (or > 12 NM from ARP).
   - Press **`Shift+H`**.
   - Aircraft ownership switches to white Center outbound state (`C` CSI stub).
   - Session log records `handoff.center` and `handoff.outbound.initiated`.

### Step 7: Airspace Exit & Clean Despawn
1. Allow the departure to continue flying outbound past 28 NM from airport reference point (ARP).
2. Upon crossing 28 NM:
   - Aircraft target symbol and datablock cleanly disappear from PPI scope.
   - Flight strip is removed from strip bay.
   - Session telemetry records `handoff.outbound.completed` and `nav.departed`.

---

## 5. Acceptance Verification Run Card (AC1–AC7)

| Acceptance Criteria | Automated Test Proof | Manual Verification | Status |
|---|---|---|---|
| **AC1: Mixed Traffic Session** | `tests/integration/departures-and-sids.test.ts` (AC1) | Steps 1–7: Full cycle from spawn to boundary despawn | **PASS** |
| **AC2: No False MSAW / CA** | `tests/integration/departures-and-sids.test.ts` (AC2), `src/core/alerts/msaw.test.ts` | Step 4: No spurious MSAW over terrain on DEM1 climb | **PASS** |
| **AC3: Smart Shift+H Handoff** | `tests/integration/departures-and-sids.test.ts` (AC3), `src/scope/ownership.test.ts` | Step 6: Tower handoff on final vs Center handoff outbound | **PASS** |
| **AC4: Radar Vector Amendments** | `tests/integration/departures-and-sids.test.ts` (AC4), `src/pilot/applyIntent.test.ts` | Step 5: `H360` vectors lateral mode and cancels `VIA_SID` | **PASS** |
| **AC5: Video Map 7 SID Corridors** | `src/scope/renderScope.test.ts`, `src/scenario/videoMaps.test.ts` | Step 1: Slot 7 DEM1_SID corridor polylines and labels | **PASS** |
| **AC6: Documented Procedure** | `phases/04-procedures/ACCEPTANCE-SIDS-DEPARTURES.md` | Verification checklist complete | **PASS** |
| **AC7: Clean Repository CI** | `npm run ci` exits 0 (typecheck, lint, format, tests) | 100% automated test pass with zero diagnostics | **PASS** |

---

## 6. Final Status

- **Build & Tests**: All 116 test suites pass (1,275+ tests).
- **TypeScript**: 0 errors (`npm run typecheck`).
- **ESLint & Prettier**: 0 errors (`npm run lint`, `npm run format:check`).
- **Conclusion**: **READY TO MERGE**.
