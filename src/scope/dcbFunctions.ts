/**
 * Analog: CRC STARS DCB MAPS / RANGE / RR / LDR DIR / CHAR SIZE / BRITE (R07).
 * Trainer delta: numbered video-map catalog (`dcbLabel`), discrete range
 * presets, generated **range rings** (2/5/10 NM about airport ref), **leader**
 * L1–L9 direction only (no length menu), CHAR SIZE 11–13 px IBM Plex Mono,
 * BRITE map-stroke steps. Discrete range presets. Not a brightness slider.
 * Not NAS STARS.
 *
 * Scope display state only. Never a Command, readback, or intent.
 */

import type { World } from "@core";
import type { LoadedVideoMap } from "@scenario";
import { CHAR_SIZE_STEPS_PX, type CharSizePx } from "./fonts";
import { DEFAULT_LEADER_DIR, isLeaderDir, type LeaderDir } from "./leader";
import { MAP_BRITE_STEPS, type MapBriteIndex } from "./palette";
import type { ScopeView } from "./scopeView";
import { setLeaderDirForSelection } from "./trackDisplay";

export type DcbSubmenu = "maps" | "ldr" | null;
type VideoMapRole = NonNullable<LoadedVideoMap["role"]>;

export const RR_INTERVALS_NM = [2, 5, 10] as const;
export type RrIntervalNm = (typeof RR_INTERVALS_NM)[number];
export const DEFAULT_RR_INTERVAL_NM: RrIntervalNm = 5;

/** Numpad compass dirs offered by DCB LDR DIR — same as scope-focus L+digit. */
export const DCB_LEADER_DIRS: LeaderDir[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function snapRrInterval(nm: number): RrIntervalNm {
  for (const step of RR_INTERVALS_NM) {
    if (step === nm) {
      return step;
    }
  }
  return DEFAULT_RR_INTERVAL_NM;
}

export function initialMapVisibility(
  maps: LoadedVideoMap[] | undefined,
  showRunway: boolean,
  showLocalizer: boolean,
  showCoastline: boolean,
): Map<string, boolean> {
  const vis = new Map<string, boolean>();
  for (const map of maps ?? []) {
    if (map.role === "runway") {
      vis.set(map.id, showRunway);
    } else if (map.role === "localizer") {
      vis.set(map.id, showLocalizer);
    } else if (map.role === "coastline") {
      vis.set(map.id, showCoastline);
    } else {
      vis.set(map.id, map.defaultOn);
    }
  }
  return vis;
}

export function dcbCatalogMaps(view: ScopeView): LoadedVideoMap[] {
  return [...(view.digitalMap.loadedVideoMaps ?? [])].sort((a, b) => a.dcbNumber - b.dcbNumber);
}

export function videoMapByRole(view: ScopeView, role: VideoMapRole): LoadedVideoMap | undefined {
  return view.digitalMap.loadedVideoMaps?.find((map) => map.role === role);
}

export function isVideoMapOn(view: ScopeView, mapId: string): boolean {
  const map = view.digitalMap.loadedVideoMaps?.find((item) => item.id === mapId);
  if (!map) {
    return false;
  }
  return view.mapVisibility.get(mapId) ?? map.defaultOn;
}

function invalidateMapCache(view: ScopeView): void {
  view.mapCache = null;
}

function syncRoleFlag(view: ScopeView, map: LoadedVideoMap, on: boolean): void {
  if (map.role === "runway") {
    view.showRunway = on;
  } else if (map.role === "localizer") {
    view.showLocalizer = on;
  } else if (map.role === "coastline") {
    view.showCoastline = on;
  }
}

/** MAPS submenu toggle keyed by catalog id. Role maps share RWY/LOC/CST flags. */
export function toggleVideoMap(view: ScopeView, mapId: string): void {
  const map = view.digitalMap.loadedVideoMaps?.find((item) => item.id === mapId);
  if (!map) {
    return;
  }
  if (map.role === "coastline" && view.digitalMap.coastline?.enabled !== true) {
    return;
  }
  const next = !isVideoMapOn(view, mapId);
  view.mapVisibility.set(mapId, next);
  syncRoleFlag(view, map, next);
  invalidateMapCache(view);
}

export function syncRoleMapVisibility(view: ScopeView, role: VideoMapRole, on: boolean): void {
  const map = videoMapByRole(view, role);
  if (map) {
    view.mapVisibility.set(map.id, on);
  }
  invalidateMapCache(view);
}

export function formatDcbMapLabel(map: LoadedVideoMap): string {
  return `${map.dcbNumber} ${map.dcbLabel}`;
}

export function cycleRrInterval(view: ScopeView): void {
  const i = RR_INTERVALS_NM.indexOf(view.ringIntervalNm);
  const next = i < 0 ? 0 : (i + 1) % RR_INTERVALS_NM.length;
  view.ringIntervalNm = RR_INTERVALS_NM[next]!;
  invalidateMapCache(view);
}

export function formatDcbRrReadout(intervalNm: RrIntervalNm): string {
  return `RR ${intervalNm}`;
}

export function cycleCharSize(view: ScopeView): void {
  const i = CHAR_SIZE_STEPS_PX.indexOf(view.charSizePx);
  const next = i < 0 ? 0 : (i + 1) % CHAR_SIZE_STEPS_PX.length;
  view.charSizePx = CHAR_SIZE_STEPS_PX[next]!;
}

export function formatDcbCharReadout(sizePx: CharSizePx): string {
  return `CHAR ${sizePx}`;
}

export function cycleMapBrite(view: ScopeView): void {
  const next = (view.mapBriteIndex + 1) % MAP_BRITE_STEPS.length;
  view.mapBriteIndex = next as MapBriteIndex;
  invalidateMapCache(view);
}

export function formatDcbBriteReadout(index: MapBriteIndex): string {
  return `BRITE ${index + 1}`;
}

export function toggleDcbSubmenu(view: ScopeView, menu: Exclude<DcbSubmenu, null>): void {
  view.dcbSubmenu = view.dcbSubmenu === menu ? null : menu;
}

export function closeDcbSubmenu(view: ScopeView): void {
  view.dcbSubmenu = null;
}

export function armPlaceCenter(view: ScopeView): void {
  view.placeCenterArmed = !view.placeCenterArmed;
}

/**
 * DCB LDR DIR: same L1–L9 as scope-focus `L`+digit via `setLeaderDirForSelection`.
 * Direction only — no length menu.
 */
export function applyDcbLeaderDir(view: ScopeView, world: World, dir: LeaderDir): void {
  if (!isLeaderDir(dir)) {
    return;
  }
  setLeaderDirForSelection(view.tracks, world, dir);
}

export function dcbLeaderDirReadout(
  view: ScopeView,
  world?: { selectedAircraftId: string | null } | null,
): string {
  const selected = world?.selectedAircraftId;
  if (selected) {
    const dir = view.tracks.get(selected)?.leaderDir;
    if (dir != null) {
      return `L${dir}`;
    }
  }
  return `L${DEFAULT_LEADER_DIR}`;
}
