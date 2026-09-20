/**
 * Radio request data types and state machine (T04-73).
 *
 * Models structured pilot service requests (flight following, airborne IFR pickup)
 * and their controller interaction lifecycle:
 * PENDING -> AWAITING_DETAILS | STANDBY | IDENTIFYING -> IDENTIFIED -> APPROVED
 * Terminal: CLEARED, DECLINED, WITHDRAWN, TERMINATED.
 *
 * State boundary: request records only. No mutation of flight rules,
 * kinematics, flight plan, active IFR clearance, or CA/MSAW.
 */

export type RadioRequestKind = "FLIGHT_FOLLOWING" | "IFR_PICKUP" | "CLASS_B_ACCESS";

/** Pilot-requestable Class B operations. `OUT_OF` is controller-issued only. */
export type ClassBRequestOperation = "TO_ENTER" | "THROUGH";

export type ClassBRequestIntent = "ARRIVAL" | "DEPARTURE" | "TRANSITION";

export interface ClassBRequestRouteLeg {
  type: "DIRECT";
  fixId: string;
}

export type RadioRequestStatus =
  | "PENDING"
  | "AWAITING_DETAILS"
  | "STANDBY"
  | "IDENTIFYING"
  | "IDENTIFIED"
  | "APPROVED"
  | "CLEARED"
  | "DECLINED"
  | "WITHDRAWN"
  | "TERMINATED";

export interface RadioRequestDetails {
  aircraftType?: string;
  destinationAirportId?: string;
  requestedAltitudeFt?: number;
  positionNm?: { xNm: number; yNm: number };
  altitudeFt?: number;
  headingDeg?: number;
  classBOperation?: ClassBRequestOperation;
  classBIntent?: ClassBRequestIntent;
  originAirportId?: string;
  route?: ClassBRequestRouteLeg[];
}

export interface RadioContactReport {
  /** Optional informational position reference; absent for bare `radar contact`. */
  distanceNm?: number;
  referenceId?: string;
  referenceKind?: "FIX" | "NAVAID" | "AIRPORT";
  reportedAtSimMs: number;
}

export interface RadioRequest {
  id: string;
  aircraftId: string;
  callsign: string;
  kind: RadioRequestKind;
  requestedAtSimMs: number;
  status: RadioRequestStatus;
  details: RadioRequestDetails;
  identifiedAtSimMs?: number;
  radarContact?: RadioContactReport;
  approvedAtSimMs?: number;
  clearedAtSimMs?: number;
  clearedClassBOperation?: ClassBRequestOperation;
  declinedAtSimMs?: number;
  terminatedAtSimMs?: number;
  withdrawnAtSimMs?: number;
  withdrawnReason?: string;
  standbyAtSimMs?: number;
  awaitingDetailsAtSimMs?: number;
}

export function isOpenRadioRequest(req: RadioRequest): boolean {
  return (
    req.status !== "CLEARED" &&
    req.status !== "DECLINED" &&
    req.status !== "WITHDRAWN" &&
    req.status !== "TERMINATED"
  );
}

export function isTerminalRadioRequest(req: RadioRequest): boolean {
  return (
    req.status === "CLEARED" ||
    req.status === "DECLINED" ||
    req.status === "WITHDRAWN" ||
    req.status === "TERMINATED"
  );
}

export function findOpenRadioRequest(
  requests: readonly RadioRequest[] | undefined,
  aircraftId: string,
  kind?: RadioRequestKind,
): RadioRequest | undefined {
  if (!requests) return undefined;
  return requests.find(
    (r) => r.aircraftId === aircraftId && isOpenRadioRequest(r) && (!kind || r.kind === kind),
  );
}

export function findLatestRadioRequest(
  requests: readonly RadioRequest[] | undefined,
  aircraftId: string,
  kind?: RadioRequestKind,
): RadioRequest | undefined {
  if (!requests) return undefined;
  for (let i = requests.length - 1; i >= 0; i--) {
    const r = requests[i]!;
    if (r.aircraftId === aircraftId && (!kind || r.kind === kind)) {
      return r;
    }
  }
  return undefined;
}

export type RequestTransitionResult =
  { ok: true; request: RadioRequest } | { ok: false; error: string };

export function transitionRequestToAwaitingDetails(
  request: RadioRequest,
  simTimeMs: number,
): RequestTransitionResult {
  if (isTerminalRadioRequest(request) || request.status === "APPROVED") {
    return { ok: false, error: "REQUEST: request is already resolved" };
  }
  request.status = "AWAITING_DETAILS";
  request.awaitingDetailsAtSimMs = simTimeMs;
  return { ok: true, request };
}

export function transitionRequestToStandby(
  request: RadioRequest,
  simTimeMs: number,
): RequestTransitionResult {
  if (isTerminalRadioRequest(request) || request.status === "APPROVED") {
    return { ok: false, error: "REQUEST: request is already resolved" };
  }
  request.status = "STANDBY";
  request.standbyAtSimMs = simTimeMs;
  return { ok: true, request };
}

export function transitionRequestToIdentifying(
  request: RadioRequest,
  _simTimeMs: number,
): RequestTransitionResult {
  if (isTerminalRadioRequest(request) || request.status === "APPROVED") {
    return { ok: false, error: "REQUEST: request is already resolved" };
  }
  if (
    request.status === "PENDING" ||
    request.status === "AWAITING_DETAILS" ||
    request.status === "STANDBY"
  ) {
    request.status = "IDENTIFYING";
  }
  return { ok: true, request };
}

export function transitionRequestToIdentified(
  request: RadioRequest,
  report: RadioContactReport,
  simTimeMs: number,
): RequestTransitionResult {
  if (isTerminalRadioRequest(request)) {
    return { ok: false, error: "REQUEST: request is already resolved" };
  }
  request.status = "IDENTIFIED";
  request.identifiedAtSimMs = simTimeMs;
  request.radarContact = report;
  return { ok: true, request };
}

export function transitionRequestToApproved(
  request: RadioRequest,
  simTimeMs: number,
): RequestTransitionResult {
  if (isTerminalRadioRequest(request)) {
    return { ok: false, error: "REQUEST: request is already resolved" };
  }
  if (request.status !== "IDENTIFIED") {
    return { ok: false, error: "REQUEST: radar identification required" };
  }
  request.status = "APPROVED";
  request.approvedAtSimMs = simTimeMs;
  return { ok: true, request };
}

/** Resolve a Class B access request with the operation actually cleared. */
export function transitionRequestToCleared(
  request: RadioRequest,
  operation: ClassBRequestOperation,
  simTimeMs: number,
): RequestTransitionResult {
  if (isTerminalRadioRequest(request)) {
    return { ok: false, error: "REQUEST: request is already resolved" };
  }
  if (request.kind !== "CLASS_B_ACCESS" || request.details.classBOperation === undefined) {
    return { ok: false, error: "REQUEST: Class B access request required" };
  }
  request.status = "CLEARED";
  request.clearedAtSimMs = simTimeMs;
  request.clearedClassBOperation = operation;
  return { ok: true, request };
}

export function transitionRequestToDeclined(
  request: RadioRequest,
  simTimeMs: number,
): RequestTransitionResult {
  if (request.status === "APPROVED") {
    return { ok: false, error: "REQUEST: active service must be terminated" };
  }
  if (isTerminalRadioRequest(request)) {
    return { ok: false, error: "REQUEST: request is already resolved" };
  }
  request.status = "DECLINED";
  request.declinedAtSimMs = simTimeMs;
  return { ok: true, request };
}

export function transitionRequestToTerminated(
  request: RadioRequest,
  simTimeMs: number,
): RequestTransitionResult {
  request.status = "TERMINATED";
  request.terminatedAtSimMs = simTimeMs;
  return { ok: true, request };
}
