/** Shared syntax guard for controller CONTACT facility names. */

const FACILITY_NAME_TOKEN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export function parseFacilityName(tokens: readonly string[]): string | null {
  if (tokens.length < 1 || tokens.length > 4) return null;
  const normalized = tokens.map((token) => token.trim().toUpperCase());
  if (normalized.some((token) => !FACILITY_NAME_TOKEN.test(token))) return null;
  return normalized.join(" ");
}
