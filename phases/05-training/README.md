# Phase 5 — Training

The sim becomes a **trainer**: score the session from the event log, optionally make pilots imperfect, optionally stub a second control position. Still a browser tab. Still not a certified device.

This is the first phase whose product fantasy is *review*, not *steer*. After phase 5 a controller can work KDEM, see a live **practice score**, export a debrief JSON, replay the session paused at any sim time, and (if they opted in) catch a wrong-altitude readback. A second PPI identity can own a polygon and take a color handoff. None of that is FAA certification, an LMS, or live multiplayer.

**Depends on:** phase 3 exit **and** phase 4 exit. Do not start until both READMEs’ **Phase exit** checklists are green. Voice is required for the readback-delay component and for spoken phraseology checks; typed-only still scores separation and text phraseology.

**Must not claim:** FAA training-device qualification, NAS operational use, STARS identity, or that a practice score is a grade.

---

## Why this phase exists

Phases 0–4 prove: the world ticks, a command becomes a readback, the scope looks like a terminal radar, voice uses the same Command IR, and aircraft fly a short STAR plus ILS 27 with lite CA/MSAW.

That is a simulator. A **trainer** also answers:

1. Did I lose separation? (CA events from T04-09, not a second detector.)
2. Did I speak/type allowed phraseology? (Command IR vs a frozen grammar — **not** an LLM.)
3. Did I fly extra miles versus DEMO ONE? (optional P1.)
4. If I used voice, what did radio timing look like?
5. Can I watch it again, paused, and inspect World + events?
6. Can I practice a handoff to a second position without standing up a server?

If scoring is fuzzy, “AI-judged,” or labeled like a certificate, the product posture from T00-01 is broken. Keep scoring a **pure function of the session event log**.

---

## What is already true (do not rebuild)

| From | You inherit |
| --- | --- |
| Phase 0 T00-01 | Frozen disclaimer copy. UI already labeled training / entertainment only. |
| Phase 0 T00-08 | Append-only `SessionLog`: `session.started`, `command.accepted`, `command.rejected`. Callers pass `atSimMs` + `atWallMs`. `all()` is immutable. |
| Phase 1 | `stepWorld`, pilot agent as the only Command→Intent mutator, template readbacks, pause / 1x / 2x, `DAL123` on KDEM. |
| Phase 2 | Dark PPI, ownership stub `unowned` \| `owned` (F3/F4, green vs white), keyboard focus model (radio vs scope), datablocks, strips. |
| Phase 3 | PTT → same parser → TTS readback, no barge-in, metrics `ptt_up_to_transcript_ms` / `ptt_up_to_audio_start_ms` on the log (or overlay). Spoken grammar path A + typed path B fallback. |
| Phase 4 | DEMO ONE STAR, ILS 27, CA lite (`alert.ca.caution` / `alert.ca.alert` / `alert.ca.clear`), MSAW lite, nav events (`nav.star.vectors`, loc/GS capture, tower handoff stub). |
| `_shared/non-goals.md` | No certification claim. No VATSIM. Phase 5 may *stub* a second position — not multi-facility NAS. No LLM as executor or autopilot. |
| `_shared/command-ir.md` | Radio-only `Command`. Phraseology scoring compares issued `Command` (+ `sourceText`) to allowed grammar. |
| `_shared/speech-port.md` | Imperfect delay sits **after** the pilot produces a readback string and **before** `synthesize`/playback. Do not put delay inside `transcribe`. |

---

## Goals (when this phase is done)

- A deterministic `scoreSession(events, ctx)` returns a **practice score** 0–100 with component breakdowns. Same log in → same numbers out.
- Separation uses **T04-09 CA episodes**, not a reimplementation of conflict geometry.
- Phraseology uses a grammar checker on each `command.accepted` (typed tokens or spoken path A). Path B salvage is **nonstandard**. No LLM.
- Optional P1: extra miles versus published DEMO ONE geometry.
- Voice: radio-discipline + delay metrics in the debrief; SpeechPort latency is **reported**, not used to punish the controller.
- Live score panel on the shell, labeled so it cannot be mistaken for certification.
- Debrief export JSON (score + deductions + event summary + disclaimer).
- Imperfect pilots **off by default**: delayed readback 2–8 s sim, occasional wrong altitude digit, `Unable` on impossible speed.
- Replay: serialize initial `World` + snapshots + events; load; pause; inspect.
- Second **TCP** stub: two positions, each a polygon on the KDEM plane; handoff changes ownership **color** (and a non-color label). Hot-seat P0; split view P1. No sockets.
- KDEM session brief markdown at start.
- Trainer settings + accessibility (color is not the only ownership cue; captions; reduced motion).
- Disclaimer still visible. No certification language in UI, score panel, brief, or export.

---

## Frozen decisions for this phase

Do not reopen these in tickets.

1. **Scoring is a pure function of the event log** (plus a small read-only `ScoreContext`: STAR lengths, whether voice occurred, trainer settings). It must not read the Canvas, React tree, or SpeechPort. Vitest in node.
2. **Do not fork CA.** T04-09 already emits `alert.ca.caution`, `alert.ca.alert`, `alert.ca.clear`. Scoring counts **episodes** (start→clear), not per-tick alerts.
3. **MSAW is debrief-observed, not graded.** User-facing score categories are separation (CA), phraseology, optional efficiency, optional readback timing. MSAW stays in the JSON as `observed` so instructors can see it without pretending we certified a terrain system.
4. **Phraseology is grammar, not style AI.** Checker input is `Command` (`source`, `sourceText`, `instructions`). Output is `canonical` \| `nonstandard` \| `disallowed`. No network, no model.
5. **Practice score, never a credential.** Visible label: `Practice score — not a certification`. Export copies the T00-01 disclaimer verbatim. Ban list in T05-02 / T05-11.
6. **Imperfect pilots default OFF.** A session with defaults behaves like phase 4. Opt-in is a trainer setting + a session-stable RNG seed.
7. **Wrong-altitude hearback:** when the error fires, the readback speaks the **wrong** altitude and **intent follows the wrong altitude** (what the pilot “heard”). The log stores issued vs spoken vs flown. Catching it (a later accepted ALTITUDE that matches the original issued value) is a documented credit.
8. **Readback delay is sim time**, 2–8 s uniform, seeded. Intent for *correct* readbacks still applies immediately (phase 1). Only the readback string / TTS is delayed. Delay does not apply to `command.rejected` error readbacks (those stay immediate).
9. **Unable is not a parse reject.** A grammatically valid `SPEED` the jet will not accept emits `pilot.unable`, no intent change, spoken/text `unable speed …`. Distinct from `command.rejected` (unknown callsign, out of [150, 280], etc.).
10. **Replay is single-player, in-tab.** File is JSON. No server. Seeking uses snapshots + `stepWorld` + recorded events. Pause is mandatory. Do not require live mic during replay (mute radio).
11. **Second position is a stub.** Same `World`, no networking, no VATSIM, no frequency change Command IR required. Ownership color + position id. Polygon is map + spawn default, **not** an automatic radar handoff when a track crosses the line.
12. **F3 stays initiate** for the *working* position (phase 2). **Handoff is a new always-on key `F6`** (document: not a CRC clone). F4 still drops to unowned.
13. **Hot-seat is P0; split view is P1.** Exit does not require two canvases. Exit does require two position ids, polygons, colors, and F6 handoff.
14. **New package `src/train`.** DOM-free. Patch `phases/_shared/architecture.md` in the **same PR as T05-01** to add the folder (planning docs here must not edit `_shared`). Import rule: `@train` → `@core` + `@parse` + `@scenario` only. `@ui` / `@scope` / `@pilot` may import `@train` types. `@core` must **not** import `@train`.
15. **Units stay glossary-frozen.** Sim ms for score/delay/replay. Wall ms only for SpeechPort latency in the debrief metrics block.

---

## Product posture (certification)

The phase 0 disclaimer is still the only legal sentence that matters:

```
ATC-SIM is a training and entertainment product. It is not an FAA training device, is not certified for operational or NAS use, and is not affiliated with the FAA or any STARS vendor. The display is a STARS-like visual analog only.
```

**Forbidden in any phase 5 UI string, brief, tooltip, export field name, or filename:**

- certified, certification, certificate, qualified, qualification
- FAA-approved, NAS-approved, TCO, ATD, FTD, AATD (as a claim)
- “pass/fail for a rating”, “controller exam”, “official grade”

**Required labels:**

| Surface | Copy |
| --- | --- |
| Score panel title | `Practice score — not a certification` |
| Debrief JSON | `"disclaimer"` = T00-01 paragraph; `"scoreKind": "practice"` |
| Brief footer | Same disclaimer |
| Replay file | Same disclaimer; `"product": "ATC-SIM"` |

`TCP` in this phase means **trainer control position** (one sector polygon + one working identity). It is **not** a Raytheon/Collins TCW.

---

## Scoring model (normative)

### Function

```ts
scoreSession(events: readonly SessionEvent[], ctx: ScoreContext): SessionScore
```

Deterministic. No `Date.now()`, no `Math.random()`. Episode grouping and weights are specified below. Re-running on the same array must deep-equal.

### `ScoreContext`

```ts
interface ScoreContext {
  /** DEMO ONE published length NM (sum of STAR legs). Omit efficiency if missing. */
  starPublishedNmById?: Record<string, number>;
  /** Trainer flags at session start (copied, not live-mutated). */
  settings: Pick<TrainerSettings, "scoreWeights" | "efficiencyEnabled">;
  /** True if any command.accepted has source === "voice". */
  hadVoice: boolean;
}
```

`hadVoice` may be derived from events; passing it explicitly is allowed if tests set it.

### Output

```ts
interface SessionScore {
  scoreKind: "practice";
  disclaimer: string; // T00-01 verbatim
  durationSimMs: number; // last event atSimMs − session.started atSimMs (0 if no start)
  total: number; // integer 0–100 after rounding half-up from weighted components
  components: {
    separation: ScoreComponent;      // always present
    phraseology: ScoreComponent;     // always present
    efficiency?: ScoreComponent;     // omitted if !efficiencyEnabled or no STAR samples
    readbackDelay?: ScoreComponent;  // omitted if !hadVoice
  };
  observed: {
    msawCautionEpisodes: number;
    msawAlertEpisodes: number;
  };
  deductions: ScoreDeduction[];
  credits: ScoreCredit[]; // hearback catches; may be empty
}

interface ScoreComponent {
  id: "separation" | "phraseology" | "efficiency" | "readbackDelay";
  raw: number;    // 0–100
  weight: number; // after renormalization, sum of present weights = 1
}

interface ScoreDeduction {
  atSimMs: number;
  component: ScoreComponent["id"];
  code: string;
  points: number; // negative
  detail: string;
}
```

### Default weights (before omit)

| Component | Weight |
| --- | --- |
| separation | 0.50 |
| phraseology | 0.30 |
| efficiency | 0.10 |
| readbackDelay | 0.10 |

If a component is omitted, **renormalize** the remaining weights to sum to 1.000. Example: no voice, no efficiency → separation 0.50/0.80 = 0.625, phraseology 0.375.

`total = round(Σ raw_i * weight_i)` with standard school rounding (`.5` up). Clamp `total` to `[0, 100]`.

### Separation (CA episodes)

Build pair key: `callsigns.slice().sort().join("|")` (two callsigns).

Walk events in log order:

| Event | Effect |
| --- | --- |
| `alert.ca.caution` | If pair has no open episode, open `{severity: "caution", start}`. If already `alert`, ignore (stay red). |
| `alert.ca.alert` | Open or **upgrade** open caution → `alert`. |
| `alert.ca.clear` | Close open episode; emit one deduction. |

Deduct **once per closed episode** (and once for any still-open episode at end of log):

| Closed as | Code | Points |
| --- | --- | --- |
| caution only | `ca_caution` | −5 |
| alert (red), duration ≤ 30_000 sim ms | `ca_alert` | −20 |
| alert, duration > 30_000 sim ms | `ca_alert` + extra `ca_alert_sustained` | −20 and −10 |

`raw = clamp(100 + sum(points), 0, 100)`.

If T04-09 used slightly different type strings, **adapt in one mapping table** in `src/train/score/ca-episodes.ts` and document the aliases. Do not recompute NM/altitude here.

### Phraseology

For each `command.accepted`, run `checkPhraseology(command)` (T05-04).

| Verdict | Code | Points |
| --- | --- | --- |
| `canonical` | — | 0 |
| `nonstandard` | `phrase_nonstandard` | −2 each |
| `disallowed` | `phrase_disallowed` | −5 each |

`raw = clamp(100 + sum(points), 0, 100)`. Zero accepted commands → `raw = 100` (empty session is not a phraseology fail).

`command.rejected` does **not** deduct phraseology (parser/pilot already refused). Optional debrief count only.

### Efficiency (P1, optional)

Enabled only when `settings.efficiencyEnabled === true` **and** `starPublishedNmById` has `DEM1` (or the catalog id).

For each aircraft that emits `nav.star.vectors` (or equivalent “STAR terminated to vectors”) with a flown-distance payload **or** a paired `nav.star.joined` + distance accumulator event `nav.star.distance` `{ callsign, starId, flownNm }`:

```
extraNm = flownNm − publishedNm
```

Per aircraft sample:

- `extraNm ≤ 2` → 100
- else `raw_i = clamp(100 - 5 * (extraNm - 2), 0, 100)`

Component `raw` = mean of samples. No samples → **omit** component (do not force 100).

If phase 4 events lack distance, T05-01 P1 may add `aircraft.distanceFlownNm` incremented in `stepWorld` while `lateral.type === "PROCEDURE"`, and a single `nav.star.distance` at vectors. That is allowed. Do not invent a second FMS.

### Readback delay / radio discipline (voice only)

Two different numbers; only one is graded.

**Reported, not graded (debrief `metrics`):** p50 of `ptt_up_to_audio_start_ms` from phase 3 speech metric events. This is SpeechPort + TTS, not controller skill.

**Graded `readbackDelay` component:** radio discipline in **sim time**.

Let a readback be “in progress” from `pilot.readback.started` to `pilot.readback.completed` (T05-05 emits these; if imperfect is off, started/completed may be the same sim ms or one tick apart).

| Situation | Code | Points |
| --- | --- | --- |
| `command.accepted` while **any** readback is in progress | `radio_blocked` | −5 |
| `command.accepted` for callsign C while C’s delayed readback is queued/in progress | `radio_stepped_on` | −8 (use this instead of blocked if same callsign) |

Do **not** deduct for long imperfect delays themselves. Do **not** deduct SpeechPort wall-clock > 1.5 s.

If imperfect is off and readbacks are immediate, blocked events should be rare (phase 3 already ignores PTT during playback). Typed commands during TTS playback **can** still fire — that is a valid deduct (controller typed over the readback).

`raw = clamp(100 + sum(points), 0, 100)`.

### Hearback credit (not a fourth weight)

If `pilot.readback.incorrect` `{ field: "altitude", issuedFt, spokenFt }` is followed later by `command.accepted` to the **same callsign** with an `ALTITUDE` whose `altitudeFt === issuedFt` (and issued ≠ spoken), append a credit `hearback_caught` **+5** applied to `total` after the weighted sum, still clamped to 100. Max **one credit per incorrect event**. Missed incorrect readbacks do not extra-punish beyond the aircraft now being at the wrong altitude (CA may then fire separately).

---

## Event log extensions

T00-08 froze three variants for phases 0–1. Later phases extend the discriminated union. Phase 5 **must** add the variants it emits. If phase 3/4 already added some, reuse names — do not alias.

Required for scoring / replay / imperfect / handoff:

| Type | Emitter | Payload (minimum) |
| --- | --- | --- |
| `session.started` | existing | `scenarioId` |
| `session.ended` | T05-03 / shell | `atSimMs`, `atWallMs` |
| `command.accepted` / `command.rejected` | existing | `command`, `reason?` |
| `alert.ca.caution` `.alert` `.clear` | T04-09 | pair callsigns, `distNm`, `deltaAltFt` |
| `alert.msaw.caution` `.alert` `.clear` | T04-10 | callsign, `altFt`, `floorFt` — observed only |
| `nav.star.vectors` | T04-04 | `callsign`, `starId` |
| `nav.star.distance` | T05-01 P1 | `callsign`, `starId`, `flownNm` |
| `speech.metrics` | T03-09 (name may vary) | PTT→transcript / PTT→audio-start wall ms |
| `phraseology.checked` | T05-04 optional | `commandId`, verdict — or compute at score time only |
| `pilot.readback.queued` | T05-05 | `commandId`, `delaySimMs` |
| `pilot.readback.started` | T05-05 / T03-06 | `commandId`, `callsign` |
| `pilot.readback.completed` | T05-05 / T03-06 | `commandId` |
| `pilot.readback.incorrect` | T05-05 | `issuedFt`, `spokenFt`, `flownFt` |
| `pilot.unable` | T05-06 | `commandId`, `reason`, `callsign` |
| `handoff.position` | T05-09 | `callsign`, `fromPositionId`, `toPositionId` |
| `handoff.tower` | T04-12 | unchanged |

Scoring **recomputes** from the log; it should not require `phraseology.checked` if it can call `checkPhraseology` on each accepted command. Emitting `phraseology.checked` is still useful for debrief diffs.

`SessionLog` max size: still unbounded, but replay files should warn in the UI if `events.length > 50_000` (do not truncate silently).

---

## Imperfect pilots (opt-in)

Settings (T05-11), defaults:

```ts
interface ImperfectPilotSettings {
  enabled: boolean; // default false
  delaySimMsMin: 2000;
  delaySimMsMax: 8000;
  wrongAltitudeProbability: number; // default 0.08 when enabled, else 0
  unableImpossibleSpeed: boolean; // default true when enabled
  seed: number; // uint32, chosen at session start
}
```

**RNG:** `mulberry32(seed)` or equivalent, stored so replay matches. Do not use `Math.random()`. Advance one sample per delay roll and per altitude-error roll (documented order: delay first, then altitude error if the command contains `ALTITUDE`).

**Delay:** On accepted command with a success readback, sample `delay ~ U[min,max]` inclusive integer ms, quantize to physics step (`50` ms). Queue the readback. UI text and TTS wait. `pilot.readback.queued` then later `started`/`completed`.

**Wrong altitude digit:** Only if `enabled` and the accepted command has exactly one `ALTITUDE` instruction and the roll `< probability`. Mutate **one** decimal digit of `altitudeFt` by ±1 in that place, then snap to a multiple of 100 inside `[1000, 18000]`, **≠ issued**. Classic case: `3000` → `2000` or `4000` (thousands place preferred if still in range). Readback templates use **spoken** altitude. `intent.assignedAltitudeFt = spokenFt`. Log `pilot.readback.incorrect`.

**Not delayed / not mutated:** `command.rejected`, `SAY_*`, `IDENT` (IDENT may still delay the “ident” readback if you want consistency — prefer **no** delay on IDENT/SAY to keep the radio snappy).

---

## Unable (impossible speed)

When imperfect `unableImpossibleSpeed` is true (and `enabled`):

A `SPEED` instruction is **unable** (valid parse, no intent change) when any of:

1. `speedKt` outside the type envelope `[150, 280]` — this already `command.rejected` in phase 1; **keep that**. Do not double-emit `pilot.unable`.
2. Aircraft lateral mode is `LOC`, `GS`, or `LANDING` **and** `speedKt > 180`.
3. Verb `INCREASE` and current `speedKt >= 280 − 1e-6`.
4. Verb `REDUCE` and current `speedKt <= 150 + 1e-6`.

Readback: `{callsign} unable speed {requested}` using FAA digits for the requested value. Event `pilot.unable` `{ reason: "speed_approach" | "speed_already_max" | "speed_already_min" }`.

When imperfect is **off**, only phase 1 envelope rejects apply. 210 kt on loc is allowed (phase 4 did not auto-cap speed).

Scoring: `pilot.unable` with `speed_approach` deducts **−3** on phraseology as `speed_incompatible` (controller judgment). Envelope rejects stay ungraded.

---

## Replay

### File (`ReplayFile` version 1)

```ts
interface ReplayFile {
  version: 1;
  product: "ATC-SIM";
  scoreKind: "practice";
  disclaimer: string;
  scenarioId: string;
  seed: number;
  trainerSettings: TrainerSettings;
  initialWorld: WorldDto;
  snapshots: Array<{ atSimMs: number; world: WorldDto }>;
  events: SessionEvent[];
}
```

`WorldDto` is JSON-safe: numbers, strings, plain objects/arrays. **Strip** AudioContext, MediaStream, canvas, functions, React refs. Ownership and position ids must round-trip.

### Recorder (T05-07)

- Start at `session.started`: deep-clone DTO of World.
- Snapshot every **10_000** sim ms (configurable 5–30 s) and on `session.ended`.
- Events = `log.all()` at export time (copy).
- Download `atc-sim-replay-<iso>.json` via a button. No auto-upload.

### Player (T05-08)

- File picker loads JSON; validate `version === 1` and disclaimer present.
- Replace live session (confirm). Set pause **on**.
- Scrubber: sim time. Seek = nearest snapshot `<= t`, then `stepWorld` applying recorded `command.*` / handoff / imperfect **from the file’s events** until `t`. Do not re-roll RNG; events already happened.
- Inspect pane: selected aircraft DTO + events in a window `[t − 5s, t + 5s]`.
- Mute SpeechPort (`null` or skip synthesize). Show template readback text from events/templates.
- Pause, 1x step one physics frame, jump to next event.

Replay is **not** a second physics truth: if `stepWorld` drifts from snapshots, **prefer snapshot** at each snapshot time (reset World to DTO), then step forward. Tests: record a heading command, reload, at T+2 s heading has increased toward assigned.

---

## Second position stub

### Positions (KDEM)

| id | Name | Color (new palette tokens) | Polygon (NM, east/north) |
| --- | --- | --- | --- |
| `APP` | Demo Approach | existing owned `#00FF66` | rectangle covering STAR / east: `(6,−20),(40,−20),(40,20),(6,20)` |
| `FIN` | Demo Final | `#00DDFF` (`ownedFinal`) | localizer west of the gate: `(−4,−8),(12,−8),(12,8),(−4,8)` |

Polygons may overlap (final sits inside a larger approach in real life). **Ownership is not “point in polygon.”** Polygon is drawn as a dim map outline + used as **default initiate target** only if you implement “spawn in APP polygon → still unowned until F3” (keep phase 2: spawn unowned).

### Behavior

- Working position: `APP` \| `FIN` (hot-seat control in the chrome).
- F3: unowned → owned **by working position** (color = that position).
- F4: → unowned (white).
- F6: if selected is owned by working position → transfer to the **other** position, emit `handoff.position`. If selected is owned by the other position, F6 is **accept** (same event if you were the receiver in hot-seat — still one player; treat F6 as “force set owner to the non-working position” when I own it, and “take ownership” when they own it). Simpler rule for the stub:

**F6 rule (normative):** selected track’s `ownerPositionId` toggles `APP` ↔ `FIN` (if unowned, F6 is no-op; use F3 first). Always emit `handoff.position`.

- Datablock line 1 may stay callsign; **strip or limited cue** shows `APP`/`FIN` so color is not the only channel (T05-11).
- Split view (P1): two `renderScope` instances, same World, different `workingPositionId` + independent camera optional. Exit-optional.

No Command IR for handoff. No frequency instruction. No networking.

---

## Architecture (phase 5 data flow)

```
SessionLog (T00-08 + later events)
        │
        ▼
 checkPhraseology(Command)          [T05-04]
        │
        ▼
 scoreSession(events, ctx)          [T05-01]
        │
        ├──────────────► Live panel [T05-02]
        ├──────────────► Debrief JSON [T05-03]
        └──────────────► Replay file may embed last score (optional)

TrainerSettings ──► Pilot agent (delay / digit / unable)  [T05-05, T05-06]
                └──► Scope positions / F6                 [T05-09]

WorldDto + events ──► Replay recorder/player              [T05-07, T05-08]

kdem.md brief ──► session start UI                        [T05-10]
```

| Folder | Owns |
| --- | --- |
| `src/train` | `scoreSession`, phraseology checker, debrief DTO, replay serialize/validate, `TrainerSettings` types |
| `src/pilot` | Delay queue, altitude mutation, unable speed, readback timing events |
| `src/scope` | Position polygons, ownership ids/colors, F6, optional split view |
| `src/ui` | Score panel, debrief/replay buttons, brief modal, trainer settings, a11y |
| `src/scenario` | `briefs/kdem.md`, position polygons JSON |
| `src/core` | `SessionEvent` union extensions, `WorldDto` pick, optional `distanceFlownNm` |
| `src/speech` | Honor transmit lock + delay: coordinator waits until delay elapsed before `synthesize` |

---

## Suggested layout

```
src/train/
  index.ts
  settings.ts
  score/score-session.ts
  score/ca-episodes.ts
  score/weights.ts
  score/score-session.test.ts
  phraseology/check-phraseology.ts
  phraseology/check-phraseology.test.ts
  debrief/export-debrief.ts
  replay/world-dto.ts
  replay/recorder.ts
  replay/player.ts
  replay/replay.test.ts
src/pilot/
  imperfect/rng.ts
  imperfect/delay-queue.ts
  imperfect/altitude-error.ts
  imperfect/unable-speed.ts
src/scope/
  positions.ts
  ownership.ts          # extend T02-08
src/scenario/
  briefs/kdem.md
  data/kdem-positions.json
src/ui/
  score-panel.tsx
  debrief-export.tsx
  replay-ui.tsx
  brief-modal.tsx
  trainer-settings.tsx
```

---

## Ticket order

Implement **one ticket at a time**. Do not start downstream work “while you are here.”

| ID | Title | Pri | Size | Depends on | Blocks |
| --- | --- | --- | --- | --- | --- |
| [T05-01](tickets/T05-01-session-scoring-model.md) | Session scoring model | P0 | L | phase 3+4 exit | T05-02, T05-03, T05-04 |
| [T05-02](tickets/T05-02-live-score-panel.md) | Live score panel | P0 | M | T05-01 | T05-11, T05-12 |
| [T05-03](tickets/T05-03-debrief-report-export-json.md) | Debrief report export JSON | P0 | M | T05-01 | T05-12 |
| [T05-04](tickets/T05-04-phraseology-checker-from-ir.md) | Phraseology checker from IR | P0 | L | T05-01 | T05-12 |
| [T05-05](tickets/T05-05-imperfect-pilot-delays-and-errors.md) | Imperfect pilot delays and errors | P0 | L | none (pilot) | T05-06, T05-11 |
| [T05-06](tickets/T05-06-unable-responses.md) | Unable responses | P0 | M | T05-05 | T05-12 |
| [T05-07](tickets/T05-07-replay-recorder.md) | Replay recorder | P0 | L | none (`World` + log) | T05-08 |
| [T05-08](tickets/T05-08-replay-player.md) | Replay player | P0 | L | T05-07 | T05-12 |
| [T05-09](tickets/T05-09-second-position-stub-and-handoff.md) | Second position stub and handoff | P0 | L | T02-08 | T05-11, T05-12 |
| [T05-10](tickets/T05-10-scenario-brief-markdown-kdem.md) | Scenario brief markdown for KDEM | P0 | S | none | T05-12 |
| [T05-11](tickets/T05-11-accessibility-and-trainer-settings.md) | Accessibility and trainer settings | P0 | M | T05-02, T05-05, T05-09 | T05-12 |
| [T05-12](tickets/T05-12-phase-5-training-acceptance-script.md) | Phase 5 training acceptance script | P0 | M | all P0 above | phase exit |

**Parallelism:** After T05-01, T05-02 ∥ T05-03 ∥ T05-04. T05-05 ∥ T05-07 ∥ T05-09 ∥ T05-10 can start immediately (phase 4 World). T05-06 after T05-05. T05-08 after T05-07. T05-11 after panel + imperfect + positions. T05-12 last.

Efficiency P1 lives **inside T05-01** (marked P1 ACs). Split view P1 lives **inside T05-09**. Neither is required to exit.

Recommended solo-agent sequence:

`01 → 04 → 02 → 03 → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12`

---

## Phase exit checklist

Do not call this product a trainer until every box is true. Efficiency and split view may stay unchecked.

- [ ] `scoreSession` is DOM-free, deterministic, covered by Vitest (CA episode, phraseology deduct, blocked-radio deduct).
- [ ] Live panel shows an integer practice score and the required non-certification label. Disclaimer still visible.
- [ ] Debrief JSON downloads with `scoreKind: "practice"`, T00-01 disclaimer, components, deductions.
- [ ] Phraseology checker: typed `DAL123 H270` canonical; spoken path A canonical; path B or token-in-voice nonstandard; two headings in one command disallowed.
- [ ] Imperfect default **off**: delayed/wrong readbacks do not occur.
- [ ] Imperfect **on**: readback delay in 2–8 s sim; seeded wrong altitude digit mutates intent + logs incorrect; replay with same seed matches (tested with recorder/player or a unit-level RNG test).
- [ ] Impossible speed on loc/GS (> 180) → `unable` readback, no speed intent change, `pilot.unable`.
- [ ] Replay JSON round-trips World + events; player pauses; inspect shows aircraft at a seek time.
- [ ] Two positions, polygons on map, F6 toggles APP/FIN color **and** a non-color `APP`/`FIN` label; `handoff.position` logged. No WebSocket.
- [ ] KDEM brief markdown shown before or at session start; includes disclaimer; no certification claim.
- [ ] Trainer settings persist imperfect + positions + a11y; color is not the only ownership cue; `aria-live` on readback/score.
- [ ] T05-12 script executed (automated items green; Manual ACs reported).
- [ ] `npm test` green. No LMS, no multiplayer server, no VATSIM, no “FAA certified” anywhere in `src/` or `src/scenario/briefs/`.

**Not required to exit:** efficiency extra-miles, split-view second canvas, MSAW in the numeric total, live multiplayer, LMS upload.

---

## Out of scope (this phase)

- Live multiplayer server, rooms, lockstep netcode, VATSIM, CRC as a network client.
- LMS (SCORM/xAPI), gradebooks, user accounts, cloud score upload.
- Certification language, FAA device qualification paperwork, “this counts as radar time.”
- LLM phraseology judge, LLM imperfect pilots, free-form chat.
- Replacing T04-09 CA with a different separation algorithm.
- Full NAS handoff (scratchpad, frequency, automated point-out, third facility).
- Weather, tower cab, dual-runway CRDA.
- Editing `phases/_shared/*` except the **implementation PR** for T05-01 architecture row (and only that row).

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Scoring CA per tick → score instantly 0 | Episode grouping in T05-01 tests |
| LLM “improves” phraseology | Ticket out of scope; checker is tables + parser |
| Imperfect on by default surprises playtesters | Default false; settings + brief |
| Wrong altitude without logging | `pilot.readback.incorrect` required before UI ships |
| Replay drift vs snapshots | Reset to snapshot, then step; test heading |
| Color-only handoff fails a11y | Strip/datablock `APP`/`FIN` text in T05-09/11 |
| “Grade” copy sneaks in | Ban list + T05-12 grep |
| F3 vs F6 confusion | Help overlay line in T05-09; F3 still initiate |

---

## How to launch an agent

1. Confirm phase 3 **and** phase 4 README **Phase exit** checklists are green.
2. Paste [`AGENT.md`](AGENT.md) as the implementation prompt, **or** paste a single `tickets/T05-xx-*.md` and say: implement only this ticket, stop when ACs are checked.
3. Do not implement efficiency or split view unless the ticket’s P1 ACs are in scope for that run.
4. Stop when the phase exit checklist is green. There is no phase 6 in this folder.

Ticket IDs are stable. Do not renumber. If you must extend, add `T05-13` at the end.
