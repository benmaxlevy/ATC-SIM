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
export const WX_METAR_PROXY_PREFIX = "/api-metar";
export const DEFAULT_METAR_BASE_URL =
  typeof window !== "undefined" && window.location
    ? WX_METAR_PROXY_PREFIX
    : "https://aviationweather.gov/api/data/metar";
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
  const now = options.nowMs ? options.nowMs() : Date.now();
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

  const candidateUrls = [baseUrl];
  if (baseUrl.startsWith("/") && baseUrl !== "https://aviationweather.gov/api/data/metar") {
    candidateUrls.push("https://aviationweather.gov/api/data/metar");
  }

  for (const rootUrl of candidateUrls) {
    const url = `${rootUrl}?ids=${encodeURIComponent(neededCodes.join(","))}&format=json`;

    try {
      const res = await fetchFn(url);
      if (!res.ok) {
        continue;
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
        if (result.size > 0) {
          break;
        }
      }
    } catch {
      // Try next candidate URL
    }
  }

  return result;
}

/**
 * Format a live METAR observation as a concise GI TEXT line.
 * e.g. "KATL 00000KT 10SM 30/22 A3018"
 */
export function formatMetarGiLine(obs: MetarObservation): string {
  const parts: string[] = [obs.icaoId];
  if (obs.wdir !== undefined && obs.wspd !== undefined) {
    const dir = String(obs.wdir).padStart(3, "0");
    const spd = String(obs.wspd).padStart(2, "0");
    parts.push(`${dir}${spd}KT`);
  }
  if (obs.visib) {
    const cleanVis = String(obs.visib).replace("+", "").replace(/SM$/i, "");
    parts.push(`${cleanVis}SM`);
  }
  if (obs.temp !== undefined && obs.dewp !== undefined) {
    parts.push(`${Math.round(obs.temp)}/${Math.round(obs.dewp)}`);
  }
  if (obs.altimeterInHg) {
    const altDigits = obs.altimeterInHg.replace(".", "");
    parts.push(`A${altDigits}`);
  }
  return parts.join(" ");
}

/**
 * Update ScopeView primary altimeter, satellite altimeters, and optional GI weather slot.
 */
export function applyMetarToScopeView(
  view: {
    primaryAltimeter?: string;
    airportAltimeters?: { airportCode: string; altimeter: string }[];
    ssaWeatherAirports?: string[];
    giTextLines: string[];
    giFilterVisible: boolean[];
  },
  observations: Map<string, MetarObservation> | Record<string, MetarObservation>,
  options?: {
    primaryIcao?: string;
    giSlot?: number;
  },
): void {
  const getObs = (code: string): MetarObservation | undefined => {
    const normalized = code.trim().toUpperCase();
    if (observations instanceof Map) {
      return observations.get(normalized);
    }
    return (observations as Record<string, MetarObservation>)[normalized];
  };

  const weatherAirports = view.ssaWeatherAirports ?? [];
  const primaryIcao = options?.primaryIcao ?? weatherAirports[0];

  if (primaryIcao) {
    const primaryObs = getObs(primaryIcao);
    if (primaryObs) {
      view.primaryAltimeter = primaryObs.altimeterInHg;
      const giSlot = options?.giSlot;
      if (giSlot !== undefined && giSlot >= 0 && giSlot < view.giTextLines.length) {
        view.giTextLines[giSlot] = formatMetarGiLine(primaryObs);
        view.giFilterVisible[giSlot] = true;
      }
    }
  }

  const satAirports = weatherAirports.slice(1);
  if (satAirports.length > 0) {
    const satAlts: { airportCode: string; altimeter: string }[] = [];
    for (const code of satAirports) {
      const obs = getObs(code);
      if (obs) {
        satAlts.push({
          airportCode: obs.icaoId,
          altimeter: obs.altimeterInHg,
        });
      }
    }
    if (satAlts.length > 0) {
      view.airportAltimeters = satAlts;
    }
  }
}

/**
 * Start periodic METAR polling for a ScopeView.
 * Returns an unbind/dispose function to stop polling.
 */
export function startMetarPolling(
  view: {
    primaryAltimeter?: string;
    airportAltimeters?: { airportCode: string; altimeter: string }[];
    ssaWeatherAirports?: string[];
    giTextLines: string[];
    giFilterVisible: boolean[];
  },
  options?: {
    fetchOptions?: FetchMetarOptions;
    primaryIcao?: string;
    giSlot?: number;
    pollIntervalMs?: number;
  },
): () => void {
  const airports = view.ssaWeatherAirports ?? [];
  if (airports.length === 0) {
    return () => {};
  }

  const intervalMs = options?.pollIntervalMs ?? DEFAULT_METAR_TTL_MS;
  let active = true;

  const runPoll = async () => {
    if (!active) return;
    try {
      const obsMap = await fetchMetar(airports, options?.fetchOptions);
      if (active && obsMap.size > 0) {
        applyMetarToScopeView(view, obsMap, {
          primaryIcao: options?.primaryIcao,
          giSlot: options?.giSlot,
        });
      }
    } catch {
      // Polling errors are swallowed; retains previous state.
    }
  };

  // Immediate initial poll
  void runPoll();

  const timerId = setInterval(() => {
    void runPoll();
  }, intervalMs);

  return () => {
    active = false;
    clearInterval(timerId);
  };
}
