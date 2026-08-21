/**
 * Analog: CRC STARS letter chords — L **leader**, F filter later
 * (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: 1.5 s window; leftover digits never go to the parser; no
 * leader-length menu. Reusable for T02-06 altitude-filter `F` chord.
 * Not NAS STARS.
 */

export const SCOPE_CHORD_WINDOW_MS = 1500;

/** Pending scope-focus chord (`L` now; T02-06 adds `F`). */
export interface ScopeChord {
  /** Prefix letter, uppercase. */
  prefix: string;
  startedAtMs: number;
  /** Optional status hint, e.g. `L_`. */
  hint: string;
  /** Digit buffer for multi-key chords (filter). Leader uses one digit. */
  buffer: string;
}

export function beginScopeChord(prefix: string, nowMs: number, hint: string): ScopeChord {
  return { prefix, startedAtMs: nowMs, hint, buffer: "" };
}

export function isScopeChordLive(chord: ScopeChord | null | undefined, nowMs: number): boolean {
  return chord != null && nowMs - chord.startedAtMs <= SCOPE_CHORD_WINDOW_MS;
}

export function isArrowKey(key: string): boolean {
  return key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
}

/**
 * Top-row or numpad digit 0–9. Arrow keys (NumLock off) return null even when
 * `code` is Numpad8 etc. — require a real digit key.
 * `code` covers Digit/Numpad when `key` is not a digit character.
 */
export function digitFromKey(key: string, code?: string): number | null {
  if (isArrowKey(key)) {
    return null;
  }
  if (/^[0-9]$/.test(key)) {
    return Number(key);
  }
  const fromCode = code?.match(/^(?:Digit|Numpad)([0-9])$/);
  if (fromCode) {
    return Number(fromCode[1]);
  }
  return null;
}

export function leaderDigitFromKey(
  key: string,
  code?: string,
): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | null {
  const n = digitFromKey(key, code);
  if (n == null || n < 1 || n > 9) {
    return null;
  }
  return n as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

export function isLeaderPrefixKey(key: string): boolean {
  return key === "L" || key === "l";
}
