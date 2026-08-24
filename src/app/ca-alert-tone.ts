/**
 * Analog: CRC STARS STCA aural (R07) — a tone while CA is active.
 * Trainer delta: square-wave beep on the Web Audio destination. Not NAS.
 * No vendor TTS/STT. Silent when AudioContext is missing or suspended.
 */

export const CA_TONE_HZ = 880;
export const CA_TONE_BEEP_MS = 150;
export const CA_TONE_PERIOD_MS = 400;
export const CA_TONE_GAIN = 0.05;

export interface CaAlertTone {
  /** Start/stop the beep from the sim tick. Safe with no AudioContext. */
  sync(active: boolean): void;
  dispose(): void;
}

export interface CaAlertToneOptions {
  getAudioContext?: () => AudioContext | null;
  now?: () => number;
}

function audioContextConstructor(): typeof AudioContext | undefined {
  const g = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  return g.AudioContext ?? g.webkitAudioContext;
}

function defaultNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/** Gate for tests: beep on for the first slice of each period. */
export function caToneBeepOn(nowMs: number): boolean {
  return nowMs % CA_TONE_PERIOD_MS < CA_TONE_BEEP_MS;
}

export function createCaAlertTone(options: CaAlertToneOptions = {}): CaAlertTone {
  const now = options.now ?? defaultNow;
  let ctx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  let disposed = false;

  function tryContext(): AudioContext | null {
    if (options.getAudioContext) {
      return options.getAudioContext();
    }
    if (ctx) {
      return ctx;
    }
    const Ctor = audioContextConstructor();
    if (!Ctor) {
      return null;
    }
    try {
      ctx = new Ctor();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function stopGraph(): void {
    try {
      osc?.stop();
    } catch {
      // already stopped
    }
    try {
      osc?.disconnect();
      gain?.disconnect();
    } catch {
      // already disconnected
    }
    osc = null;
    gain = null;
  }

  function ensureGraph(audio: AudioContext): void {
    if (osc && gain) {
      return;
    }
    const nextOsc = audio.createOscillator();
    const nextGain = audio.createGain();
    nextOsc.type = "square";
    nextOsc.frequency.value = CA_TONE_HZ;
    nextGain.gain.value = 0;
    nextOsc.connect(nextGain);
    nextGain.connect(audio.destination);
    nextOsc.start();
    osc = nextOsc;
    gain = nextGain;
  }

  return {
    sync(nextActive: boolean) {
      if (disposed) {
        return;
      }
      if (!nextActive) {
        if (gain) {
          gain.gain.value = 0;
        }
        stopGraph();
        return;
      }
      const audio = tryContext();
      if (!audio) {
        return;
      }
      if (audio.state === "suspended") {
        void audio.resume().catch(() => undefined);
      }
      ensureGraph(audio);
      if (gain) {
        gain.gain.value = caToneBeepOn(now()) ? CA_TONE_GAIN : 0;
      }
    },
    dispose() {
      disposed = true;
      stopGraph();
      if (ctx && !options.getAudioContext) {
        void ctx.close().catch(() => undefined);
      }
      ctx = null;
    },
  };
}
