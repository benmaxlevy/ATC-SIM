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
  sync(caActive: boolean, msawActiveOrVolume?: boolean | number, volumeMultiplier?: number): void;
  setVolume(vol: number): void;
  dispose(): void;
}

export interface CaAlertToneOptions {
  getAudioContext?: () => AudioContext | null;
  now?: () => number;
}

const CONFLICT_ALERT_URL = "/sounds/ConflictAlert.wav";
const MSAW_ALERT_URL = "/sounds/Msaw.wav";
export const ALERT_TONE_GAP_MS = 250;
export const COMBINED_ALERT_TONE_GAP_MS = 80;

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
  const elements = new Map<"ca" | "msaw", HTMLAudioElement>();
  let currentElement: "ca" | "msaw" | null = null;
  let browserCaActive = false;
  let browserMsawActive = false;
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
    currentElement = null;
    if (elementRestartTimer !== null) {
      clearTimeout(elementRestartTimer);
      elementRestartTimer = null;
    }
    for (const element of elements.values()) {
      element.pause();
      element.currentTime = 0;
    }
  }

  function activeElement(kind: "ca" | "msaw"): boolean {
    return kind === "ca" ? browserCaActive : browserMsawActive;
  }

  function nextElement(): "ca" | "msaw" | null {
    if (browserCaActive && browserMsawActive) return currentElement === "ca" ? "msaw" : "ca";
    if (browserCaActive) return "ca";
    if (browserMsawActive) return "msaw";
    return null;
  }

  function startBrowserElement(kind: "ca" | "msaw"): void {
    if (typeof Audio === "undefined") return;
    let element = elements.get(kind);
    if (!element) {
      element = new Audio(kind === "ca" ? CONFLICT_ALERT_URL : MSAW_ALERT_URL);
      element.addEventListener("ended", () => {
        if (currentElement !== kind || !activeElement(kind)) return;
        elementRestartTimer = setTimeout(
          () => {
            elementRestartTimer = null;
            const next = nextElement();
            if (next) startBrowserElement(next);
          },
          browserCaActive && browserMsawActive ? COMBINED_ALERT_TONE_GAP_MS : ALERT_TONE_GAP_MS,
        );
      });
      elements.set(kind, element);
    }
    currentElement = kind;
    element.volume = Math.min(1, currentVolumeMultiplier);
    element.currentTime = 0;
    void element.play().catch(() => undefined);
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
    sync(
      nextCaActive: boolean,
      msawActiveOrVolume: boolean | number = false,
      volumeMultiplier?: number,
    ) {
      if (disposed) {
        return;
      }
      const nextMsawActive = typeof msawActiveOrVolume === "boolean" ? msawActiveOrVolume : false;
      const nextVolume =
        typeof msawActiveOrVolume === "number" ? msawActiveOrVolume : volumeMultiplier;
      if (nextVolume !== undefined) {
        currentVolumeMultiplier = Math.max(0, nextVolume);
      }
      if (options.getAudioContext === undefined) {
        browserCaActive = nextCaActive && currentVolumeMultiplier > 0;
        browserMsawActive = nextMsawActive && currentVolumeMultiplier > 0;
        if (!browserCaActive && !browserMsawActive) {
          stopElement();
          return;
        }
        if (!currentElement || !activeElement(currentElement)) {
          stopElement();
          const next = nextElement();
          if (next) startBrowserElement(next);
        }
        return;
      }
      if (!nextCaActive || currentVolumeMultiplier === 0) {
        if (gain) {
          gain.gain.value = 0;
        }
        if (!nextCaActive) {
          stopGraph();
        }
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
      elements.clear();
      if (ctx && !options.getAudioContext) {
        void ctx.close().catch(() => undefined);
      }
      ctx = null;
    },
  };
}
