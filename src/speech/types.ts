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
