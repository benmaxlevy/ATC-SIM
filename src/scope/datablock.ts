/**
 * Analog: FAA PCG **datablock** / **Mode C** (R02); CRC STARS FDB / LDB (R07);
 * FOA STARS display data (R05). Altitude on the block is hundreds of feet, not
 * raw feet. CRC analog FDB line 2/3 (scratchpad, type) — trainer fields, not NAS FP.
 *
 * Trainer delta (v1, not a field-by-field STARS clone): aircraft type follows
 * strict Field 5 / Line 2 placement. Scratchpad is TrackDisplay 0–4 A–Z0–9, not a host
 * flight-plan / runway assignment. Omitted: beacon code, CSI, CHARSIZE, NAS FP.
 * Limited datablock is Mode C hundreds only (no scratchpad, no type).
 * Leader geometry (L1–L9) lives in `leader.ts`.
 * Never a label, nametag, or tooltip. Not NAS STARS.
 */

import { flightPlanForAircraft, type Aircraft, type TrackHandoff, type World } from "@core";
import type { TrackDisplay } from "./trackDisplay";
import { DATABLOCK_LINE_HEIGHT_PX, DEFAULT_DATABLOCK_CELL_PX } from "./fonts";
import {
  DEFAULT_LEADER_DIR,
  LEADER_LENGTH_PX,
  datablockTopLeft,
  type DatablockMetrics,
  type LeaderDir,
} from "./leader";

export const DATABLOCK_FIELD_GAP = "  ";

/** STARS FDB Line 2 time-sharing phase interval (~2.5 seconds). */
export const FDB_TIMESHARE_INTERVAL_MS = 2500;

/** Trainer scratchpad cell: analog CRC FDB scratchpad; not NAS FP (R27). */
export const SCRATCHPAD_MAX_LEN = 4;

export type DatablockMode = "full" | "partial" | "limited";

/**
 * Uppercase, drop anything but A–Z0–9, clamp to 4 characters.
 * Empty is valid (cleared scratchpad).
 */
export function sanitizeScratchpad(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, SCRATCHPAD_MAX_LEN);
}

/** Kinematics + intent the formatters read. Aircraft satisfies this. */
export interface DatablockSource {
  callsign: string;
  /** Mode C — reported pressure altitude (kinematics), feet MSL. */
  altitudeFt: number;
  /** Ground speed, knots (TAS=IAS in v1). */
  speedKt: number;
  intent: {
    assignedAltitudeFt: number;
    controllerAssignedAltitudeFt?: number;
    assignedSpeedKt?: number;
    controllerAssignedSpeedKt?: number;
    requestedAltitudeFt?: number;
  };
  /** ICAO type stub for FDB (e.g. B738). Display-only. */
  aircraftType?: string;
  /** Assigned or active squawk / beacon code (e.g. "1200", "0342"). */
  squawk?: string;
  /** Optional beacon code alias. */
  beaconCode?: string;
  /** Assigned squawk code when tracking squawk mismatch. */
  assignedSquawk?: string;
  /** Reported squawk code when tracking squawk mismatch. */
  reportedSquawk?: string;
  /** Wake turbulence or RNAV / CWT category indicator letter (e.g. "H", "B", "R", "L", "A"-"I"). */
  wakeCategory?: string;
  /** Special Purpose Code: "EM" (7700), "RF" (7600), "HJ" (7500), or explicit SPC tag. */
  spc?: string;
  /** Filed / requested cruise or entry altitude in feet MSL (e.g. 7000 for R070). */
  requestedAltitudeFt?: number;
  /** True if altitude is pilot-reported (displays *). */
  pilotReportedAltitude?: boolean;
  /** ATPA in-trail distance readout (Fig 38/39 two decimals, e.g. "2.40"). */
  atpaDistance?: string;
  /** Flight rules indicator ("VFR" or "IFR"). */
  flightRules?: "IFR" | "VFR" | string;
  /** True if aircraft is an overflight / enroute track. */
  isOverflight?: boolean;
}

/**
 * Build the single runtime source used by FDB/LDB formatters.
 * Analog: CRC/STARS datablock reads the operational flight data associated
 * with the track (manual §§2.12, 5.6.17). Trainer delta: unsupported host
 * fields stay empty; surveillance remains on Aircraft and no intent changes.
 */
export function datablockSourceFromWorld(
  world: World,
  aircraft: Aircraft,
  track?: Pick<TrackDisplay, "squawk">,
): DatablockSource {
  const plan = flightPlanForAircraft(world, aircraft.id);
  const reportedSquawk =
    plan?.reportedBeacon ?? track?.squawk ?? aircraft.reportedSquawk ?? aircraft.squawk;
  const assignedSquawk = plan?.assignedBeacon ?? aircraft.assignedSquawk;
  const assignedAltitudeFt =
    plan?.assignedAltitudeFt ?? aircraft.intent.controllerAssignedAltitudeFt;
  return {
    ...aircraft,
    callsign: plan?.acid ?? aircraft.callsign,
    squawk: reportedSquawk,
    assignedSquawk,
    reportedSquawk,
    aircraftType: plan?.aircraftType ?? aircraft.aircraftType,
    requestedAltitudeFt: plan?.requestedAltitudeFt ?? aircraft.requestedAltitudeFt,
    flightRules: plan?.flightRules ?? aircraft.flightRules,
    intent: {
      ...aircraft.intent,
      ...(assignedAltitudeFt === undefined
        ? {}
        : { controllerAssignedAltitudeFt: assignedAltitudeFt }),
      ...(plan?.requestedAltitudeFt === undefined
        ? {}
        : { requestedAltitudeFt: plan.requestedAltitudeFt }),
    },
  };
}

export interface FullDatablockOpts {
  /** Hide the Mode C field on full blocks (`M`). Limited ignores this. */
  modeCVisible?: boolean;
  /** Trainer scratchpad (legacy SP1 alias). */
  scratchpad?: string;
  /** Primary scratchpad (SP1: approach shorthand or interim altitude). */
  sp1?: string;
  /** Secondary scratchpad (SP2: assigned speed shorthand). */
  sp2?: string;
  /** Transferring / receiving sector ID character centered on Line 2 during handoff. */
  handoffSectorId?: string;
  /** Simulation timestamp in milliseconds for time-sharing cycle. Default 0. */
  simTimeMs?: number;
  /** Explicit time-share phase override (step index 0, 1, 2, ...). */
  timeSharePhase?: number;
  /** Figure 2-20 Field 0 TSAS sequence number (format-only input). */
  tsasSequence?: string | number;
  /** Figure 2-20 Field 3 departure data (format-only inputs). */
  exitGate?: string;
  exitFix?: string;
  /** Figure 2-20 Field 4 TCP; one or two adapted characters. */
  tcp?: string;
  /** Field 4 adaptation indicator (for example, `Δ`, `*`, `+`, or `R`). */
  field4Indicator?: string;
  /** Optional Field 0 indicators supplied by a display-state adapter. */
  field0Indicators?: string[];
  /** Field 5 duplicate beacon display condition, distinct from squawk mismatch. */
  duplicateBeaconCode?: string;
  /** Field 5 number of aircraft represented by the track. */
  aircraftCount?: number;
  /** Field 6 ATPA in-trail distance, or its documented status literals. */
  atpaInTrailDistance?: string;
  atpaNowgt?: boolean;
  atpaTpa?: boolean;
  /** Field 6 optional documented indicators. */
  noFlightPlan?: boolean;
  duplicateTargetAddress?: boolean;
  moaAssignment?: string;
  csmm?: boolean;
  selectedBeaconCode?: string;
  tsasRunwayId?: string;
  /** Field 7 TSAS and beacon-mismatch values. */
  tsasAdvisedSpeedKt?: number;
  tsasEarlyLate?: { status: "E" | "L"; minutes: number; seconds?: number };
  /** Field 8 pointout values. Higher-priority status suppresses accept count. */
  pointoutReceiverTcp?: string;
  pointoutUn?: boolean;
  pointoutRd?: boolean;
  pointoutAcceptCount?: number;
  pointoutInhibited?: boolean;
}

export interface PartialDatablockOpts {
  /** Hide the Mode C field (`M`). */
  modeCVisible?: boolean;
  /** Trainer scratchpad (legacy SP1 alias). */
  scratchpad?: string;
  /** Primary scratchpad (SP1). */
  sp1?: string;
  /** Secondary scratchpad (SP2). */
  sp2?: string;
  /** Transferring / receiving sector ID character centered on Line 2 during handoff. */
  handoffSectorId?: string;
  /** Simulation timestamp in milliseconds. */
  simTimeMs?: number;
  /** Explicit time-share phase override (step index 0, 1, 2, ...). */
  timeSharePhase?: number;
  /** Figure 2-20 Field 4 TCP; one or two adapted characters. */
  tcp?: string;
  /** Accepted for compatibility but not displayed in PDB Field 1. */
  exitGate?: string;
  /** Accepted for compatibility but not displayed in PDB Field 1. */
  exitFix?: string;
  /** Suppress ground speed display in PDB mode. */
  suppressPdbSpeed?: boolean;
  /** Existing PDB cautions only; unsupported alert/SPC values are omitted. */
  field0Indicators?: string[];
  /** Existing IDENT flash indicator; no new IDENT state is created here. */
  identIndicator?: string;
}

export interface LimitedDatablockOpts {
  /** Show beacon code if present (default true). When false/inhibited, displays Mode C only. */
  beaconVisible?: boolean;
  /** When true (queried state), displays Mode C altitude + ground speed. */
  queried?: boolean;
  /** Ground speed format when queried: "tens" (e.g. "18" for 180 kt) or "knots" (e.g. "180"). Default "tens". */
  speedFormat?: "tens" | "knots";
  /** Existing Field 0 safety-alert indicators supplied by the renderer. */
  field0Indicators?: string[];
}

export interface FullDatablock {
  /** Field 0 row above the callsign; omitted when no value is present. */
  line0?: string;
  line1: string;
  line2: string;
  /** Line 3: Assigned altitude prefixed with A, squawk mismatch, or ATPA distance. */
  line3?: string;
  /** Logical Figure 2-20 fields. Physical lines remain for existing painters. */
  fields: DatablockFields;
}

export interface PartialDatablock {
  /** PDB Field 0 caution row; omitted when no supported caution is present. */
  line0?: string;
  line1: string;
  /** Manual Fig. 2-22 projection; `fields` remains the legacy compatibility view. */
  pdbFields: DatablockFields;
  fields: DatablockFields;
}

/**
 * Explicit logical fields from Figure 2-20. Empty strings mean that the field
 * has no current display value; formatters never manufacture operational data.
 * Analog: CRC STARS FDB field grammar (R07). Trainer delta: this is a typed,
 * format-only model and does not implement NAS scheduling or surveillance.
 */
export interface DatablockFields {
  field0: string;
  field1: string;
  field2: string;
  field3: string;
  field4: string;
  field5: string;
  field6: string;
  field7: string;
  field8: string;
}

export interface DatablockFieldOptions {
  /** Include aircraft type in Field 5; PDBs intentionally suppress it. */
  aircraftTypeVisible?: boolean;
  /** Include ground speed in Field 5; PDBs may suppress it. */
  groundSpeedVisible?: boolean;
  field0Indicators?: string[];
  tsasSequence?: string | number;
  exitGate?: string;
  exitFix?: string;
  tcp?: string;
  field4Indicator?: string;
  duplicateBeaconCode?: string;
  aircraftCount?: number;
  atpaInTrailDistance?: string;
  atpaNowgt?: boolean;
  atpaTpa?: boolean;
  noFlightPlan?: boolean;
  duplicateTargetAddress?: boolean;
  moaAssignment?: string;
  csmm?: boolean;
  selectedBeaconCode?: string;
  tsasRunwayId?: string;
  tsasAdvisedSpeedKt?: number;
  tsasEarlyLate?: { status: "E" | "L"; minutes: number; seconds?: number };
  pointoutReceiverTcp?: string;
  pointoutUn?: boolean;
  pointoutRd?: boolean;
  pointoutAcceptCount?: number;
  pointoutInhibited?: boolean;
}

/** Physical character-cell lines derived from logical Fields 0–8. */
export interface PhysicalDatablockLines {
  line0?: string;
  line1: string;
  line2?: string;
  line3?: string;
}

/**
 * Project logical fields onto physical FDB/PDB lines. Field 4 owns a two-cell
 * center slot, keeping one-character TCPs aligned with two-character TCPs.
 */
export function physicalDatablockLines(
  fields: DatablockFields,
  mode: "full" | "partial" = "full",
): PhysicalDatablockLines {
  const line0 = fields.field0 || undefined;
  const line1 = fields.field1;
  const line2 = physicalFieldLine([fields.field3, fields.field4, fields.field5]);
  const line3 = physicalFieldLine([fields.field6, fields.field7, fields.field8]);
  if (mode === "partial") return { line1: line2 };
  const field0 = line0 ? { line0 } : {};
  return line3 ? { ...field0, line1, line2, line3 } : { ...field0, line1, line2 };
}

function physicalFieldLine(values: string[]): string {
  const [left, center, right] = values.map((value) => value.trim());
  const parts = [left, center ? center.padEnd(2, " ") : "", right].filter(Boolean);
  return parts.join(DATABLOCK_FIELD_GAP).trimEnd();
}

export interface LimitedDatablock {
  /** Field 0 row; omitted when no SPC or supplied safety alert is active. */
  line0?: string;
  line1: string;
}

export interface DatablockRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mode C / assigned hundreds, zero-padded, clamped 000–999. */
export function formatAltitudeHundreds(altFt: number): string {
  if (!Number.isFinite(altFt)) {
    return "000";
  }
  const hundreds = Math.round(altFt / 100);
  const clamped = Math.max(0, Math.min(999, hundreds));
  return String(clamped).padStart(3, "0");
}

/** Ground speed knots, nearest integer, padded to 3. */
export function formatGroundSpeedKt(speedKt: number): string {
  if (!Number.isFinite(speedKt)) {
    return "000";
  }
  const kt = Math.max(0, Math.round(speedKt));
  return String(kt).padStart(3, "0");
}

export interface GroundSpeedTensOpts {
  wakeCategory?: string;
  flightRules?: "IFR" | "VFR" | string;
  isOverflight?: boolean;
}

/**
 * Ground speed in tens of knots (e.g. 180 kt -> "18", 210 kt -> "21", 90 kt -> "09").
 * Optionally appends wake/RNAV category indicator (e.g. "18H", "25R"),
 * or flight category ("V" for VFR, "E" for overflights).
 */
export function formatGroundSpeedTens(
  speedKt: number,
  opts?: GroundSpeedTensOpts | string,
): string {
  if (!Number.isFinite(speedKt)) {
    return "00";
  }
  const tens = Math.max(0, Math.round(speedKt / 10));
  const base = String(tens).padStart(2, "0");

  const wake =
    typeof opts === "string" ? formatWakeCategory(opts) : formatWakeCategory(opts?.wakeCategory);
  if (wake.length > 0) {
    return `${base}${wake}`;
  }

  if (typeof opts === "object" && opts !== null) {
    if (opts.flightRules === "VFR") {
      return `${base}V`;
    }
    if (opts.isOverflight) {
      return `${base}E`;
    }
  }

  return base;
}

function assignedDiffers(modeCFt: number, assignedFt: number): boolean {
  if (!Number.isFinite(modeCFt) || !Number.isFinite(assignedFt)) {
    return false;
  }
  return Math.abs(assignedFt - modeCFt) >= 100;
}

function formatAircraftType(type: string | undefined): string | undefined {
  if (type == null || type.length === 0) {
    return undefined;
  }
  const cell = type
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
  return cell.length > 0 ? cell : undefined;
}

export function formatWakeCategory(wakeCategory: string | undefined): string {
  if (!wakeCategory || wakeCategory.length === 0) {
    return "";
  }
  return wakeCategory.toUpperCase().slice(0, 1);
}

export function formatRequestedAltitude(reqAltFt: number | undefined): string | undefined {
  if (reqAltFt == null || !Number.isFinite(reqAltFt)) {
    return undefined;
  }
  return `R${formatAltitudeHundreds(reqAltFt)}`;
}

export function getSpecialPurposeCode(track: DatablockSource): string | undefined {
  if (track.spc && track.spc.length > 0) {
    return track.spc.toUpperCase();
  }
  const codes = [track.reportedSquawk, track.squawk, track.beaconCode, track.assignedSquawk];
  for (const c of codes) {
    if (c === "7700") return "EM";
    if (c === "7600") return "RF";
    if (c === "7500") return "HJ";
  }
  return undefined;
}

function normalizeDisplayField(raw: string | undefined, maxLength: number): string {
  return (raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9*/+Δ<>.-]/g, "")
    .slice(0, maxLength);
}

function formatTsasSequence(value: string | number | undefined): string | undefined {
  if (value == null || (typeof value === "string" && value.trim() === "")) return undefined;
  const normalized = normalizeDisplayField(String(value), 2);
  return normalized.length > 0 ? normalized : undefined;
}

function formatAircraftCount(count: number | undefined): string | undefined {
  if (count == null || !Number.isInteger(count) || count < 1) return undefined;
  return `#${Math.min(count, 99)}`;
}

function formatTsasRunwayId(value: string | undefined): string | undefined {
  const runway = normalizeDisplayField(value, 3);
  return runway.length > 0 ? `A${runway}`.slice(0, 4) : undefined;
}

function formatAdvisedSpeed(speedKt: number | undefined): string | undefined {
  if (speedKt == null || !Number.isFinite(speedKt)) return undefined;
  return formatGroundSpeedTens(speedKt);
}

function formatEarlyLate(
  value: { status: "E" | "L"; minutes: number; seconds?: number } | undefined,
): string | undefined {
  if (!value || !Number.isInteger(value.minutes) || value.minutes < 0) return undefined;
  const minutes = Math.min(value.minutes, 99).toString();
  if (value.seconds == null || value.minutes > 2) return `${value.status}${minutes}`;
  if (!Number.isInteger(value.seconds) || value.seconds < 0) return undefined;
  return `${value.status}${minutes}${Math.min(value.seconds, 59).toString().padStart(2, "0")}`;
}

/**
 * Format the adapted owning TCP as a stable one- or two-cell value.
 * Analog: CRC STARS TCP subset + sector ID (R07). Trainer delta: this is
 * format-only input; it does not implement handoff or inter-facility state.
 */
export function formatTcp(value: string | undefined): string | undefined {
  const tcp = (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 2);
  return tcp.length > 0 ? tcp : undefined;
}

/** Build the logical Fields 0–5 before any physical-line compatibility view. */
export function formatDatablockFields(
  track: DatablockSource,
  opts: DatablockFieldOptions &
    Pick<
      FullDatablockOpts,
      "modeCVisible" | "scratchpad" | "sp1" | "sp2" | "timeSharePhase" | "simTimeMs"
    > = {},
): DatablockFields {
  const phaseStep =
    opts.timeSharePhase !== undefined
      ? opts.timeSharePhase
      : opts.simTimeMs != null
        ? Math.floor(opts.simTimeMs / FDB_TIMESHARE_INTERVAL_MS)
        : 0;
  const select = (values: Array<string | undefined>): string => {
    const queue = values.filter((value): value is string => Boolean(value && value.length > 0));
    return queue.length === 0
      ? ""
      : queue[((phaseStep % queue.length) + queue.length) % queue.length];
  };

  const indicators = (opts.field0Indicators ?? []).map((value) => normalizeDisplayField(value, 4));
  const spc = getSpecialPurposeCode(track);
  if (spc) indicators.unshift(normalizeDisplayField(spc, 4));
  const tsas = formatTsasSequence(opts.tsasSequence);
  if (tsas) indicators.push(tsas);

  const modeC = opts.modeCVisible === false ? undefined : formatAltitudeHundreds(track.altitudeFt);
  const scratchpad1 = sanitizeScratchpad(opts.sp1 ?? opts.scratchpad ?? "") || undefined;
  const scratchpad2 = sanitizeScratchpad(opts.sp2 ?? "") || undefined;
  const exitGate = normalizeDisplayField(opts.exitGate, 4) || undefined;
  const exitFix = normalizeDisplayField(opts.exitFix, 5) || undefined;

  const gs =
    opts.groundSpeedVisible === false
      ? undefined
      : formatGroundSpeedTens(track.speedKt, {
          wakeCategory: track.wakeCategory,
          flightRules: track.flightRules,
          isOverflight: track.isOverflight,
        });
  const duplicateBeacon = normalizeDisplayField(opts.duplicateBeaconCode, 4) || undefined;
  const rules = normalizeDisplayField(track.flightRules, 3) || undefined;
  const category = formatWakeCategory(track.wakeCategory) || undefined;
  const count = formatAircraftCount(opts.aircraftCount);
  const type =
    opts.aircraftTypeVisible === false ? undefined : formatAircraftType(track.aircraftType);
  const requested = formatRequestedAltitude(
    track.requestedAltitudeFt ?? track.intent?.requestedAltitudeFt,
  );

  // Fields 6–8 are independently time-shared. Priority follows Figure 2-20;
  // this is an analog-plus-delta formatter contract, not a TSAS/coordination
  // workflow. Absent inputs remain absent; no simulator state is inferred.
  const reportedBeaconMismatch =
    track.assignedSquawk && track.reportedSquawk && track.assignedSquawk !== track.reportedSquawk
      ? normalizeDisplayField(track.reportedSquawk, 4)
      : undefined;
  const field6 = select([
    normalizeDisplayField(opts.atpaInTrailDistance ?? track.atpaDistance, 5) || undefined,
    opts.atpaNowgt ? "NOWGT" : undefined,
    opts.atpaTpa ? "*TPA" : undefined,
    opts.noFlightPlan ? "NO FP" : undefined,
    reportedBeaconMismatch,
    duplicateBeacon,
    opts.duplicateTargetAddress ? "DA" : undefined,
    normalizeDisplayField(opts.moaAssignment, 4) || undefined,
    opts.csmm ? "CSMM" : undefined,
    normalizeDisplayField(opts.selectedBeaconCode, 4) || undefined,
    formatTsasRunwayId(opts.tsasRunwayId),
  ]);
  const mismatch =
    track.assignedSquawk && track.reportedSquawk && track.assignedSquawk !== track.reportedSquawk
      ? normalizeDisplayField(track.assignedSquawk, 4)
      : undefined;
  const field7 = select([
    targetAssignedAltitude(track),
    mismatch,
    formatAdvisedSpeed(opts.tsasAdvisedSpeedKt),
    formatEarlyLate(opts.tsasEarlyLate),
  ]);
  const pointout =
    opts.pointoutReceiverTcp != null
      ? `PO${formatTcp(opts.pointoutReceiverTcp) ? ` ${formatTcp(opts.pointoutReceiverTcp)}` : ""}`
      : opts.pointoutUn
        ? "UN"
        : opts.pointoutRd
          ? "RD"
          : undefined;
  const acceptCount =
    !pointout &&
    !opts.pointoutInhibited &&
    opts.pointoutAcceptCount != null &&
    Number.isInteger(opts.pointoutAcceptCount) &&
    opts.pointoutAcceptCount >= 0
      ? String(Math.min(opts.pointoutAcceptCount, 99))
      : undefined;

  return {
    field0: indicators.filter(Boolean).join("/").slice(0, 12),
    field1: normalizeDisplayField(track.callsign, 7),
    // Field 2 is deliberately exposed but not populated by this ticket.
    field2: "",
    field3: select([modeC, scratchpad1, scratchpad2, exitGate, exitFix]),
    field4: [normalizeDisplayField(opts.field4Indicator, 1), formatTcp(opts.tcp)]
      .filter(Boolean)
      .join(""),
    field5: select([gs, duplicateBeacon, rules, category, count, type, requested]),
    field6,
    field7,
    field8: pointout ?? acceptCount ?? "",
  };
}

/**
 * Project existing formatter values into the manual's PDB field order.
 *
 * Source: supplied TI 6191.409 Rev. 30 Fig. 2-22. Trainer
 * delta: only values already available to the formatter are projected; this
 * does not create handoff, alert, surveillance, or IDENT state. No runtime
 * adapter currently supplies PDB cautions, so absent inputs remain empty.
 */
export function formatPartialDatablockFields(
  track: DatablockSource,
  opts: PartialDatablockOpts = {},
): DatablockFields {
  const source = formatDatablockFields(track, {
    ...opts,
    tcp: undefined,
    exitGate: undefined,
    exitFix: undefined,
    aircraftTypeVisible: false,
    groundSpeedVisible: !opts.suppressPdbSpeed,
  });
  const tcp = formatTcp(opts.tcp ?? opts.handoffSectorId) ?? "";
  const groundSpeed = opts.suppressPdbSpeed
    ? ""
    : formatGroundSpeedTens(track.speedKt, {
        wakeCategory: track.wakeCategory,
        flightRules: track.flightRules,
        isOverflight: track.isOverflight,
      });

  return {
    field0: (opts.field0Indicators ?? [])
      .map((value) => normalizeDisplayField(value, 3))
      .filter((value) => value === "NOM" || value === "ISR" || value === "TRK")
      .join("/")
      .slice(0, 12),
    field1: source.field3,
    field2: tcp,
    field3: groundSpeed,
    field4: normalizeDisplayField(opts.identIndicator, 2),
    field5: "",
    field6: "",
    field7: "",
    field8: "",
  };
}

function targetAssignedAltitude(track: DatablockSource): string | undefined {
  const altitude = track.intent?.controllerAssignedAltitudeFt;
  return altitude != null && assignedDiffers(track.altitudeFt, altitude)
    ? `A${formatAltitudeHundreds(altitude)}`
    : undefined;
}

/**
 * Full datablock (STARS CRC):
 * - Field 0: Special Purpose Code (SPC: EM, RF, HJ, etc.) and existing cues.
 * - Line 1: Callsign.
 * - Line 2: Fields 3–5 (Mode C/scratchpad, TCP, GS/type/requested altitude).
 * - Line 3: Fields 6–8 (ATPA/mismatch, assigned altitude, pointout).
 */
export function formatFullDatablock(
  track: DatablockSource,
  opts: FullDatablockOpts = {},
): FullDatablock {
  const fields = formatDatablockFields(track, {
    ...opts,
    tcp: opts.tcp ?? opts.handoffSectorId,
  });
  const lines = physicalDatablockLines(fields);
  return { ...lines, line1: lines.line1 || track.callsign, line2: lines.line2 ?? "", fields };
}

export interface FullDatablockLine3Parts {
  assignedField?: string;
  squawkField?: string;
  atpaField?: string;
}

/** Line 3 segments so ATPA color cannot leak onto A040 / squawk mismatch. */
export function fullDatablockLine3Parts(track: DatablockSource): FullDatablockLine3Parts {
  const targetAssignedAlt = track.intent?.controllerAssignedAltitudeFt;
  const showAssigned =
    targetAssignedAlt != null &&
    Number.isFinite(targetAssignedAlt) &&
    assignedDiffers(track.altitudeFt, targetAssignedAlt);
  const assignedField = showAssigned ? `A${formatAltitudeHundreds(targetAssignedAlt)}` : undefined;
  const hasSquawkMismatch =
    track.assignedSquawk && track.reportedSquawk && track.assignedSquawk !== track.reportedSquawk;
  const squawkField = hasSquawkMismatch ? track.reportedSquawk : undefined;
  const atpaField =
    track.atpaDistance && track.atpaDistance.length > 0 ? track.atpaDistance : undefined;
  return { assignedField, squawkField, atpaField };
}

/**
 * Partial datablock (PDB): physical Field 3/4/5 line only, suppressing the
 * callsign and Field 5 aircraft type.
 * Used for associated tracks owned by another controller.
 */
export function formatPartialDatablock(
  track: DatablockSource,
  opts: PartialDatablockOpts = {},
): PartialDatablock {
  const fields = formatDatablockFields(track, {
    ...opts,
    tcp: opts.tcp ?? opts.handoffSectorId,
    aircraftTypeVisible: false,
    groundSpeedVisible: !opts.suppressPdbSpeed,
  });
  const pdbFields = formatPartialDatablockFields(track, opts);
  const lines = physicalDatablockLines(
    {
      ...pdbFields,
      field3: pdbFields.field1,
      field4: pdbFields.field2,
      field5: pdbFields.field3,
    },
    "partial",
  );
  const ident = pdbFields.field4;
  return {
    line0: pdbFields.field0 || undefined,
    line1: ident ? `${lines.line1}  ${ident}` : lines.line1,
    fields,
    pdbFields,
  };
}

/**
 * Limited datablock (LDB): Unassociated tracks.
 * Default: Beacon code + Mode C altitude in hundreds (e.g. `1200 045`).
 * When beacon code is inhibited: Mode C altitude only (e.g. `045`).
 * Queried state (when clicked): Mode C altitude + Ground speed (e.g. `045 18` or `045 180`).
 */
export function formatLimitedDatablock(
  track: DatablockSource,
  opts: LimitedDatablockOpts = {},
): LimitedDatablock {
  const spc = getSpecialPurposeCode(track);
  const ldbSpc = spc === "EM" || spc === "RF" || spc === "HJ" ? spc : undefined;
  const indicators = [ldbSpc, ...(opts.field0Indicators ?? []).filter((value) => value === "CA")]
    .map((value) => normalizeDisplayField(value, 4))
    .filter(Boolean)
    .join("/")
    .slice(0, 12);
  const line0 = indicators.length > 0 ? indicators : undefined;
  const withLine0 = (line1: string): LimitedDatablock =>
    line0 == null ? { line1 } : { line0, line1 };
  const modeC = formatAltitudeHundreds(track.altitudeFt);
  if (opts.queried) {
    const gs =
      opts.speedFormat === "knots"
        ? formatGroundSpeedKt(track.speedKt)
        : formatGroundSpeedTens(track.speedKt);
    return withLine0(`${modeC} ${gs}`);
  }
  const squawk = track.squawk ?? track.beaconCode;
  if (opts.beaconVisible !== false && squawk && squawk.length > 0) {
    return withLine0(`${squawk} ${modeC}`);
  }
  return withLine0(modeC);
}

export interface DatablockLines {
  line0?: string;
  line1: string;
  line2?: string;
  line3?: string;
}

/**
 * Compatibility adapter for callers that still pass a pending inbound handoff.
 * The origin is rendered through Field 4/TCP; inbound FDB Line 1 has no
 * invented `HO` suffix.
 */
export function withInboundHandoffCue(line1: string, handoff: TrackHandoff): string {
  void handoff;
  return line1;
}

/**
 * Project the shared outbound handoff state into the existing Field 4/TCP
 * display. Pending handoffs always show the destination; accepted handoffs
 * retain it for the existing five-second receiver-TCP window. This keeps
 * Center and Tower on the same datablock path without changing handoff state.
 */
export function handoffDatablockDisplay(
  handoff: TrackHandoff,
  localTcp: string,
  simTimeMs: number,
): Pick<DatablockRenderOpts, "handoffSectorId" | "tcp"> {
  if (handoff.kind === "inbound" || handoff.kind === "departure") {
    return {
      handoffSectorId: localTcp,
      tcp: handoff.kind === "inbound" ? localTcp : undefined,
    };
  }
  if (
    handoff.kind === "outbound" &&
    (handoff.status !== "accepted" ||
      (handoff.acceptedAtSimMs != null && simTimeMs < handoff.acceptedAtSimMs + 5000))
  ) {
    return { handoffSectorId: handoff.toSectorId };
  }
  if (handoff.kind === "pointout_inbound") {
    return { handoffSectorId: handoff.fromSectorId };
  }
  if (handoff.kind === "pointout_outbound") {
    return { handoffSectorId: handoff.toSectorId };
  }
  return {};
}

export interface DatablockRenderOpts {
  modeCVisible?: boolean;
  scratchpad?: string;
  sp1?: string;
  sp2?: string;
  handoffSectorId?: string;
  suppressPdbSpeed?: boolean;
  identIndicator?: string;
  timeSharePhase?: number;
  simTimeMs?: number;
  queried?: boolean;
  beaconVisible?: boolean;
  speedFormat?: "tens" | "knots";
  tsasSequence?: string | number;
  exitGate?: string;
  exitFix?: string;
  tcp?: string;
  field4Indicator?: string;
  field0Indicators?: string[];
  duplicateBeaconCode?: string;
  aircraftCount?: number;
  atpaInTrailDistance?: string;
  atpaNowgt?: boolean;
  atpaTpa?: boolean;
  noFlightPlan?: boolean;
  duplicateTargetAddress?: boolean;
  moaAssignment?: string;
  csmm?: boolean;
  selectedBeaconCode?: string;
  tsasRunwayId?: string;
  tsasAdvisedSpeedKt?: number;
  tsasEarlyLate?: { status: "E" | "L"; minutes: number; seconds?: number };
  pointoutReceiverTcp?: string;
  pointoutUn?: boolean;
  pointoutRd?: boolean;
  pointoutAcceptCount?: number;
  pointoutInhibited?: boolean;
}

/** Resolve full vs partial vs limited lines for paint and hit-test. */
export function linesForDatablock(
  track: DatablockSource,
  mode: DatablockMode = "full",
  modeCVisibleOrOpts: boolean | DatablockRenderOpts = true,
  scratchpad = "",
  limitedOpts?: LimitedDatablockOpts,
  simTimeMs = 0,
): DatablockLines {
  const opts: DatablockRenderOpts =
    typeof modeCVisibleOrOpts === "object" && modeCVisibleOrOpts !== null
      ? modeCVisibleOrOpts
      : {
          modeCVisible: modeCVisibleOrOpts,
          scratchpad,
          simTimeMs,
          ...limitedOpts,
        };

  if (mode === "limited") {
    return formatLimitedDatablock(track, {
      beaconVisible: opts.beaconVisible,
      queried: opts.queried,
      speedFormat: opts.speedFormat,
      field0Indicators: opts.field0Indicators,
    });
  }
  if (mode === "partial") {
    const partial = formatPartialDatablock(track, {
      modeCVisible: opts.modeCVisible,
      scratchpad: opts.scratchpad,
      sp1: opts.sp1,
      sp2: opts.sp2,
      handoffSectorId: opts.handoffSectorId,
      tcp: opts.tcp,
      suppressPdbSpeed: opts.suppressPdbSpeed,
      field0Indicators: opts.field0Indicators,
      identIndicator: opts.identIndicator,
      timeSharePhase: opts.timeSharePhase,
      simTimeMs: opts.simTimeMs,
    });
    return partial;
  }
  return formatFullDatablock(track, {
    modeCVisible: opts.modeCVisible,
    scratchpad: opts.scratchpad,
    sp1: opts.sp1,
    sp2: opts.sp2,
    handoffSectorId: opts.handoffSectorId,
    timeSharePhase: opts.timeSharePhase,
    simTimeMs: opts.simTimeMs,
    tsasSequence: opts.tsasSequence,
    exitGate: opts.exitGate,
    exitFix: opts.exitFix,
    tcp: opts.tcp,
    field4Indicator: opts.field4Indicator,
    field0Indicators: opts.field0Indicators,
    duplicateBeaconCode: opts.duplicateBeaconCode,
    aircraftCount: opts.aircraftCount,
    atpaInTrailDistance: opts.atpaInTrailDistance,
    atpaNowgt: opts.atpaNowgt,
    atpaTpa: opts.atpaTpa,
    noFlightPlan: opts.noFlightPlan,
    duplicateTargetAddress: opts.duplicateTargetAddress,
    moaAssignment: opts.moaAssignment,
    csmm: opts.csmm,
    selectedBeaconCode: opts.selectedBeaconCode,
    tsasRunwayId: opts.tsasRunwayId,
    tsasAdvisedSpeedKt: opts.tsasAdvisedSpeedKt,
    tsasEarlyLate: opts.tsasEarlyLate,
    pointoutReceiverTcp: opts.pointoutReceiverTcp,
    pointoutUn: opts.pointoutUn,
    pointoutRd: opts.pointoutRd,
    pointoutAcceptCount: opts.pointoutAcceptCount,
    pointoutInhibited: opts.pointoutInhibited,
  });
}

export function datablockMetrics(
  lines: DatablockLines,
  cellWidthPx: number = DEFAULT_DATABLOCK_CELL_PX,
  lineHeightPx: number = DATABLOCK_LINE_HEIGHT_PX,
): DatablockMetrics {
  const cols = Math.max(
    lines.line0?.length ?? 0,
    lines.line1.length,
    lines.line2?.length ?? 0,
    lines.line3?.length ?? 0,
    1,
  );
  const rows = (lines.line3 != null ? 3 : lines.line2 != null ? 2 : 1) + (lines.line0 ? 1 : 0);
  return { widthPx: cols * cellWidthPx, heightPx: rows * lineHeightPx };
}

export function datablockRect(
  targetX: number,
  targetY: number,
  lines: DatablockLines,
  cellWidthPx: number = DEFAULT_DATABLOCK_CELL_PX,
  lineHeightPx: number = DATABLOCK_LINE_HEIGHT_PX,
  dir: LeaderDir = DEFAULT_LEADER_DIR,
  lengthPx: number = LEADER_LENGTH_PX,
): DatablockRect {
  const metrics = datablockMetrics(lines, cellWidthPx, lineHeightPx);
  const origin = datablockTopLeft(dir, metrics, lengthPx);
  return {
    x: targetX + origin.x,
    y: targetY + origin.y,
    w: metrics.widthPx,
    h: metrics.heightPx,
  };
}

export function pointInDatablock(cssX: number, cssY: number, rect: DatablockRect): boolean {
  return cssX >= rect.x && cssX < rect.x + rect.w && cssY >= rect.y && cssY < rect.y + rect.h;
}
