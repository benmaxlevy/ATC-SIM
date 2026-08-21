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
};

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof globalThis.speechSynthesis === "undefined") {
    return null;
  }
  return globalThis.speechSynthesis;
}

/**
 * Speak `text` via `speechSynthesis`. Returns the utterance so T03-06 can
 * attach `onstart` / `onend` for PTT lock and audio-start metrics.
 * Returns `null` when the API is missing (Node / unsupported browsers).
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
  synth.speak(utterance);
  return { utterance };
}
