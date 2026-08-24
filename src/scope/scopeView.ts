/**
 * Analog: CRC STARS RANGE / PLACE CNTR / OFF CNTR / RR / PLACE RR / RR CNTR /
 * LDR DIR / LDR / HISTORY / PTL / altitude filter / MAPS / CHAR SIZE / BRITE /
 * DCB MAIN·AUX·SHIFT (docs.virtualnas.net/crc/stars — R07; FOA STARS display data — R05).
 * Trainer delta: last-click / airport live on this view, not on World. MAPS
 * visibility is keyed by catalog id (RWY/LOC/CST share role flags). Range rings
 * default about airport ref; PLACE RR sets a world-NM origin (not glued to the
 * airport). RR CNTR lights when that origin ≠ view **center**. Leader direction
 * is L1–L9; length is a discrete px set (0/24/36/48) on this view. CHAR SIZE is
 * 11–13 px Plex/system mono. BRITE steps map strokes only. History is 5 s sim /
 * 5 dots, no phosphor. PTL is a straight 1.0 min predicted track line (F7),
 * default off. Altitude filter default 000–180; `F` and the DCB FILTER cell
 * start the same chord. Discrete range presets only. Not NAS STARS.
 *
 * Scope display state only. Never a Command, readback, or intent.
 */

import {
  DEFAULT_ALTITUDE_FILTER,
  beginFilterEntry,
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
import {
  initialMapVisibility,
  snapRrInterval,
  syncRoleMapVisibility,
  type RrIntervalNm,
} from "./dcbFunctions";
import { idleDcbSpinner, type DcbMenu, type DcbSpinnerState } from "./dcbMenu";
import { DEFAULT_CHAR_SIZE_PX, DEFAULT_DATABLOCK_CELL_PX, type CharSizePx } from "./fonts";
import type { ScopeChord } from "./keymap";
import {
  DEFAULT_LEADER_DIR,
  DEFAULT_LEADER_LENGTH_PX,
  type LeaderDir,
  type LeaderLengthPx,
} from "./leader";
import { DEFAULT_DIGITAL_MAP, type DigitalMap, type MapCache } from "./mapLayers";
import { DEFAULT_MAP_BRITE_INDEX, type MapBriteIndex } from "./palette";
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
  /** MAPS on/off keyed by video-map catalog id. Not on Aircraft. */
  mapVisibility: Map<string, boolean>;
  /** Frozen RR interval (2 / 5 / 10 NM). */
  ringIntervalNm: RrIntervalNm;
  /** World origin of generated **range rings** (NM east/north). */
  rangeRingEastNm: number;
  rangeRingNorthNm: number;
  /** DCB CHAR SIZE. IBM Plex Mono / system mono only. */
  charSizePx: CharSizePx;
  /** DCB BRITE map-stroke step. Does not recolor tracks. */
  mapBriteIndex: MapBriteIndex;
  /** PLACE CNTR: next PPI click sets view **center**. */
  placeCenterArmed: boolean;
  /** PLACE RR: next PPI click sets range-ring origin. */
  placeRangeRingArmed: boolean;
  /** Last DCB LDR DIR (L1–L9). Per-track dir from T02-05 still wins when selected. */
  defaultLeaderDir: LeaderDir;
  /** Scope-global **leader** length (DCB LDR spinner). Dir 5 stays overlay. */
  leaderLengthPx: LeaderLengthPx;
  /** DCB menu machine: MAIN/AUX via SHIFT; MAPS/LDR replace the bar. */
  dcbMenu: DcbMenu;
  /** RANGE / RR / LDR DIR / LDR length spinner arm+wheel. Display only. */
  dcbSpinner: DcbSpinnerState;
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
  /** Per-track display state (history, IDENT flash, datablock, leader, ownership). Keyed by aircraft id. */
  tracks: Map<string, TrackDisplay>;
  /** Scope-focus letter chord (`L` leader; T02-06 `F` filter). Null when idle. */
  pendingChord: ScopeChord | null;
  /**
   * F1 help overlay. Display only — never pauses the sim or writes intent.
   * CRC F1 is beaconator; ours is trainer help.
   */
  helpOpen: boolean;
}

export function createScopeView(
  airportEastNm: number = AIRPORT_REF_EAST_NM,
  airportNorthNm: number = AIRPORT_REF_NORTH_NM,
  options?: { digitalMap?: DigitalMap; showCoastline?: boolean },
): ScopeView {
  const digitalMap = options?.digitalMap ?? DEFAULT_DIGITAL_MAP;
  const showCoastline = options?.showCoastline ?? digitalMap.coastline?.enabled === true;
  const showRunway = true;
  const showLocalizer = true;
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
    showRunway,
    showLocalizer,
    showRings: true,
    showCoastline,
    mapVisibility: initialMapVisibility(
      digitalMap.loadedVideoMaps,
      showRunway,
      showLocalizer,
      showCoastline,
    ),
    ringIntervalNm: snapRrInterval(digitalMap.rangeRings.intervalNm),
    rangeRingEastNm: airportEastNm,
    rangeRingNorthNm: airportNorthNm,
    charSizePx: DEFAULT_CHAR_SIZE_PX,
    mapBriteIndex: DEFAULT_MAP_BRITE_INDEX,
    placeCenterArmed: false,
    placeRangeRingArmed: false,
    defaultLeaderDir: DEFAULT_LEADER_DIR,
    leaderLengthPx: DEFAULT_LEADER_LENGTH_PX,
    dcbMenu: "MAIN",
    dcbSpinner: idleDcbSpinner(),
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
    helpOpen: false,
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

/** F1 always-on. Does not pause kinematics. Never a Command. */
export function toggleHelpOverlay(view: ScopeView): void {
  view.helpOpen = !view.helpOpen;
}

/** MAP toggles on the DCB. Coastline JSON `enabled: false` is a no-op. */
export type MapLayerId = "runway" | "localizer" | "rings" | "coastline";

export function isCoastlineToggleEnabled(view: ScopeView): boolean {
  return view.digitalMap.coastline?.enabled === true;
}

export function toggleMapLayer(view: ScopeView, layer: MapLayerId): void {
  switch (layer) {
    case "runway":
      view.showRunway = !view.showRunway;
      syncRoleMapVisibility(view, "runway", view.showRunway);
      return;
    case "localizer":
      view.showLocalizer = !view.showLocalizer;
      syncRoleMapVisibility(view, "localizer", view.showLocalizer);
      return;
    case "rings":
      view.showRings = !view.showRings;
      view.mapCache = null;
      return;
    case "coastline":
      if (!isCoastlineToggleEnabled(view)) {
        return;
      }
      view.showCoastline = !view.showCoastline;
      syncRoleMapVisibility(view, "coastline", view.showCoastline);
  }
}

export function recordLastClick(view: ScopeView, eastNm: number, northNm: number): void {
  view.lastClickEastNm = eastNm;
  view.lastClickNorthNm = northNm;
}

export function centerOnAirport(view: ScopeView): void {
  view.camera.centerEastNm = view.airportEastNm;
  view.camera.centerNorthNm = view.airportNorthNm;
}

const CENTER_EPS_NM = 1e-6;

/** True when the view **center** is not the airport ref (DCB OFF CNTR pressed). */
export function isViewOffAirport(view: ScopeView): boolean {
  return (
    Math.abs(view.camera.centerEastNm - view.airportEastNm) > CENTER_EPS_NM ||
    Math.abs(view.camera.centerNorthNm - view.airportNorthNm) > CENTER_EPS_NM
  );
}

/** True when range-ring origin ≠ view **center** (DCB RR CNTR pressed). */
export function isRangeRingOffViewCenter(view: ScopeView): boolean {
  return (
    Math.abs(view.rangeRingEastNm - view.camera.centerEastNm) > CENTER_EPS_NM ||
    Math.abs(view.rangeRingNorthNm - view.camera.centerNorthNm) > CENTER_EPS_NM
  );
}

/** PLACE RR / RR CNTR: set range-ring origin in world NM. Rebuilds ring cache. */
export function setRangeRingOrigin(view: ScopeView, eastNm: number, northNm: number): void {
  view.rangeRingEastNm = eastNm;
  view.rangeRingNorthNm = northNm;
  view.mapCache = null;
}

/** DCB RR CNTR: snap range-ring origin to the current view **center**. */
export function snapRangeRingToViewCenter(view: ScopeView): void {
  setRangeRingOrigin(view, view.camera.centerEastNm, view.camera.centerNorthNm);
}

/** DCB FILTER click: same chord as scope-focus `F`. Never a Command. */
export function beginAltitudeFilterChord(view: ScopeView, nowMs: number = Date.now()): void {
  beginFilterEntry(view.filterEntry, view.altitudeFilter, nowMs);
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
