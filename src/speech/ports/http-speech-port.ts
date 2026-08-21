import { SpeechPortError } from "../speech-port-error";
import type { AudioClip, SpeechPort, Transcript } from "../types";
import { isWav, pcm16ToWav, uint8ToArrayBuffer, wavToAudioClip } from "./wav";

/**
 * Quality-default SpeechPort (`id: "http"`).
 *
 * Talks ONLY to this repo's `speech-api/` (T03-13): local Whisper STT + Piper TTS
 * on our CPU/GPU. Hugging Face Hub is a one-time weight download on that process,
 * not a per-utterance cloud.
 *
 * Env (browser / Vite):
 * - `VITE_STT_URL` default `http://127.0.0.1:8090/stt` — our POST /stt, not a vendor.
 * - `VITE_TTS_URL` default `http://127.0.0.1:8090/tts` — our POST /tts, not a vendor.
 * - `VITE_SPEECH_TOKEN` optional local shared-secret header for speech-api.
 *   Never a metered vendor API key. Do not point these URLs at a paid cloud.
 *
 * Body choice: WAV pcm16le mono (`Content-Type: audio/wav`). speech-api rejects
 * non-WAV STT bodies. TTS JSON `{ text, voiceId }` → `audio/wav` (or raw pcm16
 * + `X-Sample-Rate` if a future local build sends that).
 *
 * CORS: speech-api must allow the Vite origin (`http://127.0.0.1:5173` /
 * `http://localhost:5173`). Do not proxy STT/TTS through a vendor or the sim tick.
 *
 * `beginUtterance` / `endUtterance` are omitted — this adapter is clip-only
 * (`transcribe(clip)`). Live methods belong to T03-04 web-speech.
 */

export const DEFAULT_STT_URL = "http://127.0.0.1:8090/stt";
export const DEFAULT_TTS_URL = "http://127.0.0.1:8090/tts";
export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_VOICE_ID = "en_US-lessac-medium";

export interface HttpSpeechPortConfig {
  sttUrl?: string;
  ttsUrl?: string;
  /** Applied to both STT and TTS when the specific timeouts are unset. */
  timeoutMs?: number;
  sttTimeoutMs?: number;
  ttsTimeoutMs?: number;
  voiceId?: string;
  /**
   * Full Authorization header value (e.g. `Bearer …`). Local speech-api secret only.
   * Never logged.
   */
  authorization?: string;
  /** Custom header name if speech-api does not use Authorization. */
  authHeaderName?: string;
  authHeaderValue?: string;
  /** Injected in tests. Defaults to global fetch. */
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

function optionalEnv(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && err.name === "AbortError";
}

function bytesToPcm16(bytes: Uint8Array): Int16Array {
  const even = bytes.byteLength - (bytes.byteLength % 2);
  const pcm16 = new Int16Array(even / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, even);
  for (let i = 0; i < pcm16.length; i += 1) {
    pcm16[i] = view.getInt16(i * 2, true);
  }
  return pcm16;
}

export class HttpSpeechPort implements SpeechPort {
  readonly id = "http";

  readonly sttUrl: string;
  readonly ttsUrl: string;

  readonly #sttTimeoutMs: number;
  readonly #ttsTimeoutMs: number;
  readonly #defaultVoiceId: string;
  readonly #authHeaderName: string | undefined;
  readonly #authHeaderValue: string | undefined;
  readonly #fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  #transcribeInFlight = false;

  constructor(config: HttpSpeechPortConfig = {}) {
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sttUrl = config.sttUrl ?? optionalEnv(import.meta.env.VITE_STT_URL) ?? DEFAULT_STT_URL;
    this.ttsUrl = config.ttsUrl ?? optionalEnv(import.meta.env.VITE_TTS_URL) ?? DEFAULT_TTS_URL;
    this.#sttTimeoutMs = config.sttTimeoutMs ?? timeoutMs;
    this.#ttsTimeoutMs = config.ttsTimeoutMs ?? timeoutMs;
    this.#defaultVoiceId = config.voiceId ?? DEFAULT_VOICE_ID;
    this.#fetch = config.fetch ?? globalThis.fetch.bind(globalThis);

    if (config.authHeaderName && config.authHeaderValue !== undefined) {
      this.#authHeaderName = config.authHeaderName;
      this.#authHeaderValue = config.authHeaderValue;
    } else if (config.authorization) {
      this.#authHeaderName = "Authorization";
      this.#authHeaderValue = config.authorization;
    } else {
      const token = optionalEnv(import.meta.env.VITE_SPEECH_TOKEN);
      if (token) {
        this.#authHeaderName = "Authorization";
        this.#authHeaderValue = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
      }
    }
  }

  async transcribe(audio: AudioClip): Promise<Transcript> {
    if (this.#transcribeInFlight) {
      return Promise.reject(new SpeechPortError("in_flight", "transcribe already in flight"));
    }
    this.#transcribeInFlight = true;
    const wav = pcm16ToWav(audio);
    try {
      const { response, latencyMs } = await this.#post(this.sttUrl, {
        headers: this.#headers({ "Content-Type": "audio/wav" }),
        body: uint8ToArrayBuffer(wav),
        timeoutMs: this.#sttTimeoutMs,
        label: "STT",
      });
      const raw = await response.text();
      if (raw.trim() === "") {
        throw new SpeechPortError("empty", "STT response body was empty");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch (cause) {
        throw new SpeechPortError("invalid_response", "STT response was not JSON", { cause });
      }
      if (typeof parsed !== "object" || parsed === null || !("text" in parsed)) {
        throw new SpeechPortError("invalid_response", "STT response missing text");
      }
      const textValue = (parsed as { text: unknown }).text;
      if (typeof textValue !== "string") {
        throw new SpeechPortError("invalid_response", "STT response missing text");
      }
      const confidenceValue = (parsed as { confidence?: unknown }).confidence;
      const confidence =
        typeof confidenceValue === "number" && Number.isFinite(confidenceValue)
          ? confidenceValue
          : 1.0;
      return { text: textValue, confidence, latencyMs };
    } finally {
      this.#transcribeInFlight = false;
    }
  }

  async synthesize(text: string, voiceId: string): Promise<AudioClip> {
    const voice = voiceId.trim() === "" ? this.#defaultVoiceId : voiceId;
    const { response } = await this.#post(this.ttsUrl, {
      headers: this.#headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ text, voiceId: voice }),
      timeoutMs: this.#ttsTimeoutMs,
      label: "TTS",
    });
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new SpeechPortError("empty", "TTS response body was empty");
    }
    const bytes = new Uint8Array(buffer);
    if (isWav(bytes)) {
      try {
        return wavToAudioClip(bytes);
      } catch (cause) {
        throw new SpeechPortError("invalid_response", "TTS WAV could not be decoded", { cause });
      }
    }
    const rateHeader = response.headers.get("X-Sample-Rate");
    const sampleRate = rateHeader === null || rateHeader.trim() === "" ? 16000 : Number(rateHeader);
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new SpeechPortError("invalid_response", "TTS sample rate missing");
    }
    const pcm16 = bytesToPcm16(bytes);
    if (pcm16.length === 0) {
      throw new SpeechPortError("empty", "TTS response body was empty");
    }
    return { sampleRate, channels: 1, pcm16 };
  }

  #headers(base: Record<string, string>): Record<string, string> {
    if (this.#authHeaderName === undefined || this.#authHeaderValue === undefined) {
      return base;
    }
    return { ...base, [this.#authHeaderName]: this.#authHeaderValue };
  }

  async #post(
    url: string,
    init: {
      headers: Record<string, string>;
      body: BodyInit;
      timeoutMs: number;
      label: "STT" | "TTS";
    },
  ): Promise<{ response: Response; latencyMs: number }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs);
    const startedAt = performance.now();
    try {
      let response: Response;
      try {
        response = await this.#fetch(url, {
          method: "POST",
          headers: init.headers,
          body: init.body,
          signal: controller.signal,
        });
      } catch (cause) {
        if (isAbortError(cause) || controller.signal.aborted) {
          throw new SpeechPortError("timeout", `${init.label} request timed out`);
        }
        throw new SpeechPortError("network", `${init.label} network error`);
      }
      const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
      if (!response.ok) {
        throw new SpeechPortError("http", `${init.label} HTTP ${response.status}`, {
          status: response.status,
        });
      }
      return { response, latencyMs };
    } finally {
      clearTimeout(timer);
    }
  }
}
