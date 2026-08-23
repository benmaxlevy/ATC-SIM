/**
 * Display readbacks include altitude hundreds in parentheses
 * (`one-zero thousand (10000)`). TTS must speak only the grouped phrase.
 */

export function readbackForTts(text: string): string {
  return text
    .replace(/\s*\(\d+\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
