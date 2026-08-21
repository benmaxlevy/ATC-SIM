# T03-09 Latency metrics overlay

**Phase:** 03 Voice
**Priority:** P1
**Size:** S
**Depends on:** T03-02, T03-06
**Blocks:** T03-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Every utterance logs **PTT-up → transcript** and **PTT-up → audio-start** in milliseconds. A small overlay (or the status area) shows the last values plus session p50. Wall clock only.

## Context

`phases/_shared/speech-port.md`: measure both; log both. `phases/_shared/architecture.md`: our speech-api target **< 1.5 s p50**. `phases/_shared/glossary.md`: wall clock is only for PTT/ASR latency; sim ms is the wrong clock.

Do **not** fail the phase on Web Speech quality or slowness. Overlay may color http p50 green `< 1500` / yellow `< 2500` / red otherwise — informational.

## Scope

- On PTT-up: `t0 = performance.now()`.
- On transcribe resolve (or fail): `ptt_up_to_transcript_ms = now - t0` (still log on fail).
- On readback audio-start: `ptt_up_to_audio_start_ms = now - t0`; `null` if TTS never started.
- Session event log payload every utterance.
- Overlay: last `transcript_ms`, last `audio_start_ms`, session p50 of **successful** audio-start samples, backend id (`http` / `web-speech` / …).
- Toggle-able (default on for this phase so T03-12 is easy; T03-10 may persist).
- p50: median of samples this session; min 1 sample to display; show `n=`.
- `Transcript.latencyMs` may be shown as STT-only subset; do not replace coordinator metrics with it.

## Out of scope

- Sending metrics to a cloud APM.
- Gating gameplay if p50 is slow.
- Sim-time clocks.
- Per-adapter histograms beyond session p50.
- Failing CI if a mock fetch is “slow.”

## Implementation notes

- `src/speech/metrics.ts`: `markPttUp()`, `markTranscript()`, `markAudioStart()`, `snapshot()`, `percentile50(values)`.
- Pure percentile function is the unit-test core (odd/even lengths).
- Overlay: `src/ui/latency-overlay.ts` (or a React component in the shell). Keep it out of the PPI canvas if possible (HTML overlay) so scope code stays clean.
- Do not log PTT keys or raw PCM.

## Acceptance criteria

- [ ] **AC1 —** Given a successful fake-port utterance with play start, then both metrics are finite numbers `>= 0` and `audio_start >= transcript` (allow equal if same tick).
- [ ] **AC2 —** Given STT failure, then `ptt_up_to_transcript_ms` is still logged and `ptt_up_to_audio_start_ms` is `null`.
- [ ] **AC3 —** Given an odd-length series of samples, then p50 is the middle value (unit test on the helper).
- [ ] **AC4 —** Overlay (when enabled) shows last transcript ms, last audio-start ms (or `—`), and p50.
- [ ] **AC5 —** Automated test exists for the percentile helper and/or metric snapshot (happy path).

## Test plan

- Unit: p50 `[1,3,2] → 2`; `[1,2,3,4] → 2.5` or `2` — pick inclusive median and document (recommend average of two middle for even, or lower-middle; **document one**).
- Integration: none.
- Manual: http PTT; read overlay; confirm event log lines.

## Suggested files

- `src/speech/metrics.ts`
- `src/speech/metrics.test.ts`
- `src/ui/latency-overlay.ts`
- `src/speech/voice-loop.ts` (marks)
