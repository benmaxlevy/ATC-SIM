/**
 * Piper medium voices for per-callsign readbacks. speech-api preloads the same
 * roster. Settings `voiceId` of `auto` (default) hashes the callsign; any other
 * id is a forced override for every aircraft.
 */

export const AUTO_TTS_VOICE_ID = "auto";

export const PILOT_VOICE_IDS = [
  "en_US-lessac-medium",
  "en_US-amy-medium",
  "en_US-ryan-medium",
  "en_US-joe-medium",
  "en_US-kristin-medium",
  "en_US-kusal-medium",
] as const;

export type PilotVoiceId = (typeof PILOT_VOICE_IDS)[number];

function djb2(text: string): number {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return hash >>> 0;
}

export function isAutoTtsVoice(voiceId: string | undefined): boolean {
  const trimmed = voiceId?.trim() ?? "";
  return trimmed === "" || trimmed.toLowerCase() === AUTO_TTS_VOICE_ID;
}

export function voiceIdForCallsign(callsign: string | null | undefined, override?: string): string {
  if (!isAutoTtsVoice(override)) {
    return override!.trim();
  }
  const key = (callsign ?? "").trim().toUpperCase() || "UNKNOWN";
  const idx = djb2(key) % PILOT_VOICE_IDS.length;
  return PILOT_VOICE_IDS[idx]!;
}
