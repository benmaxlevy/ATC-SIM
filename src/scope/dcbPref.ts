/**
 * Analog: CRC STARS DCB PREF / DCB position TOP / LEFT / RIGHT / BOTTOM (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: 8 local preference-set slots (not CRC's 32 NAS host sets),
 * persisted in localStorage, facility-keyed and schema-versioned. One DCB at a
 * time along a PPI edge. LEFT/RIGHT are a vertical cell stack; TOP/BOTTOM stay
 * horizontal. Drawable PPI size is the host minus DCB thickness on that edge.
 * No window.prompt, no HTML <input>, not a settings panel / profile modal /
 * theme picker. Not a NAS preference host. Display snapshot only — never
 * Command IR, speech prefs, command-line text, or world kinematics.
 *
 * Scope display state only. Never a Command, readback, or intent.
 */

import { RANGE_PRESETS_NM, type RangeNm } from "./camera";
import { snapRrInterval, type RrIntervalNm } from "./dcbFunctions";
import { cloneCharSizes, type CharSizes } from "./fonts";
import { HISTORY_DOT_COUNTS, type HistoryDotCount } from "./history";
import { LEADER_LENGTH_STEPS_PX, type LeaderDir, type LeaderLengthPx } from "./leader";
import { cloneBrite, type BriteState } from "./palette";
import { PTL_MINUTE_PRESETS, type PtlMinutes } from "./ptl";
import { createScopeView, setDcbDock, type ScopeView } from "./scopeView";
import { GI_SLOT_COUNT, SSA_FILTER_FIELDS, type SsaVisibility } from "./ssa";
import {
  DEFAULT_TPA_STATE,
  TPA_RADIUS_NM,
  type AtpaState,
  type TpaRadiusNm,
  type TpaState,
} from "./tpa";

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

/** Trainer freeze: 8 slots, not CRC 32. */
export const DCB_PREF_SLOT_COUNT = 8;

/** MAIN PREF second-line budget. CRC analog is a short set name (e.g. 22/27). */
export const DCB_PREF_READOUT_MAX_CHARS = 6;

export const DCB_PREF_SCHEMA_VERSION = 1 as const;

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
  showRunway: boolean;
  showLocalizer: boolean;
  showRings: boolean;
  showCoastline: boolean;
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
}

/** Live PREF machine on ScopeView. Slots are the trainer 8-set table. */
export interface DcbPrefRuntime {
  icao: string;
  slots: Array<DcbPrefSlot | null>;
  activeIndex: number;
  restore: DcbPrefBody | null;
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
  };
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

function isRangeNm(value: unknown): value is RangeNm {
  return (RANGE_PRESETS_NM as readonly number[]).includes(value as number);
}

function isDock(value: unknown): value is DcbDock {
  return typeof value === "string" && (DOCKS as readonly string[]).includes(value);
}

function isLeaderDir(value: unknown): value is LeaderDir {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 9;
}

function isLeaderLength(value: unknown): value is LeaderLengthPx {
  return (LEADER_LENGTH_STEPS_PX as readonly number[]).includes(value as number);
}

function isHistoryCount(value: unknown): value is HistoryDotCount {
  return (HISTORY_DOT_COUNTS as readonly number[]).includes(value as number);
}

function isPtlMinutes(value: unknown): value is PtlMinutes {
  return (PTL_MINUTE_PRESETS as readonly number[]).includes(value as number);
}

function isTpaRadius(value: unknown): value is TpaRadiusNm {
  return (TPA_RADIUS_NM as readonly number[]).includes(value as number);
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
    showRunway: view.showRunway,
    showLocalizer: view.showLocalizer,
    showRings: view.showRings,
    showCoastline: view.showCoastline,
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
    atpa: { on: view.atpa.on },
  };
}

function applyMapVisibility(view: ScopeView, record: Record<string, boolean>): void {
  const maps = view.digitalMap.loadedVideoMaps ?? [];
  for (const map of maps) {
    if (Object.prototype.hasOwnProperty.call(record, map.id)) {
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
    applyMapVisibility(view, body.mapVisibility);
  }
  view.showRunway = body.showRunway === true;
  view.showLocalizer = body.showLocalizer === true;
  view.showRings = body.showRings === true;
  view.showCoastline = body.showCoastline === true;
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
  view.brite = cloneBrite(body.brite);
  view.charSizes = cloneCharSizes(body.charSizes);
  view.charSizePx = view.charSizes.dataBlocks;
  view.ssaFilter = cloneSsa(body.ssaFilter);
  view.giFilterVisible = cloneGiVisible(body.giFilterVisible);
  view.tpa = {
    on: body.tpa?.on === true,
    radiusNm: isTpaRadius(body.tpa?.radiusNm) ? body.tpa.radiusNm : DEFAULT_TPA_STATE.radiusNm,
  };
  view.atpa = { on: body.atpa?.on === true };
  view.mapCache = null;
}

/** Factory display defaults. Does not wipe tracks / aircraft. */
export function applyDcbPrefDefaults(view: ScopeView): void {
  const factory = createScopeView(view.airportEastNm, view.airportNorthNm, {
    digitalMap: view.digitalMap,
    giTextLines: view.giTextLines,
    showCoastline: view.digitalMap.coastline?.enabled === true,
  });
  applyDcbPref(view, serializeDcbPref(factory));
}

export function beginDcbPrefSession(view: ScopeView): void {
  view.dcbPref.restore = serializeDcbPref(view);
}

export function restoreDcbPrefSession(view: ScopeView): void {
  if (view.dcbPref.restore) {
    applyDcbPref(view, view.dcbPref.restore);
  }
}

export function selectDcbPrefSlot(view: ScopeView, index: number): void {
  if (index < 0 || index >= DCB_PREF_SLOT_COUNT) {
    return;
  }
  view.dcbPref.activeIndex = index;
  const slot = view.dcbPref.slots[index];
  if (slot) {
    applyDcbPref(view, slot.body);
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
  };
  storage.setItem(dcbPrefStorageKey(icao), JSON.stringify(file));
}

export function saveDcbPref(view: ScopeView, storage?: DcbPrefStorage): void {
  const index = view.dcbPref.activeIndex;
  const name = view.dcbPref.slots[index]?.name ?? `PREF ${index + 1}`;
  view.dcbPref.slots[index] = { name, body: serializeDcbPref(view) };
  persistRuntime(view, storage);
}

/**
 * First empty slot, auto-name PREF n. If all eight are full, overwrite slot 8
 * (no browser prompt / <input>).
 */
export function saveAsDcbPref(view: ScopeView, storage?: DcbPrefStorage): number {
  let index = view.dcbPref.slots.findIndex((slot) => slot === null);
  if (index < 0) {
    index = DCB_PREF_SLOT_COUNT - 1;
  }
  view.dcbPref.slots[index] = { name: `PREF ${index + 1}`, body: serializeDcbPref(view) };
  view.dcbPref.activeIndex = index;
  persistRuntime(view, storage);
  return index;
}

export function deleteDcbPref(view: ScopeView, storage?: DcbPrefStorage): void {
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
  };
  if (raw === null || raw === "") {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object") {
      return fallback;
    }
    const file = parsed as { v?: unknown; icao?: unknown; slots?: unknown; activeIndex?: unknown };
    if (file.v !== DCB_PREF_SCHEMA_VERSION || typeof file.icao !== "string") {
      return fallback;
    }
    if (!Array.isArray(file.slots) || file.slots.length !== DCB_PREF_SLOT_COUNT) {
      return fallback;
    }
    const activeIndex =
      typeof file.activeIndex === "number" &&
      file.activeIndex >= 0 &&
      file.activeIndex < DCB_PREF_SLOT_COUNT
        ? file.activeIndex
        : 0;
    return {
      v: DCB_PREF_SCHEMA_VERSION,
      icao: file.icao,
      activeIndex,
      slots: file.slots.map((slot) => parseSlot(slot)),
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
  const file = parseDcbPrefJson(storage.getItem(dcbPrefStorageKey(icao)), icao);
  view.dcbPref.slots = file.slots;
  view.dcbPref.activeIndex = file.activeIndex ?? 0;
  const slot = view.dcbPref.slots[view.dcbPref.activeIndex];
  if (slot) {
    applyDcbPref(view, slot.body);
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
