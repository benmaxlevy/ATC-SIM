/**
 * Load a facility MVA chart from `src/scenario/data/<icao>-mva.json`.
 * Missing file → null (procedure catalog still loads). Sibling of
 * `data/<icao>/` so the procedure schema stays procedure-only.
 */

import { parseMvaChart } from "./parse";
import type { MvaChart } from "./types";

const MVA_JSON = import.meta.glob<unknown>("../data/*-mva.json", {
  eager: true,
  import: "default",
});

/** Last path segment without `-mva.json`, so `KDEM` and `kdem` both work. */
export function mvaFileKey(airportId: string): string {
  return `../data/${airportId.trim().toLowerCase()}-mva.json`;
}

/**
 * Parse the committed MVA JSON for `airportId`, or `null` when that facility
 * has no chart yet.
 */
export function loadMva(airportId: string): MvaChart | null {
  const key = mvaFileKey(airportId);
  const raw = MVA_JSON[key];
  if (raw === undefined) {
    return null;
  }
  return parseMvaChart(raw);
}
