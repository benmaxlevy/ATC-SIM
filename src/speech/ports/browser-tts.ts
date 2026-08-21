/**
 * Browser `speechSynthesis` helper for the opt-in `web-speech` prototype.
 *
 * `speechSynthesis` is a black box — T03-07 radio FX cannot filter it.
 * T03-06 should call this when `SpeechPort.id === "web-speech"` instead of
 * playing the silence clip from `WebSpeechPort.synthesize`. Do **not** also
 * speak inside `synthesize`, or the readback will play twice.
 *
 * This is not the quality default. Chrome/Edge STT may send audio to the
 * browser vendor; TTS uses installed voices and is still prototype-only.
 */

export type BrowserSpeakResult = {
  utterance: SpeechSynthesisUtterance;
  /** Call after attaching `onstart` / `onend` so those handlers are not missed. */
  speak: () => void;
};

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof globalThis.speechSynthesis === "undefined") {
    return null;
  }
  return globalThis.speechSynthesis;
}

/**
 * Prepare a `speechSynthesis` utterance. Does **not** call `speak()` — the
 * readback player attaches `onstart` / `onend` first, then {@link BrowserSpeakResult.speak}.
 * Returns `null` when the API is missing (Node / unsupported browsers).
 *
 * This path is a black box: T03-07 radio FX must not claim it.
 */
export function speakBrowser(text: string, voiceId: string): BrowserSpeakResult | null {
  const synth = getSpeechSynthesis();
  if (!synth) {
    return null;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  if (voiceId) {
    const match = synth
      .getVoices()
      .find((voice) => voice.voiceURI === voiceId || voice.name === voiceId);
    if (match) {
      utterance.voice = match;
    }
  }
  return {
    utterance,
    speak: () => {
      synth.speak(utterance);
    },
  };
}
