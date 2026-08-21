# T03-07 Radio FX graph

**Phase:** 03 Voice
**Priority:** P1
**Size:** M
**Depends on:** T03-06
**Blocks:** T03-12 (PCM path sound)
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

PCM readbacks from clip-based ports (`http`, later whisper-wasm TTS if any) play through a Web Audio graph: bandpass (or highpass+lowpass), light noise, compressor. `web-speech` / `speechSynthesis` stays unfiltered.

## Context

`phases/_shared/speech-port.md`: “phase 3 radio FX: bandpass + light noise + compressor.” Do not route `speechSynthesis` into this graph.

Phase README §7.2. v1 should sound like a radio, not a calibrated transceiver.

## Scope

- `createRadioGraph(ctx: AudioContext): RadioGraph` returning an input `AudioNode` (Gain or equivalent) and `connect(destination)`.
- Chain:
  1. Biquad bandpass **or** highpass (~300 Hz) + lowpass (~3000 Hz).
  2. Voice gain.
  3. Mix in low-level noise (looping `AudioBuffer` of weak white/pink noise, or a tiny worklet). Noise must not drown the readback.
  4. `DynamicsCompressorNode` (gentle: tame peaks after filter).
  5. Master gain → destination.
- Named constants for frequencies, noise gain, compressor threshold/ratio/attack/release.
- Dry bypass: `setFxEnabled(false)` connects source → destination (settings / debug; T03-10 may expose).
- T03-06 player connects `AudioBufferSourceNode` → graph input instead of destination.
- Do not apply FX to silence clips or to the browser TTS path.

## Out of scope

- Convolution IR of a real headset or GroundCom.
- Controller sidetone, roger beep, squelch tail (optional 50 ms lock tail already in T03-06).
- Per-airline voices or “bad radio” training (phase 5).
- Changing TTS text.
- 500 MB models.

## Implementation notes

- Noise buffer: generate once (e.g. 1 s white noise), loop, gain ≈ 0.02–0.05 vs voice ≈ 1.0 — tune by ear; keep numbers in constants.
- Start noise only while a readback plays (or keep it at 0 gain when idle) so the room is not hissing between calls.
- `AudioContext` sample rate may be 48 kHz; filters are in Hz — fine.
- Tests: graph factory returns nodes; `setFxEnabled` toggles; noise gain is finite. Do not snapshot audio in CI.

## Acceptance criteria

- [ ] **AC1 —** Given FX enabled and a PCM clip play, then the source is connected through a filter and a compressor before destination (inspectable via a test hook or documented node list).
- [ ] **AC2 —** Given FX disabled, then playback is dry (no obligatory noise).
- [ ] **AC3 —** Given `web-speech` browser TTS, then this graph is not required and must not throw if unused.
- [ ] **AC4 —** Noise is not audible at idle (gain 0 or node stopped) after play ends.
- [ ] **AC5 —** Automated test exists for factory/bypass (happy path). Listening is Manual.

## Test plan

- Unit: createRadioGraph with a mocked or real AudioContext in Vitest (if AudioContext exists in happy-dom/jsdom, skip gracefully); constants exported; bypass flag.
- Integration: none.
- Manual: http TTS dry vs FX — voice thinner, light hiss, no clipping slam. Toggle bypass.

## Suggested files

- `src/speech/playback/radio-graph.ts`
- `src/speech/playback/radio-graph.test.ts`
- `src/speech/playback/radio-fx-params.ts`
- `src/speech/playback/readback-player.ts` (connect into graph)
