# Phase 3 — Voice loop

PTT clip in, spoken command out the same `Command` IR as the typed line, then a synthesized pilot readback through a Web Audio radio chain.

This phase does **not** change kinematics, the pilot validator, or the scope. It adds a capture → `SpeechPort.transcribe` → parser → existing pilot apply → `SpeechPort.synthesize` → radio FX path. Phase 1’s text command line stays the source of truth for “did the airplane do the right thing.” Voice is another front-end onto that loop.

**Depends on:** Phase 1 exit (typed command → readback → aircraft turns). Phase 2 (scope) is preferred so PTT and the PPI coexist, but SpeechPort is isolated — this phase may overlap the tail of phase 2.

**Does not depend on:** Phase 4 procedures, phase 5 scoring.

---

## 1. What “done” means

A controller holds a configurable PTT key, speaks FAA-style phraseology, releases the key, and:

1. The mic clip is captured in-tab (AudioWorklet → PCM16 mono 16 kHz).
2. The active `SpeechPort` returns a `Transcript`.
3. A **spoken English grammar** (path A) compiles that text to `Command` with `source: "voice"`.
4. The **same** pilot agent as phase 1 validates, emits a readback string, and applies intent.
5. TTS PCM plays through a Web Audio graph (bandpass + light noise + compressor).
6. Two wall-clock numbers are logged: **PTT-up → transcript** and **PTT-up → audio-start**.

With the **http → our speech-api** path, PTT-up → audio-start **p50 < 1.5 s** is the quality target (localhost or LAN). **Web Speech is opt-in only** (browser vendor may transcribe in the cloud) and **must not fail the phase**.

---

## 2. Contracts (read before any ticket)

| File | Why it matters here |
| --- | --- |
| [`../_shared/speech-port.md`](../_shared/speech-port.md) | `SpeechPort`, `AudioClip`, `Transcript`; adapter order; client wiring; non-negotiables |
| [`../_shared/command-ir.md`](../_shared/command-ir.md) | Frozen `Command` / `Instruction`; `source: "text" \| "voice"`; validation stays in the pilot |
| [`../_shared/architecture.md`](../_shared/architecture.md) | `src/speech` owns adapters/capture/graph; parser is DOM-free; 1.5 s p50 target |
| [`../_shared/glossary.md`](../_shared/glossary.md) | PTT, SpeechPort, Command IR, readback — do not invent synonyms |
| [`../_shared/non-goals.md`](../_shared/non-goals.md) | No always-on listen, no paid STT/TTS vendors, no LLM executor |
| [`../_shared/ticket-template.md`](../_shared/ticket-template.md) | Ticket shape |

If a ticket and a shared file disagree, **the shared file wins**. If this README and a ticket disagree, **this README wins** (then fix the ticket).

---

## 3. Voice-loop architecture

```
PTT key-down
    │
    ▼
getUserMedia + AudioWorklet capture          [T03-01]
    │  (blocked if readback is playing — no barge-in)
    ▼
PTT key-up → AudioClip (pcm16, 16 kHz, mono)
    │
    ▼
SpeechPort.transcribe(clip)                  [T03-05 → speech-api T03-13; optional 04/11]
    │
    ▼
Transcript { text, confidence, latencyMs }
    │
    ├─ confidence < threshold (default 0.55) → status “say again”; stop
    │
    ▼
Spoken normalizer (homophones, ICAO digits, fillers)
    │
    ▼
Path A: spoken grammar → Command IR          [T03-03]   PRIMARY
    │  (if A fails, optional Path B: fuzzy-map to typed tokens → phase 1 tokenizer)
    │
    ▼
Command { source: "voice", sourceText, callsign, instructions[] }
    │
    ▼
Existing pilot agent (validate → readback string → intent)
    │
    ├─ reject → status / error readback; no kinematics change
    │
    ▼
SpeechPort.synthesize(readback, voiceId)     [T03-05 primary PCM]
    │
    ▼
Web Audio: decode PCM → radio FX → play     [T03-06, T03-07]
    │
    ▼
Latency overlay: t_transcript, t_audio_start [T03-09]
```

### 3.1 Same parser as text — what that actually means

The pilot, kinematics, and `Command` type **do not fork**. There is one `parseCommand(input, source)` (or equivalent) in `src/parse`.

- **Typed** input uses the phase 1 tokenizer (`H270`, `D30`, …).
- **Voice** input uses the spoken grammar (path A) first.
- Both emit the same `Command`. The only difference the rest of the app is allowed to see is `Command.source` and `Command.sourceText`.

The parser **must not** import `src/speech`. Speech **must not** construct `Instruction` objects itself — it only hands strings to parse.

### 3.2 Path A vs path B (phraseology)

After ASR, English radio speech is not vice-style tokens. Two strategies are documented; **tickets implement A as primary**.

| | Path A — spoken grammar → IR | Path B — fuzzy-map to typed tokens |
| --- | --- | --- |
| **Idea** | Parse spoken 7110.65-ish English directly into `Instruction[]` | Rewrite ASR text into phase 1 tokens (`L270`, `D30`) then reuse the typed tokenizer |
| **Example** | `"turn left heading two seven zero"` → `FLY_HEADING 270 LEFT` | same string → `"L270"` → typed parser |
| **Callsign** | `"Delta one two three"` → `DAL123` via telephony table | `"Delta one two three"` → `"DAL123 "` prefix then tokens |
| **Strength** | Multi-instruction utterances; no lossy squeeze through `H`/`D`/`S` shorthand | Reuses battle-tested typed parser; good salvage when A fails on a fragment |
| **Weakness** | Must own number/callsign grammar | Combined instructions and callsigns get brittle; `D30` cannot express “three thousand five hundred” without extending typed tokens |

**Primary (tickets):** Path A. Path B is a **fallback inside `src/parse`** after A returns a parse miss — not a second voice loop, not a second SpeechPort.

**Do not** teach the typed tokenizer to accept “heading two seven zero” as a first-class typed command. Keep the keyboard language and the radio language as two front-ends.

### 3.3 Light normalizer (runs before A, and before B if A misses)

Deterministic, no ML. Apply in order:

1. Lowercase, collapse whitespace, strip punctuation except hyphens inside callsigns if any.
2. Drop fillers: `uh`, `um`, `er`, `ah`, `please`, `now`, `for me`.
3. ICAO digit words → canonical: `niner`→`nine`, `tree`→`three`, `fife`→`five`, `oh`/`owe`→`zero` (only in digit context).
4. Homophones in **number slots only** (not in “descend **to**” — that `to` is a preposition): `to`/`too`/`two` → `two` when the next tokens are digits or number-words; `for`/`four` similarly; `ate`→`eight`.
5. Collapse `and maintain` so the altitude verb parser sees a stable phrase.

The normalizer returns a canonical spoken string. It does **not** emit `Command`. Grammar tests should include both raw-ish ASR strings and already-normalized strings.

---

## 4. Spoken grammar (path A) — v1 coverage

Align with frozen `Instruction` types in `command-ir.md`. Anything not in that union is a parse miss (status line, no intent change).

### 4.1 Callsign

```
Callsign := Telephony FlightNumber
          | "november" TailChars
          | SpokenIcao  (delta alpha lima one two three)
```

- **Telephony table** (data, not code): `Delta`→`DAL`, `American`→`AAL`, `United`→`UAL`, `Southwest`→`SWA`, `JetBlue`→`JBU`, `Alaska`→`ASA`, `Frontier`→`FFT`, `Spirit`→`NKS`, `FedEx`→`FDX`, `UPS`→`UPS`. Ship ~10–20 rows as JSON under `src/parse` or `src/scenario`. Unknown telephony → parse miss with reason `unknown_telephony`, not a guessed ICAO.
- **Flight number:** digit-by-digit required (`one two three` → `123`). Grouped forms (`twelve`, `twenty three`) are best-effort, not phase-exit blockers.
- **Selected track:** if the parser receives a selected callsign from the session (phase 1/2 selection) and the utterance has **no** callsign, attach the selected track’s callsign — same rule as typed. If neither selected nor spoken → reject.
- Ambiguous numeric suffix (`123` matches two strips) is **pilot** validation, not the grammar.

### 4.2 Numbers

| Role | Spoken form | Value |
| --- | --- | --- |
| Heading | three digits, each spoken | `two seven zero` → `270`; `three six zero` → `0` (normalize 360) |
| Altitude | thousands / thousand+hundred | `three thousand` → `3000`; `three thousand five hundred` → `3500`; `one one thousand` → `11000`; `one zero thousand` → `10000` |
| Speed | three digits | `two one zero` → `210` |
| Turn degrees | number + `degrees` | `twenty degrees` / `two zero degrees` → `20` |

Out-of-range and non-100 ft altitudes are parsed if grammatically valid, then **rejected by the pilot** (existing rules). The grammar does not silently clamp.

### 4.3 Instruction phrases (7110.65-shaped)

Worked examples the tickets **must** parse (after normalizer):

**Example 1 — altitude (JO 7110.65 climb/descend and maintain)**

> “Delta one two three descend and maintain three thousand”

```
Command.source = "voice"
Command.callsign = "DAL123"
Command.sourceText = <transcript.text>
Command.instructions = [
  { type: "ALTITUDE", altitudeFt: 3000, verb: "DESCEND" }
]
```

**Example 2 — heading with turn direction**

> “turn left heading two seven zero”

```
instructions = [
  { type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" }
]
```

Callsign from selection if omitted.

**Combined utterance (required, not extra credit)**

> “Delta one two three turn left heading two seven zero descend and maintain three thousand”

Two instructions, callsign once. Readback templates (phase 1) already join with a comma.

### 4.4 Phrase → IR map (v1)

| Spoken (canonical) | IR |
| --- | --- |
| `turn left heading {ddd}` | `FLY_HEADING` + `LEFT` |
| `turn right heading {ddd}` | `FLY_HEADING` + `RIGHT` |
| `fly heading {ddd}` | `FLY_HEADING` + `SHORTEST` |
| `continue present heading` | `PRESENT_HEADING` |
| `turn left {n} degrees` / `turn right {n} degrees` | `TURN_DEGREES` |
| `descend and maintain {alt}` / `descend {alt}` | `ALTITUDE` `DESCEND` |
| `climb and maintain {alt}` / `climb {alt}` | `ALTITUDE` `CLIMB` |
| `maintain {alt}` (altitude context) | `ALTITUDE` `MAINTAIN` |
| `expedite` adjacent to climb/descend | `expedite: true` on that `ALTITUDE` |
| `maintain {spd} knots` | `SPEED` `MAINTAIN` |
| `reduce speed to {spd}` / `slow to {spd}` | `SPEED` `REDUCE` |
| `increase speed to {spd}` | `SPEED` `INCREASE` |
| `proceed direct {fix}` | `DIRECT` |
| `ident` / `squawk ident` | `IDENT` |
| `say heading` | `SAY_HEADING` |
| `say altitude` | `SAY_ALTITUDE` |
| `cleared ils {rwy}` / `cleared ils runway {rwy} approach` | `CLEARED_APPROACH` (phase 1 may no-op fly-through) |

`EXPECT_APPROACH` may wait for a later phrase; do not invent it without a ticket.

### 4.5 Path B fallback (implement, do not lead with)

If A fails, try a conservative rewrite:

| Spoken fragment | Typed token |
| --- | --- |
| `heading {d d d}` / `fly heading {ddd}` | `H{ddd}` |
| `turn left heading {ddd}` | `L{ddd}` |
| `turn right heading {ddd}` | `R{ddd}` |
| `turn left {n} degrees` | `T{n}L` |
| `descend … {thousands}` | `D{fl}` where `D30` = 3000 ft (phase 1 convention) |
| `climb …` | `C{fl}` |
| `maintain {thousands}` altitude | `A{fl}` |
| `… {spd} knots` / `speed {spd}` | `S{spd}` |
| `ident` | `I` |
| `present heading` | `PH` |

If B also fails → `command.rejected` / parse-miss UX (T03-08). Never send a half-mapped token list that could move the wrong airplane.

---

## 5. SpeechPort implementations

From `speech-port.md`. Do not import vendor SDKs outside `src/speech/`.

| `id` | Phase 3 role | Clip in? | PCM out for radio FX? | Required to exit? |
| --- | --- | --- | --- | --- |
| `null` | Already exists (phase 0). `transcribe` throws; `synthesize` silence | n/a | silence | App must still boot |
| `http` | **Default.** POST clip/text to **our** `speech-api` (HF weights, local inference) | Yes | Yes | **Yes** (happy path + metrics) |
| `web-speech` | Opt-in prototype. May send audio to the **browser vendor** | Live mic during PTT | **No** — `speechSynthesis` black box | **No** |
| `whisper-wasm` | Optional spike (T03-11, P2) | Yes | STT only; TTS from `http` | **No** |

### 5.1 Live vs clip STT (do not paper over this)

`SpeechPort.transcribe(audio: AudioClip)` is clip-based. **Web Speech API does not consume a PCM clip.** Phase 3 may add **optional** methods on the port, implemented as no-ops on clip adapters:

```ts
beginUtterance?(): void;
endUtterance?(): Promise<Transcript | null>;
```

Coordinator rules:

- **Always** capture an `AudioClip` on PTT-up (debug, metrics, http, whisper-wasm).
- **http / whisper-wasm / null:** `transcribe(clip)` only. Ignore live methods.
- **web-speech:** call `beginUtterance()` on PTT-down (starts `SpeechRecognition`), on PTT-up stop recognition and resolve `endUtterance()` or `transcribe(clip)` that **returns the live result and may ignore PCM**.

Do not change `_shared/speech-port.md` in this phase unless a later freeze ticket says so. Keep the extension local and documented in T03-04.

### 5.2 http adapter = our speech-api only

Env (document in settings):

- `VITE_STT_URL` default `http://127.0.0.1:8090/stt`
- `VITE_TTS_URL` default `http://127.0.0.1:8090/tts`
- Optional local shared-secret header — **not** a vendor API key.

Suggested STT: `POST` `audio/wav` → JSON `{ "text": string, "confidence"?: number }`. Missing confidence → `1.0`.

Suggested TTS: `POST` JSON `{ "text", "voiceId" }` → `audio/wav`.

The process behind those URLs is **T03-13 `speech-api/`**: Hub weights on disk, inference on our CPU/GPU. **Do not** point this adapter at OpenAI, Deepgram, Groq, Hugging Face Inference API, Workers AI, or any metered ASR/TTS. Do not add a first-class vendor port.

### 5.3 Concurrent transcribe

`transcribe` must not be called while another `transcribe` is in flight for the same session (`speech-port.md`). Combined with **no barge-in**, this is automatic if PTT is ignored during capture+STT+playback. Still assert it in the coordinator.

---

## 6. Capture, PTT, permissions

### 6.1 Capture graph (T03-01)

1. Secure context (localhost or HTTPS) required; otherwise status, no throw through the sim tick.
2. On first PTT (or when the user enables voice in settings): `getUserMedia({ audio: { echoCancellation, noiseSuppression, autoGainControl } })`. Prefer echoCancellation **on** so speaker readback does not dump into the next clip if the user keys early.
3. AudioWorklet processor copies input floats into a ring buffer (or posts frames). Main thread owns PTT gating: only **record** while PTT is down.
4. PTT-up: concatenate, downsample/resample to **16 kHz mono PCM16**, build `AudioClip`.
5. Empty clip (keydown+keyup with no samples, or < 80 ms) → do not call `transcribe`; status “no audio”; not a parser reject.

### 6.2 PTT key

- **Default:** backtick `` ` `` (speech-port also allows Caps Lock; **do not default Caps Lock** — it is a lock-state key and fights OS/scope). Caps Lock may be offered as a bind.
- **Configurable** in settings (T03-10). Persist in the same storage phase 0/2 used for UI prefs.
- Window-level listener when the command line / any text field is **not** focused. If an `<input>` / `<textarea>` / contenteditable is focused, the PTT bind is ignored so the user can type `` ` `` and callsigns.
- Phase 2 CRC-like scope keys: PTT must not steal `F`/`R`/range keys. Document the default in settings UI.

### 6.3 Barge-in: none — **ignore PTT while readback is playing**

Pick is **ignore**, not queue.

| User action | Behavior |
| --- | --- |
| PTT while capture already active | Impossible (same key) / ignore repeats |
| PTT-down while STT/parse/pilot in flight | Ignore; optional status `working` |
| PTT-down **while readback audio is playing** | **Ignore.** Do not start capture. Do not queue a clip. Show radio-busy / “standby” |
| PTT-down after playback ends | Normal capture |

**Why not queue:** a delayed transmit after the airplane has already started turning surprises the controller and is easy to apply to the wrong traffic. Radio-busy is the honest model.

T03-01 exposes `setTransmitLocked(boolean)`. T03-06 sets it true from play-start to `ended` (plus a short tail, ~50 ms, so compressor release is not clipped into the next PTT).

---

## 7. Playback and radio FX

### 7.1 Readback player (T03-06)

- Input: `AudioClip` from `synthesize`, or a “no PCM” path for `web-speech` that calls `speechSynthesis.speak` and **does not** claim radio FX.
- Play via `AudioBufferSourceNode` into the radio graph (T03-07).
- `audio-start` timestamp: `AudioContext.currentTime` mapped to `performance.now()` when the source starts (or `onstart` for speechSynthesis). This is the second latency number.
- One readback at a time. If a new accepted command somehow arrives while playing (should not, given PTT lock), do not overlap — the lock exists to prevent this.

### 7.2 Radio graph (T03-07)

Clip adapters only (`http`, and whisper if it returns TTS PCM; not `speechSynthesis`):

```
AudioBufferSource
    → BiquadFilter (bandpass, ~300–3000 Hz or highpass+lowpass pair)
    → Gain (voice)
    → (mix) Gain-scaled BufferSource or AudioWorklet of light noise
    → DynamicsCompressor
    → destination
```

Keep parameters as named constants (not magic numbers scattered). v1 is “sounds like a radio,” not a physics-accurate transceiver. Do not use `speechSynthesis` in this graph — it cannot be filtered.

---

## 8. Errors and low confidence (never throw through the tick)

All of these land in the **readback/status line** (and session event log). The sim keeps running.

| Condition | UX | Aircraft |
| --- | --- | --- |
| Mic permission denied / dismissed | “Microphone blocked” + how to re-enable | No change |
| No secure context | “Voice needs HTTPS or localhost” | No change |
| Capture/Worklet failure | “Mic capture failed” | No change |
| Empty / too-short clip | “No audio” | No change |
| STT timeout / HTTP 4xx/5xx / network | “Radio failed” / “say again” | No change |
| `null` port transcribe throw | Caught; “Voice backend unavailable” | No change |
| `confidence < threshold` (default **0.55**) | “Say again” (low confidence) | No parse, no change |
| Spoken grammar miss (A and B) | “Unable to parse” + keep `sourceText` in log | No change |
| Pilot reject (ambiguous callsign, bad altitude, …) | Existing phase 1 error readback | No change |
| TTS failure after accepted command | Intent **already applied**; status “readback audio failed”; still log `t_transcript` | Intent changed (same as a missed radio after the pilot heard you — document this) |

Do not retry STT automatically. Do not pop `alert()`.

---

## 9. Latency metrics

Wall clock only (`performance.now()`). Sim time is the wrong clock (`glossary.md`).

| Metric | t0 | t1 |
| --- | --- | --- |
| `ptt_up_to_transcript_ms` | PTT key-up | `transcribe` / live STT promise resolves |
| `ptt_up_to_audio_start_ms` | PTT key-up | first audible readback start (Web Audio source start or `speechSynthesis.onstart`) |

Log both on the session event log every utterance (success or fail; use `null` for audio-start if TTS never started). Overlay (T03-09) shows last utterance + session **p50** for the http backend.

**Target:** our `speech-api` (localhost/LAN), p50(`ptt_up_to_audio_start_ms`) **< 1500**. Measured in T03-12. Web Speech p50 is irrelevant to exit.

`Transcript.latencyMs` is the adapter’s own STT timing (may be a subset of PTT-up → transcript). Record both; do not replace coordinator metrics with adapter-only numbers.

---

## 10. Settings (T03-10)

Minimum:

- Speech backend: `null` | `web-speech` | `http` | `whisper-wasm` (last only if the spike shipped).
- PTT key bind.
- Confidence threshold (default 0.55).
- STT/TTS URLs if `http` (may be env-only; if env-only, settings shows read-only “configured / missing”).
- TTS `voiceId` string.
- Latency overlay toggle.
- Radio FX on/off (dry PCM vs graph) — useful for debugging TTS.

Switching backend mid-session: tear down live recognition, do not leak `MediaStream`. Next PTT uses the new port. Do not hot-swap mid-`transcribe`.

**Default for quality:** `http` when URLs are present; otherwise `web-speech` if the browser supports it; else `null` with a visible “voice disabled” hint. Boot must never crash on missing URLs.

---

## 11. Suggested layout

Phase 0 may have used `src/` folders or packages; stick to that. Suggested files (tickets repeat these):

```
src/speech/
  voice-loop.ts              # coordinator (T03-02)
  metrics.ts                 # PTT-up marks (T03-09)
  capture/ptt-controller.ts  # T03-01
  capture/pcm-worklet.ts
  capture/resample.ts
  playback/readback-player.ts # T03-06
  playback/radio-graph.ts     # T03-07
  ports/web-speech-port.ts    # T03-04
  ports/http-speech-port.ts   # T03-05
  ports/whisper-wasm-port.ts  # T03-11 optional
src/parse/
  spoken/normalizer.ts        # T03-03
  spoken/grammar.ts
  spoken/numbers.ts
  spoken/telephony.ts
  spoken/typed-fuzzy.ts       # path B
src/ui/
  voice-status.ts             # T03-08
  latency-overlay.ts          # T03-09
  settings-speech.ts          # T03-10
```

`src/core` keeps `Command` types. `src/pilot` is unchanged except it already honors `Command.source` for logs.

---

## 12. Ticket order

Implement **one ticket at a time**. Do not start a ticket’s downstream work “while you are here.”

```
T03-01 Capture AudioWorklet PTT          P0
T03-03 Spoken phraseology grammar        P0   (parallel with 01; no audio needed)
        ↘
T03-02 Transcript → parser plumbing      P0   needs 01 + 03
        ↘
T03-08 Low confidence and error UX       P0   needs 02
T03-04 Web Speech adapter                P1   needs 01; OPT-IN ONLY; not default
T03-13 Self-hosted speech-api            P0   HF weights, local inference
T03-05 HTTP STT/TTS adapter              P0   needs 01 + 13; talks ONLY to speech-api
        ↘
T03-06 Readback TTS playback             P0   needs 02 + (04 or 05; prefer 05 for PCM)
T03-07 Radio FX graph                    P1   needs 06
T03-09 Latency metrics overlay           P1   needs 02 + 06
T03-10 Settings speech backend switch    P1   needs 04 + 05
T03-11 Optional whisper-wasm spike       P2   needs 01; MAY DEFER; not on exit path
T03-12 Phase 3 voice acceptance script   P0   needs all P0/P1 except 11; speech-api up
```

Recommended solo-agent sequence:

`01 → 03 → 02 → 08 → 13 → 05 → 06 → 07 → 09 → 10 → 12`

(`04` optional / later). Skip `11` unless explicitly asked.

---

## 13. Phase exit checklist

Do not start phase 5 until this is green. Phase 4 does not need this.

- [ ] **E1 —** PTT down/up captures a clip via AudioWorklet; permission denial never kills the sim tick.
- [ ] **E2 —** Spoken examples parse to the IR in §4.3 (unit tests, DOM-free).
- [ ] **E3 —** Voice path sets `Command.source === "voice"` and the aircraft turns / changes altitude the same as the equivalent typed command.
- [ ] **E4 —** `http` adapter transcribes a clip and synthesizes PCM (mocked in CI; real URLs in the manual script).
- [ ] **E5 —** Accepted command plays a readback; PTT during playback is ignored (no barge-in, no queue).
- [ ] **E6 —** Radio FX graph is in the http/PCM path (bandpass + light noise + compressor).
- [ ] **E7 —** Low confidence, parse miss, mic deny, and STT failure show status text; no uncaught exception in the tick.
- [ ] **E8 —** Overlay or log shows `ptt_up_to_transcript_ms` and `ptt_up_to_audio_start_ms` every utterance.
- [ ] **E9 —** Settings can switch `null` / `web-speech` / `http` without reload crash.
- [ ] **E10 —** T03-12 acceptance script executed; **speech-api + http** p50 audio-start recorded. If p50 ≥ 1.5 s on localhost/LAN, document the number and remaining bottleneck — still ship the loop; file a follow-up rather than silently skipping metrics.
- [ ] **E11 —** Web Speech may be inaccurate or unsupported; that is **not** an exit failure if http (or a recorded manual http run) worked.
- [ ] **E12 —** `whisper-wasm` absent or incomplete is **not** an exit failure.
- [ ] **E13 —** Typed command line still works; phase 1 tests still pass.
- [ ] **E14 —** No LLM, no always-on listen, no paid vendor STT/TTS (OpenAI/Deepgram/Groq/HF Inference/etc.), inference only on `speech-api` or optional wasm.

---

## 14. Out of scope (this phase)

- Fine-tuning or training any ASR/TTS model in this repo (`non-goals.md`).
- Always-on / full-duplex listen; VAD-triggered transmit; hotword.
- LLM NLU, “just chat with the pilot,” or replacing the grammar with a model.
- **Paid / metered third-party STT or TTS** (OpenAI, Deepgram, Groq, ElevenLabs, Google Cloud Speech, HF Inference API/Endpoints, Workers AI, …).
- Making Web Speech the default or as accurate as speech-api.
- Queueing PTT clips.

---

## 15. Risks

| Risk | Mitigation |
| --- | --- |
| ASR drops “niner” / “tree” | Normalizer aliases; grammar accepts `nine`/`three` |
| ASR inserts “to” before headings | Number-slot homophone rules; tests for “heading to two seven zero” |
| Web Speech ignores the clip | Live `beginUtterance` extension; http remains the quality path |
| TTS slow → miss 1.5 s | Measure; overlay; do not block exit on a single slow region — document |
| PTT vs command-line backtick | Ignore PTT when a text field is focused |
| Intent applied but TTS fails | Documented in §8; still a successful clearance |

---

## 16. How to launch an agent

1. Paste [`AGENT.md`](AGENT.md) as the prompt.
2. Or paste a single `tickets/T03-xx-*.md` and say: implement only this ticket, stop when ACs are checked.
3. Do not implement T03-11 unless the user asks.
