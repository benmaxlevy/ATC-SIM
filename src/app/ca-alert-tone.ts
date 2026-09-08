/**
 * Analog: CRC STARS STCA aural (R07) — a tone while CA is active.
 * Trainer delta: shipped ConflictAlert.wav loop on the browser audio output.
 * Injected AudioContext instances retain the testable oscillator path.
 */

export const CA_TONE_HZ = 880;
export const CA_TONE_BEEP_MS = 150;
export const CA_TONE_PERIOD_MS = 400;
export const CA_TONE_GAIN = 0.05;

export interface CaAlertTone {
  /** Start/stop the beep from the sim tick. Safe with no AudioContext. */
  sync(active: boolean, volumeMultiplier?: number): void;
  setVolume(vol: number): void;
  dispose(): void;
}

export interface CaAlertToneOptions {
  getAudioContext?: () => AudioContext | null;
  now?: () => number;
}

const CONFLICT_ALERT_URL = "/sounds/ConflictAlert.wav";
export const ALERT_TONE_GAP_MS = 250;

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
  let element: HTMLAudioElement | null = null;
  let elementLooping = false;
  let elementRestartTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let currentVolumeMultiplier = 1.0;

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

  function stopElement(): void {
    elementLooping = false;
    if (elementRestartTimer !== null) {
      clearTimeout(elementRestartTimer);
      elementRestartTimer = null;
    }
    element?.pause();
    if (element) {
      element.currentTime = 0;
    }
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
    setVolume(vol: number) {
      const clamped = Math.max(0, vol);
      currentVolumeMultiplier = clamped <= 5 ? clamped / 5 : Math.min(100, clamped) / 100;
      if (gain && gain.gain.value > 0) {
        gain.gain.value = CA_TONE_GAIN * currentVolumeMultiplier;
      }
    },
    sync(nextActive: boolean, volumeMultiplier?: number) {
      if (disposed) {
        return;
      }
      if (volumeMultiplier !== undefined) {
        currentVolumeMultiplier = Math.max(0, volumeMultiplier);
      }
      if (!nextActive || currentVolumeMultiplier === 0) {
        if (options.getAudioContext === undefined) {
          stopElement();
        }
        if (gain) {
          gain.gain.value = 0;
        }
        if (!nextActive) {
          stopGraph();
        }
        return;
      }
      if (options.getAudioContext === undefined) {
        if (typeof Audio === "undefined") {
          return;
        }
        if (elementLooping) {
          element!.volume = Math.min(1, currentVolumeMultiplier);
          return;
        }
        const nextElement = element ?? new Audio(CONFLICT_ALERT_URL);
        if (!element) {
          element = nextElement;
          nextElement.addEventListener("ended", () => {
            if (!elementLooping || elementRestartTimer !== null) {
              return;
            }
            elementRestartTimer = setTimeout(() => {
              elementRestartTimer = null;
              if (elementLooping) {
                void element?.play().catch(() => undefined);
              }
            }, ALERT_TONE_GAP_MS);
          });
        }
        elementLooping = true;
        nextElement.volume = Math.min(1, currentVolumeMultiplier);
        void nextElement.play().catch(() => undefined);
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
        gain.gain.value = caToneBeepOn(now()) ? CA_TONE_GAIN * currentVolumeMultiplier : 0;
      }
    },
    dispose() {
      disposed = true;
      stopGraph();
      stopElement();
      element = null;
      if (ctx && !options.getAudioContext) {
        void ctx.close().catch(() => undefined);
      }
      ctx = null;
    },
  };
}
