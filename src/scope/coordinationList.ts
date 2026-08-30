/**
 * Analog: CRC STARS Coordination List & F13 Departure Release / Vice stars/cmdops.go.
 * Manages departure hold-for-release coordination lists, auto-release modes,
 * flashing unreleased indicators, and video maps directory formatting.
 */

import { formatAltitudeHundreds } from "./datablock";
import { isVideoMapOn } from "./dcbFunctions";
import { buildSystemListLines, rewriteFixForList, type ListFormatter } from "./listFormatter";
import type { ScopeView } from "./scopeView";

export interface ReleaseDeparture {
  id: string;
  callsign: string;
  aircraftType: string;
  squawk: string;
  exitFix: string;
  requestedAltitudeFt: number;
  released: boolean;
}

export interface CoordinationListState {
  id: string;
  facilityName: string;
  autoRelease: boolean;
  departures: ReleaseDeparture[];
}

export function createCoordinationList(
  id: string = "A",
  facilityName: string = "KDEM",
  departures: ReleaseDeparture[] = [],
): CoordinationListState {
  return {
    id,
    facilityName,
    autoRelease: false,
    departures,
  };
}

/**
 * Builds text lines for the in-scope Coordination List.
 */
export function buildCoordinationListLines(
  list: CoordinationListState,
  maxLines: number = 10,
): string[] {
  const header = list.autoRelease
    ? `${list.facilityName.toUpperCase().padEnd(12, " ")} AUTO`
    : list.facilityName.toUpperCase();

  const formatter: ListFormatter = {
    title: header,
    frameTitle: `COORDINATION (${list.id})`,
    maxLines,
    entries: list.departures.length,
    formatLine: (idx) => {
      const dep = list.departures[idx]!;
      const prefix = dep.released ? "+" : "*";
      const indexStr = String(idx + 1).padStart(2, "0");
      const acid = dep.callsign.padEnd(7, " ");
      const type = dep.aircraftType.padEnd(4, " ");
      const bcn = dep.squawk.padStart(4, "0");
      const exit = rewriteFixForList(dep.exitFix);
      const alt = formatAltitudeHundreds(dep.requestedAltitudeFt);
      return `${prefix}${indexStr} ${acid} ${type} ${bcn} ${exit} ${alt}`;
    },
  };
  return buildSystemListLines(formatter);
}

export type ReleaseResult =
  | { success: true; releasedCallsign: string }
  | { success: false; error: "ILL_FLIGHT" | "MULTIPLE_FLIGHTS" | "NOT_FOUND" };

/**
 * Releases a single unacknowledged departure (F13 with no parameters).
 */
export function releaseSingleDeparture(list: CoordinationListState): ReleaseResult {
  const unreleased = list.departures.filter((d) => !d.released);
  if (unreleased.length === 0) {
    return { success: false, error: "ILL_FLIGHT" };
  }
  if (unreleased.length > 1) {
    return { success: false, error: "MULTIPLE_FLIGHTS" };
  }
  const target = unreleased[0]!;
  target.released = true;
  return { success: true, releasedCallsign: target.callsign };
}

/**
 * Releases a specific flight by callsign (F13 <ACID>). If already released, deletes it from list.
 */
export function releaseDepartureByCallsign(
  list: CoordinationListState,
  callsign: string,
): ReleaseResult {
  const normalized = callsign.trim().toUpperCase();
  const index = list.departures.findIndex((d) => d.callsign.toUpperCase() === normalized);
  if (index < 0) {
    return { success: false, error: "NOT_FOUND" };
  }
  const dep = list.departures[index]!;
  if (dep.released) {
    // Second release removes it from the coordination list
    list.departures.splice(index, 1);
    return { success: true, releasedCallsign: dep.callsign };
  }
  dep.released = true;
  return { success: true, releasedCallsign: dep.callsign };
}

/**
 * Toggles auto-release mode for the coordination list (F13 P(ID) A* / M*).
 */
export function setCoordinationAutoRelease(list: CoordinationListState, auto: boolean): void {
  list.autoRelease = auto;
  if (auto) {
    // Automatically release any pending flights
    for (const dep of list.departures) {
      dep.released = true;
    }
  }
}

/**
 * Default example video maps for facility display when loaded maps are not present.
 */
export const DEFAULT_GEOGRAPHIC_MAPS = [
  { id: 3, shortName: "A90", fullName: "A90 BASE", active: false },
  { id: 12, shortName: "EOVM", fullName: "A90 EOVM", active: false },
  { id: 15, shortName: "MAIN", fullName: "BOS A90 MAIN", active: true },
  { id: 31, shortName: "27/22", fullName: "BOS 27/22", active: true },
  { id: 32, shortName: "27/32", fullName: "BOS 27/32", active: false },
];

/**
 * Builds Video Maps list lines with category groupings and '>' active indicators.
 * Format:
 * GEOGRAPHIC MAPS
 *    3 A90       A90 BASE
 *   12 EOVM      A90 EOVM
 * > 15 MAIN      BOS A90 MAIN
 * > 31 27/22     BOS 27/22
 *   32 27/32     BOS 27/32
 */
export function buildVideoMapsListLines(
  view: ScopeView,
  category: "ALL" | "GEO" | "SYS" | "CURRENT" = "ALL",
  maxLines: number = 20,
): string[] {
  const loadedMaps = view.digitalMap?.loadedVideoMaps ?? [];
  const entries: { id: number; shortName: string; fullName: string; active: boolean }[] = [];

  if (loadedMaps.length > 0) {
    for (let i = 0; i < loadedMaps.length; i++) {
      const map = loadedMaps[i]!;
      const active = isVideoMapOn(view, map.id);
      if (category === "CURRENT" && !active) {
        continue;
      }
      entries.push({
        id: map.starsId ?? map.dcbNumber ?? i + 1,
        shortName: map.dcbLabel || map.name || `MAP${i + 1}`,
        fullName: map.name || map.dcbLabel || `Map ${i + 1}`,
        active,
      });
    }
  } else {
    for (const m of DEFAULT_GEOGRAPHIC_MAPS) {
      if (category === "CURRENT" && !m.active) {
        continue;
      }
      entries.push(m);
    }
  }

  const title =
    category === "ALL" || category === "GEO" ? "GEOGRAPHIC MAPS" : `VIDEO MAPS (${category})`;

  const formatter: ListFormatter = {
    title,
    frameTitle: "GEOGRAPHIC MAPS (TX)",
    maxLines,
    entries: entries.length,
    formatLine: (idx) => {
      const e = entries[idx]!;
      const marker = e.active ? ">" : " ";
      const idStr = String(e.id).padStart(3, " ");
      const shortStr = e.shortName.padEnd(10, " ");
      return `${marker} ${idStr} ${shortStr}${e.fullName}`;
    },
  };
  return buildSystemListLines(formatter);
}
