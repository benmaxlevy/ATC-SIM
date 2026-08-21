/**
 * Analog: CRC STARS RANGE / CENTER / HISTORY / PTL / altitude filter
 * (docs.virtualnas.net/crc/stars — R07; FOA STARS display data — R05).
 * Trainer delta: last-click / airport live on this view, not on World. Map /
 * localizer / rings flags are trainer display state (DCB-lite binds later).
 * History is 5 s sim / 5 dots, no phosphor. PTL is a straight 1.0 min
 * predicted track line (F7), default off. Leader direction is L1–L9 (no length
 * menu). Altitude filter default 000–180; `F` is scope-focus only. Not NAS STARS.
 *
 * Scope display state only. Never a Command, readback, or intent.
 */

import {
  DEFAULT_ALTITUDE_FILTER,
  idleFilterEntry,
  type AltitudeFilter,
  type FilterEntry,
} from "./altitudeFilter";
import {
  AIRPORT_REF_EAST_NM,
  AIRPORT_REF_NORTH_NM,
  DEFAULT_RANGE_NM,
  type ScopeCamera,
} from "./camera";
import { DEFAULT_DATABLOCK_CELL_PX } from "./fonts";
import type { ScopeChord } from "./keymap";
import { DEFAULT_DIGITAL_MAP, type DigitalMap, type MapCache } from "./mapLayers";
import type { TrackDisplay } from "./trackDisplay";

export interface ScopeView {
  camera: ScopeCamera;
  airportEastNm: number;
  airportNorthNm: number;
  lastClickEastNm: number | null;
  lastClickNorthNm: number | null;
  showRunway: boolean;
  showLocalizer: boolean;
  showRings: boolean;
  showCoastline: boolean;
  digitalMap: DigitalMap;
  mapCache: MapCache | null;
  /** Global history dots. CRC analog; default on. F8 / scope-focus H. */
  historyEnabled: boolean;
  /**
   * Mode C field on full datablocks. CRC analog `M`; default shown.
   * Limited datablocks ignore this.
   */
  modeCVisible: boolean;
  /** Last measured `0` cell width for datablock hit-tests. */
  datablockCellWidthPx: number;
  /**
   * Global predicted track line (PTL). CRC analog; default off. F7 always-on.
   * Display only — never a Command, readback, or intent.
   */
  ptlOn: boolean;
  /**
   * Altitude filter (Mode C hundreds). FOA/CRC analog; default 000–180.
   * Scope command only — never a Command, readback, or intent.
   */
  altitudeFilter: AltitudeFilter;
  /** Scope-focus `F` chord. Idle when not entering hundreds. */
  filterEntry: FilterEntry;
  /** Per-track display state (history, IDENT flash, datablock, leader). Keyed by aircraft id. */
  tracks: Map<string, TrackDisplay>;
  /** Scope-focus letter chord (`L` leader; T02-06 `F` filter). Null when idle. */
  pendingChord: ScopeChord | null;
}

export function createScopeView(
  airportEastNm: number = AIRPORT_REF_EAST_NM,
  airportNorthNm: number = AIRPORT_REF_NORTH_NM,
  options?: { digitalMap?: DigitalMap; showCoastline?: boolean },
): ScopeView {
  const digitalMap = options?.digitalMap ?? DEFAULT_DIGITAL_MAP;
  const showCoastline = options?.showCoastline ?? digitalMap.coastline?.enabled === true;
  return {
    camera: {
      rangeNm: DEFAULT_RANGE_NM,
      centerEastNm: airportEastNm,
      centerNorthNm: airportNorthNm,
    },
    airportEastNm,
    airportNorthNm,
    lastClickEastNm: null,
    lastClickNorthNm: null,
    showRunway: true,
    showLocalizer: true,
    showRings: true,
    showCoastline,
    digitalMap,
    mapCache: null,
    historyEnabled: true,
    modeCVisible: true,
    datablockCellWidthPx: DEFAULT_DATABLOCK_CELL_PX,
    ptlOn: false,
    altitudeFilter: { ...DEFAULT_ALTITUDE_FILTER },
    filterEntry: idleFilterEntry(DEFAULT_ALTITUDE_FILTER),
    tracks: new Map(),
    pendingChord: null,
  };
}

/** F8 always-on; H only when scope-focused. Never a Command. */
export function toggleHistoryEnabled(view: ScopeView): void {
  view.historyEnabled = !view.historyEnabled;
}

/** Scope-focus `M`: hide/show Mode C on full datablocks. Never a Command. */
export function toggleModeCVisible(view: ScopeView): void {
  view.modeCVisible = !view.modeCVisible;
}

/** F7 always-on. Never a Command. */
export function togglePtlOn(view: ScopeView): void {
  view.ptlOn = !view.ptlOn;
}

export function recordLastClick(view: ScopeView, eastNm: number, northNm: number): void {
  view.lastClickEastNm = eastNm;
  view.lastClickNorthNm = northNm;
}

export function centerOnAirport(view: ScopeView): void {
  view.camera.centerEastNm = view.airportEastNm;
  view.camera.centerNorthNm = view.airportNorthNm;
}

/** End: last left-click world point, or airport if none this session. */
export function centerOnLastClick(view: ScopeView): void {
  if (view.lastClickEastNm === null || view.lastClickNorthNm === null) {
    centerOnAirport(view);
    return;
  }
  view.camera.centerEastNm = view.lastClickEastNm;
  view.camera.centerNorthNm = view.lastClickNorthNm;
}

export function centerOnWorld(view: ScopeView, eastNm: number, northNm: number): void {
  view.camera.centerEastNm = eastNm;
  view.camera.centerNorthNm = northNm;
}
