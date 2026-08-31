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
 * Scope display state only. Never a Command, readback, or intent.
 */

import { RANGE_PRESETS_NM, type RangeNm } from "./camera";
import { snapRrInterval, type RrIntervalNm } from "./dcbFunctions";
import { cloneCharSizes, type CharSizes } from "./fonts";
import { type HistoryDotCount } from "./history";
import { LEADER_LENGTH_STEPS_PX, type LeaderDir, type LeaderLengthPx } from "./leader";
import { cloneBrite, type BriteState } from "./palette";
import { PTL_MINUTE_PRESETS, type PtlMinutes } from "./ptl";
import { createScopeView, setDcbDock, type ScopeView } from "./scopeView";
import { GI_SLOT_COUNT, SSA_FILTER_FIELDS, type SsaVisibility } from "./ssa";
import {
  DEFAULT_ATPA_STATE,
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
 * The storage key's `v1` is the T02-29 namespace, not this body version.
 */
export const DCB_PREF_SCHEMA_VERSION = 2 as const;

/** Readable PREF body versions. A mere v1 file is not corrupt. */
const DCB_PREF_READABLE_VERSIONS: readonly number[] = [1, 2];

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

/** Live PREF machine on ScopeView. Slots are the trainer 32-set table. */
export interface DcbPrefRuntime {
  icao: string;
  slots: Array<DcbPrefSlot | null>;
  activeIndex: number;
  restore: DcbPrefBody | null;
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

function isLeaderDir(value: unknown): value is LeaderDir {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 9;
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
    atpa: {
      on: view.atpa.on,
      inTrailDistance: view.atpa.inTrailDistance,
      coneMileage: view.atpa.coneMileage,
      alertCones: view.atpa.alertCones,
      monitorCones: view.atpa.monitorCones,
    },
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
  view.atpa = {
    ...DEFAULT_ATPA_STATE,
    on: body.atpa?.on === true,
    inTrailDistance: body.atpa?.inTrailDistance !== false,
    coneMileage: body.atpa?.coneMileage !== false,
    alertCones: body.atpa?.alertCones !== false,
    monitorCones: body.atpa?.monitorCones !== false,
  };
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
  const index = nextDcbPrefSaveAsIndex(view);
  view.dcbPref.slots[index] = { name: parsed.name, body: serializeDcbPref(view) };
  view.dcbPref.activeIndex = index;
  view.dcbPref.pendingSaveAs = false;
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
