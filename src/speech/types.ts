export interface SpeechPort {
  readonly id: string;

  /**
   * Transcribe a complete PTT clip (PCM16 mono 16 kHz recommended).
   * Must not be called while another transcribe() is in flight for the same session.
   */
  transcribe(audio: AudioClip): Promise<Transcript>;

  /** Synthesize a readback. Return PCM the client will play through Web Audio. */
  synthesize(text: string, voiceId: string): Promise<AudioClip>;

  /**
   * Local phase-3 extension (README §5.1 / T03-04). Not in `_shared/speech-port.md`.
   * Clip adapters omit these. Coordinator (T03-02): call on PTT-down when present.
   * Must not start recognition in the constructor (no always-on listen).
   */
  beginUtterance?(): void;

  /**
   * PTT-up: stop live recognition and resolve the utterance, or `null` if
   * `beginUtterance` was never called. Clip adapters omit this.
   */
  endUtterance?(): Promise<Transcript | null>;

  /** Abort live recognition on teardown / backend switch (T03-10). */
  dispose?(): void;
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
