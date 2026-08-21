# T03-06 Readback TTS playback

**Phase:** 03 Voice
**Priority:** P0
**Size:** M
**Depends on:** T03-02, T03-05 (PCM). T03-04 optional for browser-speak branch.
**Blocks:** T03-07, T03-09, T03-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

After the pilot returns a readback string, the active port’s `synthesize` PCM plays through Web Audio. PTT is **ignored** for the whole playback (no barge-in, no queue). `audio-start` is timestamped for metrics.

## Context

`phases/_shared/speech-port.md`: synthesize → Web Audio graph; play; do not use `speechSynthesis` if you need radio FX. Phase README §6.3 and §7.1: **ignore PTT while playing**; lock via T03-01 `setTransmitLocked(true)` from play start until `ended` + ~50 ms.

Pilot templates already produce strings like `{callsign} heading two seven zero` (`command-ir.md`). This ticket does not change templates.

If T03-07 is not done, play **dry** (source → destination). T03-07 inserts the FX graph behind the same player.

## Scope

- After successful `dispatchCommand` / accepted command, take the readback string the pilot already exposes (phase 1 UI/status). Call `speechPort.synthesize(readback, voiceId)`.
- Decode `AudioClip` → `AudioBuffer` (pcm16 → float32) and start an `AudioBufferSourceNode`.
- On `start`: record `ptt_up_to_audio_start_ms` using the utterance `t0` from T03-02; call `setTransmitLocked(true)` if not already locked from PTT-up.
- On `ended` (plus 50 ms tail): `setTransmitLocked(false)`.
- If synthesize fails after intent was applied: status hook for T03-08 (“readback audio failed”); still leave intent applied; do not unlock before you are sure nothing is playing.
- `web-speech` branch: if T03-04 exported browser TTS, play that **instead of** an empty clip; `audio-start` from `speechSynthesis.onstart` or equivalent; still hold the PTT lock until `onend`.
- Do not overlap two readbacks.
- Use a shared `AudioContext` (resume on first PTT or first play — browsers start suspended).

## Out of scope

- Bandpass / noise / compressor (T03-07). Wire a `connect(node)` seam so FX can wrap the source later.
- Overlay drawing (T03-09) — emit a metric event / callback.
- Changing readback phraseology.
- Sidetone of the controller mic.
- Queueing commands that arrived during playback (they must not arrive if lock works).

## Implementation notes

- `src/speech/playback/readback-player.ts`.
- pcm16 → float: `s / 32768`.
- `audio-start` definition: the moment the source is started (`source.start()`) after `audioContext.resume()`, **not** after the user hears it through Bluetooth delay. For `speechSynthesis`, `onstart`.
- Lock timing: set locked **on PTT-down or PTT-up** (already in flight) **and** keep locked through playback. Simplest: lock on PTT-down, unlock only when playback ends **or** on empty-clip / STT-fail / parse-miss (no audio). If STT is slow, the user must not capture a second clip anyway (`speech-port.md` one transcribe in flight). Align with README: ignore PTT while STT/parse **or** playback — lock from PTT-down until idle.
- Idle = no in-flight transcribe and no playing source.
- Tests: player with a mocked `AudioContext` is hard; test pcm16-to-float and lock state machine in pure code (`ReadbackGate`: events `ptt-down`, `utterance-failed`, `play-ended` → locked boolean).

## Acceptance criteria

- [x] **AC1 —** Given an accepted voice command and a fake port `synthesize` that returns a non-silent clip, when the loop finishes apply, then playback is started (player invoked with that clip).
- [x] **AC2 —** Given playback in progress, when PTT-down occurs, then T03-01 lock prevents capture (no second clip / no queue).
- [x] **AC3 —** Given playback `ended`, then transmit lock clears and a later PTT can capture.
- [x] **AC4 —** Given `synthesize` rejects after accept, then intent remains applied and lock still returns to idle (no stuck PTT).
- [x] **AC5 —** An `audio-start` timestamp callback/event fires once per successful play start.
- [x] **AC6 —** Automated test exists for the lock/idle state machine and/or pcm16-to-float (happy path). AudioContext may be Manual.

## Test plan

- Unit: gate states (down → stt → play → end → idle); fail-after-accept unlocks; pcm16 conversion of `32767` / `-32768`.
- Integration: fake port + voice loop if easy.
- Manual: http backend, issue example 1, hear *some* audio (dry is OK), mash PTT during readback — no new capture; after silence, PTT works again.

## Suggested files

- `src/speech/playback/readback-player.ts`
- `src/speech/playback/pcm16-to-audio-buffer.ts`
- `src/speech/playback/transmit-gate.ts`
- `src/speech/playback/transmit-gate.test.ts`
- `src/speech/voice-loop.ts` (wire synthesize + play)
