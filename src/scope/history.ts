/**
 * Analog: CRC STARS HISTORY (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: analog CRC **history**; we sample 5 s sim / 5 dots, no phosphor
 * snake. Discrete 2–3 px dots in FAA history-blue (independent of FDB
 * ownership), newest brighter than oldest. AUX HISTORY spinner shows 0–5 of
 * those dots (0 skips draw like historyEnabled === false). Not a grey website
 * fade. Not NAS STARS.
 */

export const HISTORY_SAMPLE_MS = 5000;
export const HISTORY_MAX_DOTS = 5;
export const HISTORY_DOT_COUNTS = [0, 1, 2, 3, 4, 5] as const;
export const HISTORY_KEYBOARD_MAX_DOTS = 9;
/** AUX spinner stays 0–5. Keyboard `*HIST` accepts 0–9 (draw still caps at buffer length). */
export type HistoryDotCount = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface HistoryBuf {
  timesSimMs: number[]; // length ≤ 5
  eastNm: number[];
  northNm: number[];
}

export function createHistoryBuf(): HistoryBuf {
  return { timesSimMs: [], eastNm: [], northNm: [] };
}

/**
 * Sample current position when the buffer is empty (first paint) or when
 * `simTimeMs - lastSample >= 5000`. Caps at 5, dropping the oldest.
 * Call from the display sampler — not from kinematics / `stepWorld`.
 */
export function maybeSampleHistory(
  buf: HistoryBuf,
  simTimeMs: number,
  eastNm: number,
  northNm: number,
): boolean {
  const last = buf.timesSimMs.length === 0 ? null : buf.timesSimMs[buf.timesSimMs.length - 1];
  if (last !== null && simTimeMs - last < HISTORY_SAMPLE_MS) {
    return false;
  }
  buf.timesSimMs.push(simTimeMs);
  buf.eastNm.push(eastNm);
  buf.northNm.push(northNm);
  while (buf.timesSimMs.length > HISTORY_MAX_DOTS) {
    buf.timesSimMs.shift();
    buf.eastNm.shift();
    buf.northNm.shift();
  }
  return true;
}

/** Newest `count` samples; 0 draws none (same skip as historyEnabled === false). */
export function historyDotsToDraw(
  buf: HistoryBuf,
  count: HistoryDotCount,
): { eastNm: number[]; northNm: number[] } {
  if (count <= 0) {
    return { eastNm: [], northNm: [] };
  }
  const start = Math.max(0, buf.eastNm.length - count);
  return { eastNm: buf.eastNm.slice(start), northNm: buf.northNm.slice(start) };
}

export function stepHistoryDotCount(current: HistoryDotCount, delta: -1 | 1): HistoryDotCount {
  if (current > 5) {
    return delta === 1 ? current : 5;
  }
  const next = current + delta;
  if (next < 0 || next > 5) {
    return current;
  }
  return next as HistoryDotCount;
}
