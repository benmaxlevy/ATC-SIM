/**
 * Analog: CRC STARS DCB RANGE / PLACE CNTR / OFF CNTR / RR / PLACE RR / RR CNTR /
 * LDR DIR / LDR / MAPS / GEO MAPS / CURRENT / WX / CHAR SIZE / BRITE (R07).
 * Trainer delta: numbered video-map catalog (`dcbLabel`) or CRC map-group
 * layout. GEO MAPS / CURRENT / *D ALL iterate the complete loaded inventory,
 * including maps absent from DCB groups. Empty DCB slots stay disabled. WX1–6
 * latch `view.wxLevels` (VIP 1–6). Generated **range rings** (2/5/10 NM, PLACE RR origin in world NM),
 * **leader** L1–L9 direction spinner plus discrete length 0/24/36/48 px,
 * CHAR SIZE per subsystem (DATA BLOCKS / LISTS / DCB / TOOLS / POS) on IBM
 * Plex Mono so FDB/LDB **datablock** cells stay character-cell. BRITE per
 * drawn channel as a 0–100 multiply. TPA J-rings 2/3/5/10 NM (selected or
 * owned tracks) live on the DCB TPA/ATPA submenu; ATPA cones paint from
 * `world.alerts.atpa` when the DCB toggle is on. Discrete range presets. Not a
 * font picker. Not NAS STARS.
 *
 * Scope display state only. Never a Command, readback, or intent.
 */

import type { World } from "@core";
import type { LoadedVideoMap, VideoMapGroup, VideoMapGroupSet, VideoMapGroupSlot } from "@scenario";
import {
  CHAR_SIZE_STEPS_PX,
  DCB_CHAR_SIZE_STEPS_PX,
  POS_SIZE_STEPS_PX,
  type CharSizeChannel,
  type CharSizePx,
} from "../fonts";
import {
  DEFAULT_LEADER_DIR,
  LEADER_LENGTH_STEPS_PX,
  isLeaderDir,
  type LeaderDir,
  type LeaderLengthPx,
} from "../leader";
import { BRITE_STEPS, type BriteChannel, type BriteLevel } from "../palette";
import {
  snapRangeRingToViewCenter,
  VOL_STEPS,
  type VolLevel,
  type ModeFsl,
  type DwellMode,
  type ScopeView,
} from "../scopeView";
import { setLeaderDirForSelection } from "../trackDisplay";
import { cloneWxLevels, type VipLevel } from "../wx";

type VideoMapRole = NonNullable<LoadedVideoMap["role"]>;

export const RR_INTERVALS_NM = [2, 5, 10] as const;
/** Keyboard `*RR` may set 20 NM; DCB spinner stays `RR_INTERVALS_NM`. */
export const RR_KEYBOARD_INTERVALS_NM = [2, 5, 10, 20] as const;
export type RrIntervalNm = (typeof RR_KEYBOARD_INTERVALS_NM)[number];
export const DEFAULT_RR_INTERVAL_NM: RrIntervalNm = 5;

/** Numpad compass dirs offered by DCB LDR DIR — same as scope-focus L+digit. */
export const DCB_LEADER_DIRS: LeaderDir[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** CRC analog numbered MAPS slots. Trainer catalog binds dcbNumber; unused stay empty. */
export const DCB_MAP_SLOT_COUNT = 32;
/** MAIN quick video-map toggles (catalog 1–6 / group MAIN). */
export const DCB_QUICK_MAP_COUNT = 6;
/** Group submenu slots start after MAIN 1–6 (`*D 7` is submenu[0]). */
export const DCB_GROUP_SUBMENU_SLOT_START = DCB_QUICK_MAP_COUNT + 1;
/** MAIN 6 + submenu 32. */
export const DCB_GROUP_SLOT_COUNT = DCB_QUICK_MAP_COUNT + DCB_MAP_SLOT_COUNT;

/** Optional layout for `*D` / `M` tokens when map groups are loaded. */
export interface VideoMapTokenLayout {
  groups?: VideoMapGroupSet;
  selectedGroupId?: string | null;
}

export function snapRrInterval(nm: number): RrIntervalNm {
  for (const step of RR_KEYBOARD_INTERVALS_NM) {
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
      vis.set(map.id, showRunway ? map.defaultOn : false);
    } else if (map.role === "localizer") {
      vis.set(map.id, showLocalizer ? map.defaultOn : false);
    } else if (map.role === "coastline") {
      vis.set(map.id, showCoastline);
    } else {
      vis.set(map.id, map.defaultOn);
    }
  }
  return vis;
}

function hasDcbNumber(map: LoadedVideoMap): map is LoadedVideoMap & { dcbNumber: number } {
  return map.dcbNumber !== undefined;
}

/** Complete loaded inventory. GEO / *D ALL / CURRENT iterate this, not DCB slots. */
export function loadedCatalogMaps(view: ScopeView): LoadedVideoMap[] {
  return [...(view.digitalMap.loadedVideoMaps ?? [])];
}

export function dcbCatalogMaps(view: ScopeView): LoadedVideoMap[] {
  return loadedCatalogMaps(view)
    .filter(hasDcbNumber)
    .sort((a, b) => a.dcbNumber - b.dcbNumber);
}

/** First group by `sourceIndex`. No A80 id hardcode. */
export function defaultSelectedMapGroupId(groups: VideoMapGroupSet | undefined): string | null {
  if (groups === undefined || groups.groups.length === 0) {
    return null;
  }
  const ordered = [...groups.groups].sort((a, b) => a.sourceIndex - b.sourceIndex);
  return ordered[0]!.id;
}

export function selectedVideoMapGroup(view: ScopeView): VideoMapGroup | undefined {
  const groups = view.digitalMap.videoMapGroups;
  if (groups === undefined || groups.groups.length === 0) {
    return undefined;
  }
  const selectedId = view.selectedMapGroupId;
  if (selectedId) {
    const hit = groups.groups.find((group) => group.id === selectedId);
    if (hit) {
      return hit;
    }
  }
  const fallbackId = defaultSelectedMapGroupId(groups);
  return groups.groups.find((group) => group.id === fallbackId);
}

export function videoMapTokenLayout(view: ScopeView): VideoMapTokenLayout {
  const groups = view.digitalMap.videoMapGroups;
  if (groups === undefined) {
    return {};
  }
  return { groups, selectedGroupId: view.selectedMapGroupId };
}

function groupById(
  groups: VideoMapGroupSet,
  selectedGroupId: string | null | undefined,
): VideoMapGroup | undefined {
  if (selectedGroupId) {
    const hit = groups.groups.find((group) => group.id === selectedGroupId);
    if (hit) {
      return hit;
    }
  }
  const fallbackId = defaultSelectedMapGroupId(groups);
  return groups.groups.find((group) => group.id === fallbackId);
}

function slotFromGroup(group: VideoMapGroup, slot: number): VideoMapGroupSlot | undefined {
  if (slot >= 1 && slot <= DCB_QUICK_MAP_COUNT) {
    return group.main[slot - 1];
  }
  if (slot >= DCB_GROUP_SUBMENU_SLOT_START && slot <= DCB_GROUP_SLOT_COUNT) {
    return group.submenu[slot - DCB_GROUP_SUBMENU_SLOT_START];
  }
  return undefined;
}

function mapForGroupSlot(
  maps: readonly LoadedVideoMap[],
  slot: VideoMapGroupSlot | undefined,
): LoadedVideoMap | undefined {
  if (slot === undefined || slot.starsId === null || slot.mapId === undefined) {
    return undefined;
  }
  return maps.find((map) => map.id === slot.mapId);
}

/** MAPS submenu cell numbers: 1–32 (KDEM dcbNumber) or 7–38 (group submenu). */
export function dcbMapsPageSlotNumbers(view: ScopeView): number[] {
  const start = selectedVideoMapGroup(view) ? DCB_GROUP_SUBMENU_SLOT_START : 1;
  return Array.from({ length: DCB_MAP_SLOT_COUNT }, (_, i) => start + i);
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

function anyRoleOn(view: ScopeView, role: VideoMapRole): boolean {
  return (view.digitalMap.loadedVideoMaps ?? []).some(
    (map) => map.role === role && isVideoMapOn(view, map.id),
  );
}

function syncRoleFlag(view: ScopeView, map: LoadedVideoMap): void {
  if (map.role === "runway") {
    view.showRunway = anyRoleOn(view, "runway");
  } else if (map.role === "localizer") {
    view.showLocalizer = anyRoleOn(view, "localizer");
  } else if (map.role === "coastline") {
    view.showCoastline = anyRoleOn(view, "coastline");
  }
}

/**
 * Catalog lookup for preview `*D` / `M` tokens.
 * Matches ULID `id`, `dcbLabel`, DCB layout slot, and CRC `starsId`.
 * Numeric tokens prefer CRC `starsId` so they match GEO MAPS, then fall back
 * to legacy KDEM `dcbNumber` or a selected group slot.
 */
export function resolveVideoMapToken(
  maps: readonly LoadedVideoMap[],
  token: string,
  layout?: VideoMapTokenLayout,
): LoadedVideoMap | undefined {
  const normalized = token.trim().toUpperCase();
  if (normalized.length === 0) {
    return undefined;
  }
  const byId = maps.find((map) => map.id.toUpperCase() === normalized);
  if (byId) {
    return byId;
  }
  if (/^\d+$/.test(normalized)) {
    const n = Number(normalized);
    const byStars = maps.find((map) => map.starsId === n);
    if (byStars) {
      return byStars;
    }
    const groups = layout?.groups;
    if (groups !== undefined) {
      const group = groupById(groups, layout?.selectedGroupId);
      const slotted = mapForGroupSlot(maps, group ? slotFromGroup(group, n) : undefined);
      if (slotted) {
        return slotted;
      }
    } else {
      const byDcb = maps.find((map) => map.dcbNumber === n);
      if (byDcb) {
        return byDcb;
      }
    }
  }
  return maps.find((map) => map.dcbLabel.toUpperCase() === normalized);
}

/** MAPS submenu toggle keyed by catalog id. Role maps share RWY/LOC/CST flags. */
export function toggleVideoMap(view: ScopeView, mapId: string, explicitState?: boolean): void {
  const map = view.digitalMap.loadedVideoMaps?.find((item) => item.id === mapId);
  if (!map) {
    return;
  }
  if (map.role === "coastline" && view.digitalMap.coastline?.enabled !== true) {
    return;
  }
  const currentlyOn = isVideoMapOn(view, mapId);
  const next = explicitState ?? !currentlyOn;
  if (next === currentlyOn) {
    return;
  }
  view.mapVisibility.set(mapId, next);
  syncRoleFlag(view, map);
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
  if (map.starsId !== undefined) {
    return `${map.starsId} ${map.dcbLabel}`;
  }
  if (map.dcbNumber === undefined) {
    return map.dcbLabel;
  }
  return `${map.dcbNumber} ${map.dcbLabel}`;
}

export function videoMapByDcbNumber(view: ScopeView, slot: number): LoadedVideoMap | undefined {
  const group = selectedVideoMapGroup(view);
  if (group) {
    return mapForGroupSlot(loadedCatalogMaps(view), slotFromGroup(group, slot));
  }
  return dcbCatalogMaps(view).find((map) => map.dcbNumber === slot);
}

export function isDcbMapSlotEnabled(view: ScopeView, slot: number): boolean {
  const map = videoMapByDcbNumber(view, slot);
  if (!map) {
    return false;
  }
  if (map.role === "coastline" && view.digitalMap.coastline?.enabled !== true) {
    return false;
  }
  return true;
}

/** CLR ALL: every catalog video map off. Coastline is a no-op when JSON `enabled: false`. */
export function clearAllVideoMaps(view: ScopeView): void {
  setAllVideoMaps(view, false);
}

/**
 * Bulk catalog on/off (`*D ALL` / `*D NONE`). Same coastline JSON-off skip as CLR ALL.
 * Syncs RWY/LOC/CST role flags and drops the map stroke cache.
 */
export function setAllVideoMaps(view: ScopeView, enabled: boolean): void {
  for (const map of loadedCatalogMaps(view)) {
    if (map.role === "coastline" && view.digitalMap.coastline?.enabled !== true) {
      continue;
    }
    view.mapVisibility.set(map.id, enabled);
    syncRoleFlag(view, map);
  }
  invalidateMapCache(view);
}

export type MapListKind = "geo" | "current";

/** GEO MAPS = every loaded video map + ON/OFF. CURRENT = maps that are on. */
export function buildMapListLines(view: ScopeView, kind: MapListKind): string[] {
  const maps = loadedCatalogMaps(view);
  if (kind === "geo") {
    return maps.map((map) => {
      const state = isVideoMapOn(view, map.id) ? "ON" : "OFF";
      return `${formatDcbMapLabel(map)} ${state}`;
    });
  }
  return maps.filter((map) => isVideoMapOn(view, map.id)).map((map) => formatDcbMapLabel(map));
}

export function toggleGeoMapsList(view: ScopeView): void {
  view.geoMapsListOn = !view.geoMapsListOn;
}

export function toggleCurrentMapsList(view: ScopeView): void {
  view.currentMapsListOn = !view.currentMapsListOn;
}

export function hideMapLists(view: ScopeView): void {
  view.geoMapsListOn = false;
  view.currentMapsListOn = false;
}

/**
 * DCB RR click-cycle (T02-17): 5 → 10 → 2 → OFF → 5. Kept for T02-21 walkthroughs.
 * MAIN RR is a spinner (`stepRrInterval`) and does not hide rings.
 */
export function cycleRrInterval(view: ScopeView): void {
  if (!view.showRings) {
    view.showRings = true;
    const i = (RR_INTERVALS_NM as readonly number[]).indexOf(view.ringIntervalNm);
    const next = i < 0 ? 0 : (i + 1) % RR_INTERVALS_NM.length;
    view.ringIntervalNm = RR_INTERVALS_NM[next]!;
    invalidateMapCache(view);
    return;
  }
  const i = (RR_INTERVALS_NM as readonly number[]).indexOf(view.ringIntervalNm);
  if (i === 0) {
    view.showRings = false;
    invalidateMapCache(view);
    return;
  }
  const next = i < 0 ? 0 : i + 1;
  view.ringIntervalNm = RR_INTERVALS_NM[next % RR_INTERVALS_NM.length]!;
  invalidateMapCache(view);
}

export function formatDcbRrReadout(intervalNm: RrIntervalNm, showRings: boolean = true): string {
  if (!showRings) {
    return "OFF";
  }
  return `${intervalNm}`;
}

function stepFrozen<T>(list: readonly T[], current: T, delta: number): T {
  const i = list.indexOf(current);
  if (i < 0) {
    return list[0]!;
  }
  const next = Math.max(0, Math.min(list.length - 1, i + Math.trunc(delta)));
  return list[next]!;
}

/**
 * DCB RR spinner: step the frozen 2/5/10 NM **range ring** interval. No wrap.
 * Does not hide rings (interval stays on while visible).
 */
export function stepRrInterval(view: ScopeView, delta: number): void {
  const inSpinner = (RR_INTERVALS_NM as readonly number[]).includes(view.ringIntervalNm);
  const current = inSpinner
    ? (view.ringIntervalNm as (typeof RR_INTERVALS_NM)[number])
    : snapRrToSpinner(view.ringIntervalNm);
  const next = stepFrozen(RR_INTERVALS_NM, current, delta);
  if (next === view.ringIntervalNm && view.showRings) {
    return;
  }
  view.ringIntervalNm = next;
  view.showRings = true;
  invalidateMapCache(view);
}

function snapRrToSpinner(nm: number): (typeof RR_INTERVALS_NM)[number] {
  let closest: (typeof RR_INTERVALS_NM)[number] = RR_INTERVALS_NM[0]!;
  let minDiff = Math.abs(nm - closest);
  for (const step of RR_INTERVALS_NM) {
    const diff = Math.abs(nm - step);
    if (diff < minDiff) {
      minDiff = diff;
      closest = step;
    }
  }
  return closest;
}

/** Keyboard `*RR 2|5|10|20`: set interval and turn rings on. */
export function setRangeRingInterval(view: ScopeView, intervalNm: RrIntervalNm): void {
  view.ringIntervalNm = intervalNm;
  view.showRings = true;
  invalidateMapCache(view);
}

export function cycleCharSize(view: ScopeView): void {
  const i = CHAR_SIZE_STEPS_PX.indexOf(view.charSizes.dataBlocks);
  const next = i < 0 ? 0 : (i + 1) % CHAR_SIZE_STEPS_PX.length;
  view.charSizes.dataBlocks = CHAR_SIZE_STEPS_PX[next]!;
  view.charSizePx = view.charSizes.dataBlocks;
}

export function formatDcbCharReadout(sizePx: CharSizePx | number): string {
  return String(sizePx);
}

export function stepCharSizeChannel(
  view: ScopeView,
  channel: CharSizeChannel,
  delta: number,
): void {
  if (channel === "dcb") {
    view.charSizes.dcb = stepFrozen(DCB_CHAR_SIZE_STEPS_PX, view.charSizes.dcb, delta);
    return;
  }
  if (channel === "pos") {
    view.charSizes.pos = stepFrozen(POS_SIZE_STEPS_PX, view.charSizes.pos, delta);
    return;
  }
  view.charSizes[channel] = stepFrozen(CHAR_SIZE_STEPS_PX, view.charSizes[channel], delta);
  if (channel === "dataBlocks") {
    view.charSizePx = view.charSizes.dataBlocks;
  }
}

const MAP_CACHE_BRITE_CHANNELS: ReadonlySet<BriteChannel> = new Set(["mpa", "mpb", "rr", "cmp"]);

export function stepBriteChannel(view: ScopeView, channel: BriteChannel, delta: number): void {
  view.brite[channel] = stepFrozen(BRITE_STEPS, view.brite[channel], delta);
  if (MAP_CACHE_BRITE_CHANNELS.has(channel)) {
    invalidateMapCache(view);
  }
}

/** T02-17 leftover: click-cycle MPA so older walkthroughs still mutate BRITE. */
export function cycleMapBrite(view: ScopeView): void {
  const i = BRITE_STEPS.indexOf(view.brite.mpa);
  const next = i < 0 ? 0 : (i + 1) % BRITE_STEPS.length;
  view.brite.mpa = BRITE_STEPS[next]!;
  invalidateMapCache(view);
}

export function formatDcbBriteReadout(level: BriteLevel | number): string {
  if (level === 0) {
    return "OFF";
  }
  return String(level);
}

export function armPlaceCenter(view: ScopeView): void {
  const next = !view.placeCenterArmed;
  view.placeRangeRingArmed = false;
  view.placeCenterArmed = next;
}

/** PLACE RR: next PPI click sets **range ring** origin in world NM. */
export function armPlaceRangeRing(view: ScopeView): void {
  const next = !view.placeRangeRingArmed;
  view.placeCenterArmed = false;
  view.placeRangeRingArmed = next;
}

/** RR CNTR: snap ring origin to the view **center**. */
export function applyRrCenter(view: ScopeView): void {
  snapRangeRingToViewCenter(view);
}

/**
 * DCB LDR DIR: same L1–L9 as scope-focus `L`+digit via `setLeaderDirForSelection`.
 * Spinner steps 1–9 (no wrap). Radio-focus `L090` is still a left turn.
 */
export function applyDcbLeaderDir(view: ScopeView, world: World, dir: LeaderDir): void {
  if (!isLeaderDir(dir)) {
    return;
  }
  view.defaultLeaderDir = dir;
  setLeaderDirForSelection(view.tracks, world, dir);
}

export function dcbLeaderDirValue(
  view: ScopeView,
  world?: { selectedAircraftId: string | null } | null,
): LeaderDir {
  const selected = world?.selectedAircraftId;
  if (selected) {
    const dir = view.tracks.get(selected)?.leaderDir;
    if (dir != null) {
      return dir;
    }
  }
  return view.defaultLeaderDir ?? DEFAULT_LEADER_DIR;
}

export function stepDcbLeaderDir(view: ScopeView, world: World | undefined, delta: number): void {
  const next = stepFrozen(DCB_LEADER_DIRS, dcbLeaderDirValue(view, world), delta);
  view.defaultLeaderDir = next;
  if (world) {
    setLeaderDirForSelection(view.tracks, world, next);
  }
}

export function dcbLeaderDirReadout(
  view: ScopeView,
  world?: { selectedAircraftId: string | null } | null,
): string {
  return `L${dcbLeaderDirValue(view, world)}`;
}

export function formatDcbLdrLengthReadout(lengthPx: LeaderLengthPx): string {
  return `${lengthPx}`;
}

export function stepDcbLeaderLength(view: ScopeView, delta: number): void {
  view.leaderLengthPx = stepFrozen(LEADER_LENGTH_STEPS_PX, view.leaderLengthPx, delta);
}

/**
 * MAIN WX1–WX6 latch. Index 0 is VIP 1. Display only — never a Command.
 */
export function toggleWxLevel(view: ScopeView, level: VipLevel): void {
  const i = level - 1;
  if (i < 0 || i > 5) {
    return;
  }
  const next = cloneWxLevels(view.wxLevels) as [
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
    boolean,
  ];
  next[i] = !next[i];
  view.wxLevels = next;
}

/**
 * AUX VOL spinner (0–5). Modulates workstation CA alert tone volume.
 */
export function stepDcbVol(view: ScopeView, delta: number): void {
  view.vol = stepFrozen(VOL_STEPS, view.vol, delta);
}

export function formatDcbVolReadout(vol: VolLevel): string {
  return `${vol}`;
}

export const MODE_FSL_STEPS: readonly ModeFsl[] = ["F", "S", "L"];

/**
 * Step MODE FSL spinner ("F" <-> "S" <-> "L").
 */
export function stepModeFsl(view: ScopeView, delta: number): ModeFsl {
  const next = stepFrozen(MODE_FSL_STEPS, view.modeFsl, delta);
  view.modeFsl = next;
  return next;
}

/**
 * MAIN MODE FSL 3-state toggle latch.
 * Cycles "F" (Full) -> "S" (Semi/Partial) -> "L" (Limited) -> "F".
 */
export function cycleModeFsl(view: ScopeView): ModeFsl {
  const next: ModeFsl = view.modeFsl === "F" ? "S" : view.modeFsl === "S" ? "L" : "F";
  view.modeFsl = next;
  return next;
}

export const HISTORY_RATE_STEPS = [1.0, 2.0, 3.0, 4.0, 4.5, 5.0, 6.0, 8.0, 10.0] as const;

/**
 * Step AUX H_RATE spinner.
 */
export function stepHistoryRate(view: ScopeView, delta: number): number {
  const next = stepFrozen(HISTORY_RATE_STEPS, view.historyRateSec, delta);
  view.historyRateSec = next;
  return next;
}

export function formatDcbHistoryRateReadout(rate: number): string {
  return Number(rate).toFixed(1);
}

export const DWELL_MODES: readonly DwellMode[] = ["OFF", "ON", "LOCK"];

/**
 * Step AUX DWELL mode spinner ("OFF" <-> "ON" <-> "LOCK").
 */
export function stepDwellMode(view: ScopeView, delta: number): DwellMode {
  const next = stepFrozen(DWELL_MODES, view.dwellMode, delta);
  view.dwellMode = next;
  if (next === "OFF") {
    view.dwellLockedAircraftId = null;
  }
  return next;
}

/**
 * Cycle AUX DWELL mode ("OFF" -> "ON" -> "LOCK" -> "OFF").
 */
export function cycleDwellMode(view: ScopeView): DwellMode {
  const next: DwellMode =
    view.dwellMode === "OFF" ? "ON" : view.dwellMode === "ON" ? "LOCK" : "OFF";
  view.dwellMode = next;
  if (next === "OFF") {
    view.dwellLockedAircraftId = null;
  }
  return next;
}

export function formatDcbDwellReadout(mode: DwellMode): string {
  return mode;
}

/**
 * Toggle AUX CURSOR HOME button.
 */
export function toggleCursorHome(view: ScopeView): boolean {
  view.cursorHome = !view.cursorHome;
  return view.cursorHome;
}

export const CURSOR_SPEED_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * Step AUX CSR SPD spinner (1–10).
 */
export function stepCursorSpeed(view: ScopeView, delta: number): number {
  const next = stepFrozen(CURSOR_SPEED_STEPS, view.cursorSpeed, delta);
  view.cursorSpeed = next;
  return next;
}

export function formatDcbCursorSpeedReadout(speed: number): string {
  return `${speed}`;
}
