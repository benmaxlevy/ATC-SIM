# T04-22 Departure radio telephony and initial check-in

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-20, T04-21, T04-15
**Blocks:** T04-23
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Departure aircraft perform realistic, standard initial check-in transmissions to Departure Control on the radio channel using catalog spoken SID names, passing altitudes, and climb intents, integrated with the non-overlapping check-in queue.

## Context

T04-15 introduced unsolicited radio check-ins for STAR arrivals (`"Approach, Delta 123, descending via DEMO ONE arrival through one one thousand"`). Departures have an analogous standard phraseology per AIM 4-2-3 and JO 7110.65:
- On initial contact with Departure control (after transfer from Tower, typically passing 1,000–1,500 ft AGL):
  - **Climb Via:** `"Departure, <callsign>, passing <passing_alt> climbing via the <sid_spoken_name> departure"` (or `"Departure, <callsign>, leaving <passing_alt> for <assigned_alt>"`).
  - Example: `"Departure, Delta 123, passing one thousand two hundred climbing via the DEMO ONE departure"`.
- Check-ins must be scheduled with realistic jitter (2–5 seconds after airborne spawn) and queued through `CheckInQueue` so departure and arrival transmissions never collide or talk over one another.
- Catalog spoken name is derived from `catalog.sids[].name`, never hardcoding `"DEM1"` or `"KDEM"`.

See `src/pilot/checkinQueue.ts`, `src/pilot/telephony.ts`, `src/speech/telephonyTokens.ts`.

## Research

- **R01** JO 7110.65 — Section 2-4-15 (Emphasis for Altitude Assignment), Section 4-5-7 (Climb Via).
- **R03** AIM 4-2-3 (Contact Procedures) & AIM 5-2-8 (Departure Procedures) — Initial contact on departure frequency: facility identification, aircraft callsign, current altitude (leaving/passing), and assigned altitude / climb via restriction.

**Official term:** Initial Contact, Departure Check-in, Telephony Altitude Report.

**Trainer delta:** Spoken facility tag is `"Departure"`; passing altitude is current Mode C rounded to hundreds; catalog `name` is used for spoken procedure name.

## Scope

- Formatting helper in `src/pilot/telephony.ts` or `src/pilot/checkinQueue.ts`:
  ```ts
  export interface FormatDepartureCheckInArgs {
    callsign: string;
    sidName?: string;
    currentAltitudeFt: number;
    assignedAltitudeFt: number;
    isClimbVia: boolean;
  }

  export function formatDepartureCheckIn(args: FormatDepartureCheckInArgs): string;
  ```
  - If `isClimbVia` and `sidName`: `"Departure, ${callsignSpeech}, passing ${altSpeech} climbing via the ${sidName} departure"`.
  - Otherwise: `"Departure, ${callsignSpeech}, leaving ${altSpeech} for ${assignedAltSpeech}"`.
- Procedure name lookup helper:
  - `sidSpokenName(catalog, sidId): string` — resolves `catalog.sids.find(s => s.id === sidId)?.name ?? sidId`.
- Extend `CheckInQueue` in `src/pilot/checkinQueue.ts`:
  - Support scheduling both arrival and departure check-in entries with `kind: "arrival" | "departure"`.
  - Departures become eligible for check-in 2–5 seconds after spawning (or upon reaching 1,000 ft MSL).
  - Radio busy lock ensures one transmission at a time with standard quiet gap between messages (`CHECKIN_IDLE_GAP_MS`).
- Pilot readback updates:
  - Acknowledging climb clearances (`"CLIMB 100"` -> `"Climb and maintain one zero thousand, <callsign>"`).
  - Radar contact / vectors acknowledgement.
- Unit and snapshot tests for telephony strings, spoken token expansion, and queue draining.

## Out of scope

- Synthesizing new third-party voice TTS providers (uses existing web/speech-api architecture).
- Controller speech recognition changes (existing grammar handles callsigns & commands).

## Acceptance criteria

- [ ] **AC1 —** `formatDepartureCheckIn({ callsign: "DAL123", sidName: "DEMO ONE", currentAltitudeFt: 1200, assignedAltitudeFt: 10000, isClimbVia: true })` formats to `"Departure, Delta 123, passing one thousand two hundred climbing via the DEMO ONE departure"`.
- [ ] **AC2 —** `sidSpokenName(catalog, "DEM1")` returns `"DEMO ONE"` from catalog metadata without a `"DEM1"` literal branch in production code.
- [ ] **AC3 —** A newly spawned departure schedules its check-in within 2–5 seconds and plays over the radio channel without colliding with active arrival check-ins.
- [ ] **AC4 —** Radio log / session log records the departure check-in transmission with correct timestamp and callsign.
- [ ] **AC5 —** Automated tests for AC1–AC4 pass. `npm test` exit 0.

## Test plan

- Unit: Telephony text formatting; spoken name resolution; queue priority & FIFO ordering.
- Integration: Session with simultaneous arrivals and departures verifies sequenced, clean radio transmissions.
- Manual: `npm run dev -- ?departures=auto` allows hearing/reading departure check-in transmissions as aircraft climb out.

## Suggested files

- `src/pilot/telephony.ts`
- `src/pilot/telephony.test.ts`
- `src/pilot/checkinQueue.ts`
- `src/pilot/checkinQueue.test.ts`
- `src/scenario/procedures/sidHelpers.ts`
