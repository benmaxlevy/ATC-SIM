/**
 * Analog: CRC STARS RANGE / PLACE CNTR / OFF CNTR / RR / PLACE RR / RR CNTR /
 * LDR DIR / LDR / HISTORY / PTL / altitude filter / MAPS / CHAR SIZE / BRITE /
 * DCB MAIN·AUX·SHIFT (docs.virtualnas.net/crc/stars — R07; FOA STARS display data — R05).
 * Trainer delta: last-click / airport live on this view, not on World. MAPS
 * visibility is keyed by catalog id (RWY/LOC/CST share role flags). Range rings
 * default about airport ref; PLACE RR sets a world-NM origin (not glued to the
 * airport). RR CNTR lights when that origin ≠ view **center**. Leader direction
 * is L1–L9; length is a discrete px set (0/24/36/48) on this view. CHAR SIZE is
 * per-subsystem Plex/system mono (DATA BLOCKS / LISTS / DCB / TOOLS / POS), not
 * a font picker. BRITE is per drawn channel (0–100 multiply); WX/WXC tint VIP
 * paint; BKC is a stored no-op. History records on each surveillance report, cap 5 dots, no
 * phosphor; AUX HISTORY spinner shows 0–5 of those dots (F8 / H
 * toggles 0 ↔ last non-zero). Default SITE mode is FUSED. PTL is a straight predicted track line (default
 * 1.0 min; AUX spinner 0.5/1/2/4). F7 toggles PTL ALL. PTL OWN is F3-owned
 * tracks; ALL wins if both are on. Per-track PTL is `*R` plus click
 * (`ptlByAircraftId`, session, not PREF). TPA J-rings: DCB 2/3/5/10 NM about the
 * selected track (or owned tracks if none selected), plus per-track `*J` /
 * `*P` session graphics (1–30 NM, not PREF). ATPA master plus four DCB latches
 * (A/TPA Mileage, Intrail Distance, Alert Cones, Monitor Cones) gate cones and
 * readouts. ATPA cones paint from `world.alerts.atpa` when on. DCB docks
 * TOP/LEFT/RIGHT/BOTTOM. Altitude filter default 000–180; FILTER stays on MAIN.
 * Discrete range presets only. Not NAS STARS.
 *
 * Scope display state only. Never a Command, readback, or intent.
 */

import type { LatLon } from "@core";
import {
  DEFAULT_ALTITUDE_FILTER,
  beginFilterEntry,
  idleFilterEntry,
  type AltitudeFilter,
  type FilterEntry,
} from "./altitudeFilter";
import { idlePreviewArea, type PreviewAreaState } from "./previewArea";
import { idleStarsChordEntry, type StarsChordAction, type StarsChordEntry } from "./starsChord";
import {
  AIRPORT_REF_EAST_NM,
  AIRPORT_REF_NORTH_NM,
  DEFAULT_RANGE_NM,
  type ScopeCamera,
} from "./camera";
import {
  defaultSelectedMapGroupId,
  initialMapVisibility,
  snapRrInterval,
  syncRoleMapVisibility,
  type RrIntervalNm,
} from "./dcb/dcbFunctions";
import { emptyDcbPrefRuntime, type DcbDock, type DcbPrefRuntime } from "./dcb/dcbPref";
import { idleDcbSpinner, type DcbMenu, type DcbSpinnerState } from "./dcb/dcbMenu";
import {
  cloneCharSizes,
  DEFAULT_CHAR_SIZE_PX,
  DEFAULT_DATABLOCK_CELL_PX,
  type CharSizePx,
  type CharSizes,
} from "./fonts";
import type { HistoryDotCount } from "./history";
import { stepHistoryDotCount } from "./history";
import {
  PTL_MINUTES,
  clearPtlByAircraftId,
  stepPtlMinutes,
  togglePtlByAircraftId,
  type PtlMinutes,
} from "./ptl";
import {
  SSA_ALTIMETER_STUB,
  defaultGiVisibility,
  defaultSsaVisibility,
  padGiTextLines,
  type SsaAirportAltimeter,
  type SsaFilterField,
  type SsaVisibility,
} from "./ssa";
import {
  DEFAULT_ATPA_STATE,
  DEFAULT_TPA_STATE,
  formatDcbTpaMiReadout,
  stepTpaRadiusNm,
  type AtpaState,
  type TpaState,
} from "./tpa";
import type { ScopeChord } from "./keymap";
import {
  DEFAULT_LEADER_DIR,
  DEFAULT_LEADER_LENGTH_PX,
  type LeaderDir,
  type LeaderLengthPx,
} from "./leader";
import { DEFAULT_DIGITAL_MAP, type DigitalMap, type MapCache } from "./mapLayers";
import { cloneBrite, type BriteState } from "./palette";
import type { TrackDisplay } from "./trackDisplay";
import type { RadarSite } from "@scenario";
import {
  defaultSurveillanceMode,
  effectiveSurveillanceMode,
  surveillanceModesEqual,
  type SurveillanceMode,
} from "./surveillance";
import { cloneWxLevels, emptyWxMosaic, type WxLevels, type WxMosaic } from "./wx";

import {
  DEFAULT_SYSTEM_LIST_PLACEMENTS,
  idleListDragState,
  type CrdaRpcConfig,
  type ListDragState,
  type SystemListPlacement,
} from "./systemLists";

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
  /** Frozen RR interval (2 / 5 / 10 / 20 NM). DCB spinner is 2/5/10. */
  ringIntervalNm: RrIntervalNm;
  /** World origin of generated **range rings** (NM east/north). */
  rangeRingEastNm: number;
  rangeRingNorthNm: number;
  /** DCB CHAR SIZE per subsystem. IBM Plex Mono / system mono only. */
  charSizes: CharSizes;
  /** Alias of `charSizes.dataBlocks` (FDB/LDB). Pick/hit-test still read this. */
  charSizePx: CharSizePx;
  /**
   * DCB BRITE per drawn channel (0–100). Hue stays T02-08 green/white/blue.
   * WX/WXC tint VIP fills and contours. PRI tints the position mark.
   * BKC/CMP/BCN stay stored; paint channels tint draw.
   */
  brite: BriteState;
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
  /** RANGE / RR / LDR DIR / LDR length / HISTORY / PTL spinner arm+wheel. Display only. */
  dcbSpinner: DcbSpinnerState;
  /** GEO MAPS on-PPI list (video map catalog). Display only. */
  geoMapsListOn: boolean;
  /** CURRENT on-PPI list of video maps that are on. Display only. */
  currentMapsListOn: boolean;
  /**
   * Selected DCB map group id. Trainer is a single TCP. Defaults to the first
   * group (`sourceIndex` 0). Data-driven; never an A80 hardcode.
   */
  selectedMapGroupId: string | null;
  /** One DCB along a PPI edge. CRC analog; default TOP. */
  dcbDock: DcbDock;
  digitalMap: DigitalMap;
  mapCache: MapCache | null;
  /**
   * HISTORY dots to draw (0–9 from keyboard; AUX spinner 0–5). 0 = off (same skip as
   * historyEnabled === false). Sampler still keeps 5 dots. F8 / H toggles 0 ↔ last
   * non-zero (default 5).
   */
  historyDotCount: HistoryDotCount;
  /** Last non-zero HISTORY count restored by F8 / H. */
  lastHistoryDotCount: Exclude<HistoryDotCount, 0>;
  /** Derived from historyDotCount > 0. Kept so existing readers stay valid. */
  historyEnabled: boolean;
  /**
   * Mode C field on full datablocks. CRC analog `M`; default shown.
   * Limited datablocks ignore this.
   */
  modeCVisible: boolean;
  /** Last measured `0` cell width for datablock hit-tests. */
  datablockCellWidthPx: number;
  /**
   * PTL ALL (global). CRC analog; default off. F7 always-on toggles this.
   * Display only — never a Command, readback, or intent.
   */
  ptlOn: boolean;
  /** PTL OWN: F3-owned tracks only. ALL wins if both are on. */
  ptlOwn: boolean;
  /** PTL length in minutes. Default 1.0 (T02-07). AUX spinner 0.5/1/2/4; keyboard 0–15. */
  ptlMinutes: PtlMinutes;
  /**
   * Per-track PTL override (`*R` plus click). Session map, not PREF.
   * `true` forces the line; `false` hides it under PTL ALL.
   */
  ptlByAircraftId: Map<string, boolean>;
  /**
   * TPA. DCB `{ on, radiusNm }` is the toggle + 2/3/5/10 spinner (PREF).
   * Per-track `*J` / `*P` graphics live on `TrackDisplay` (session, not PREF).
   */
  tpa: TpaState;
  /** ATPA master toggle. Cones paint from `world.alerts.atpa` when on. */
  atpa: AtpaState;
  /**
   * Altitude filter (Mode C hundreds). FOA/CRC analog; default 000–180.
   * Scope command only — never a Command, readback, or intent.
   */
  altitudeFilter: AltitudeFilter;
  /** Scope-focus `F` chord. Idle when not entering hundreds. */
  filterEntry: FilterEntry;
  /** Scope-focus `*` TPA/ATPA chord. Idle when not entering. Display only. */
  starsChordEntry: StarsChordEntry;
  /**
   * Track-scoped `*J` / `*P` / `*J#` / `*P#` waiting for a slew. Null when none.
   * Survives the 1.5 s chord timeout until apply, Esc, or a new `*` chord.
   */
  starsChordArmed: StarsChordAction | null;
  /**
   * STARS Preview Area buffer (R07). Idle / empty until T02-52 / T02-53 fill
   * INIT CNTL, TERM CNTL, and beacon. Display only — never Command IR.
   */
  preview: PreviewAreaState;
  /**
   * SSA FILTER: which existing SSA lines paint (TIME / ALTSTG / FILTER / RANGE /
   * OFF CNTR / STATUS / PTL). Default all on. Display only — not the altitude
   * FILTER chord.
   */
  ssaFilter: SsaVisibility;
  /** Ten GI TEXT strings from facility JSON. Empty = unused. Not live METAR. */
  giTextLines: string[];
  /** GI FILTER 1–10. Empty authored slots stay off and inert. */
  giFilterVisible: boolean[];
  /** In-scope system list positions & configurations. */
  systemLists: Record<string, SystemListPlacement>;
  /**
   * TOWER 1–3 airport IDs. When omitted, each list uses the scenario airport.
   * Satellite airports are not inferred from a facility-id switch.
   */
  towerAirports?: string[];
  /** Primary airport altimeter setting (e.g. "30.18"). Default "30.17" or scenario value. */
  primaryAltimeter?: string;
  /** Terminal satellite airport altimeters rendered in SSA matrix. */
  airportAltimeters?: SsaAirportAltimeter[];
  /** Configured SSA weather airports from scenario ([0]=primary, [1..]=satellites). */
  ssaWeatherAirports?: string[];
  /**
   * CRDA STATUS RPC pairings. When omitted, `buildCrdaStatusList` uses
   * `defaultCrdaConfigsForAirport`.
   */
  crdaRpcConfigs?: CrdaRpcConfig[];
  /** In-scope system list active middle-click drag state. */
  listDrag: ListDragState;
  /**
   * DCB PREF runtime (T02-29). Eight named local display snapshots.
   * Analog CRC PREF; trainer localStorage, not a NAS preference host.
   */
  dcbPref: DcbPrefRuntime;
  /** Owning controller sector ID character for tracked targets (default "D"). */
  sectorId: string;
  /** Active beacon code select list (squawks rendering square symbol). */
  beaconSelectCodes: string[];
  /** Per-track display state (history, IDENT flash, datablock, leader, ownership). Keyed by aircraft id. */
  tracks: Map<string, TrackDisplay>;
  /** Scope-focus letter chord (`L` leader; T02-06 `F` filter). Null when idle. */
  pendingChord: ScopeChord | null;
  /**
   * F1 help overlay. Display only — never pauses the sim or writes intent.
   * CRC F1 is beaconator; ours is trainer help.
   */
  helpOpen: boolean;
  /**
   * F1 Beaconator (Beacon Code Readout) active state.
   * When active, displays beacon code in place of callsign and forces PDBs to FDBs.
   */
  beaconatorActive: boolean;
  /**
   * SITE display mode. Default FUSED. Empty `radarSites` is implicit FUSED.
   * T02-76 owns the DCB SITE caps; this field is the sampler input.
   * T02-77 binds authored scenario rows onto the live view.
   */
  surveillanceMode: SurveillanceMode;
  /** Trainer-authored sites from the loaded scenario. `[]` = implicit FUSED. */
  radarSites: RadarSite[];
  /**
   * STARS VIP 1–6 display latches. Default all false.
   * Display only. Paint is weatherLayer. Does not steer aircraft.
   */
  wxLevels: WxLevels;
  /**
   * Fetched VIP mosaic. Default empty. Paint reads this; do not fetch here.
   */
  wxMosaic: WxMosaic;
  /** Scenario ARP for mosaic placement. Default 0,0. Not an airport-id switch. */
  arp: LatLon;
}

export function createScopeView(
  airportEastNm: number = AIRPORT_REF_EAST_NM,
  airportNorthNm: number = AIRPORT_REF_NORTH_NM,
  options?: {
    digitalMap?: DigitalMap;
    showCoastline?: boolean;
    giTextLines?: readonly string[];
    radarSites?: readonly RadarSite[];
    surveillanceMode?: SurveillanceMode;
    arp?: LatLon;
    ssaWeatherAirports?: readonly string[];
    primaryAltimeter?: string;
    airportAltimeters?: readonly SsaAirportAltimeter[];
  },
): ScopeView {
  const digitalMap = options?.digitalMap ?? DEFAULT_DIGITAL_MAP;
  const showCoastline = options?.showCoastline ?? digitalMap.coastline?.enabled === true;
  const showRunway = true;
  const showLocalizer = true;
  const giTextLines = padGiTextLines(options?.giTextLines);
  const arp = options?.arp ?? { latDeg: 0, lonDeg: 0 };
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
    charSizes: cloneCharSizes(),
    charSizePx: DEFAULT_CHAR_SIZE_PX,
    brite: cloneBrite(),
    placeCenterArmed: false,
    placeRangeRingArmed: false,
    defaultLeaderDir: DEFAULT_LEADER_DIR,
    leaderLengthPx: DEFAULT_LEADER_LENGTH_PX,
    dcbMenu: "MAIN",
    dcbSpinner: idleDcbSpinner(),
    geoMapsListOn: false,
    currentMapsListOn: false,
    selectedMapGroupId: defaultSelectedMapGroupId(digitalMap.videoMapGroups),
    dcbDock: "TOP",
    digitalMap,
    mapCache: null,
    historyDotCount: 5,
    lastHistoryDotCount: 5,
    historyEnabled: true,
    modeCVisible: true,
    datablockCellWidthPx: DEFAULT_DATABLOCK_CELL_PX,
    ptlOn: false,
    ptlOwn: false,
    ptlMinutes: PTL_MINUTES,
    ptlByAircraftId: new Map(),
    tpa: { ...DEFAULT_TPA_STATE },
    atpa: { ...DEFAULT_ATPA_STATE },
    altitudeFilter: { ...DEFAULT_ALTITUDE_FILTER },
    filterEntry: idleFilterEntry(DEFAULT_ALTITUDE_FILTER),
    starsChordEntry: idleStarsChordEntry(),
    starsChordArmed: null,
    preview: idlePreviewArea(),
    ssaFilter: defaultSsaVisibility(),
    giTextLines,
    giFilterVisible: defaultGiVisibility(giTextLines),
    primaryAltimeter: options?.primaryAltimeter ?? SSA_ALTIMETER_STUB,
    airportAltimeters: options?.airportAltimeters ? [...options.airportAltimeters] : [],
    ssaWeatherAirports: options?.ssaWeatherAirports ? [...options.ssaWeatherAirports] : undefined,
    systemLists: { ...DEFAULT_SYSTEM_LIST_PLACEMENTS },
    listDrag: idleListDragState(),
    dcbPref: emptyDcbPrefRuntime(),
    sectorId: "D",
    beaconSelectCodes: [],
    tracks: new Map(),
    pendingChord: null,
    helpOpen: false,
    beaconatorActive: false,
    surveillanceMode: options?.surveillanceMode ?? defaultSurveillanceMode(),
    radarSites: options?.radarSites ? [...options.radarSites] : [],
    wxLevels: cloneWxLevels(),
    wxMosaic: emptyWxMosaic(),
    arp,
  };
}

/**
 * Bind authored scenario `radarSites` onto the live view (T02-77).
 *
 * Analog: CRC / vNAS STARS SITE FUSED / MULTI / single-site (R07);
 * FOA STARS display-data / radar coverage (R05); JO 7110.65 radar
 * identification display wording (R01). Trainer delta: sites are fixture
 * rows, not live sensors. Unknown stored site id → FUSED. Empty catalog
 * stays implicit FUSED. No 30 s coast. No airport-id branch. Not NAS STARS.
 */
export function applyRadarSites(view: ScopeView, sites: readonly RadarSite[]): void {
  view.radarSites = [...sites];
  view.surveillanceMode = effectiveSurveillanceMode(view.surveillanceMode, view.radarSites);
  clearLastSurveillanceReports(view);
}

/** SITE / catalog change resamples immediately. Trainer delta: no 30 s coast. */
function clearLastSurveillanceReports(view: ScopeView): void {
  for (const td of view.tracks.values()) {
    delete td.lastReport;
  }
}

/** Bind SITE DCB / PREF to the T02-75 sampler. Unknown site id → FUSED. */
export function setSurveillanceMode(view: ScopeView, mode: SurveillanceMode): void {
  const next = effectiveSurveillanceMode(mode, view.radarSites);
  if (surveillanceModesEqual(view.surveillanceMode, next)) {
    return;
  }
  view.surveillanceMode = next;
  clearLastSurveillanceReports(view);
}

export function setBeaconatorActive(view: ScopeView, active: boolean): void {
  view.beaconatorActive = active;
}

export function toggleBeaconator(view: ScopeView): void {
  view.beaconatorActive = !view.beaconatorActive;
}

function syncHistoryEnabled(view: ScopeView): void {
  view.historyEnabled = view.historyDotCount > 0;
}

/** F8 always-on; H only when scope-focused. Toggles 0 ↔ last non-zero (default 5). Never a Command. */
export function toggleHistoryEnabled(view: ScopeView): void {
  if (view.historyDotCount === 0) {
    view.historyDotCount = view.lastHistoryDotCount;
  } else {
    view.lastHistoryDotCount = view.historyDotCount;
    view.historyDotCount = 0;
  }
  syncHistoryEnabled(view);
}

export function setHistoryDotCount(view: ScopeView, count: HistoryDotCount): void {
  view.historyDotCount = count;
  if (count !== 0) {
    view.lastHistoryDotCount = count;
  }
  syncHistoryEnabled(view);
}

/** Keyboard `*PTL [0-15]`. Zero inhibits the PTL line (PTL ALL off). */
export function setPtlMinutes(view: ScopeView, minutes: number): void {
  view.ptlMinutes = minutes;
  if (minutes <= 0) {
    view.ptlOn = false;
  }
}

export function stepHistoryDots(view: ScopeView, delta: -1 | 1): void {
  setHistoryDotCount(view, stepHistoryDotCount(view.historyDotCount, delta));
}

export function formatDcbHistoryReadout(count: HistoryDotCount): string {
  return String(count);
}

/** Scope-focus `M`: hide/show Mode C on full datablocks. Never a Command. */
export function toggleModeCVisible(view: ScopeView): void {
  view.modeCVisible = !view.modeCVisible;
}

/** F7 always-on: toggle PTL ALL. If OWN and ALL were off, this turns ALL on. Never a Command. */
export function togglePtlOn(view: ScopeView): void {
  view.ptlOn = !view.ptlOn;
}

export function togglePtlOwn(view: ScopeView): void {
  view.ptlOwn = !view.ptlOwn;
}

/** `*R` click: flip this track’s session PTL override. Length stays global. */
export function togglePerTrackPtl(
  view: ScopeView,
  aircraftId: string,
  currentlyDrawn: boolean,
): boolean {
  return togglePtlByAircraftId(view.ptlByAircraftId, aircraftId, currentlyDrawn);
}

/** Session / map reset. Does not touch PREF, F7, or `*PTL` minutes. */
export function clearPerTrackPtl(view: ScopeView): void {
  clearPtlByAircraftId(view.ptlByAircraftId);
}

export function stepPtlLength(view: ScopeView, delta: -1 | 1): void {
  view.ptlMinutes = stepPtlMinutes(view.ptlMinutes, delta);
}

export function formatDcbPtlMinutesReadout(minutes: PtlMinutes): string {
  return minutes === 0.5 ? "0.5" : minutes.toFixed(1);
}

/** SSA FILTER cell: hide/show one existing SSA line. Never a Command. */
export function toggleSsaFilter(view: ScopeView, key: SsaFilterField): void {
  view.ssaFilter[key] = !view.ssaFilter[key];
}

/** GI FILTER 1–10. Empty authored slots are inert. Never a Command. */
export function toggleGiFilter(view: ScopeView, index: number): void {
  const text = view.giTextLines[index] ?? "";
  if (text.length === 0) {
    return;
  }
  view.giFilterVisible[index] = !view.giFilterVisible[index];
}

/** DCB TPA: toggle J-rings. Display only — never a Command. */
export function toggleTpaOn(view: ScopeView): void {
  view.tpa.on = !view.tpa.on;
}

/** DCB TPA MI spinner: frozen 2/3/5/10 NM, no wrap. */
export function stepTpaRadius(view: ScopeView, delta: -1 | 1): void {
  view.tpa.radiusNm = stepTpaRadiusNm(view.tpa.radiusNm, delta);
}

export { formatDcbTpaMiReadout };

/** DCB ATPA master toggle. Cones paint when on and pairs exist. */
export function toggleAtpaOn(view: ScopeView): void {
  view.atpa.on = !view.atpa.on;
}

/** DCB A/TPA Mileage. Display only — never a Command. */
export function toggleAtpaConeMileage(view: ScopeView): void {
  view.atpa.coneMileage = !view.atpa.coneMileage;
}

/** DCB Intrail Distance. Display only — never a Command. */
export function toggleAtpaInTrailDistance(view: ScopeView): void {
  view.atpa.inTrailDistance = !view.atpa.inTrailDistance;
}

/** DCB Alert Cones (alert **and** warning). Display only — never a Command. */
export function toggleAtpaAlertCones(view: ScopeView): void {
  view.atpa.alertCones = !view.atpa.alertCones;
}

/** DCB Monitor Cones. Display only — never a Command. */
export function toggleAtpaMonitorCones(view: ScopeView): void {
  view.atpa.monitorCones = !view.atpa.monitorCones;
}

export function setDcbDock(view: ScopeView, dock: DcbDock): void {
  if (view.dcbDock === dock) {
    return;
  }
  view.dcbDock = dock;
  view.mapCache = null;
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
