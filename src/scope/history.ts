/**
 * Analog: CRC STARS HISTORY (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: analog CRC **history**; we sample 5 s sim / 5 dots, no phosphor
 * snake. Discrete 2–3 px dots in FAA history-blue (independent of FDB
 * ownership), newest brighter than oldest. Not a grey website trail. Not NAS STARS.
 */

export const HISTORY_SAMPLE_MS = 5000;
export const HISTORY_MAX_DOTS = 5;

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
