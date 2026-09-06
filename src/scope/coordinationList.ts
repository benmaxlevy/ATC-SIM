/**
 * Analog: CRC STARS Coordination List & F13 Departure Release / Vice stars/cmdops.go.
 * Manages departure hold-for-release coordination lists, auto-release modes,
 * flashing unreleased indicators, and video maps directory formatting.
 */

import { formatAltitudeHundreds } from "./datablock";
import { isVideoMapOn } from "./dcb/dcbFunctions";
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

export interface DefaultVideoMapEntry {
  id: number;
  mapId: string;
  name: string;
  shortName: string;
  fullName: string;
  active: boolean;
}

/**
 * Default example video maps for facility display when loaded maps are not present.
 * Matches STARS adaptation slots (1-30).
 */
export const DEFAULT_GEOGRAPHIC_MAPS: DefaultVideoMapEntry[] = [
  {
    id: 1,
    mapId: "1",
    name: "BOS AIRSPACE",
    shortName: "BOS",
    fullName: "BOS AIRSPACE",
    active: true,
  },
  {
    id: 2,
    mapId: "2",
    name: "FINAL 4R/4L",
    shortName: "4R/4L",
    fullName: "FINAL 4R/4L",
    active: false,
  },
  {
    id: 3,
    mapId: "3",
    name: "FINAL 22L/27",
    shortName: "22L/27",
    fullName: "FINAL 22L/27",
    active: false,
  },
  {
    id: 4,
    mapId: "4",
    name: "MVA SECTORS",
    shortName: "MVA",
    fullName: "MVA SECTORS",
    active: true,
  },
  {
    id: 5,
    mapId: "5",
    name: "VFR REPORTING",
    shortName: "VFR",
    fullName: "VFR REPORTING",
    active: false,
  },
];

export interface VideoMapListEntry {
  id: number;
  mapId: string;
  name: string;
  active: boolean;
  shortName?: string;
  fullName?: string;
}

/**
 * Resolves the list of video maps to display in the Video Maps list.
 */
export function getVideoMapsEntries(
  view: ScopeView,
  category: "ALL" | "GEO" | "SYS" | "CURRENT" = "ALL",
): VideoMapListEntry[] {
  const loadedMaps = view.digitalMap?.loadedVideoMaps ?? [];
  const entries: VideoMapListEntry[] = [];

  if (loadedMaps.length > 0) {
    for (let i = 0; i < loadedMaps.length; i++) {
      const map = loadedMaps[i]!;
      const active = isVideoMapOn(view, map.id);
      if (category === "CURRENT" && !active) {
        continue;
      }
      entries.push({
        id: map.starsId ?? map.dcbNumber ?? i + 1,
        mapId: map.id,
        name: map.dcbLabel || map.name || `Map ${i + 1}`,
        shortName: map.dcbLabel || map.name || `MAP${i + 1}`,
        fullName: map.name || map.dcbLabel || `Map ${i + 1}`,
        active,
      });
    }
  } else {
    for (const m of DEFAULT_GEOGRAPHIC_MAPS) {
      const active = isVideoMapOn(view, m.mapId);
      if (category === "CURRENT" && !active) {
        continue;
      }
      entries.push({
        id: m.id,
        mapId: m.mapId,
        name: m.name,
        shortName: m.shortName,
        fullName: m.fullName,
        active,
      });
    }
  }
  return entries;
}

/**
 * Builds Video Maps list lines with category groupings and '>' active indicators.
 *
 * Format (GEO MAPS / VIDEO MAPS):
 * VIDEO MAPS
 * >  1 BOS AIRSPACE
 *    2 FINAL 4R/4L
 *    3 FINAL 22L/27
 * >  4 MVA SECTORS
 *    5 VFR REPORTING
 *
 * Format (CURRENT / ACTIVE MAPS):
 * ACTIVE MAPS
 *  1 BOS AIRSPACE
 *  4 MVA SECTORS
 */
export function buildVideoMapsListLines(
  view: ScopeView,
  category: "ALL" | "GEO" | "SYS" | "CURRENT" = "ALL",
  maxLines: number = 20,
  offset?: number,
): string[] {
  const entries = getVideoMapsEntries(view, category);
  const isCurrent = category === "CURRENT";
  const title = isCurrent ? "ACTIVE MAPS" : "VIDEO MAPS";
  const frameTitle = isCurrent ? "ACTIVE MAPS (ML)" : "VIDEO MAPS (ML)";

  const formatter: ListFormatter = {
    title,
    frameTitle,
    maxLines,
    offset,
    entries: entries.length,
    formatLine: (idx) => {
      const e = entries[idx]!;
      const idStr = String(e.id).padStart(2, " ");
      if (isCurrent) {
        return `${idStr} ${e.name}`;
      }
      const marker = e.active ? "> " : "  ";
      return `${marker}${idStr} ${e.name}`;
    },
  };
  return buildSystemListLines(formatter);
}
