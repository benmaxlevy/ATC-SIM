import type { RangeNm } from "../camera";
import type { DwellMode, VolLevel } from "../scopeView";
import type { RrIntervalNm } from "./dcbFunctions";
import type { LeaderDir, LeaderLengthPx } from "../leader";
import type { HistoryDotCount } from "../history";
import type { PtlMinutes } from "../ptl";
import type { BriteState } from "../palette";
import type { CharSizes } from "../fonts";
import type { SsaVisibility } from "../ssa";
import type { AtpaState, TpaState } from "../tpa";
import type { SurveillanceMode } from "../surveillance";
import type { WxLevels } from "../wx";

export type DcbDock = "TOP" | "LEFT" | "RIGHT" | "BOTTOM";

export type DcbPrefOwner = "FSSTARS" | "FMA";

export type DcbPrefStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * AMZ-keyed FMA display preference snapshot (TI 6191.409 §4.1, §4.1.1, §6.16.2).
 */
export type FmaAmzPreference = {
  amzId: string;
  /** Complete supported workstation display profile; legacy partial fields remain readable. */
  displayProfile?: DcbPrefBody;
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
};

/** Display snapshot body. Not settings/theme. Not NAS PREF. */
export type DcbPrefBody = {
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
};

export type DcbPrefSlot = {
  name: string;
  body: DcbPrefBody;
};

export type DcbPrefFile = {
  v: number;
  icao: string;
  activeIndex?: number;
  normalActiveIndex?: number;
  slots: Array<DcbPrefSlot | null>;
  /** Last successfully selected or saved normal display profile. */
  normalProfile?: DcbPrefBody;
  amzPreferences?: Record<string, FmaAmzPreference>;
  selectedFmaAmzId?: string;
  owners?: { FSSTARS: Array<DcbPrefSlot | null>; FMA: Array<DcbPrefSlot | null> };
};

/** Live PREF machine on ScopeView. Slots are the trainer 32-set table. */
export type DcbPrefRuntime = {
  icao: string;
  slots: Array<DcbPrefSlot | null>;
  activeIndex: number;
  restore: DcbPrefBody | null;
  /** FMA-specific part of the in-menu RESTORE snapshot; never persisted. */
  restoreAmzProfile: FmaAmzPreference | null;
  /** Pre-menu lastApplied identity to restore on RESTORE; never persisted. */
  restoreLastApplied: { owner: DcbPrefOwner; index: number; name: string } | null;
  /** Pre-menu FMA mode and active AMZ to restore on RESTORE; never persisted. */
  restoreFmaSurveillance: { enabled: boolean; selectedAmzId: string | null } | null;
  /** Last successfully selected or saved normal display profile, independent of FMA edits. */
  normalProfile: DcbPrefBody | null;
  /** True while SAVE AS waits for a preview-area name. Not persisted. */
  pendingSaveAs: boolean;
  /** Temporary Figure 4-1 owner selection. Never persisted. */
  menuOwner: DcbPrefOwner;
  ownerCandidate: DcbPrefOwner | null;
  ownerConfirmed: boolean;
  /** Stable reserved FMA namespace. `slots` remains the normal namespace for compatibility. */
  fmaSlots: Array<DcbPrefSlot | null>;
  lastApplied: { owner: DcbPrefOwner; index: number; name: string } | null;
  lastNormal: { index: number; name: string } | null;
};
