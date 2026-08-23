# T04-15 STAR descend-via check-in

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-13 (pose/VIA spawn exists; T04-12 already arms `PROCEDURE` + `VIA_STAR` on ils27)
**Blocks:** none
**Launch:** Implement this ticket only. Do not start spawn-geometry tickets or phase 5 scoring.

## Goal

Inbound aircraft that spawn on a STAR with descend-via armed make **one** unsolicited radio check-in shortly after spawn, in frozen trainer phraseology, shown on the existing readback/status line and spoken if TTS is live, with a typed `radio.checkin` session event. Check-in is **not** a command readback and **not** Command IR.

## Context

Phase 4 is green through T04-12. Radio today is controller → parse → pilot → `formatReadback` → `voiceLoop.playReadback`. There is no pilot-initiated transmission. Controller `VIA DEM1` readback is `{callsign} descend via DEMO ONE` (catalog name, no “arrival”). Check-in uses a **different** skeleton requested by the human:

> approach, {callsign}, descending via ____ arrival through xxxx feet

T04-14 will STAR-spawn the default pack; this ticket must also work on `kdem-ils27` (two VIA arrivals) so it can land **in parallel** with T04-14 after T04-13.

`phases/_shared/architecture.md`: the **pilot agent** owns what the pilot says. Scope does not invent radio. Parser does not emit check-ins. `stepWorld` stays `SpeechPort`-free.

Live formatters (do not fork): `formatCallsignSpeech("DAL123")` → `delta one two three` (`src/pilot/telephony.ts`); `speakAltitude(11000)` → `one one thousand` (`src/pilot/digits.ts`). Catalog STAR `DEM1` name is `DEMO ONE`.

## Research

Cite **R01** (JO 7110.65) and AIM initial contact / descend-via. Search: `AIM initial contact facility identification`, `7110.65 descend via STAR phraseology`.

| Analog | Official idea | Trainer freeze |
| --- | --- | --- |
| AIM initial contact | Facility name, then aircraft ID, then the message | Facility call is the literal word **`approach`**. Not “Demo Approach”. Phase 5 APP/FIN is not started. |
| Descend-via report | Pilot reports descending via the published arrival and an altitude | Catalog spoken **`name`** (`DEMO ONE`), never coded id (`DEM1`). Include the word **`arrival`**. No leading “the”. |
| Altitude on first contact | Field usage varies (“leaving”, “at”, “through”) | Always **`through`** + present Mode C via `speakAltitude`, then the word **`feet`**. |
| ATIS / squawk / “with you” | Common on real initial contact | **Omit.** |
| Controller `DESCEND_VIA` | Pilot **readback** “descend via (name)” | Check-in is **unsolicited**. Do not parse it. Command readback stays unchanged. Check-in uses **`descending via`**. |

Code comment on the formatter: analog AIM initial contact + descend-via; trainer delta = frozen template, “through”, facility `approach`, trailing “feet”, no ATIS/squawk.

## Scope

- Pure `formatCheckIn` in `@pilot`. Reuse `formatCallsignSpeech` and `speakAltitude`. Look up STAR **name** from the loaded catalog. Do **not** call `formatReadback`.
- Schedule **one** check-in per eligible arrival at spawn: lateral `PROCEDURE` **and** vertical `VIA_STAR`, same `starId`.
- Fire at **sim** time `spawnSimMs + staggerMs`. Seeded RNG (reuse T04-14 `mulberry32` if present; otherwise the same uint32 recipe). **No `Math.random()`.**
- At fire time, re-check eligibility. If still `PROCEDURE` + `VIA_STAR`: format, show status line, play TTS if the port is live, append `radio.checkin`. If heading already cancelled VIA, or `nav.star.vectors` already fired: **skip** (no utterance, no event).
- Never check in twice.
- Radio queue: one utterance at a time via existing `playReadback`; wait if the voice loop is busy or PTT is down; **500 ms sim** idle after the previous utterance ends before the next check-in **starts**.
- Patch `SessionEvent` in `src/core/events/types.ts` in **this** ticket.
- Null `SpeechPort`: still set the status line and emit `radio.checkin`; do not throw.
- Downwind / `?traffic=` bench aircraft **without** STAR+VIA: never schedule.
- Export `formatCheckIn` from `@pilot`. `src/parse/**` and `src/scope/**` must not import it (grep AC).

## Out of scope

- Spawn xy, outer-fix placement, random STAR assignment (T04-13 / T04-14).
- Center ↔ Approach frequency change, ATIS, squawk, “with you”.
- SID / outbound checkouts.
- Changing `DESCEND_VIA` / `JOIN_PROCEDURE` readback templates.
- New Command IR instruction. Parser must not accept check-in text as a controller command.
- Phase 5 scoring UI, `checkPhraseology` changes, T05-05 imperfect delay implementation (document that scoring must **ignore** `radio.checkin`).
- Vendor TTS, Chrome Web Speech as the quality path, barge-in.

## Implementation notes

### Frozen spoken template

```text
approach, {formatCallsignSpeech(callsign)}, descending via {starName} arrival through {speakAltitude(altitudeFt)} feet
```

- `starName` = catalog `name` (e.g. `DEMO ONE`), never `DEM1`.
- `altitudeFt` = present Mode C (`aircraft.altitudeFt`) at **fire** time.
- Commas after `approach` and after the spoken callsign. Single spaces. No “the”.

**Golden example** (DAL123, DEMO ONE, 11000 ft):

```text
approach, delta one two three, descending via DEMO ONE arrival through one one thousand feet
```

Vitest may assert `.toLowerCase()`:

```text
approach, delta one two three, descending via demo one arrival through one one thousand feet
```

Unchanged command readback: `delta one two three descend via DEMO ONE`.

### When it fires

1. **Schedule** when an aircraft is spawned with `intent.lateral.type === "PROCEDURE"` and `intent.vertical.type === "VIA_STAR"`.
2. `dueSimMs = spawnSimMs + staggerMs`. `staggerMs` ∈ **[3000, 8000]** sim ms, quantized to **50 ms**, drawn from a seeded PRNG in spawn order (independent stream is fine: e.g. `mulberry32(seed ^ 0xC0FFEE)` so check-in stagger does not consume spawn-assignment draws).
3. **Fire** on the app tick **after** `stepWorld` (or `drainCheckIns(world, radio)` the app calls each frame). Do not import `SpeechPort` from `src/core`.
4. At fire: still PROCEDURE + VIA_STAR → speak once. Else → skipped.
5. After `nav.star.vectors` or a heading that cancelled VIA: if due has not fired, skip. If already spoken, do not repeat.
6. Aircraft that never had VIA (downwind bench): never schedule.

### Radio queue

- Reuse `voiceLoop.playReadback(text, callsign)`.
- Busy if an utterance is playing, transmit gate locked, or PTT is down. Check-in waits; it does not cancel; it does not steal PTT.
- Stagger is **eligibility**, not a substitute for the serial player. Colliding dues: FIFO by `dueSimMs` then spawn order.
- Pause: `simTimeMs` does not advance → dues wait. 2×: delays are sim-ms.
- T05-05 later: do not emit `pilot.readback.*` for check-ins. Share the playback busy gate only.

### Session event

```ts
| {
    type: "radio.checkin";
    atSimMs: number;
    atWallMs: number;
    callsign: string;
    starId: string;
    starName: string;
    altitudeFt: number;
    text: string;
  }
```

Emit **when delivered** to the status line, not when scheduled. Comment: *Pilot-initiated; not a Command. Phase 5 phraseology scoring must not treat this as controller input.*

Do not log skip. Do not reuse `command.accepted`.

### UI

Same readback/status line as command readbacks. Show `text` even when the speech backend is null. Do not draw check-in on the PPI.

## Acceptance criteria

- [ ] **AC1 —** Given `formatCheckIn({ callsign: "DAL123", starName: "DEMO ONE", altitudeFt: 11000 })`, when formatted, then the string lowercased equals `approach, delta one two three, descending via demo one arrival through one one thousand feet`.
- [ ] **AC2 —** Given `starId` `DEM1`, when formatted with catalog lookup, then the body contains `DEMO ONE` / `demo one` and does **not** contain the coded id `DEM1`.
- [ ] **AC3 —** Given a fixture aircraft `PROCEDURE` + `VIA_STAR` spawned at sim 0, when stepped past due with radio idle, then exactly one `radio.checkin` is appended with callsign, starId, starName, altitudeFt (present Mode C), and `text` matching AC1, and the status line equals `text`.
- [ ] **AC4 —** Given the same aircraft, when a heading instruction cancels VIA **before** due, then no check-in text, no TTS, no `radio.checkin`.
- [ ] **AC5 —** Given check-in already `done`, when heading or a later `VIA` occurs, then no second check-in. Given `nav.star.vectors` before due, skip.
- [ ] **AC6 —** Given six STAR+VIA arrivals at t=0 and a frozen seed, when stepped, then each eligible due stagger is in `[3000, 8000]` ms sim and a multiple of 50; `Math.random` is not used in the check-in scheduler (grep).
- [ ] **AC7 —** Given two due check-ins and a mock `playReadback` that stays busy until resolved, when drained, then the second play does not start until the first completes plus ≥ 500 ms sim. Controller readback in flight also blocks check-in start.
- [ ] **AC8 —** Given a null/silent SpeechPort, when a check-in fires, then the status line updates, `radio.checkin` is logged, and no throw.
- [ ] **AC9 —** Given bench/downwind spawn without VIA, when stepped 10 s sim, then no `radio.checkin`.
- [ ] **AC10 —** `src/parse` and `src/scope` do not import `formatCheckIn` or emit `radio.checkin` (grep). No new Instruction variant. `formatReadback` for `DESCEND_VIA` is unchanged.
- [ ] **AC11 — Research:** formatter file comments analog vs trainer delta.
- [ ] **AC12 —** `SessionEvent` union includes `"radio.checkin"` with a type test.
- [ ] **AC13 —** Manual: `npm run dev` (default after T04-14, or `?scenario=kdem-ils27` before it) — hear/see check-in without issuing a command. Issue `H270` before ~3 s on one aircraft → that one stays silent. Null backend: text only, no console error.

## Test plan

- Unit: `formatCheckIn` golden string; 3000 → `through three thousand feet`; catalog name vs id.
- Unit: eligibility, skip on heading/vectors, no repeat, stagger range, seed reproducibility, busy-gate FIFO, null port.
- Integration: fixture World DAL123 on DEM1 at 11000 → event + status callback after due.
- Manual: AC13.

## Suggested files

- `src/pilot/checkin.ts` / `checkin.test.ts`
- `src/pilot/checkinQueue.ts` / `checkinQueue.test.ts`
- `src/pilot/index.ts`
- `src/core/events/types.ts` (and existing event union test)
- `src/app/create-app.ts` (drain after `stepWorld`; wire status line + `playReadback`)
