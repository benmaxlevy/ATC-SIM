/**
 * Piper medium voices for per-callsign readbacks. speech-api preloads the same
 * roster. Settings `voiceId` of `auto` (default) hashes the callsign across the
 * roster, or `random` picks randomly per transmission. When no callsign is present,
 * a voice is selected at random from the roster. Any specific voice id is a forced
 * override for every aircraft.
 */

export const AUTO_TTS_VOICE_ID = "auto";
export const RANDOM_TTS_VOICE_ID = "random";

export const PILOT_VOICE_IDS = [
  "en_US-lessac-medium",
  "en_US-amy-medium",
  "en_US-ryan-medium",
  "en_US-joe-medium",
  "en_US-kristin-medium",
  "en_US-kusal-medium",
] as const;

export type PilotVoiceId = (typeof PILOT_VOICE_IDS)[number];

export function randomPilotVoice(rng: () => number = Math.random): PilotVoiceId {
  const raw = rng();
  const idx = Math.floor((raw < 0 ? -raw : raw) * PILOT_VOICE_IDS.length) % PILOT_VOICE_IDS.length;
  return PILOT_VOICE_IDS[idx]!;
}

function djb2(text: string): number {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return hash >>> 0;
}

export function isAutoTtsVoice(voiceId: string | undefined): boolean {
  const trimmed = voiceId?.trim() ?? "";
  const lower = trimmed.toLowerCase();
  return trimmed === "" || lower === AUTO_TTS_VOICE_ID || lower === RANDOM_TTS_VOICE_ID;
}

export function voiceIdForCallsign(
  callsign: string | null | undefined,
  override?: string,
  rng: () => number = Math.random,
): string {
  const trimmedOverride = override?.trim();
  if (trimmedOverride && trimmedOverride.toLowerCase() === RANDOM_TTS_VOICE_ID) {
    return randomPilotVoice(rng);
  }
  if (!isAutoTtsVoice(override)) {
    return trimmedOverride!;
  }
  const key = (callsign ?? "").trim().toUpperCase();
  if (!key) {
    return randomPilotVoice(rng);
  }
  const idx = djb2(key) % PILOT_VOICE_IDS.length;
  return PILOT_VOICE_IDS[idx]!;
}
