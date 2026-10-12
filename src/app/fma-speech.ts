/**
 * FMA browser speech queue and SpeechSynthesis adapter.
 *
 * Analog: Raytheon STARS TCW/TDW Operator's Manual TI 6191.409 Revision 30
 * §2.16.4 pp. 2-107–108 (ACID WARNING/COAST/WRONG RUNWAY/CAUTION once at onset;
 * telephony or phonetic letters; no NOM speech)
 * §§6.16.6–7 pp. 6-135–136 (VOICE 1–10; volume commit and VOICE TEST utter Test).
 * Web Speech API specification: SpeechSynthesis, localService, voiceschanged.
 *
 * Trainer delta: SpeechSynthesis is the sole user-authorized FMA audio backend.
 * Application-owned queue manages prioritization and selective cancellation so
 * global speechSynthesis.cancel() does not drop unrelated pending alert items.
 */

import type { FmaAlertEpisode, FmaPrimaryCondition } from "@core";
import { formatCallsignSpeech } from "../pilot/telephony";

export interface FmaSpeechItem {
  readonly id: string;
  readonly episodeId: string | null;
  readonly aircraftId: string | null;
  readonly kind: "alert" | "action";
  readonly priority: number; // 0 = warning (highest), 1 = caution, 2 = action (Test)
  readonly text: string;
  readonly volume: number; // 0.1 to 1.0
  readonly condition?: FmaPrimaryCondition;
}

export interface FmaSpeechStatus {
  readonly supported: boolean;
  readonly voiceAvailable: boolean;
  readonly activeUtteranceText: string | null;
  readonly queueLength: number;
}

export interface SpeechSynthesisUtteranceLike {
  text: string;
  volume: number;
  voice: SpeechSynthesisVoiceLike | null;
  lang: string;
  onend: ((ev?: Event | unknown) => void) | null;
  onerror: ((ev?: Event | unknown) => void) | null;
  onstart: ((ev?: Event | unknown) => void) | null;
}

export interface SpeechSynthesisVoiceLike {
  readonly default: boolean;
  readonly lang: string;
  readonly localService: boolean;
  readonly name: string;
  readonly voiceURI: string;
}

export interface SpeechSynthesisLike {
  readonly speaking: boolean;
  readonly pending: boolean;
  readonly paused: boolean;
  onvoiceschanged: ((ev?: Event | unknown) => void) | null;
  getVoices(): SpeechSynthesisVoiceLike[];
  speak(utterance: SpeechSynthesisUtteranceLike): void;
  cancel(): void;
  addEventListener?(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener?(type: string, listener: EventListenerOrEventListenerObject): void;
}

export interface FmaSpeechControllerOptions {
  synthesis?: SpeechSynthesisLike | null;
  createUtterance?: (text: string) => SpeechSynthesisUtteranceLike;
  initialVoiceLevel?: number;
  onStatusChange?: (status: FmaSpeechStatus) => void;
}

export interface FmaSpeechController {
  enqueueEpisode(episode: FmaAlertEpisode, callsign: string, aircraftId?: string | null): void;
  cancelEpisode(episodeId: string): void;
  cancelAircraft(aircraftId: string): void;
  setVoiceLevel(level: number, speakTest?: boolean): void;
  voiceTest(): void;
  getVoiceLevel(): number;
  getStatus(): FmaSpeechStatus;
  subscribeStatus(listener: (status: FmaSpeechStatus) => void): () => void;
  clearQueue(): void;
  dispose(): void;
}

const SUFFIX_MAP: Record<FmaPrimaryCondition, string> = {
  NTZ_WARNING: "WARNING",
  SURVEILLANCE_LOST: "COAST",
  RUNWAY_ERROR: "WRONG RUNWAY",
  NTZ_CAUTION: "CAUTION",
};

/**
 * Format the exact spoken utterance for an FMA alert onset.
 * ACID prefix + exact suffix: WARNING | COAST | WRONG RUNWAY | CAUTION.
 */
export function formatFmaAlertUtterance(callsign: string, condition: FmaPrimaryCondition): string {
  const spokenAcid = formatCallsignSpeech(callsign);
  const suffix = SUFFIX_MAP[condition];
  return `${spokenAcid} ${suffix}`.trim();
}

/** Select an installed English localService=true voice if available. */
function selectEnglishLocalVoice(
  voices: readonly SpeechSynthesisVoiceLike[],
): SpeechSynthesisVoiceLike | null {
  return voices.find((v) => v.localService && v.lang?.toLowerCase().startsWith("en")) ?? null;
}

export function createFmaSpeechController(
  options: FmaSpeechControllerOptions = {},
): FmaSpeechController {
  const synth: SpeechSynthesisLike | null =
    options.synthesis !== undefined
      ? options.synthesis
      : typeof window !== "undefined" && "speechSynthesis" in window
        ? (window.speechSynthesis as unknown as SpeechSynthesisLike)
        : null;

  const makeUtterance =
    options.createUtterance ??
    ((text: string): SpeechSynthesisUtteranceLike => {
      if (typeof SpeechSynthesisUtterance !== "undefined") {
        return new SpeechSynthesisUtterance(text) as unknown as SpeechSynthesisUtteranceLike;
      }
      return {
        text,
        volume: 1,
        voice: null,
        lang: "en-US",
        onend: null,
        onerror: null,
        onstart: null,
      };
    });

  let voiceLevel = Math.max(1, Math.min(10, Math.round(options.initialVoiceLevel ?? 6)));
  let queue: FmaSpeechItem[] = [];
  let activeItem: FmaSpeechItem | null = null;
  let activeUtterance: SpeechSynthesisUtteranceLike | null = null;
  let disposed = false;
  let selectedVoice: SpeechSynthesisVoiceLike | null = null;
  let nextItemId = 1;
  const statusListeners = new Set<(status: FmaSpeechStatus) => void>();

  function queryVoice(): SpeechSynthesisVoiceLike | null {
    if (!synth || disposed) return null;
    try {
      const voices = synth.getVoices();
      return selectEnglishLocalVoice(voices);
    } catch {
      return null;
    }
  }

  function updateVoices(): void {
    selectedVoice = queryVoice();
    notifyStatus();
    checkPump();
  }

  const voicesChangedHandler = () => {
    updateVoices();
  };

  if (synth) {
    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", voicesChangedHandler);
    } else {
      synth.onvoiceschanged = voicesChangedHandler;
    }
    selectedVoice = queryVoice();
  }

  function getStatus(): FmaSpeechStatus {
    const supported = Boolean(synth);
    const voiceAvailable = Boolean(synth && selectedVoice);
    return {
      supported,
      voiceAvailable,
      activeUtteranceText: activeItem ? activeItem.text : null,
      queueLength: queue.length,
    };
  }

  function notifyStatus(): void {
    const status = getStatus();
    options.onStatusChange?.(status);
    for (const listener of statusListeners) listener(status);
  }

  function pumpQueue(): void {
    if (disposed || !synth) return;
    if (activeItem !== null) return; // Currently speaking an item
    if (queue.length === 0) {
      notifyStatus();
      return;
    }

    if (!selectedVoice) {
      selectedVoice = queryVoice();
      if (!selectedVoice) {
        // Missing local voice: alerts remain visually active, but audio cannot speak now.
        notifyStatus();
        return;
      }
    }

    // Sort queue by priority: warnings (0) < cautions (1) < actions (2)
    // Stable by insertion id
    queue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return parseInt(a.id, 10) - parseInt(b.id, 10);
    });

    const item = queue.shift()!;
    activeItem = item;

    const utt = makeUtterance(item.text);
    utt.volume = Math.max(0.1, Math.min(1.0, item.volume));
    if (selectedVoice) {
      utt.voice = selectedVoice;
      utt.lang = selectedVoice.lang || "en-US";
    }
    activeUtterance = utt;

    const clearAndNext = () => {
      if (activeUtterance === utt) {
        activeItem = null;
        activeUtterance = null;
        notifyStatus();
        pumpQueue();
      }
    };

    utt.onend = () => {
      clearAndNext();
    };

    utt.onerror = () => {
      clearAndNext();
    };

    try {
      synth.speak(utt);
      notifyStatus();
    } catch {
      clearAndNext();
    }
  }

  function checkPump(): void {
    if (!activeItem && queue.length > 0) {
      pumpQueue();
    }
  }

  return {
    enqueueEpisode(episode: FmaAlertEpisode, callsign: string, aircraftId?: string | null): void {
      if (disposed) return;
      // NOM is silent
      if (!SUFFIX_MAP[episode.condition]) return;

      // Deduplicate: do not enqueue if already active or pending in queue
      if (activeItem?.episodeId === episode.id) return;
      if (queue.some((item) => item.episodeId === episode.id)) return;

      const isWarning =
        episode.condition === "NTZ_WARNING" ||
        episode.condition === "SURVEILLANCE_LOST" ||
        episode.condition === "RUNWAY_ERROR";
      const priority = isWarning ? 0 : 1; // 0 for warnings, 1 for caution
      const text = formatFmaAlertUtterance(callsign, episode.condition);
      const volume = voiceLevel / 10;

      const item: FmaSpeechItem = {
        id: String(nextItemId++),
        episodeId: episode.id,
        aircraftId: aircraftId ?? null,
        kind: "alert",
        priority,
        text,
        volume,
        condition: episode.condition,
      };

      queue.push(item);
      notifyStatus();
      pumpQueue();
    },

    cancelEpisode(episodeId: string): void {
      if (disposed) return;
      // Remove from pending queue
      queue = queue.filter((item) => item.episodeId !== episodeId);

      // If active utterance is for this episode, cancel it in browser
      if (activeItem?.episodeId === episodeId) {
        const cancelingUtterance = activeUtterance;
        activeItem = null;
        activeUtterance = null;
        if (cancelingUtterance) {
          cancelingUtterance.onend = null;
          cancelingUtterance.onerror = null;
        }
        if (synth) {
          try {
            synth.cancel();
          } catch {
            // Browser teardown must not throw
          }
        }
        notifyStatus();
        pumpQueue();
      } else {
        notifyStatus();
      }
    },

    cancelAircraft(aircraftId: string): void {
      if (disposed) return;
      queue = queue.filter((item) => item.aircraftId !== aircraftId);
      if (activeItem?.aircraftId === aircraftId) {
        const cancelingUtterance = activeUtterance;
        activeItem = null;
        activeUtterance = null;
        if (cancelingUtterance) {
          cancelingUtterance.onend = null;
          cancelingUtterance.onerror = null;
        }
        if (synth) {
          try {
            synth.cancel();
          } catch {
            // Ignore
          }
        }
        notifyStatus();
        pumpQueue();
      } else {
        notifyStatus();
      }
    },

    setVoiceLevel(level: number, speakTest = true): void {
      if (disposed) return;
      if (!Number.isFinite(level) || level < 1 || level > 10) return;
      voiceLevel = Math.round(level);
      if (speakTest) {
        const item: FmaSpeechItem = {
          id: String(nextItemId++),
          episodeId: null,
          aircraftId: null,
          kind: "action",
          priority: 2,
          text: "Test",
          volume: voiceLevel / 10,
        };
        queue.push(item);
        notifyStatus();
        pumpQueue();
      }
    },

    voiceTest(): void {
      if (disposed) return;
      const item: FmaSpeechItem = {
        id: String(nextItemId++),
        episodeId: null,
        aircraftId: null,
        kind: "action",
        priority: 2,
        text: "Test",
        volume: voiceLevel / 10,
      };
      queue.push(item);
      notifyStatus();
      pumpQueue();
    },

    getVoiceLevel(): number {
      return voiceLevel;
    },

    getStatus,
    subscribeStatus(listener) {
      statusListeners.add(listener);
      listener(getStatus());
      return () => statusListeners.delete(listener);
    },

    clearQueue(): void {
      if (disposed) return;
      queue = [];
      if (activeItem) {
        const cancelingUtterance = activeUtterance;
        activeItem = null;
        activeUtterance = null;
        if (cancelingUtterance) {
          cancelingUtterance.onend = null;
          cancelingUtterance.onerror = null;
        }
        if (synth) {
          try {
            synth.cancel();
          } catch {
            // Ignore
          }
        }
      }
      notifyStatus();
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      statusListeners.clear();
      queue = [];
      if (activeUtterance) {
        activeUtterance.onend = null;
        activeUtterance.onerror = null;
      }
      activeItem = null;
      activeUtterance = null;
      if (synth) {
        if (typeof synth.removeEventListener === "function") {
          synth.removeEventListener("voiceschanged", voicesChangedHandler);
        } else {
          synth.onvoiceschanged = null;
        }
        try {
          synth.cancel();
        } catch {
          // Teardown must never throw
        }
      }
      notifyStatus();
    },
  };
}

/**
 * Synchronize ScopeView FMA speech events with the FmaSpeechController.
 * Drains scopeView.fmaSpeechEvents and keeps fmaSpeech volume synchronized.
 */
export function syncFmaSpeech(
  controller: FmaSpeechController,
  view: {
    fmaSpeechEvents: Array<
      | { type: "onset" | "cancel"; episodeId: string; aircraftId: string }
      | { type: "test"; level?: number }
    >;
    fmaAlertResults: ReadonlyMap<string, { episode?: FmaAlertEpisode | null }>;
    fmaVoiceLevel?: number;
  },
  world: {
    aircraft: ReadonlyArray<{ id: string; callsign: string }>;
  },
): void {
  if (view.fmaVoiceLevel !== undefined && view.fmaVoiceLevel !== controller.getVoiceLevel()) {
    // Synchronize volume without speaking test on passive sync
    controller.setVoiceLevel(view.fmaVoiceLevel, false);
  }

  if (view.fmaSpeechEvents.length === 0) return;

  const events = [...view.fmaSpeechEvents];
  view.fmaSpeechEvents.length = 0;

  for (const event of events) {
    if (event.type === "cancel") {
      controller.cancelEpisode(event.episodeId);
    } else if (event.type === "onset") {
      const result = view.fmaAlertResults.get(event.aircraftId);
      const episode = result?.episode;
      if (!episode || episode.id !== event.episodeId) continue;
      const aircraft = world.aircraft.find((ac) => ac.id === event.aircraftId);
      const callsign = aircraft?.callsign ?? event.aircraftId;
      controller.enqueueEpisode(episode, callsign, event.aircraftId);
    } else if (event.type === "test") {
      if (event.level !== undefined) {
        controller.setVoiceLevel(event.level, true);
      } else {
        controller.voiceTest();
      }
    }
  }
}
