import { SpeechNotAvailableError } from "./errors";
import type { AudioClip, SpeechPort, Transcript } from "./types";

/** 100 ms of silence at 16 kHz mono PCM16. */
const SILENCE_SAMPLE_RATE = 16000;
const SILENCE_FRAME_COUNT = 1600;

export class NullSpeechPort implements SpeechPort {
  readonly id = "null";

  transcribe(audio: AudioClip): Promise<Transcript> {
    void audio;
    return Promise.reject(new SpeechNotAvailableError("NullSpeechPort cannot transcribe"));
  }

  synthesize(text: string, voiceId: string): Promise<AudioClip> {
    void text;
    void voiceId;
    return Promise.resolve({
      sampleRate: SILENCE_SAMPLE_RATE,
      channels: 1,
      pcm16: new Int16Array(SILENCE_FRAME_COUNT),
    });
  }
}
