/**
 * Analog: CRC STARS DCB PREF / DCB position TOP / LEFT / RIGHT / BOTTOM /
 * PREF SAVE AS name prompt (docs.virtualnas.net/crc/stars — R07).
 * STARS spec: 32 local preference-set slots (16 columns x 2 rows = 32 slots; CRC analog / NAS host sets),
 * persisted in localStorage, facility-keyed and schema-versioned. One DCB at a
 * time along a PPI edge. LEFT/RIGHT are a vertical cell stack; TOP/BOTTOM stay
 * horizontal. Drawable PPI size is the host minus DCB thickness on that edge.
 * Trainer delta: named local sets collected via the preview-area / status-line
 * buffer (eight-slot analog; this table is 32). Enter writes the first empty
 * slot, or the last slot when full. Esc cancels before any write. Digit-only
 * names are rejected (FIL reserved). No window.prompt, no HTML <input>,
 * not a settings panel / profile modal / theme picker. Not a NAS preference host.
 * Display snapshot only — never Command IR, speech prefs, command-line text,
 * or world kinematics.
 *
 * PREF may persist SITE display mode only (T02-76). Stored site IDs are
 * validated against current adapted `radarSites`; unknown → FUSED. Per-track
 * PTL (`ptlByAircraftId`) and per-track TPA stay session state, not PREF.
 * CRC R07 SITE is disabled in its FUSION-only analog; this trainer lifts
 * FUSED / MULTI / adapted sites (R05 FOA display data).
 *
 * Scope display state only. Never a Command, readback, or intent.
 */

import { RANGE_PRESETS_NM, type RangeNm } from "../camera";
import { defaultSelectedMapGroupId, snapRrInterval, type RrIntervalNm } from "./dcbFunctions";
import { cloneCharSizes, type CharSizes } from "../fonts";
import { type HistoryDotCount } from "../history";
import {
  LEADER_LENGTH_STEPS_PX,
  isLeaderDir,
  type LeaderDir,
  type LeaderLengthPx,
} from "../leader";
import { cloneBrite, type BriteLevel, type BriteState } from "../palette";
import { PTL_MINUTE_PRESETS, type PtlMinutes } from "../ptl";
import {
  createScopeView,
  DEFAULT_VOL_LEVEL,
  DEFAULT_DWELL_MODE,
  DEFAULT_HISTORY_RATE_SEC,
  DEFAULT_CURSOR_SPEED,
  DEFAULT_SERVICE_MODE,
  clearFmaSurveillanceView,
  configureFmaSurveillanceView,
  setDcbDock,
  setSurveillanceMode,
  type DwellMode,
  type FmaAmzPreference,
  type ScopeView,
  type VolLevel,
} from "../scopeView";
import { GI_SLOT_COUNT, SSA_FILTER_FIELDS, type SsaVisibility } from "../ssa";
import {
  DEFAULT_ATPA_STATE,
  DEFAULT_TPA_STATE,
  TPA_RADIUS_NM,
  type AtpaState,
  type TpaRadiusNm,
  type TpaState,
} from "../tpa";
import { resolveSurveillancePref, type SurveillanceMode } from "../surveillance";
import { cloneWxLevels, type WxLevels } from "../wx";
import { canonicalSystemListId, ensureSystemListPlacement } from "../systemLists";
import type { FmaAmz } from "../../core/alerts/fmaGeometry";

export type DcbDock = "TOP" | "LEFT" | "RIGHT" | "BOTTOM";

/** Same 36 px thickness as the horizontal bar (two text rows + 1 px gutters). */
export const DCB_THICKNESS_PX = 36;

export function isVerticalDcbDock(dock: DcbDock): boolean {
  return dock === "LEFT" || dock === "RIGHT";
}

/**
 * Camera view size after reserving DCB thickness on the docked edge.
 * Canvas clientWidth/Height should match this remaining rect.
 */
export function drawablePpiSize(
  hostWidthPx: number,
  hostHeightPx: number,
  dock: DcbDock,
  thicknessPx: number = DCB_THICKNESS_PX,
): { widthPx: number; heightPx: number } {
  if (isVerticalDcbDock(dock)) {
    return { widthPx: Math.max(0, hostWidthPx - thicknessPx), heightPx: hostHeightPx };
  }
  return { widthPx: hostWidthPx, heightPx: Math.max(0, hostHeightPx - thicknessPx) };
}

/** STARS specification: 32 preference slots (16 columns x 2 rows). */
export const DCB_PREF_SLOT_COUNT = 32;

/** MAIN PREF second-line budget. CRC analog is a short set name (e.g. 22/27). */
export const DCB_PREF_READOUT_MAX_CHARS = 6;

/** SAVE AS type-in budget. Stored exact; MAIN still clips to the readout cap. */
export const DCB_PREF_NAME_MAX_CHARS = 8;

/**
 * Body schema version. Writes always emit this. `parseDcbPrefJson` also
 * accepts `v: 1` (T02-29 / T02-46: `atpa: { on }` plus optional readout
 * flags) and fills the four ATPA sub-toggles from documented defaults.
 * `v: 2` loads with all six WX levels off when `wxLevels` is absent.
 * The storage key's `v1` is the T02-29 namespace, not this body version.
 */
export const DCB_PREF_SCHEMA_VERSION = 3 as const;

/** Readable PREF body versions. A mere v1 or v2 file is not corrupt. */
export const DCB_PREF_READABLE_VERSIONS: readonly number[] = [1, 2, 3];

export type DcbPrefStorage = Pick<Storage, "getItem" | "setItem">;

/** Display snapshot body. Not settings/theme. Not NAS PREF. */
export interface DcbPrefBody {
  dcbDock: DcbDock;
  rangeNm: RangeNm;
  centerEastNm: number;
  centerNorthNm: number;
  ringIntervalNm: RrIntervalNm;
  rangeRingEastNm: number;
  rangeRingNorthNm: number;
  mapVisibility: Record<string, boolean>;
  selectedMapGroupId?: string | null;
  mapListMode?: "GEO" | "CURRENT";
  geoMapsListOn?: boolean;
  currentMapsListOn?: boolean;
  dcbVisible?: boolean;
  modeCVisible?: boolean;
  altitudeFilter?: { minHundreds: number; maxHundreds: number };
  associatedAltitudeFilter?: { minHundreds: number; maxHundreds: number };
  mciEnabled?: boolean;
  beaconSelectCodes?: string[];
  caControllerOwnedPairsInhibited?: boolean;
  showRunway: boolean;
  showLocalizer: boolean;
  showRings: boolean;
  showCoastline: boolean;
  showCompassRose?: boolean;
  defaultLeaderDir: LeaderDir;
  leaderLengthPx: LeaderLengthPx;
  historyDotCount: HistoryDotCount;
  lastHistoryDotCount: Exclude<HistoryDotCount, 0>;
  ptlMinutes: PtlMinutes;
  ptlOwn: boolean;
  ptlOn: boolean;
  brite: BriteState;
  charSizes: CharSizes;
  ssaFilter: SsaVisibility;
  giFilterVisible: boolean[];
  tpa: TpaState;
  atpa: AtpaState;
  /** SITE display mode only. Per-track PTL / TPA are not stored. */
  surveillanceMode: SurveillanceMode;
  wxLevels: WxLevels;
  vol?: VolLevel;
  modeFsl?: unknown;
  amzPreferences?: Record<string, FmaAmzPreference>;
  /** Last locally selected AMZ; validated against the scenario flow when rebound. */
  selectedFmaAmzId?: string;
  historyRateSec?: number;
  dwellMode?: DwellMode;
  cursorHome?: boolean;
  cursorSpeed?: number;
  systemLists?: Record<string, { visible: boolean; x: number; y: number; maxLines: number }>;
}

export interface DcbPrefSlot {
  name: string;
  body: DcbPrefBody;
}

export interface DcbPrefFile {
  v: typeof DCB_PREF_SCHEMA_VERSION;
  icao: string;
  activeIndex?: number;
  slots: Array<DcbPrefSlot | null>;
  /** Last successfully selected or saved normal display profile. */
  normalProfile?: DcbPrefBody;
  amzPreferences?: Record<string, FmaAmzPreference>;
  selectedFmaAmzId?: string;
}

/** Live PREF machine on ScopeView. Slots are the trainer 32-set table. */
export interface DcbPrefRuntime {
  icao: string;
  slots: Array<DcbPrefSlot | null>;
  activeIndex: number;
  restore: DcbPrefBody | null;
  /** FMA-specific part of the in-menu RESTORE snapshot; never persisted. */
  restoreAmzProfile: FmaAmzPreference | null;
  /** Last successfully selected or saved normal display profile, independent of FMA edits. */
  normalProfile: DcbPrefBody | null;
  /** True while SAVE AS waits for a preview-area name. Not persisted. */
  pendingSaveAs: boolean;
}

const DOCKS: readonly DcbDock[] = ["TOP", "LEFT", "RIGHT", "BOTTOM"];

export function emptyDcbPrefSlots(): Array<DcbPrefSlot | null> {
  return Array.from({ length: DCB_PREF_SLOT_COUNT }, () => null);
}

export function emptyDcbPrefRuntime(icao: string = ""): DcbPrefRuntime {
  return {
    icao,
    slots: emptyDcbPrefSlots(),
    activeIndex: 0,
    restore: null,
    restoreAmzProfile: null,
    normalProfile: null,
    pendingSaveAs: false,
  };
}

export type DcbPrefNameParse =
  { ok: true; name: string } | { ok: false; reason: "empty" | "non-alnum" | "digit-only" };

/**
 * Non-empty alphanumeric only. Digit-only is reserved for FIL-style input.
 * Exact stored spelling; display clips/uppercases separately.
 */
export function parseDcbPrefName(raw: string): DcbPrefNameParse {
  const name = raw.trim();
  if (name.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (!/^[A-Za-z0-9]+$/.test(name)) {
    return { ok: false, reason: "non-alnum" };
  }
  if (/^\d+$/.test(name)) {
    return { ok: false, reason: "digit-only" };
  }
  return { ok: true, name };
}

/** First empty slot, or the last slot when the table is full. */
export function nextDcbPrefSaveAsIndex(view: Pick<ScopeView, "dcbPref">): number {
  const index = view.dcbPref.slots.findIndex((slot) => slot === null);
  if (index < 0) {
    return DCB_PREF_SLOT_COUNT - 1;
  }
  return index;
}

/** Stored name of the active filled slot; empty string when the slot is vacant. */
export function activeDcbPrefName(view: Pick<ScopeView, "dcbPref">): string {
  return view.dcbPref.slots[view.dcbPref.activeIndex]?.name?.trim() ?? "";
}

/** DCB MAIN second line: uppercase, clipped to the cap budget. */
export function formatDcbPrefReadout(name: string): string {
  const compact = name.trim().replace(/\s+/g, " ").toUpperCase();
  if (compact.length <= DCB_PREF_READOUT_MAX_CHARS) {
    return compact;
  }
  return compact.slice(0, DCB_PREF_READOUT_MAX_CHARS).trimEnd();
}

export function dcbPrefStorageKey(icao: string): string {
  return `atc-sim.dcb.pref.v1.${icao}`;
}

function isReadablePrefSchemaVersion(value: unknown): boolean {
  return typeof value === "number" && DCB_PREF_READABLE_VERSIONS.includes(value);
}

function isRangeNm(value: unknown): value is RangeNm {
  return (RANGE_PRESETS_NM as readonly number[]).includes(value as number);
}

function isDock(value: unknown): value is DcbDock {
  return typeof value === "string" && (DOCKS as readonly string[]).includes(value);
}

function isLeaderLength(value: unknown): value is LeaderLengthPx {
  return (LEADER_LENGTH_STEPS_PX as readonly number[]).includes(value as number);
}

function isHistoryCount(value: unknown): value is HistoryDotCount {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 9;
}

function isPtlMinutes(value: unknown): value is PtlMinutes {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 15) {
    return false;
  }
  if ((PTL_MINUTE_PRESETS as readonly number[]).includes(value)) {
    return true;
  }
  return Number.isInteger(value);
}

function isTpaRadius(value: unknown): value is TpaRadiusNm {
  return (TPA_RADIUS_NM as readonly number[]).includes(value as number);
}

function isAltitudeFilter(value: unknown): value is { minHundreds: number; maxHundreds: number } {
  return (
    !!value &&
    typeof value === "object" &&
    Number.isInteger((value as { minHundreds?: unknown }).minHundreds) &&
    Number.isInteger((value as { maxHundreds?: unknown }).maxHundreds) &&
    (value as { minHundreds: number }).minHundreds >= 0 &&
    (value as { maxHundreds: number }).maxHundreds <= 180 &&
    (value as { minHundreds: number }).minHundreds <= (value as { maxHundreds: number }).maxHundreds
  );
}

/** Missing or malformed WX levels become six false. Valid six-boolean arrays pass through. */
function parseWxLevels(value: unknown): WxLevels {
  if (!Array.isArray(value) || value.length !== 6) {
    return cloneWxLevels();
  }
  if (!value.every((flag) => typeof flag === "boolean")) {
    return cloneWxLevels();
  }
  return cloneWxLevels([value[0], value[1], value[2], value[3], value[4], value[5]]);
}

function cloneSsa(filter: SsaVisibility): SsaVisibility {
  const next = {} as SsaVisibility;
  for (const field of SSA_FILTER_FIELDS) {
    next[field] = filter[field] !== false;
  }
  return next;
}

function cloneGiVisible(visible: readonly boolean[]): boolean[] {
  return Array.from({ length: GI_SLOT_COUNT }, (_, i) => visible[i] === true);
}

function mapToRecord(map: Map<string, boolean>): Record<string, boolean> {
  const record: Record<string, boolean> = {};
  for (const [id, on] of map) {
    record[id] = on;
  }
  return record;
}

function completeDisplayProfile(view: ScopeView): DcbPrefBody {
  const body = serializeDcbPref(view);
  delete body.amzPreferences;
  delete body.selectedFmaAmzId;
  return body;
}

function slotDisplayBody(view: ScopeView): DcbPrefBody {
  const body = serializeDcbPref(view);
  delete body.amzPreferences;
  return body;
}

export function serializeDcbPref(view: ScopeView): DcbPrefBody {
  return {
    dcbDock: view.dcbDock,
    rangeNm: view.camera.rangeNm,
    centerEastNm: view.camera.centerEastNm,
    centerNorthNm: view.camera.centerNorthNm,
    ringIntervalNm: view.ringIntervalNm,
    rangeRingEastNm: view.rangeRingEastNm,
    rangeRingNorthNm: view.rangeRingNorthNm,
    mapVisibility: mapToRecord(view.mapVisibility),
    selectedMapGroupId: view.selectedMapGroupId,
    mapListMode: view.mapListMode ?? "GEO",
    geoMapsListOn: view.geoMapsListOn,
    currentMapsListOn: view.currentMapsListOn,
    dcbVisible: view.dcbVisible,
    modeCVisible: view.modeCVisible,
    altitudeFilter: { ...view.altitudeFilter },
    associatedAltitudeFilter: { ...view.associatedAltitudeFilter },
    mciEnabled: view.mciEnabled,
    beaconSelectCodes: [...view.beaconSelectCodes],
    caControllerOwnedPairsInhibited: view.caControllerOwnedPairsInhibited,
    showRunway: view.showRunway,
    showLocalizer: view.showLocalizer,
    showRings: view.showRings,
    showCoastline: view.showCoastline,
    showCompassRose: view.showCompassRose,
    defaultLeaderDir: view.defaultLeaderDir,
    leaderLengthPx: view.leaderLengthPx,
    historyDotCount: view.historyDotCount,
    lastHistoryDotCount: view.lastHistoryDotCount,
    ptlMinutes: view.ptlMinutes,
    ptlOwn: view.ptlOwn,
    ptlOn: view.ptlOn,
    brite: cloneBrite(view.brite),
    charSizes: cloneCharSizes(view.charSizes),
    ssaFilter: cloneSsa(view.ssaFilter),
    giFilterVisible: cloneGiVisible(view.giFilterVisible),
    tpa: { on: view.tpa.on, radiusNm: view.tpa.radiusNm },
    atpa: {
      on: view.atpa.on,
      inTrailDistance: view.atpa.inTrailDistance,
      coneMileage: view.atpa.coneMileage,
      alertCones: view.atpa.alertCones,
      monitorCones: view.atpa.monitorCones,
    },
    surveillanceMode: view.surveillanceMode,
    wxLevels: cloneWxLevels(view.wxLevels),
    vol: view.vol ?? DEFAULT_VOL_LEVEL,
    amzPreferences:
      view.amzPreferences && view.amzPreferences.size > 0
        ? Object.fromEntries(view.amzPreferences.entries())
        : undefined,
    selectedFmaAmzId: view.fmaSurveillance.selectedAmzId ?? view.fmaDefaultAmzId ?? undefined,
    historyRateSec: view.historyRateSec ?? DEFAULT_HISTORY_RATE_SEC,
    dwellMode: view.dwellMode ?? DEFAULT_DWELL_MODE,
    cursorHome: view.cursorHome ?? false,
    cursorSpeed: view.cursorSpeed ?? DEFAULT_CURSOR_SPEED,
    systemLists: view.systemLists
      ? Object.fromEntries(
          Object.entries(view.systemLists)
            .filter(([id]) => canonicalSystemListId(id) === id)
            .map(([id, p]) => [id, { visible: p.visible, x: p.x, y: p.y, maxLines: p.maxLines }]),
        )
      : undefined,
  };
}

function applyMapVisibility(
  view: ScopeView,
  record: Record<string, boolean>,
  complete = false,
): void {
  const maps = view.digitalMap.loadedVideoMaps ?? [];
  for (const map of maps) {
    if (complete || Object.prototype.hasOwnProperty.call(record, map.id)) {
      view.mapVisibility.set(map.id, record[map.id] === true);
    }
  }
  view.mapCache = null;
}

export function applyDcbPref(view: ScopeView, body: DcbPrefBody): void {
  if (isDock(body.dcbDock)) {
    setDcbDock(view, body.dcbDock);
  }
  if (isRangeNm(body.rangeNm)) {
    view.camera.rangeNm = body.rangeNm;
  }
  if (Number.isFinite(body.centerEastNm) && Number.isFinite(body.centerNorthNm)) {
    view.camera.centerEastNm = body.centerEastNm;
    view.camera.centerNorthNm = body.centerNorthNm;
  }
  view.ringIntervalNm = snapRrInterval(body.ringIntervalNm);
  if (Number.isFinite(body.rangeRingEastNm) && Number.isFinite(body.rangeRingNorthNm)) {
    view.rangeRingEastNm = body.rangeRingEastNm;
    view.rangeRingNorthNm = body.rangeRingNorthNm;
  }
  if (body.mapVisibility && typeof body.mapVisibility === "object") {
    applyMapVisibility(view, body.mapVisibility, body.selectedMapGroupId !== undefined);
  }
  if (body.selectedMapGroupId !== undefined) {
    const validGroup = view.digitalMap.videoMapGroups?.groups.some(
      (group) => group.id === body.selectedMapGroupId,
    );
    view.selectedMapGroupId =
      body.selectedMapGroupId === null || validGroup
        ? body.selectedMapGroupId
        : defaultSelectedMapGroupId(view.digitalMap.videoMapGroups);
  }
  if (body.mapListMode === "GEO" || body.mapListMode === "CURRENT")
    view.mapListMode = body.mapListMode;
  if (body.geoMapsListOn !== undefined) view.geoMapsListOn = body.geoMapsListOn === true;
  if (body.currentMapsListOn !== undefined)
    view.currentMapsListOn = body.currentMapsListOn === true;
  if (body.dcbVisible !== undefined) view.dcbVisible = body.dcbVisible === true;
  if (body.modeCVisible !== undefined) view.modeCVisible = body.modeCVisible === true;
  if (body.altitudeFilter && isAltitudeFilter(body.altitudeFilter))
    view.altitudeFilter = { ...body.altitudeFilter };
  if (body.associatedAltitudeFilter && isAltitudeFilter(body.associatedAltitudeFilter)) {
    view.associatedAltitudeFilter = { ...body.associatedAltitudeFilter };
  }
  if (body.mciEnabled !== undefined) view.mciEnabled = body.mciEnabled === true;
  if (
    Array.isArray(body.beaconSelectCodes) &&
    body.beaconSelectCodes.every((code) => typeof code === "string")
  ) {
    view.beaconSelectCodes = [...body.beaconSelectCodes];
  }
  if (body.caControllerOwnedPairsInhibited !== undefined) {
    view.caControllerOwnedPairsInhibited = body.caControllerOwnedPairsInhibited === true;
  }
  view.showRunway = body.showRunway === true;
  view.showLocalizer = body.showLocalizer === true;
  view.showRings = body.showRings === true;
  view.showCoastline = body.showCoastline === true;
  if (body.showCompassRose !== undefined) {
    view.showCompassRose = body.showCompassRose;
  }
  if (isLeaderDir(body.defaultLeaderDir)) {
    view.defaultLeaderDir = body.defaultLeaderDir;
  }
  if (isLeaderLength(body.leaderLengthPx)) {
    view.leaderLengthPx = body.leaderLengthPx;
  }
  if (isHistoryCount(body.historyDotCount)) {
    view.historyDotCount = body.historyDotCount;
    view.historyEnabled = body.historyDotCount > 0;
  }
  if (isHistoryCount(body.lastHistoryDotCount)) {
    view.lastHistoryDotCount = body.lastHistoryDotCount;
  }
  if (isPtlMinutes(body.ptlMinutes)) {
    view.ptlMinutes = body.ptlMinutes;
  }
  view.ptlOwn = body.ptlOwn === true;
  view.ptlOn = body.ptlOn === true;
  view.brite = cloneBrite({ ...cloneBrite(), ...(body.brite ?? {}) });
  view.charSizes = cloneCharSizes(body.charSizes);
  view.charSizePx = view.charSizes.dataBlocks;
  view.ssaFilter = cloneSsa(body.ssaFilter ?? view.ssaFilter);
  view.giFilterVisible = cloneGiVisible(body.giFilterVisible ?? view.giFilterVisible);
  view.tpa = {
    on: body.tpa?.on === true,
    radiusNm: isTpaRadius(body.tpa?.radiusNm) ? body.tpa.radiusNm : DEFAULT_TPA_STATE.radiusNm,
  };
  view.atpa = {
    ...DEFAULT_ATPA_STATE,
    on: body.atpa?.on === true,
    inTrailDistance: body.atpa?.inTrailDistance !== false,
    coneMileage: body.atpa?.coneMileage !== false,
    alertCones: body.atpa?.alertCones !== false,
    monitorCones: body.atpa?.monitorCones !== false,
  };
  setSurveillanceMode(view, resolveSurveillancePref(body.surveillanceMode, view.radarSites));
  view.wxLevels = parseWxLevels(body.wxLevels);
  view.vol =
    body.vol !== undefined && body.vol >= 0 && body.vol <= 5
      ? (body.vol as VolLevel)
      : DEFAULT_VOL_LEVEL;
  // Note: legacy modeFsl field is intentionally ignored and discarded (T02-225).
  if (body.amzPreferences && typeof body.amzPreferences === "object") {
    for (const [amzId, pref] of Object.entries(body.amzPreferences)) {
      if (pref && typeof pref === "object" && typeof pref.amzId === "string") {
        view.amzPreferences.set(amzId, pref);
      }
    }
  }
  if (typeof body.selectedFmaAmzId === "string") {
    view.fmaDefaultAmzId = body.selectedFmaAmzId;
  }
  view.historyRateSec =
    typeof body.historyRateSec === "number" && body.historyRateSec > 0
      ? body.historyRateSec
      : DEFAULT_HISTORY_RATE_SEC;
  view.dwellMode =
    body.dwellMode === "OFF" || body.dwellMode === "ON" || body.dwellMode === "LOCK"
      ? body.dwellMode
      : DEFAULT_DWELL_MODE;
  view.cursorHome = body.cursorHome === true;
  view.cursorSpeed =
    typeof body.cursorSpeed === "number" && body.cursorSpeed >= 1 && body.cursorSpeed <= 10
      ? body.cursorSpeed
      : DEFAULT_CURSOR_SPEED;
  if (body.systemLists && typeof body.systemLists === "object") {
    for (const [id, saved] of Object.entries(body.systemLists)) {
      const p = ensureSystemListPlacement(view, id);
      if (p && saved) {
        if (typeof saved.visible === "boolean") p.visible = saved.visible;
        if (typeof saved.x === "number") p.x = saved.x;
        if (typeof saved.y === "number") p.y = saved.y;
        if (typeof saved.maxLines === "number") p.maxLines = saved.maxLines;
      }
    }
  }
  view.mapCache = null;
}

/** Factory display defaults. Does not wipe tracks / aircraft. */
export function applyDcbPrefDefaults(view: ScopeView): void {
  if (view.fmaSurveillance.enabled) {
    const amzId = view.fmaSurveillance.selectedAmzId;
    const applied = amzId ? applyFmaAmzPreference(view, amzId) : false;
    view.lastWarning = applied ? null : "NO PREF SET FOUND";
    return;
  }
  applyDcbPref(view, factoryDisplayProfile(view));
  view.dcbPref.normalProfile = completeDisplayProfile(view);
}

function factoryDisplayProfile(view: ScopeView): DcbPrefBody {
  const factory = createScopeView(view.airportEastNm, view.airportNorthNm, {
    digitalMap: view.digitalMap,
    giTextLines: view.giTextLines,
    showCoastline: view.digitalMap.coastline?.enabled === true,
    arp: view.arp,
    radarSites: view.radarSites,
  });
  return completeDisplayProfile(factory);
}

/** Return from FMA to the last selected/saved normal profile. */
export function applyLastNormalDcbPref(view: ScopeView): void {
  if (view.dcbPref.normalProfile) {
    applyDcbPref(view, view.dcbPref.normalProfile);
  } else {
    applyDcbPrefDefaults(view);
  }
}

export function beginDcbPrefSession(view: ScopeView): void {
  view.dcbPref.restore = serializeDcbPref(view);
  const amzId = view.fmaSurveillance.enabled ? view.fmaSurveillance.selectedAmzId : null;
  const amz = view.fmaAmzs.find((candidate) => candidate.id === amzId);
  view.dcbPref.restoreAmzProfile = amz ? captureFmaAmzPreference(view, amz) : null;
}

export function restoreDcbPrefSession(view: ScopeView): void {
  if (view.dcbPref.restore) {
    applyDcbPref(view, view.dcbPref.restore);
    const amzProfile = view.dcbPref.restoreAmzProfile;
    if (amzProfile) applyFmaAmzPreferenceValue(view, amzProfile.amzId, amzProfile);
  }
}

function captureFmaAmzPreference(view: ScopeView, amz: FmaAmz): FmaAmzPreference {
  const activeRunways = new Set(amz.members.map((member) => member.runwayId));
  const runwayLeaders: Record<string, number> = {};
  for (const [runwayId, direction] of view.fmaRunwayLeaders) {
    if (activeRunways.has(runwayId) && direction !== null && isLeaderDir(direction)) {
      runwayLeaders[runwayId] = direction;
    }
  }
  const disabledNtzs = view.fmaAlertInhibit.ntzIds ?? new Set<string>();
  return {
    amzId: amz.id,
    mag: view.fmaMag,
    ptlSeconds: view.fmaPtlSeconds,
    voiceLevel: view.fmaVoiceLevel,
    fmaBrite: {
      amz: view.brite.amz,
      ntz: view.brite.ntz,
      rwy: view.brite.rwy,
      ref: view.brite.ref,
    },
    runwayLeaders,
    enabledNtzIds: amz.ntzs.filter((ntz) => !disabledNtzs.has(ntz.id)).map((ntz) => ntz.id),
    displayProfile: completeDisplayProfile(view),
  };
}

function isCompleteDisplayProfile(value: unknown): value is DcbPrefBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<DcbPrefBody>;
  return (
    isDock(body.dcbDock) &&
    isRangeNm(body.rangeNm) &&
    Number.isFinite(body.centerEastNm) &&
    Number.isFinite(body.centerNorthNm) &&
    !!body.mapVisibility &&
    typeof body.mapVisibility === "object" &&
    !Array.isArray(body.mapVisibility) &&
    Object.values(body.mapVisibility).every((enabled) => typeof enabled === "boolean") &&
    !!body.brite &&
    typeof body.brite === "object" &&
    Object.values(body.brite).length > 0 &&
    Object.values(body.brite).every(
      (level) => typeof level === "number" && Number.isFinite(level) && level >= 0 && level <= 100,
    ) &&
    !!body.charSizes &&
    typeof body.charSizes === "object" &&
    !!body.ssaFilter &&
    typeof body.ssaFilter === "object" &&
    Array.isArray(body.giFilterVisible) &&
    body.giFilterVisible.every((visible) => typeof visible === "boolean") &&
    !!body.tpa &&
    typeof body.tpa === "object" &&
    !!body.atpa &&
    typeof body.atpa === "object" &&
    Array.isArray(body.wxLevels) &&
    body.wxLevels.length === 6 &&
    body.wxLevels.every((enabled) => typeof enabled === "boolean") &&
    typeof body.showRunway === "boolean" &&
    typeof body.showLocalizer === "boolean" &&
    typeof body.showRings === "boolean" &&
    typeof body.showCoastline === "boolean" &&
    typeof body.ptlOwn === "boolean" &&
    typeof body.ptlOn === "boolean" &&
    body.defaultLeaderDir !== undefined &&
    isLeaderDir(body.defaultLeaderDir) &&
    isLeaderLength(body.leaderLengthPx)
  );
}

export function selectDcbPrefSlot(view: ScopeView, index: number): void {
  if (view.fmaSurveillance.enabled) return;
  if (index < 0 || index >= DCB_PREF_SLOT_COUNT) {
    return;
  }
  view.dcbPref.activeIndex = index;
  const slot = view.dcbPref.slots[index];
  if (slot) {
    applyDcbPref(view, slot.body);
    view.dcbPref.normalProfile = completeDisplayProfile(view);
  }
}

export function persistDcbPref(view: ScopeView, storage?: DcbPrefStorage): void {
  persistRuntime(view, storage);
}

function persistRuntime(view: ScopeView, storage: DcbPrefStorage | undefined): void {
  if (!storage) {
    return;
  }
  const icao = view.dcbPref.icao.trim().toUpperCase();
  if (!icao) {
    return;
  }
  view.dcbPref.icao = icao;
  const file: DcbPrefFile = {
    v: DCB_PREF_SCHEMA_VERSION,
    icao,
    activeIndex: view.dcbPref.activeIndex,
    slots: view.dcbPref.slots,
    normalProfile: view.dcbPref.normalProfile ?? undefined,
    amzPreferences:
      view.amzPreferences.size > 0 ? Object.fromEntries(view.amzPreferences.entries()) : undefined,
    selectedFmaAmzId: view.fmaSurveillance.selectedAmzId ?? view.fmaDefaultAmzId ?? undefined,
  };
  storage.setItem(dcbPrefStorageKey(icao), JSON.stringify(file));
}

export function saveDcbPref(view: ScopeView, storage?: DcbPrefStorage): void {
  if (view.fmaSurveillance.enabled) {
    captureSelectedFmaAmzPreference(view);
    persistRuntime(view, storage);
    return;
  }
  const index = view.dcbPref.activeIndex;
  const name = view.dcbPref.slots[index]?.name ?? `PREF ${index + 1}`;
  captureSelectedFmaAmzPreference(view);
  view.dcbPref.slots[index] = { name, body: slotDisplayBody(view) };
  view.dcbPref.normalProfile = completeDisplayProfile(view);
  persistRuntime(view, storage);
}

/**
 * Arm SAVE AS naming. Does not write a slot. Esc via `cancelDcbPrefSaveAs`
 * clears this before any persist.
 */
export function beginDcbPrefSaveAs(view: ScopeView): void {
  view.dcbPref.pendingSaveAs = true;
}

export function cancelDcbPrefSaveAs(view: ScopeView): void {
  view.dcbPref.pendingSaveAs = false;
}

export function isDcbPrefSaveAsPending(view: Pick<ScopeView, "dcbPref">): boolean {
  return view.dcbPref.pendingSaveAs;
}

/**
 * Commit a parsed name to the first empty slot, or the last slot when full.
 * Invalid names return null and leave pending SAVE AS armed.
 */
export function commitDcbPrefSaveAs(
  view: ScopeView,
  rawName: string,
  storage?: DcbPrefStorage,
): number | null {
  if (!view.dcbPref.pendingSaveAs) {
    return null;
  }
  const parsed = parseDcbPrefName(rawName);
  if (!parsed.ok) {
    return null;
  }
  if (view.fmaSurveillance.enabled) {
    const amzId = view.fmaSurveillance.selectedAmzId;
    if (!amzId || parsed.name !== amzId) return null;
    captureSelectedFmaAmzPreference(view);
    view.dcbPref.pendingSaveAs = false;
    persistRuntime(view, storage);
    return view.dcbPref.activeIndex;
  }
  const index = nextDcbPrefSaveAsIndex(view);
  captureSelectedFmaAmzPreference(view);
  view.dcbPref.slots[index] = { name: parsed.name, body: slotDisplayBody(view) };
  view.dcbPref.normalProfile = completeDisplayProfile(view);
  view.dcbPref.activeIndex = index;
  view.dcbPref.pendingSaveAs = false;
  persistRuntime(view, storage);
  return index;
}

export function deleteDcbPref(view: ScopeView, storage?: DcbPrefStorage): void {
  if (view.fmaSurveillance.enabled) {
    const amzId = view.fmaSurveillance.selectedAmzId;
    if (amzId) view.amzPreferences.delete(amzId);
    persistRuntime(view, storage);
    return;
  }
  view.dcbPref.slots[view.dcbPref.activeIndex] = null;
  persistRuntime(view, storage);
}

function parseSlot(raw: unknown): DcbPrefSlot | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw !== "object") {
    return null;
  }
  const slot = raw as { name?: unknown; body?: unknown };
  if (typeof slot.name !== "string" || slot.body === null || typeof slot.body !== "object") {
    return null;
  }
  return { name: slot.name, body: slot.body as DcbPrefBody };
}

export function parseDcbPrefJson(raw: string | null, icao: string): DcbPrefFile {
  const fallback: DcbPrefFile = {
    v: DCB_PREF_SCHEMA_VERSION,
    icao,
    activeIndex: 0,
    slots: emptyDcbPrefSlots(),
    amzPreferences: undefined,
  };
  if (raw === null || raw === "") {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") {
      return fallback;
    }
    const file = parsed as {
      v?: unknown;
      icao?: unknown;
      slots?: unknown;
      activeIndex?: unknown;
      normalProfile?: unknown;
      amzPreferences?: unknown;
      selectedFmaAmzId?: unknown;
    };
    if (!isReadablePrefSchemaVersion(file.v) || typeof file.icao !== "string") {
      return fallback;
    }
    if (!Array.isArray(file.slots)) {
      return fallback;
    }
    const activeIndex =
      typeof file.activeIndex === "number" &&
      file.activeIndex >= 0 &&
      file.activeIndex < DCB_PREF_SLOT_COUNT
        ? file.activeIndex
        : 0;
    const parsedSlots = file.slots.slice(0, DCB_PREF_SLOT_COUNT).map((slot) => parseSlot(slot));
    while (parsedSlots.length < DCB_PREF_SLOT_COUNT) {
      parsedSlots.push(null);
    }
    return {
      v: DCB_PREF_SCHEMA_VERSION,
      icao: file.icao,
      activeIndex,
      slots: parsedSlots,
      ...(file.v === DCB_PREF_SCHEMA_VERSION && isCompleteDisplayProfile(file.normalProfile)
        ? { normalProfile: file.normalProfile }
        : {}),
      ...(file.amzPreferences && typeof file.amzPreferences === "object"
        ? { amzPreferences: file.amzPreferences as Record<string, FmaAmzPreference> }
        : {}),
      ...(typeof file.selectedFmaAmzId === "string"
        ? { selectedFmaAmzId: file.selectedFmaAmzId }
        : {}),
    };
  } catch {
    return fallback;
  }
}

/** Boot helper: load slots and apply the last active filled slot. Corrupt JSON → factory. */
export function loadDcbPrefFromStorage(
  view: ScopeView,
  icao: string,
  storage: DcbPrefStorage,
): void {
  view.dcbPref.icao = icao;
  view.amzPreferences.clear();
  if (view.fmaSurveillance.enabled) {
    clearFmaSurveillanceView(view);
    configureFmaSurveillanceView(view, false, null);
  }
  view.fmaCandidateMode = false;
  if (view.serviceMode === "FMA") view.serviceMode = DEFAULT_SERVICE_MODE;
  const parsedFile = parseDcbPrefJson(storage.getItem(dcbPrefStorageKey(icao)), icao);
  const file =
    parsedFile.icao.trim().toUpperCase() === icao.trim().toUpperCase()
      ? parsedFile
      : parseDcbPrefJson(null, icao);
  view.dcbPref.slots = file.slots;
  view.dcbPref.activeIndex = file.activeIndex ?? 0;
  if (file.selectedFmaAmzId) view.fmaDefaultAmzId = file.selectedFmaAmzId;
  view.dcbPref.normalProfile = file.normalProfile ?? null;
  if (file.amzPreferences) {
    for (const [id, pref] of Object.entries(file.amzPreferences)) {
      if (pref && typeof pref === "object" && pref.amzId === id) view.amzPreferences.set(id, pref);
    }
  }
  // Older v1–v3 files stored AMZ preferences inside a normal slot body.
  for (const slot of view.dcbPref.slots) {
    if (slot?.body?.amzPreferences && typeof slot.body.amzPreferences === "object") {
      for (const [id, pref] of Object.entries(slot.body.amzPreferences)) {
        if (pref && typeof pref === "object" && pref.amzId === id && !view.amzPreferences.has(id)) {
          view.amzPreferences.set(id, pref);
        }
      }
    }
  }
  const slot = view.dcbPref.slots[view.dcbPref.activeIndex];
  if (file.normalProfile) {
    applyDcbPref(view, file.normalProfile);
  } else if (slot) {
    applyDcbPref(view, slot.body);
    view.dcbPref.normalProfile = completeDisplayProfile(view);
  } else {
    // Establish a valid factory baseline now; subsequent unsaved changes never
    // become the FMA exit target.
    applyDcbPrefDefaults(view);
    view.dcbPref.normalProfile = completeDisplayProfile(view);
  }
  // Root namespace wins over legacy slot-embedded copies.
  if (file.amzPreferences) {
    view.amzPreferences.clear();
    for (const [id, pref] of Object.entries(file.amzPreferences)) {
      if (pref && typeof pref === "object" && pref.amzId === id) view.amzPreferences.set(id, pref);
    }
  }
}

export function browserDcbPrefStorage(): DcbPrefStorage | null {
  try {
    const storage = globalThis.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

/** Per-AMZ FMA PTL ceiling; older/authored adapters without one keep the 30 s default. */
export function getFmaMaximumPtlSeconds(
  amzs: readonly { id: string; monitoring?: { maximumPtlS?: number } }[],
  amzId: string | null | undefined,
): number {
  const adaptedMaximum = amzs.find((amz) => amz.id === amzId)?.monitoring?.maximumPtlS;
  return typeof adaptedMaximum === "number" &&
    Number.isFinite(adaptedMaximum) &&
    adaptedMaximum >= 0
    ? Math.floor(adaptedMaximum)
    : 30;
}

/**
 * Apply AMZ-keyed FMA display settings from local preference store (TI 6191.409 §4.1, §6.16.2).
 * Returns true if preference set existed and was applied; false if not found.
 */
export function applyFmaAmzPreference(view: ScopeView, amzId: string): boolean {
  const pref = view.amzPreferences.get(amzId);
  if (!pref || pref.amzId !== amzId) {
    return false;
  }
  return applyFmaAmzPreferenceValue(view, amzId, pref);
}

function applyFmaAmzPreferenceValue(
  view: ScopeView,
  amzId: string,
  pref: FmaAmzPreference,
): boolean {
  const completeProfile = isCompleteDisplayProfile(pref.displayProfile)
    ? pref.displayProfile
    : null;
  if (completeProfile) {
    applyDcbPref(view, completeProfile);
    applyMapVisibility(view, completeProfile.mapVisibility ?? {}, true);
  } else {
    applyDcbPref(view, view.dcbPref.normalProfile ?? factoryDisplayProfile(view));
  }
  if (!completeProfile && isRangeNm(pref.rangeNm)) {
    view.camera.rangeNm = pref.rangeNm;
  }
  if (
    !completeProfile &&
    Number.isFinite(pref.centerEastNm) &&
    Number.isFinite(pref.centerNorthNm)
  ) {
    view.camera.centerEastNm = pref.centerEastNm!;
    view.camera.centerNorthNm = pref.centerNorthNm!;
  }
  if (!completeProfile && pref.mapVisibility && typeof pref.mapVisibility === "object") {
    applyMapVisibility(view, pref.mapVisibility);
  }
  if (
    typeof pref.mag === "number" &&
    Number.isInteger(pref.mag) &&
    pref.mag >= 1 &&
    pref.mag <= 8
  ) {
    view.fmaMag = pref.mag;
  }
  if (
    typeof pref.ptlSeconds === "number" &&
    Number.isInteger(pref.ptlSeconds) &&
    pref.ptlSeconds >= 0
  ) {
    view.fmaPtlSeconds = Math.min(pref.ptlSeconds, getFmaMaximumPtlSeconds(view.fmaAmzs, amzId));
  }
  if (
    typeof pref.voiceLevel === "number" &&
    Number.isInteger(pref.voiceLevel) &&
    pref.voiceLevel >= 1 &&
    pref.voiceLevel <= 10
  ) {
    view.fmaVoiceLevel = pref.voiceLevel;
  }
  if (pref.fmaBrite) {
    const validBrite = (n: unknown) =>
      Number.isInteger(n) && (n === 0 || ((n as number) >= 5 && (n as number) <= 100));
    const validNtzBrite = (n: unknown) =>
      Number.isInteger(n) && (n as number) >= 50 && (n as number) <= 100;
    if (validBrite(pref.fmaBrite.amz)) view.brite.amz = pref.fmaBrite.amz as unknown as BriteLevel;
    if (validNtzBrite(pref.fmaBrite.ntz))
      view.brite.ntz = pref.fmaBrite.ntz as unknown as BriteLevel;
    if (validBrite(pref.fmaBrite.rwy)) view.brite.rwy = pref.fmaBrite.rwy as unknown as BriteLevel;
    if (validBrite(pref.fmaBrite.ref)) view.brite.ref = pref.fmaBrite.ref as unknown as BriteLevel;
  }
  if (
    pref.runwayLeaders &&
    typeof pref.runwayLeaders === "object" &&
    !Array.isArray(pref.runwayLeaders)
  ) {
    const activeAmz = view.fmaAmzs.find((a) => a.id === amzId);
    const activeRunways = new Set(activeAmz?.members.map((member) => member.runwayId) ?? []);
    const entries = Object.entries(pref.runwayLeaders);
    const knownRunwayEntries = entries.filter(([rwy]) => activeRunways.has(rwy));
    // An empty snapshot means all this AMZ's runway overrides are NONE. An
    // unknown-only field is invalid and must not disturb live assignments.
    if (entries.length === 0 || knownRunwayEntries.length > 0) {
      for (const runwayId of activeRunways) view.fmaRunwayLeaders.delete(runwayId);
    }
    for (const [rwy, dir] of knownRunwayEntries) {
      if (activeRunways.has(rwy) && dir !== null && isLeaderDir(dir)) {
        view.fmaRunwayLeaders.set(rwy, dir as unknown as LeaderDir);
      }
    }
  }
  if (Array.isArray(pref.enabledNtzIds)) {
    const activeAmz = view.fmaAmzs.find((a) => a.id === amzId);
    if (activeAmz) {
      const knownIds = new Set(activeAmz.ntzs.map((n) => n.id));
      const allReferencesValid = pref.enabledNtzIds.every(
        (id) => typeof id === "string" && knownIds.has(id),
      );
      if (allReferencesValid) {
        const enabledSet = new Set(pref.enabledNtzIds);
        const disabledNtzs = new Set(
          activeAmz.ntzs.filter((n) => !enabledSet.has(n.id)).map((n) => n.id),
        );
        view.fmaAlertInhibit = { ...view.fmaAlertInhibit, ntzIds: disabledNtzs };
      }
    }
  }
  if (!completeProfile) {
    pref.displayProfile = completeDisplayProfile(view);
    persistRuntime(view, browserDcbPrefStorage() ?? undefined);
  }
  return true;
}

/** Capture current selected-AMZ display state only on explicit PREF SAVE. */
function captureSelectedFmaAmzPreference(view: ScopeView): void {
  const amzId = view.fmaSurveillance.enabled ? view.fmaSurveillance.selectedAmzId : null;
  const amz = view.fmaAmzs.find((candidate) => candidate.id === amzId);
  if (!amz) return;
  const runwayLeaders: Record<string, number> = {};
  const activeRunways = new Set(amz.members.map((member) => member.runwayId));
  for (const [rwy, dir] of view.fmaRunwayLeaders) {
    if (activeRunways.has(rwy) && dir !== null && isLeaderDir(dir)) runwayLeaders[rwy] = dir;
  }
  const disabled = view.fmaAlertInhibit.ntzIds ?? new Set<string>();
  saveFmaAmzPreference(view, amz.id, {
    mag: view.fmaMag,
    ptlSeconds: view.fmaPtlSeconds,
    voiceLevel: view.fmaVoiceLevel,
    fmaBrite: {
      amz: view.brite.amz,
      ntz: view.brite.ntz,
      rwy: view.brite.rwy,
      ref: view.brite.ref,
    },
    runwayLeaders,
    enabledNtzIds: amz.ntzs.filter((ntz) => !disabled.has(ntz.id)).map((ntz) => ntz.id),
    rangeNm: view.camera.rangeNm,
    centerEastNm: view.camera.centerEastNm,
    centerNorthNm: view.camera.centerNorthNm,
    mapVisibility: mapToRecord(view.mapVisibility),
    displayProfile: completeDisplayProfile(view),
  });
}

/**
 * Save AMZ-keyed FMA display settings to local preference store.
 */
export function saveFmaAmzPreference(
  view: ScopeView,
  amzId: string,
  settings?: Partial<FmaAmzPreference>,
): FmaAmzPreference {
  const existing = view.amzPreferences.get(amzId);
  const activeAmz = view.fmaAmzs.find((a) => a.id === amzId);
  const disabledNtzs = view.fmaAlertInhibit.ntzIds ?? new Set<string>();
  const currentEnabledNtzs = activeAmz
    ? activeAmz.ntzs.filter((n) => !disabledNtzs.has(n.id)).map((n) => n.id)
    : undefined;
  const currentRunwayLeaders: Record<string, number> = {};
  for (const [rwy, dir] of view.fmaRunwayLeaders.entries()) {
    if (dir !== null && dir !== undefined) {
      currentRunwayLeaders[rwy] = dir;
    }
  }
  const profileBase =
    settings?.displayProfile ?? existing?.displayProfile ?? completeDisplayProfile(view);
  const displayProfile = JSON.parse(JSON.stringify(profileBase)) as DcbPrefBody;
  displayProfile.rangeNm = (settings?.rangeNm ?? profileBase.rangeNm) as RangeNm;
  displayProfile.centerEastNm = settings?.centerEastNm ?? profileBase.centerEastNm;
  displayProfile.centerNorthNm = settings?.centerNorthNm ?? profileBase.centerNorthNm;
  displayProfile.mapVisibility = JSON.parse(
    JSON.stringify(settings?.mapVisibility ?? profileBase.mapVisibility),
  ) as Record<string, boolean>;
  const updated: FmaAmzPreference = {
    amzId,
    mag: settings?.mag ?? existing?.mag ?? view.fmaMag,
    ptlSeconds: settings?.ptlSeconds ?? existing?.ptlSeconds ?? view.fmaPtlSeconds,
    fmaBrite: settings?.fmaBrite ??
      existing?.fmaBrite ?? {
        amz: view.brite.amz,
        ntz: view.brite.ntz,
        rwy: view.brite.rwy,
        ref: view.brite.ref,
      },
    runwayLeaders: settings?.runwayLeaders ?? existing?.runwayLeaders ?? currentRunwayLeaders,
    enabledNtzIds: settings?.enabledNtzIds ?? existing?.enabledNtzIds ?? currentEnabledNtzs,
    voiceLevel: settings?.voiceLevel ?? existing?.voiceLevel ?? view.fmaVoiceLevel,
    rangeNm: displayProfile.rangeNm,
    centerEastNm: displayProfile.centerEastNm,
    centerNorthNm: displayProfile.centerNorthNm,
    mapVisibility: { ...displayProfile.mapVisibility },
    displayProfile,
  };
  view.amzPreferences.set(amzId, updated);
  return updated;
}
