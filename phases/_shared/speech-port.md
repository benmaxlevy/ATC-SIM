# SpeechPort

Speech is an **adapter**. The sim, parser, and pilot agent must compile and run with a `NullSpeechPort`.

Do not import vendor SDKs outside `speech/`. **Do not call paid third-party speech APIs.**

## Self-hosted (frozen)

Quality STT/TTS is **our** HTTP service (`speech-api/`). It loads open weights (typically from [Hugging Face Hub](https://huggingface.co/models) — e.g. Whisper / ATC-tuned Whisper, Piper) onto **our GPU or CPU** and serves them.

- Per-utterance inference happens **only** on that process (or in-tab `whisper-wasm`).
- Hugging Face Hub = **download weights once**. Not Hugging Face Inference API, Inference Endpoints, or any $/minute ASR.
- Banned at request time: OpenAI, Deepgram, AssemblyAI, Groq, ElevenLabs, Google Cloud Speech, Azure Speech, Amazon Transcribe/Polly, Cloudflare Workers AI as a product dependency, and any other metered STT/TTS.

The browser `HttpSpeechPort` POSTs only to `VITE_STT_URL` / `VITE_TTS_URL` (default `http://127.0.0.1:8090/...`). Those URLs must be **this repo’s API**, not a vendor.

Optional Path C is **`POST /parse` on the same origin** — not a `SpeechPort` method. See `parse-pipeline.md`. Same ban list: no paid LLM APIs.

## Interface

```ts
export interface SpeechPort {
  readonly id: string;

  /**
   * Transcribe a complete PTT clip (PCM16 mono 16 kHz recommended).
   * Must not be called while another transcribe() is in flight for the same session.
   */
  transcribe(audio: AudioClip): Promise<Transcript>;

  /** Synthesize a readback. Return PCM the client will play through Web Audio. */
  synthesize(text: string, voiceId: string): Promise<AudioClip>;
}

export interface AudioClip {
  sampleRate: number;
  channels: 1;
  pcm16: Int16Array;
}

export interface Transcript {
  text: string;
  /** 0–1. Below threshold (default 0.55) → reject, ask for repeat. */
  confidence: number;
  latencyMs: number;
}
```

## Implementations (order)

| Id | Phase | Notes |
| --- | --- | --- |
| `null` | 0 | `transcribe` throws; `synthesize` returns silence. App still boots. |
| `text-only` | 1 | Not a SpeechPort; the command line bypasses speech. |
| `http` | 3 | **Quality default.** POST clip/text to **our** `speech-api`. |
| `web-speech` | 3 optional | Browser `SpeechRecognition` / `speechSynthesis`. May send audio to the **browser vendor** (Chrome → Google). Not default; quality must not gate phase exit. |
| `whisper-wasm` | 3 optional | In-tab weights after a Hub download. Must not be required to pass phase 3. |

## Client wiring

1. Key-down (configurable, default `` ` ``): start capture via `getUserMedia` + AudioWorklet.
2. Key-up: stop, resample, `transcribe`.
3. `transcript.text` goes to the **same parser** as the command line.
4. Pilot agent returns readback string.
5. `synthesize` → Web Audio graph (phase 3 radio FX: bandpass + light noise + compressor).
6. Play. Do not use `speechSynthesis` if you need radio FX; it is a black box.

## Non-negotiables

- Parser does not know whether source was voice or text except `Command.source`.
- Failures (mic deny, timeout, low confidence, speech-api down) surface in the readback/status line, never throw through the sim tick.
- Measure PTT-up → transcript and PTT-up → audio-start. Log both.
- Missing speech-api → `null` port + typed commands still work. Do **not** silently fall back to a paid cloud.
