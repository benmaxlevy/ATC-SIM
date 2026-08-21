# Phase 3 voice acceptance (T03-12)

Repeatable ~20-minute checklist for README **E1–E14**. Automated where honest (Vitest, no mic). Manual where audio, mic, or a live `speech-api` is required.

This file does **not** add features. It does **not** invent a 1.5 s p50. Measure in the table or leave cells blank / leftover. Path C off is **not** a fail.

## Explicit skips (not fail criteria)

| Skip | Exit item | Rule |
| --- | --- | --- |
| Web Speech transcript accuracy | **E11** | Wrong words or unsupported browser **must not** fail the run. Pass the web-speech step if PTT does not crash. |
| T03-11 `whisper-wasm` | **E12** | Absent or incomplete is **not** a fail. Do not implement T03-11 to satisfy this script. |
| Path C / `POST /parse` | **E14** | Off or absent is **not** a fail. Do not implement T03-14. |

## BLOCKED on http config (do not silently skip E4 / E10)

Live **E4** (real STT/TTS) and **E10** (p50 audio-start) need this repo’s `speech-api` on the http URLs (`VITE_STT_URL` / `VITE_TTS_URL`, default `http://127.0.0.1:8090/stt` and `…/tts`).

**Before the manual http steps**, probe:

```text
curl.exe -sS -m 5 http://127.0.0.1:8090/health
```

Expect JSON `{ "ok": true, ... }`. You may try `127.0.0.1:8090` if it is up.

| If | Then |
| --- | --- |
| URLs unset/empty in settings, **or** `/health` fails, times out, or returns non-JSON | Mark live **E4** and **E10** **BLOCKED on http config**. Do not fake p50 numbers. Do not silently skip those rows. CI mocks still cover adapter E4. |
| `/health` is ok | Continue manual steps 4–10. Fill the p50 table from the latency overlay. Target `< 1500` ms audio-start p50; if ≥ 1500, write the number and suspected bottleneck (STT, TTS, or play resume) and still mark E10 **measured**. |

### This environment (2026-08-21)

- Vite defaults still point at `http://127.0.0.1:8090/stt` and `…/tts` (URLs present, not cleared).
- TCP `127.0.0.1:8090` was **LISTEN**, but `GET /health` timed out (15 s, 0 bytes). Several `CLOSE_WAIT` sockets. Treat speech-api as **not serving**.
- Live **E4** / **E10**: **BLOCKED on http config**. p50 table left blank. No invented 1.5 s number.

Restart or run T03-13 `speech-api` until `/health` returns JSON, then re-run steps 4–10. Do not point HttpSpeechPort at OpenAI, Deepgram, Groq, ElevenLabs, or HF Inference.

---

## Automated (CI / this worktree)

Default path (includes grammar fixtures, voice-loop fake port, http mocks, metrics p50, factory default):

```text
npm test
```

Targeted slice (same glob as `npm test`; does not need a mic or speech-api):

```text
npx vitest run src/parse/spoken src/parse/parse.test.ts src/speech/voice-loop.test.ts src/speech/ports/http-speech-port.test.ts src/speech/metrics.test.ts src/speech/ports/factory.test.ts src/speech/voiceAcceptance.test.ts src/speech/playback/radio-graph.test.ts src/ui/latency-overlay.test.ts src/ui/settings-speech.test.ts src/ui/submitCommand.test.ts
```

Do not delete spoken fixtures. Grammar happy path for the two JO 7110.65-shaped strings (README §4.3 / T03-03) must stay in that default run:

1. `"Delta one two three descend and maintain three thousand"` → `DAL123` + `ALTITUDE DESCEND 3000`, `parseStage: "spoken_a"`.
2. `"turn left heading two seven zero"` + selected `DAL123` → `FLY_HEADING 270 LEFT`.

| Automated proof | Maps to |
| --- | --- |
| `src/parse/spoken/grammar.test.ts`, `src/parse/parse.test.ts`, `src/speech/voiceAcceptance.test.ts` | **E2**, fixtures |
| `src/speech/voice-loop.test.ts` (fake port → `source: "voice"`) | **E3**, **E5** (no barge-in / no queue) |
| `src/speech/ports/http-speech-port.test.ts` (mocked fetch) | **E4** CI only |
| `src/speech/playback/radio-graph.test.ts` (highpass + lowpass + noise + compressor) | **E6** graph wiring (not a listen) |
| `src/speech/voice-loop.test.ts`, `src/ui/voice-status.test.ts`, `src/app/create-app.test.ts` | **E7** |
| `src/speech/metrics.test.ts`, `src/ui/latency-overlay.test.ts` | **E8** |
| `src/speech/ports/factory.test.ts`, `src/ui/settings-speech.test.ts` | **E9** default `http`; switch ids |
| `src/ui/submitCommand.test.ts`, `src/parse/parse.test.ts` (`H270` typed; English → Path A) | **E13** |
| http-speech-port vendor grep; factory `whisper-wasm` → `null`; `pathC: false` does not fetch | **E11** skip, **E12** skip, **E14** |

---

## Setup (manual)

Phase 1 KDEM scenario. Spawn includes **`DAL123`** airborne (heading 100). Command line works. Overlay on (Voice settings → Latency overlay; default on). Backend **`http`**. Headphones recommended (`echoCancellation` on). Click the PPI (not the command line) so PTT is not ignored.

**T03-13 `speech-api` running** on `127.0.0.1:8090` with `/health` JSON. If that probe fails, stop the live http steps and mark **BLOCKED on http config** (see above). Typed commands and `npm test` still count.

Boot: `npm run dev` (Vite, localhost). Default PTT is backtick `` ` ``, not Caps Lock.

---

## Manual script (include verbatim)

Each step maps to exit items **E1–E14**.

1. **Typed regression (E13).** Type the equivalent of turn left heading 270. Aircraft turns. Text `source` remains text (log).
2. **Mic grant (E1).** PTT `` ` ``; browser permission allow; tab mic icon. Release; non-empty clip path (no crash).
3. **Mic deny (E1, E7).** Revoke permission, PTT; status microphone blocked; aircraft still moves on typed command; no exception in console from the tick.
4. **Phrase 1 (E2, E3, E5).** Select `DAL123` or speak the callsign. PTT: *“Delta one two three descend and maintain three thousand.”* Expect descend intent 3000 ft, readback audio, `Command.source === "voice"` in log.
5. **Phrase 2 (E2, E3).** PTT: *“turn left heading two seven zero.”* Expect heading 270 left turn (with selection if callsign omitted).
6. **Busy PTT (E5).** During readback, hold PTT and speak; **no** new command; radio-busy status; after audio ends, PTT works.
7. **Low confidence / parse (E7).** Whisper nonsense or set threshold to `1.0` temporarily; expect say-again; no intent change. Reset threshold to 0.55.
8. **Radio FX (E6).** Hear filtered voice + light noise on http PCM. Toggle dry if settings exist.
9. **Metrics (E8, E10).** Overlay shows last transcript ms and audio-start ms. Perform **≥ 7** good http utterances. Record p50 audio-start. Target `< 1500`. If ≥ 1500, write the number and suspected bottleneck (STT, TTS, or play resume) — still mark E10 as “measured.”
10. **Backend switch (E9).** Switch to `web-speech` if available; one PTT; may be wrong words — **pass if no crash**. Switch to `null`; PTT shows backend unavailable. Switch back to `http`.
11. **Web Speech quality (E11).** Do not fail the run on wrong transcript.
12. **whisper-wasm (E12).** Skip unless present.
13. **Non-goals (E14).** Confirm no OpenAI/Deepgram/HF Inference call in the voice path; no always-on recognition before PTT (DevTools / mic icon idle). `speech-api` is local.

### Operator notes for the verbatim steps

| Step | How to run here | Status line / log to watch |
| --- | --- | --- |
| 1 | Click command line. Type `DAL123 L270` (or English `turn left heading two seven zero` with `DAL123` selected). | Readback; `source: "text"`; `parseStage` `typed` for `L270` / `H270`, `spoken_a` for English. |
| 2 | Click PPI first so the command line is not focused. Hold backtick. | Tab mic indicator; no throw. |
| 3 | Site settings → Microphone → Block. PTT. Then type `DAL123 H270`. | `Microphone blocked — allow in browser settings`. Typed still turns. |
| 4–5 | Need live speech-api. If `/health` failed: **BLOCKED on http config**. | Voice `Command`; descend 3000 / heading 270 LEFT. |
| 6 | During TTS, PTT again. | `Radio busy — standby`; no second command. |
| 7 | Voice settings → Confidence `1.0`, one PTT, then reset `0.55`. Or speak garbage. | `Say again`; intent unchanged. |
| 8 | Voice settings → Radio FX on (default), then off (dry). | http PCM only. `speechSynthesis` is a black box — skip FX listen on web-speech. |
| 9 | Overlay id `voice-latency-overlay`: `http  STT …  AUD …  p50 … n=…` | Need **≥ 7** good http utterances. Blank table if **BLOCKED on http config**. |
| 10 | Voice → Backend: `web-speech` → one PTT; `null` → PTT; back to `http`. | Wrong Web Speech words = pass. `null` → `Voice backend unavailable`. |
| 11 | **Skip as fail criterion.** Record “not a fail.” | — |
| 12 | Settings has no whisper-wasm row. **Skip.** | — |
| 13 | DevTools Network: only `127.0.0.1:8090` (or LAN speech-api), never vendor ASR. Mic idle until PTT. | Path C off is not a fail. |

---

## E1–E14 run card

| Exit | Automated | Manual | This run |
| --- | --- | --- | --- |
| **E1** capture + mic deny does not kill tick | PTT controller + create-app | Steps 2–3 | Leftover (needs Chrome + mic) |
| **E2** §4.3 fixtures | grammar + parseCommand + `voiceAcceptance.test.ts` | Steps 4–5 live | Automated pass. Live phrases **BLOCKED on http config** |
| **E3** `source === "voice"` + same kinematics | voice-loop fake port | Steps 4–5 | Automated pass. Live **BLOCKED on http config** |
| **E4** http STT/TTS | mocked `http-speech-port` | Steps 4–5 real URLs | CI mock pass. Live **BLOCKED on http config** |
| **E5** readback + no barge-in | voice-loop lock tests | Steps 4, 6 | Automated pass. Live leftover |
| **E6** radio FX graph | radio-graph unit tests | Step 8 listen | Automated wiring pass. Listen leftover |
| **E7** status, no tick throw | voice-status + voice-loop | Steps 3, 7 | Automated pass. Live leftover |
| **E8** overlay / log both latencies | metrics + overlay format | Step 9 | Automated pass. Live leftover |
| **E9** backend switch | factory + settings | Step 10 | Automated pass. Live leftover |
| **E10** p50 audio-start recorded | — | Step 9, ≥ 7 http | **BLOCKED on http config** (table blank) |
| **E11** Web Speech quality | skip | Step 11 | **Skip** (not a fail) |
| **E12** whisper-wasm | factory maps to `null` | Step 12 | **Skip** (not a fail) |
| **E13** typed tokens + English Path A | parse + submitCommand | Step 1 | Automated pass. Live leftover |
| **E14** no always-on, no paid vendor, Path C off | vendor grep + pathC | Step 13 | Automated pass. Live leftover |

---

## p50 results (http audio-start)

Fill from the latency overlay after **≥ 7** good **http** utterances. Leave blank until measured. Do not copy a 1500 ms target into the cells.

| Date | Browser | Adapter | n | p50 transcript ms | p50 audio-start ms | Pass / fail notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-21 | — | http | — | — | — | **BLOCKED on http config.** `127.0.0.1:8090` LISTEN but `GET /health` timed out (0 bytes). No live utterances. No invented p50. |

Target (architecture / speech-port): p50(`ptt_up_to_audio_start_ms`) **< 1500** on localhost/LAN against **our** speech-api. If measured p50 ≥ 1500, keep the number, name STT vs TTS vs play resume, file a follow-up — still ship the loop.

---

## Checklist for the next operator

- [ ] `npm test` green (grammar fixtures still present).
- [ ] `GET http://127.0.0.1:8090/health` returns JSON — otherwise **BLOCKED on http config** for E4/E10.
- [ ] Manual steps 1–13 walked (skips E11/E12 as written).
- [ ] p50 table filled or explicitly leftover / blocked — never silently empty after a successful http run.
