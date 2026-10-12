/**
 * Analog: CRC STARS RANGE / PLACE CNTR / OFF CNTR / RR / PLACE RR / RR CNTR /
 * LDR DIR / LDR / HISTORY / PTL / altitude filter / MAPS / CHAR SIZE / BRITE /
 * DCB MAIN·AUX·SHIFT (docs.virtualnas.net/crc/stars — R07; FOA STARS display data — R05).
 * Trainer delta: last-click / airport live on this view, not on World. MAPS
 * visibility is keyed by catalog id (RWY/LOC/CST share role flags). Range rings
 * default about airport ref; PLACE RR sets a world-NM origin (not glued to the
 * airport). RR CNTR lights when that origin ≠ view **center**. Leader direction
 * is L1–L9; length is a discrete 0–7 step set (12 px per step) on this view. CHAR SIZE is
 * per-subsystem fonts converted from Vice's STARS bitmaps (DATA BLOCKS / LISTS / DCB / TOOLS / POS), not
 * a font picker. BRITE is per drawn channel (0–100 multiply); WX/WXC tint VIP
 * paint; BKC is a stored no-op. History records on each surveillance report, cap 5 dots, no
 * phosphor; AUX HISTORY spinner shows 0–5 of those dots (H toggles 0 ↔ last non-zero).
 * Default SITE mode is FUSED. PTL is a straight predicted track line (default
 * 1.0 min; AUX spinner 0.5/1/2/4). F10 toggles PTL ALL. F7 is MULTI FUNC and starts a separate operand buffer. PTL OWN is F3-owned
 * tracks; ALL wins if both are on. Per-track PTL is F7 `R` plus click
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

import {
  createFmaAlertState,
  type FmaAlertInhibit,
  type FmaAlertState,
  type FmaAlertTrackResult,
  type FmaAmz,
  type LatLon,
  type NmEastNorth,
} from "@core";
import {
  DEFAULT_ALTITUDE_FILTER,
  beginFilterEntry,
  idleFilterEntry,
  type AltitudeFilter,
  type FilterEntry,
} from "./altitudeFilter";
import { cancelPreviewArea, idlePreviewArea, type PreviewAreaState } from "./previewArea";
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
import {
  cancelDcbSpinner,
  idleDcbSpinner,
  type DcbMenu,
  type DcbSpinnerState,
} from "./dcb/dcbMenu";
import {
  cloneCharSizes,
  DEFAULT_CHAR_SIZE_PX,
  DEFAULT_DATABLOCK_CELL_PX,
  type CharSizePx,
  type CharSizes,
} from "./fonts";
import { stepHistoryDotCount, type HistoryDotCount } from "./history";
export type { HistoryDotCount };
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
import { createMinSepState, type MinSepState } from "./minimumSeparation";
import {
  clearRangeBearingLines,
  createRangeBearingLineState,
  setRblRadarTilesetBoundary,
  type RangeBearingLineState,
} from "./rangeBearingLines";
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
import type { SurveillanceReport } from "./surveillance";
import {
  advanceFmaSurveillance,
  clearFmaSurveillance,
  configureFmaSurveillance,
  createFmaSurveillanceState,
  pruneFmaSurveillance,
  releaseFmaTrack,
  releaseFmaTracks,
  setFmaSensorStatus,
  setFmaSensorFixture,
  type FmaSensorFixture,
  type FmaSensorStatus,
  type FmaSurveillanceState,
  type FmaSurveillanceTick,
} from "./fmaSurveillance";
import { applyFmaAmzPreference } from "./dcb/dcbPref";
import type { DatablockRenderSnapshot } from "./datablock";
import { resolveFmaFlow, type RadarSite, type Scenario } from "@scenario";
import {
  defaultSurveillanceMode,
  effectiveSurveillanceMode,
  surveillanceModesEqual,
  type SurveillanceMode,
} from "./surveillance";
import { cloneWxLevels, emptyWxMosaic, type WxLevels, type WxMosaic } from "./wx";

import {
  cloneSystemListPlacements,
  idleFlightPlanListState,
  idleListDragState,
  type CrdaRpcConfig,
  type FlightPlanListState,
  type ListDragState,
  type ListRect,
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
  showCompassRose: boolean;
  /** MAPS on/off keyed by video-map catalog id. Not on Aircraft. */
  mapVisibility: Map<string, boolean>;
  /** Frozen RR interval (2 / 5 / 10 / 20 NM). DCB spinner is 2/5/10. */
  ringIntervalNm: RrIntervalNm;
  /** World origin of generated **range rings** (NM east/north). */
  rangeRingEastNm: number;
  rangeRingNorthNm: number;
  /** DCB CHAR SIZE compatibility tokens selecting native ARTS bitmap faces. */
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
  /** Last DCB LDR DIR compass position. Per-track dir from T02-05 still wins when selected. */
  defaultLeaderDir: LeaderDir;
  /** Scope-global **leader** length (DCB LDR spinner). Dir 5 stays overlay. */
  leaderLengthPx: LeaderLengthPx;
  /** DCB menu machine: MAIN/AUX via SHIFT; MAPS/LDR replace the bar. */
  dcbMenu: DcbMenu;
  dcbMenuParent?: "MAIN" | "AUX";
  /** RANGE / RR / LDR DIR / LDR length / HISTORY / PTL spinner arm+wheel. Display only. */
  dcbSpinner: DcbSpinnerState;
  /** GEO MAPS on-PPI list (video map catalog). Display only. */
  geoMapsListOn: boolean;
  /** CURRENT on-PPI list of video maps that are on. Display only. */
  currentMapsListOn: boolean;
  /** Video maps list mode: GEO (all maps) or CURRENT (active only). */
  mapListMode?: "GEO" | "CURRENT";
  /**
   * Mode C Intruder (MCI) alerting enabled. When false, no MCI rows are added
   * to the AL list. Toggled by `*MCI Enter`.
   */
  mciEnabled: boolean;
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
   * historyEnabled === false). Sampler still keeps 5 dots. H toggles 0 ↔ last
   * non-zero (default 5).
   */
  historyDotCount: HistoryDotCount;
  /** Last non-zero HISTORY count restored by H. */
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
  /** Last rendered datablock presentation/layout; invalidated on each render. */
  datablockRenderSnapshot?: DatablockRenderSnapshot;
  /**
   * PTL ALL (global). CRC analog; default off. F10 always-on toggles this.
   * Display only — never a Command, readback, or intent.
   */
  ptlOn: boolean;
  /** PTL OWN: F3-owned tracks only. ALL wins if both are on. */
  ptlOwn: boolean;
  /** PTL length in minutes. Default 1.0 (T02-07). AUX spinner 0.5/1/2/4; keyboard 0–15. */
  ptlMinutes: PtlMinutes;
  /**
   * Per-track PTL override (F7 `R` plus click). Session map, not PREF.
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
  /** Associated-track altitude filter; altitudeFilter is unassociated. */
  associatedAltitudeFilter: AltitudeFilter;
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
  /** Active system list pixel bounding rectangles from the latest render frame. */
  activeListRects?: { id: string; bounds: ListRect; handleBounds?: ListRect }[];
  /** Active system list entry bounding rectangles from the latest render frame for hit-testing. */
  activeListEntries?: {
    listId: string;
    rowIndex: number;
    callsign: string;
    mapId?: string;
    mapIndex?: number;
    bounds: ListRect;
  }[];
  /** Dropped callsigns manually removed from Tower lists. */
  towerListDroppedCallsigns?: Set<string>;
  /** Dropped callsigns manually removed from VFR list. */
  vfrListDroppedCallsigns?: Set<string>;
  /** Flight plan list (FL) pagination and purge state. */
  flightPlanList?: FlightPlanListState;
  /** Alias for flightPlanList matching STARS specification. */
  flightPlanListState?: FlightPlanListState;
  /** Active pointer hover coordinate on scope canvas. */
  cursorHoverPos?: { x: number; y: number } | null;
  /** F1 drop mode armed: next left-click on a system list entry drops it. */
  f1DropArmed?: boolean;
  /** Staged candidate list anchor position before Enter commits it. */
  stagedListAnchor?: { listId: string; x: number; y: number } | null;
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
  /** Pairwise CA inhibited canonical keys ("idA|idB" or "callsignA|callsignB"). */
  caInhibitedPairs: Set<string>;
  /** CA C controller-wide setting for pairs whose two tracks are locally owned. */
  caControllerOwnedPairsInhibited: boolean;
  /** Acknowledged CA alert pair canonical keys. */
  acknowledgedAlertPairs: Set<string>;
  /** Scope-focus letter chord (`F` filter). Null when idle. */
  pendingChord: ScopeChord | null;
  /**
   * F1 help overlay. Display only — never pauses the sim or writes intent.
   * CRC F1 is beaconator; ours is trainer help.
   */
  helpOpen: boolean;
  /**
   * DCB display / dock visibility. Default true.
   */
  dcbVisible?: boolean;
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
  /** Per-TCW FMA report retention. Separate from World alerts and SITE sampler. */
  fmaSurveillance: FmaSurveillanceState;
  /** Per-TCW qualified alert episodes and read-only results; never World.alerts. */
  fmaAlertState: FmaAlertState;
  fmaAlertResults: Map<string, FmaAlertTrackResult>;
  fmaAlertOutlines: Map<string, "RED" | "YELLOW">;
  fmaAlertDiagnostics: string[];
  fmaScenarioDiagnostics: string[];
  fmaAmzs: FmaAmz[];
  fmaDefaultAmzId: string | null;
  fmaAlertInhibit: FmaAlertInhibit;
  /** Display-local episode acknowledgments; IDs expire with their alert episode. */
  fmaAcknowledgedEpisodeIds: Set<string>;
  fmaSilencedEpisodeIds: Set<string>;
  /** T02-224 consumes these episode-local onset/cancel events and action tests for speech. */
  fmaSpeechEvents: Array<
    | { type: "onset" | "cancel"; episodeId: string; aircraftId: string }
    | { type: "test"; level?: number }
  >;
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
  /**
   * STARS TCW alert tone volume (0–5 spinner). Default 2.
   * Modulates CA alert tone volume without affecting pilot radio line.
   */
  vol: VolLevel;
  /**
   * STARS TCW FMA voice volume level (1–10). TI 6191.409 §§6.16.6–7.
   * Default 6. Modulates browser SpeechSynthesis utterance volume (level / 10).
   */
  fmaVoiceLevel: number;
  /**
   * Supported service level mode (EFSL, FSL, TRNG, FMA, DSF).
   * TI 6191.409 Section 6.16.1, Figure 6-16.
   * Default supported service state is "FSL".
   */
  serviceMode: ServiceMode;
  /**
   * Pending FMA confirmation state when MODE -> FMA is clicked.
   * Requires ACCEPT to commit toggle, or DONE/cancel to dismiss.
   */
  fmaCandidateMode: boolean;
  /**
   * Configured hardware/display capability ("2K" or "1K").
   * FMA requires 2K; 1K omits FMA from MODE submenu (Figure 6-16).
   */
  displayCapability: "2K" | "1K";
  /**
   * Operator workstation privilege ("controller" or "other").
   * FMA requires controller privilege.
   */
  operatorPrivilege: "controller" | "other";
  /**
   * AMZ-keyed FMA preference store (analog Section 4.1 / 4.1.1).
   */
  amzPreferences: Map<string, FmaAmzPreference>;
  /**
   * Last operator-facing system warning (e.g. "NO PREF SET FOUND").
   */
  lastWarning: string | null;
  /**
   * FMA lateral magnification factor (1–8). TI 6191.409 §6.16.3. Default 1.
   */
  fmaMag: number;
  /**
   * FMA predicted track line length in whole seconds (0–adapted max, default 5). TI 6191.409 §6.16.4.
   * 0 removes displayed PTLs in FMA and clears SSA PTL readout.
   */
  fmaPtlSeconds: number;
  /**
   * FMA runway-assigned leader direction overrides (runwayId -> LeaderDir | null). TI 6191.409 §6.16.5.
   */
  fmaRunwayLeaders: Map<string, LeaderDir | null>;
  /**
   * AUX H_RATE: History dot scan rate interval in seconds (default 4.5).
   * New history dots are sampled when elapsed time >= historyRateSec * 1000.
   */
  historyRateSec: number;
  /**
   * AUX DWELL mode: "OFF", "ON", "LOCK" (default "OFF").
   * ON brightens datablock on hover; LOCK keeps last hovered track brightened.
   */
  dwellMode: DwellMode;
  /** Track ID currently locked by DWELL LOCK mode. */
  dwellLockedAircraftId: string | null;
  /** AUX CURSOR HOME toggle state. */
  cursorHome: boolean;
  /** AUX CSR SPD spinner (1–10, default 4). */
  cursorSpeed: number;
  /**
   * Minimum-Separation (MIN) model and prediction session state.
   * TI 6191.409 Section 6.4. Display/prediction only.
   */
  minSep: MinSepState;
  /**
   * Range-Bearing Line (RBL) session state and up to 9 active lines.
   * TI 6191.409 Section 6.7. Display/prediction only.
   */
  rbl: RangeBearingLineState;
}

export type DisplayCapability = "2K" | "1K";
export type OperatorPrivilege = "controller" | "other";

export type ServiceMode = "EFSL" | "FSL" | "TRNG" | "FMA" | "DSF";
export const DEFAULT_SERVICE_MODE: ServiceMode = "FSL";

/**
 * AMZ-keyed FMA display preference snapshot (TI 6191.409 §4.1, §4.1.1, §6.16.2).
 */
export interface FmaAmzPreference {
  amzId: string;
  mag?: number;
  ptlSeconds?: number;
  fmaBrite?: {
    amz?: number;
    ntz?: number;
    rwy?: number;
    ref?: number;
  };
  runwayLeaders?: Record<string, number>;
  enabledNtzIds?: string[];
  voiceLevel?: number;
  rangeNm?: number;
  centerEastNm?: number;
  centerNorthNm?: number;
  mapVisibility?: Record<string, boolean>;
}

export const VOL_STEPS = [0, 1, 2, 3, 4, 5] as const;
export type VolLevel = (typeof VOL_STEPS)[number];
export const DEFAULT_VOL_LEVEL: VolLevel = 2;

export type DwellMode = "OFF" | "ON" | "LOCK";
export const DEFAULT_DWELL_MODE: DwellMode = "OFF";

export const DEFAULT_HISTORY_RATE_SEC = 4.5;
export const DEFAULT_CURSOR_SPEED = 4;

export function createScopeView(
  airportEastNm: number = AIRPORT_REF_EAST_NM,
  airportNorthNm: number = AIRPORT_REF_NORTH_NM,
  options?: {
    digitalMap?: DigitalMap;
    showCoastline?: boolean;
    showCompassRose?: boolean;
    giTextLines?: readonly string[];
    radarSites?: readonly RadarSite[];
    surveillanceMode?: SurveillanceMode;
    arp?: LatLon;
    ssaWeatherAirports?: readonly string[];
    towerAirports?: readonly string[];
    primaryAltimeter?: string;
    airportAltimeters?: readonly SsaAirportAltimeter[];
    vol?: VolLevel;
    fmaVoiceLevel?: number;
    serviceMode?: ServiceMode;
    displayCapability?: "2K" | "1K";
    operatorPrivilege?: "controller" | "other";
    historyRateSec?: number;
    dwellMode?: DwellMode;
    cursorHome?: boolean;
    cursorSpeed?: number;
    radarTilesetBoundaryNm?: readonly NmEastNorth[];
    fmaAmzs?: readonly FmaAmz[];
    fmaDefaultAmzId?: string | null;
    fmaMag?: number;
    fmaPtlSeconds?: number;
    fmaRunwayLeaders?: ReadonlyMap<string, LeaderDir | null>;
  },
): ScopeView {
  const digitalMap = options?.digitalMap ?? DEFAULT_DIGITAL_MAP;
  const showCoastline = options?.showCoastline ?? digitalMap.coastline?.enabled === true;
  const showCompassRose = options?.showCompassRose ?? true;
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
    showCompassRose,
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
    mapListMode: "GEO",
    mciEnabled: true,
    selectedMapGroupId: defaultSelectedMapGroupId(digitalMap.videoMapGroups),
    dcbDock: "TOP",
    digitalMap,
    mapCache: null,
    historyDotCount: 5,
    lastHistoryDotCount: 5,
    historyEnabled: true,
    modeCVisible: true,
    datablockCellWidthPx: DEFAULT_DATABLOCK_CELL_PX,
    datablockRenderSnapshot: undefined,
    ptlOn: false,
    ptlOwn: false,
    ptlMinutes: PTL_MINUTES,
    ptlByAircraftId: new Map(),
    tpa: { ...DEFAULT_TPA_STATE },
    atpa: { ...DEFAULT_ATPA_STATE },
    altitudeFilter: { ...DEFAULT_ALTITUDE_FILTER },
    associatedAltitudeFilter: { ...DEFAULT_ALTITUDE_FILTER },
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
    towerAirports: options?.towerAirports
      ? [...options.towerAirports]
      : options?.ssaWeatherAirports
        ? [...options.ssaWeatherAirports]
        : undefined,
    systemLists: cloneSystemListPlacements(),
    listDrag: idleListDragState(),
    dcbPref: emptyDcbPrefRuntime(),
    sectorId: "D",
    beaconSelectCodes: [],
    tracks: new Map(),
    caInhibitedPairs: new Set(),
    caControllerOwnedPairsInhibited: false,
    acknowledgedAlertPairs: new Set(),
    pendingChord: null,
    helpOpen: false,
    dcbVisible: true,
    beaconatorActive: false,
    towerListDroppedCallsigns: new Set(),
    vfrListDroppedCallsigns: new Set(),
    flightPlanList: idleFlightPlanListState(),
    get flightPlanListState() {
      return this.flightPlanList;
    },
    set flightPlanListState(val) {
      this.flightPlanList = val;
    },
    cursorHoverPos: null,
    f1DropArmed: false,
    stagedListAnchor: null,
    activeListEntries: [],
    surveillanceMode: options?.surveillanceMode ?? defaultSurveillanceMode(),
    radarSites: options?.radarSites ? [...options.radarSites] : [],
    fmaSurveillance: createFmaSurveillanceState(),
    fmaAlertState: createFmaAlertState(),
    fmaAlertResults: new Map(),
    fmaAlertOutlines: new Map(),
    fmaAlertDiagnostics: [],
    fmaScenarioDiagnostics: [],
    fmaAmzs: options?.fmaAmzs ? [...options.fmaAmzs] : [],
    fmaDefaultAmzId: options?.fmaDefaultAmzId ?? null,
    fmaAlertInhibit: {},
    fmaAcknowledgedEpisodeIds: new Set(),
    fmaSilencedEpisodeIds: new Set(),
    fmaSpeechEvents: [],
    wxLevels: cloneWxLevels(),
    wxMosaic: emptyWxMosaic(),
    arp,
    vol: options?.vol ?? DEFAULT_VOL_LEVEL,
    fmaVoiceLevel: options?.fmaVoiceLevel ?? 6,
    serviceMode: options?.serviceMode ?? DEFAULT_SERVICE_MODE,
    fmaCandidateMode: false,
    displayCapability: options?.displayCapability ?? "2K",
    operatorPrivilege: options?.operatorPrivilege ?? "controller",
    amzPreferences: new Map(),
    lastWarning: null,
    fmaMag: options?.fmaMag ?? 1,
    fmaPtlSeconds: options?.fmaPtlSeconds ?? 5,
    fmaRunwayLeaders: options?.fmaRunwayLeaders ? new Map(options.fmaRunwayLeaders) : new Map(),
    historyRateSec: options?.historyRateSec ?? DEFAULT_HISTORY_RATE_SEC,
    dwellMode: options?.dwellMode ?? DEFAULT_DWELL_MODE,
    dwellLockedAircraftId: null,
    cursorHome: options?.cursorHome ?? false,
    cursorSpeed: options?.cursorSpeed ?? DEFAULT_CURSOR_SPEED,
    minSep: createMinSepState(),
    rbl: createRangeBearingLineState({
      radarTilesetBoundaryNm: options?.radarTilesetBoundaryNm
        ? [...options.radarTilesetBoundaryNm]
        : undefined,
    }),
  };
}

/**
 * Bind authored scenario `radarTilesetBoundaryNm` onto the live view (T02-208).
 * Sets or clears the boundary polygon on the RBL session state.
 */
export function applyRadarTilesetBoundary(
  view: ScopeView,
  boundary?: readonly NmEastNorth[],
): void {
  setRblRadarTilesetBoundary(view.rbl, boundary);
}

/** Session replacement clears RBL graphics and stale Preview errors/actions, including empty sessions. */
export function resetRangeBearingSession(view: ScopeView): void {
  clearRangeBearingLines(view.rbl);
  cancelPreviewArea(view.preview);
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
  clearFmaSurveillanceView(view);
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
  clearFmaSurveillanceView(view);
}

/** Internal runtime seam for the later MODE / AMZ controls; no UI command. */
export function configureFmaSurveillanceView(
  view: ScopeView,
  enabled: boolean,
  selectedAmzId: string | null,
  monitoring?: { surveillanceLossS: number; coastOutS: number },
): void {
  const nextMonitoring = monitoring ?? view.fmaSurveillance.monitoring;
  const previous = view.fmaSurveillance;
  view.fmaSurveillance = configureFmaSurveillance(
    view.fmaSurveillance,
    enabled,
    selectedAmzId,
    nextMonitoring,
  );
  if (view.fmaSurveillance !== previous) {
    for (const [aircraftId, episode] of view.fmaAlertState.episodes) {
      view.fmaSpeechEvents.push({ type: "cancel", episodeId: episode.id, aircraftId });
    }
    view.fmaAlertState = createFmaAlertState(selectedAmzId);
    view.fmaAlertResults = new Map();
    view.fmaAlertOutlines = new Map();
    view.fmaAlertDiagnostics = [];
    view.fmaAcknowledgedEpisodeIds.clear();
    view.fmaSilencedEpisodeIds.clear();
    cancelPreviewArea(view.preview);
    for (const td of view.tracks.values()) delete td.presentationReport;
  }
}

/** Deterministic sensor-source fixture input for synthetic tests/browser exercises. */
export function setFmaSensorStatusView(view: ScopeView, status: FmaSensorStatus | null): void {
  view.fmaSurveillance = setFmaSensorStatus(view.fmaSurveillance, status);
}

/** Deterministic report-feed override; [] deliberately interrupts every source. */
export function setFmaSensorFixtureView(view: ScopeView, fixture: FmaSensorFixture | null): void {
  view.fmaSurveillance = setFmaSensorFixture(view.fmaSurveillance, fixture);
}

/** Selects explicit fixture reports when present; an empty fixture remains a gap. */
export function fmaReportsForSimulationTick(
  view: ScopeView,
  ordinaryReports: readonly SurveillanceReport[],
): readonly SurveillanceReport[] {
  return view.fmaSurveillance.sensorFixture?.reports ?? ordinaryReports;
}

/** Simulation-update observer. Caller must guard against unchanged sim time. */
export function advanceFmaSurveillanceView(view: ScopeView, tick: FmaSurveillanceTick): void {
  view.fmaSurveillance = advanceFmaSurveillance(view.fmaSurveillance, tick);
  publishFmaPresentation(view);
}

/** Prune dead/disassociated tracks without evaluating report age. */
export function pruneFmaSurveillanceView(
  view: ScopeView,
  liveTrackIds: ReadonlySet<string>,
  associatedTrackIds?: ReadonlySet<string>,
): void {
  view.fmaSurveillance = pruneFmaSurveillance(
    view.fmaSurveillance,
    liveTrackIds,
    associatedTrackIds,
  );
  publishFmaPresentation(view);
}

export function releaseFmaTrackView(view: ScopeView, aircraftId: string): void {
  view.fmaSurveillance = releaseFmaTrack(view.fmaSurveillance, aircraftId);
  delete view.tracks.get(aircraftId)?.presentationReport;
}

export function releaseFmaTracksView(view: ScopeView, aircraftIds: Iterable<string>): void {
  const ids = [...aircraftIds];
  view.fmaSurveillance = releaseFmaTracks(view.fmaSurveillance, ids);
  for (const id of ids) delete view.tracks.get(id)?.presentationReport;
}

export function clearFmaSurveillanceView(view: ScopeView): void {
  const pendingCancels = view.fmaSpeechEvents.filter(
    (event): event is { type: "cancel"; episodeId: string; aircraftId: string } =>
      event.type === "cancel",
  );
  view.fmaSpeechEvents.length = 0;
  view.fmaSpeechEvents.push(...pendingCancels);
  const canceledEpisodeIds = new Set(pendingCancels.map((event) => event.episodeId));
  for (const [aircraftId, episode] of view.fmaAlertState.episodes) {
    if (!canceledEpisodeIds.has(episode.id)) {
      view.fmaSpeechEvents.push({ type: "cancel", episodeId: episode.id, aircraftId });
    }
  }
  view.fmaSurveillance = clearFmaSurveillance(view.fmaSurveillance);
  view.fmaAlertState = createFmaAlertState();
  view.fmaAlertResults = new Map();
  view.fmaAlertOutlines = new Map();
  view.fmaAlertDiagnostics = [];
  view.fmaAlertInhibit = {};
  view.fmaAcknowledgedEpisodeIds.clear();
  view.fmaSilencedEpisodeIds.clear();
  cancelPreviewArea(view.preview);
  cancelDcbSpinner(view);
  for (const td of view.tracks.values()) delete td.presentationReport;
}

/**
 * Rebind FMA configuration on scenario or catalog replacement (T02-225 contract rule 6):
 * If previously enabled with an AMZ ID, rebind by stable known AMZ ID or initial valid AMZ;
 * clear all session episodes, arms, retained tracks and speech.
 */
export function rebindFmaScenarioAmzs(
  view: ScopeView,
  nextAmzs: readonly FmaAmz[],
  resolvedAmzId?: string | null,
): void {
  view.fmaAmzs = [...nextAmzs];
  const currentAmzId = view.fmaSurveillance.selectedAmzId;
  const stillValid = currentAmzId ? view.fmaAmzs.some((a) => a.id === currentAmzId) : false;
  const wasEnabled = view.fmaSurveillance.enabled;

  clearFmaSurveillanceView(view);
  view.fmaCandidateMode = false;
  view.fmaDefaultAmzId = nextAmzs.some((amz) => amz.id === resolvedAmzId)
    ? resolvedAmzId!
    : (nextAmzs[0]?.id ?? null);

  if (wasEnabled && view.fmaAmzs.length > 0 && view.fmaDefaultAmzId) {
    const targetAmzId =
      resolvedAmzId === undefined && stillValid ? currentAmzId! : view.fmaDefaultAmzId;
    if (!applyFmaAmzPreference(view, targetAmzId)) view.lastWarning = "NO PREF SET FOUND";
    else view.lastWarning = null;
    configureFmaSurveillanceView(view, true, targetAmzId);
  } else if (wasEnabled) {
    configureFmaSurveillanceView(view, false, null);
  }
}

/** Shared scenario-flow resolver and lifecycle binder used at boot and replacement. */
export function bindFmaScenarioFlow(
  view: ScopeView,
  scenario: Pick<Scenario, "catalog" | "activeRunwayId" | "fma">,
) {
  const resolution = resolveFmaFlow(scenario.catalog, scenario.activeRunwayId, {
    initialAmzId: scenario.fma?.initialAmzId,
    preferredAmzId: view.fmaSurveillance.selectedAmzId,
    excludeDerived: scenario.fma?.excludeDerivedGroups,
  });
  rebindFmaScenarioAmzs(view, resolution.amzs, resolution.selectedAmzId);
  view.fmaScenarioDiagnostics = resolution.diagnostics;
  return resolution;
}

function publishFmaPresentation(view: ScopeView): void {
  for (const [id, td] of view.tracks) {
    const retained = view.fmaSurveillance.tracks.get(id);
    if (view.fmaSurveillance.enabled && retained) {
      td.presentationReport = { ...retained.coastedReport };
    } else {
      delete td.presentationReport;
    }
  }
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

/** H when scope-focused. Toggles history 0 ↔ last non-zero (default 5). Never a Command. */
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

/** F10 always-on: toggle PTL ALL. If OWN and ALL were off, this turns ALL on. Never a Command. */
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

/** Help overlay toggle. Display only — never a Command. */
export function toggleHelpOverlay(view: ScopeView): void {
  view.helpOpen = !view.helpOpen;
}

/** Ctrl+F8 DCB visibility toggle. */
export function toggleDcbVisible(view: ScopeView): void {
  view.dcbVisible = view.dcbVisible === undefined ? false : !view.dcbVisible;
}

/** Ctrl+F11 WX layer toggle: if any active, turn all off; otherwise turn all on. */
export function toggleWxLevels(view: ScopeView): void {
  const anyOn = view.wxLevels.some(Boolean);
  view.wxLevels = anyOn
    ? [false, false, false, false, false, false]
    : [true, true, true, true, true, true];
}

/** MAP toggles on the DCB. Coastline JSON `enabled: false` is a no-op. */
export type MapLayerId = "runway" | "localizer" | "rings" | "coastline" | "compassRose";

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
    case "compassRose":
      view.showCompassRose = !view.showCompassRose;
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

/**
 * STARS TCW VOICE level action (1–10). TI 6191.409 §§6.16.6–7.
 * Only levels 1 through 10 are accepted. Clamped to integer [1, 10].
 */
export function setFmaVoiceLevel(view: ScopeView, level: number): void {
  if (!Number.isFinite(level)) return;
  view.fmaVoiceLevel = Math.max(1, Math.min(10, Math.round(level)));
}
