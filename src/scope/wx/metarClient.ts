/** Analog: CRC STARS SSA weather / Terminal Weather Display (docs.virtualnas.net/crc/stars).
 *  Airport list from scenario.ssaWeatherAirports — scenario data, not a runtime command.
 *  Live METAR from aviationweather.gov; cached and decoded for SSA/GI display. */

export interface MetarObservation {
  icaoId: string;
  receiptTime?: string;
  obsTime?: number;
  reportTime: string;
  temp?: number;
  dewp?: number;
  wdir?: number;
  wspd?: number;
  visib?: string;
  altimHpa?: number;
  altimeterInHg: string; // e.g. "30.18"
  rawOb: string;
  fltCat?: string;
  cover?: string;
  lat?: number;
  lon?: number;
  elev?: number;
  name?: string;
}

export const DEFAULT_METAR_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_METAR_BASE_URL = "https://aviationweather.gov/api/data/metar";
export const DEFAULT_ALTIMETER_STUB = "30.17";

/**
 * Convert pressure in hPa/mb to altimeter inHg formatted as XX.XX.
 * Formula: hPa * 0.029529983 rounded to 2 decimal places.
 */
export function hPaToAltimeterInHg(hpa: number): string {
  if (!Number.isFinite(hpa) || hpa <= 0) {
    return DEFAULT_ALTIMETER_STUB;
  }
  const inHg = hpa * 0.029529983;
  return inHg.toFixed(2);
}

/**
 * Parse standard FAA altimeter setting from raw METAR (e.g. "A3018" -> "30.18").
 */
export function parseAltimeterFromRawOb(rawOb: string): string | null {
  if (!rawOb || typeof rawOb !== "string") {
    return null;
  }
  const match = rawOb.match(/\bA(\d{2})(\d{2})\b/);
  if (!match) {
    return null;
  }
  return `${match[1]}.${match[2]}`;
}

/**
 * Decode a single raw JSON observation from aviationweather.gov.
 */
export function decodeMetarObservation(raw: unknown): MetarObservation | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const icaoId = typeof r.icaoId === "string" ? r.icaoId.trim().toUpperCase() : null;
  if (!icaoId) {
    return null;
  }

  const rawOb = typeof r.rawOb === "string" ? r.rawOb.trim() : "";
  const reportTime = typeof r.reportTime === "string" ? r.reportTime : new Date().toISOString();

  let altimeterInHg = DEFAULT_ALTIMETER_STUB;
  let altimHpa: number | undefined;

  if (typeof r.altim === "number" && Number.isFinite(r.altim) && r.altim > 0) {
    altimHpa = r.altim;
    altimeterInHg = hPaToAltimeterInHg(r.altim);
  } else if (rawOb) {
    const fromRaw = parseAltimeterFromRawOb(rawOb);
    if (fromRaw) {
      altimeterInHg = fromRaw;
    }
  }

  return {
    icaoId,
    receiptTime: typeof r.receiptTime === "string" ? r.receiptTime : undefined,
    obsTime: typeof r.obsTime === "number" ? r.obsTime : undefined,
    reportTime,
    temp: typeof r.temp === "number" ? r.temp : undefined,
    dewp: typeof r.dewp === "number" ? r.dewp : undefined,
    wdir: typeof r.wdir === "number" ? r.wdir : undefined,
    wspd: typeof r.wspd === "number" ? r.wspd : undefined,
    visib: typeof r.visib === "string" || typeof r.visib === "number" ? String(r.visib) : undefined,
    altimHpa,
    altimeterInHg,
    rawOb,
    fltCat: typeof r.fltCat === "string" ? r.fltCat : undefined,
    cover: typeof r.cover === "string" ? r.cover : undefined,
    lat: typeof r.lat === "number" ? r.lat : undefined,
    lon: typeof r.lon === "number" ? r.lon : undefined,
    elev: typeof r.elev === "number" ? r.elev : undefined,
    name: typeof r.name === "string" ? r.name : undefined,
  };
}

export interface FetchMetarOptions {
  fetchFn?: typeof fetch;
  baseUrl?: string;
  nowMs?: () => number;
  ttlMs?: number;
  forceRefresh?: boolean;
}

interface CacheEntry {
  obs: MetarObservation;
  fetchedAtMs: number;
}

const metarCache = new Map<string, CacheEntry>();

export function clearMetarCache(): void {
  metarCache.clear();
}

export function getCachedMetar(
  icaoId: string,
  maxAgeMs = DEFAULT_METAR_TTL_MS,
  nowMs = Date.now(),
): MetarObservation | null {
  const normalized = icaoId.trim().toUpperCase();
  const entry = metarCache.get(normalized);
  if (!entry) {
    return null;
  }
  if (nowMs - entry.fetchedAtMs > maxAgeMs) {
    return null;
  }
  return entry.obs;
}

export function setCachedMetar(obs: MetarObservation, nowMs = Date.now()): void {
  metarCache.set(obs.icaoId.trim().toUpperCase(), {
    obs,
    fetchedAtMs: nowMs,
  });
}

/**
 * Fetch and decode METAR observations for the given ICAO airport codes.
 * Returns a map of upper-case ICAO -> MetarObservation.
 * Gracefully returns cached or empty on network failure (never throws).
 */
export async function fetchMetar(
  icaoCodes: readonly string[],
  options: FetchMetarOptions = {},
): Promise<Map<string, MetarObservation>> {
  const result = new Map<string, MetarObservation>();
  if (!icaoCodes || icaoCodes.length === 0) {
    return result;
  }

  const fetchFn = options.fetchFn ?? (typeof fetch !== "undefined" ? fetch : undefined);
  const baseUrl = options.baseUrl ?? DEFAULT_METAR_BASE_URL;
  const now = (options.nowMs ? options.nowMs() : Date.now());
  const ttl = options.ttlMs ?? DEFAULT_METAR_TTL_MS;
  const forceRefresh = options.forceRefresh === true;

  const neededCodes: string[] = [];

  for (const rawCode of icaoCodes) {
    const code = rawCode.trim().toUpperCase();
    if (!code) continue;
    if (!forceRefresh) {
      const cached = getCachedMetar(code, ttl, now);
      if (cached) {
        result.set(code, cached);
        continue;
      }
    }
    neededCodes.push(code);
  }

  if (neededCodes.length === 0 || !fetchFn) {
    return result;
  }

  const url = `${baseUrl}?ids=${encodeURIComponent(neededCodes.join(","))}&format=json`;

  try {
    const res = await fetchFn(url);
    if (!res.ok) {
      return result;
    }
    const data = await res.json();
    if (Array.isArray(data)) {
      for (const item of data) {
        const obs = decodeMetarObservation(item);
        if (obs) {
          setCachedMetar(obs, now);
          result.set(obs.icaoId, obs);
        }
      }
    }
  } catch {
    // Network errors or invalid JSON return whatever was cached without throwing.
  }

  return result;
}
