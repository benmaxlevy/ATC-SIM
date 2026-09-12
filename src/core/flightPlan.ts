/**
 * Local trainer flight plans are operational records, not surveillance
 * tracks.  Reported beacon data is evidence attached to a plan and never
 * changes its ACID.
 */

export type FlightPlanStatus = "pending" | "active" | "suspended" | "deleted";
export type FlightPlanSuspensionReason = "beacon-mismatch" | "inactive";

export type FlightType = "IFR" | "VFR" | "DVFR" | "SVFR";

export interface FlightPlan {
  id: string;
  status: FlightPlanStatus;
  /** Aircraft identification (ACID), independent of reported squawk. */
  acid: string;
  assignedBeacon?: string;
  reportedBeacon?: string;
  /** Local owning/controlling position, not an association result. */
  tcp?: string;
  flightType?: FlightType;
  fixes: string[];
  route?: string;
  scratchpads: string[];
  requestedAltitudeFt?: number;
  assignedAltitudeFt?: number;
  equipment?: string;
  aircraftType?: string;
  aircraftCount?: number;
  airportId?: string;
  flightRules?: string;
  eta?: string;
  ptd?: string;
  source?: string;
  /** Why the plan is suspended; drives STARS mismatch unsuspend behavior. */
  suspensionReason?: FlightPlanSuspensionReason;
  /** Authoritative surveillance association; absent while pending/unassociated. */
  associatedAircraftId?: string;
}

export type FlightPlanErrorCode =
  | "INVALID_ACID"
  | "INVALID_BEACON"
  | "DUPLICATE_ACID"
  | "DUPLICATE_BEACON"
  | "NO_BEACON_AVAILABLE"
  | "INVALID_STATUS_TRANSITION";

export interface FlightPlanError {
  code: FlightPlanErrorCode;
  field: "acid" | "assignedBeacon" | "reportedBeacon" | "status";
  value?: string;
  message: string;
}

export type FlightPlanResult<T> = { ok: true; value: T } | { ok: false; error: FlightPlanError };

export type FlightPlanCorrelationErrorCode =
  | "PLAN_NOT_FOUND"
  | "TARGET_NOT_FOUND"
  | "NO_MATCH"
  | "AMBIGUOUS_MATCH"
  | "TARGET_ALREADY_ASSOCIATED"
  | "PLAN_ALREADY_ASSOCIATED"
  | "INVALID_SQUAWK";

export interface FlightPlanCorrelationError {
  code: FlightPlanCorrelationErrorCode;
  planId: string;
  aircraftIds?: string[];
  message: string;
}

export type FlightPlanCorrelationResult =
  | { ok: true; plan: FlightPlan; aircraftId: string }
  | { ok: false; error: FlightPlanCorrelationError };

export type FlightPlanModificationField =
  | "acid"
  | "assignedBeacon"
  | "tcp"
  | "fixes"
  | "flightType"
  | "scratchpads"
  | "requestedAltitudeFt"
  | "assignedAltitudeFt"
  | "eta"
  | "ptd";

export type FlightPlanModificationValue = string | number | string[] | undefined;

export type FlightPlanModificationErrorCode =
  | "PLAN_NOT_FOUND"
  | "NO_FLIGHT"
  | "DUPLICATE_ACID"
  | "DUPLICATE_BEACON"
  | "INVALID_ACID"
  | "INVALID_BEACON"
  | "INVALID_FIELD"
  | "INVALID_VALUE"
  | "TRACK_OWNERSHIP";

export interface FlightPlanModificationError {
  code: FlightPlanModificationErrorCode;
  field: FlightPlanModificationField | "plan";
  value?: string;
  message: string;
}

export type FlightPlanModificationResult =
  { ok: true; plan: FlightPlan } | { ok: false; error: FlightPlanModificationError };

const ACID_PATTERN = /^[A-Z][A-Z0-9]{1,6}$/;
const BEACON_PATTERN = /^[0-7]{4}$/;
const BEACON_SELECTOR_PATTERN = /^(?:\+|\/|\/[1-4]|A)$/;
const ETA_PTD_PATTERN = /^(?:[01]\d|2[0-3])[0-5]\dE$/;
const TCP_PATTERN = /^[A-Z0-9]{1,2}$/;
const FIX_PAIR_PATTERN = /^(?:[A-Z0-9]{1,4}\*|\*[A-Z0-9]{1,4})(?:\*[APE])?$/;
const SCRATCHPAD_PATTERN = /^[A-Z0-9+/. *]{0,4}$/;
const SCRATCHPAD_FORBIDDEN = /^(?:NAT|CST|AMB|RDR|ADB|XXX|\d{3})/;

function normalized(value: string | undefined): string | undefined {
  return value?.trim().toUpperCase();
}

export function isValidAcid(value: string): boolean {
  const acid = value.trim().toUpperCase();
  return acid !== "ALL" && ACID_PATTERN.test(acid) && (acid.length !== 2 || /[0-9]$/.test(acid));
}

export function isValidBeaconCode(value: string): boolean {
  return BEACON_PATTERN.test(value.trim());
}

function isValidScratchpad(value: string): boolean {
  const text = value.trim().toUpperCase();
  return SCRATCHPAD_PATTERN.test(text) && !SCRATCHPAD_FORBIDDEN.test(text);
}

function error(
  code: FlightPlanErrorCode,
  field: FlightPlanError["field"],
  value: string | undefined,
  message: string,
): FlightPlanError {
  return { code, field, ...(value === undefined ? {} : { value }), message };
}

function plansOf(existing: readonly FlightPlan[] | undefined): readonly FlightPlan[] {
  return existing ?? [];
}

export function validateFlightPlan(
  plan: Pick<FlightPlan, "acid" | "assignedBeacon" | "reportedBeacon">,
  existing: readonly FlightPlan[] = [],
): FlightPlanError[] {
  const acid = normalized(plan.acid);
  const assignedBeacon = normalized(plan.assignedBeacon);
  const reportedBeacon = normalized(plan.reportedBeacon);
  const errors: FlightPlanError[] = [];

  if (!acid || !isValidAcid(acid)) {
    errors.push(
      error(
        "INVALID_ACID",
        "acid",
        plan.acid,
        "ACID must be one letter followed by 1–6 alphanumerics; two-character ACIDs end in a digit",
      ),
    );
  } else if (plansOf(existing).some((item) => item.acid === acid && item.status !== "deleted")) {
    errors.push(error("DUPLICATE_ACID", "acid", acid, `ACID ${acid} already exists`));
  }

  if (assignedBeacon !== undefined && !isValidBeaconCode(assignedBeacon)) {
    errors.push(
      error(
        "INVALID_BEACON",
        "assignedBeacon",
        plan.assignedBeacon,
        "assigned beacon must be four octal digits",
      ),
    );
  } else if (
    assignedBeacon !== undefined &&
    plansOf(existing).some(
      (item) => item.assignedBeacon === assignedBeacon && item.status !== "deleted",
    )
  ) {
    errors.push(
      error(
        "DUPLICATE_BEACON",
        "assignedBeacon",
        assignedBeacon,
        `beacon ${assignedBeacon} already exists`,
      ),
    );
  }

  if (reportedBeacon !== undefined && !isValidBeaconCode(reportedBeacon)) {
    errors.push(
      error(
        "INVALID_BEACON",
        "reportedBeacon",
        plan.reportedBeacon,
        "reported beacon must be four octal digits",
      ),
    );
  }
  return errors;
}

export function createFlightPlan(
  input: Omit<FlightPlan, "status"> & { status?: FlightPlanStatus },
  existing: readonly FlightPlan[] = [],
): FlightPlanResult<FlightPlan> {
  const plan: FlightPlan = {
    ...input,
    id: input.id.trim(),
    status: input.status ?? "pending",
    acid: input.acid.trim().toUpperCase(),
    assignedBeacon: normalized(input.assignedBeacon),
    reportedBeacon: normalized(input.reportedBeacon),
    fixes: [...input.fixes],
    scratchpads: [...input.scratchpads],
  };
  const firstError = validateFlightPlan(plan, existing)[0];
  return firstError ? { ok: false, error: firstError } : { ok: true, value: plan };
}

/** Allocate the first free code in the supplied deterministic trainer pool. */
export function allocateBeaconCode(
  pool: readonly string[],
  occupied: readonly string[] = [],
): FlightPlanResult<string | undefined> {
  const occupiedSet = new Set(occupied.map((code) => code.trim()));
  for (const rawCode of pool) {
    const code = rawCode.trim();
    if (!isValidBeaconCode(code)) {
      return {
        ok: false,
        error: error(
          "INVALID_BEACON",
          "assignedBeacon",
          rawCode,
          "beacon pool contains a non-octal code",
        ),
      };
    }
    if (!occupiedSet.has(code)) {
      return { ok: true, value: code };
    }
  }
  // An empty/exhausted local pool is a supported no-code outcome.
  return { ok: true, value: undefined };
}

export function withAllocatedBeacon(
  plan: FlightPlan,
  pool: readonly string[],
  existing: readonly FlightPlan[] = [],
): FlightPlanResult<FlightPlan> {
  const occupied = existing.flatMap((item) =>
    item.status !== "deleted" && item.assignedBeacon ? [item.assignedBeacon] : [],
  );
  const allocation = allocateBeaconCode(pool, occupied);
  if (!allocation.ok) return allocation;
  return { ok: true, value: { ...plan, assignedBeacon: allocation.value } };
}

export function transitionFlightPlan(
  plan: FlightPlan,
  status: Exclude<FlightPlanStatus, "deleted">,
  suspensionReason?: FlightPlanSuspensionReason,
): FlightPlanResult<FlightPlan> {
  const allowedNextStatus: Partial<Record<FlightPlanStatus, readonly FlightPlanStatus[]>> = {
    pending: ["active"],
    active: ["suspended"],
    suspended: ["active", "pending"],
  };
  if (!allowedNextStatus[plan.status]?.includes(status)) {
    return {
      ok: false,
      error: error(
        "INVALID_STATUS_TRANSITION",
        "status",
        `${plan.status}->${status}`,
        `unsupported flight-plan status transition ${plan.status}->${status}`,
      ),
    };
  }
  const value = { ...plan, status };
  if (status === "suspended" && suspensionReason !== undefined) {
    value.suspensionReason = suspensionReason;
  } else if (status !== "suspended") {
    delete value.suspensionReason;
  }
  return { ok: true, value };
}

export function deleteFlightPlan(plan: FlightPlan): FlightPlan {
  return { ...plan, status: "deleted", assignedBeacon: undefined, reportedBeacon: undefined };
}

function modificationError(
  code: FlightPlanModificationErrorCode,
  field: FlightPlanModificationError["field"],
  value: string | undefined,
  message: string,
): FlightPlanModificationError {
  return { code, field, ...(value === undefined ? {} : { value }), message };
}

/** Modify one authoritative plan field. Scope edits do not change kinematics or intent. */
export function modifyFlightPlan(
  world: {
    flightPlans: FlightPlan[];
    aircraft: Array<{
      id: string;
      callsign?: string;
      assignedSquawk?: string;
    }>;
  },
  planId: string,
  field: FlightPlanModificationField,
  value: FlightPlanModificationValue,
): FlightPlanModificationResult {
  const plan = world.flightPlans.find((item) => item.id === planId);
  if (!plan || plan.status === "deleted") {
    return {
      ok: false,
      error: modificationError("PLAN_NOT_FOUND", "plan", planId, `flight plan ${planId} not found`),
    };
  }
  if (plan.status === "active" && (field === "eta" || field === "ptd")) {
    return {
      ok: false,
      error: modificationError(
        "INVALID_FIELD",
        field,
        undefined,
        `${field} is only valid for inactive plans`,
      ),
    };
  }
  if (plan.status !== "active" && field === "assignedAltitudeFt") {
    return {
      ok: false,
      error: modificationError(
        "INVALID_FIELD",
        field,
        undefined,
        "assigned altitude requires an active flight",
      ),
    };
  }
  const candidate: FlightPlan = {
    ...plan,
    fixes: [...plan.fixes],
    scratchpads: [...plan.scratchpads],
  };
  if (field === "acid") {
    if (typeof value !== "string" || !isValidAcid(value)) {
      return {
        ok: false,
        error: modificationError("INVALID_ACID", field, String(value), "invalid ACID"),
      };
    }
    candidate.acid = value.trim().toUpperCase();
  } else if (field === "assignedBeacon") {
    if (
      typeof value !== "string" ||
      (!isValidBeaconCode(value) && !BEACON_SELECTOR_PATTERN.test(value.trim().toUpperCase()))
    ) {
      return {
        ok: false,
        error: modificationError("INVALID_BEACON", field, String(value), "invalid assigned beacon"),
      };
    }
    const beacon = value.trim().toUpperCase();
    candidate.assignedBeacon = BEACON_SELECTOR_PATTERN.test(beacon) ? undefined : beacon;
  } else if (field === "tcp") {
    if (typeof value !== "string") {
      return {
        ok: false,
        error: modificationError("INVALID_VALUE", field, String(value), `invalid ${field}`),
      };
    }
    const tcp = value.trim().toUpperCase();
    if (!TCP_PATTERN.test(tcp)) {
      return {
        ok: false,
        error: modificationError("INVALID_VALUE", field, tcp, "invalid controller position"),
      };
    }
    candidate.tcp = tcp;
  } else if (field === "eta" || field === "ptd") {
    if (typeof value !== "string" || !ETA_PTD_PATTERN.test(value.trim().toUpperCase())) {
      return {
        ok: false,
        error: modificationError("INVALID_VALUE", field, String(value), `invalid ${field}`),
      };
    }
    candidate[field] = value.trim().toUpperCase();
  } else if (field === "fixes") {
    const values = typeof value === "string" ? [value] : value;
    if (
      !Array.isArray(values) ||
      values.length !== 1 ||
      typeof values[0] !== "string" ||
      !FIX_PAIR_PATTERN.test(values[0].trim().toUpperCase())
    ) {
      return {
        ok: false,
        error: modificationError("INVALID_VALUE", field, String(value), "invalid entry/exit fixes"),
      };
    }
    candidate.fixes = [values[0].trim().toUpperCase()];
  } else if (field === "scratchpads") {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      return {
        ok: false,
        error: modificationError("INVALID_VALUE", field, String(value), `invalid ${field}`),
      };
    }
    const scratchpads = value.map((item) => item.trim().toUpperCase());
    if (scratchpads.length > 2 || scratchpads.some((item) => !isValidScratchpad(item))) {
      return {
        ok: false,
        error: modificationError("INVALID_VALUE", field, String(value), "invalid scratchpad"),
      };
    }
    candidate.scratchpads = scratchpads;
  } else if (field === "flightType") {
    if (
      value !== "IFR" &&
      value !== "VFR" &&
      value !== "DVFR" &&
      value !== "SVFR" &&
      value !== "A" &&
      value !== "P" &&
      value !== "E"
    ) {
      return {
        ok: false,
        error: modificationError("INVALID_VALUE", field, String(value), "invalid flight type"),
      };
    }
    candidate.flightType =
      value === "A" ? "IFR" : value === "P" ? "VFR" : value === "E" ? "DVFR" : value;
  } else if (field === "requestedAltitudeFt" || field === "assignedAltitudeFt") {
    if (value === undefined || value === 0) {
      delete candidate[field];
    } else {
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 99000 ||
        value % 100 !== 0
      ) {
        return {
          ok: false,
          error: modificationError("INVALID_VALUE", field, String(value), `invalid ${field}`),
        };
      }
      candidate[field] = value;
    }
  } else {
    return {
      ok: false,
      error: modificationError("INVALID_FIELD", field, undefined, `unsupported field ${field}`),
    };
  }

  const duplicate = world.flightPlans.find(
    (item) => item.id !== plan.id && item.status !== "deleted" && item.acid === candidate.acid,
  );
  if (duplicate) {
    return {
      ok: false,
      error: modificationError(
        "DUPLICATE_ACID",
        field,
        candidate.acid,
        `ACID ${candidate.acid} already exists`,
      ),
    };
  }
  if (candidate.assignedBeacon) {
    const duplicateBeacon = world.flightPlans.find(
      (item) =>
        item.id !== plan.id &&
        item.status !== "deleted" &&
        item.assignedBeacon === candidate.assignedBeacon,
    );
    if (duplicateBeacon) {
      return {
        ok: false,
        error: modificationError(
          "DUPLICATE_BEACON",
          field,
          candidate.assignedBeacon,
          `beacon ${candidate.assignedBeacon} already exists`,
        ),
      };
    }
  }
  Object.assign(plan, candidate);
  if (field === "requestedAltitudeFt" || field === "assignedAltitudeFt") {
    if (value === undefined || value === 0) delete plan[field];
  }
  return { ok: true, plan };
}

/** Release an assigned beacon without deleting the inactive/suspended plan. */
export function releaseAssignedBeacon(
  world: { flightPlans: FlightPlan[] },
  planId: string,
): FlightPlanModificationResult {
  const plan = world.flightPlans.find((item) => item.id === planId);
  if (!plan || plan.status === "deleted") {
    return {
      ok: false,
      error: modificationError("PLAN_NOT_FOUND", "plan", planId, `flight plan ${planId} not found`),
    };
  }
  if (plan.status === "active") {
    return {
      ok: false,
      error: modificationError(
        "INVALID_FIELD",
        "assignedBeacon",
        undefined,
        "active flight beacon cannot be released",
      ),
    };
  }
  plan.assignedBeacon = undefined;
  return { ok: true, plan };
}

/** Delete an authoritative plan and unassociate its track without changing kinematics. */
export function deleteFlightPlanFromWorld(
  world: {
    flightPlans: FlightPlan[];
    aircraft: Array<{ id: string }>;
  },
  planId: string,
): FlightPlanModificationResult {
  const plan = world.flightPlans.find((item) => item.id === planId);
  if (!plan || plan.status === "deleted") {
    return {
      ok: false,
      error: modificationError("PLAN_NOT_FOUND", "plan", planId, `flight plan ${planId} not found`),
    };
  }
  plan.associatedAircraftId = undefined;
  Object.assign(plan, deleteFlightPlan(plan));
  return { ok: true, plan };
}

/** Remove a plan association without deleting or changing the plan state. */
export function disassociateFlightPlan(
  world: { flightPlans: FlightPlan[] },
  planId: string,
): FlightPlanModificationResult {
  const plan = world.flightPlans.find((item) => item.id === planId);
  if (!plan || plan.status === "deleted") {
    return {
      ok: false,
      error: modificationError("PLAN_NOT_FOUND", "plan", planId, `flight plan ${planId} not found`),
    };
  }
  plan.associatedAircraftId = undefined;
  return { ok: true, plan };
}

/** Resolve the only authoritative plan↔aircraft relationship. */
export function flightPlanForAircraft(
  world: { flightPlans: readonly FlightPlan[] },
  aircraftId: string,
): FlightPlan | undefined {
  return world.flightPlans.find(
    (plan) => plan.status !== "deleted" && plan.associatedAircraftId === aircraftId,
  );
}

function reportedSquawk(aircraft: {
  reportedSquawk?: string;
  squawk?: string;
}): string | undefined {
  return (aircraft.reportedSquawk ?? aircraft.squawk)?.trim();
}

function correlationError(
  code: FlightPlanCorrelationErrorCode,
  planId: string,
  message: string,
  aircraftIds?: string[],
): FlightPlanCorrelationError {
  return { code, planId, message, ...(aircraftIds ? { aircraftIds } : {}) };
}

/** Associate an existing plan to one explicitly selected track. No kinematics change. */
export function associateFlightPlan(
  world: {
    flightPlans: FlightPlan[];
    aircraft: Array<{
      id: string;
      callsign?: string;
      squawk?: string;
      reportedSquawk?: string;
      assignedSquawk?: string;
    }>;
  },
  planId: string,
  aircraftId: string,
): FlightPlanCorrelationResult {
  const plan = world.flightPlans.find((item) => item.id === planId);
  if (!plan || plan.status === "deleted") {
    return {
      ok: false,
      error: correlationError("PLAN_NOT_FOUND", planId, `flight plan ${planId} not found`),
    };
  }
  const target = world.aircraft.find((item) => item.id === aircraftId);
  if (!target) {
    return {
      ok: false,
      error: correlationError("TARGET_NOT_FOUND", planId, `aircraft ${aircraftId} not found`),
    };
  }
  if (plan.associatedAircraftId && plan.associatedAircraftId !== aircraftId) {
    return {
      ok: false,
      error: correlationError(
        "PLAN_ALREADY_ASSOCIATED",
        planId,
        `flight plan ${planId} is associated to ${plan.associatedAircraftId}`,
        [plan.associatedAircraftId],
      ),
    };
  }
  const other = world.flightPlans.find(
    (item) =>
      item.id !== planId && item.status !== "deleted" && item.associatedAircraftId === aircraftId,
  );
  if (other) {
    return {
      ok: false,
      error: correlationError(
        "TARGET_ALREADY_ASSOCIATED",
        planId,
        `aircraft ${aircraftId} is associated to ${other.id}`,
      ),
    };
  }
  // Manual §5.4.1: pending plans activate when associated. A plan suspended
  // while inactive or without beacon mismatch remains suspended when the
  // Manual §5.4.1: beacon-mismatch suspensions unsuspend on association;
  // ordinary inactive suspensions remain suspended until explicitly unsuspended.
  if (
    plan.status === "pending" ||
    (plan.status === "suspended" && plan.suspensionReason === "beacon-mismatch")
  ) {
    const transitioned = transitionFlightPlan(plan, "active");
    if (!transitioned.ok) {
      return {
        ok: false,
        error: correlationError("PLAN_NOT_FOUND", planId, transitioned.error.message),
      };
    }
    plan.status = transitioned.value.status;
    if (plan.status !== "suspended") delete plan.suspensionReason;
  }
  plan.associatedAircraftId = aircraftId;
  plan.reportedBeacon = reportedSquawk(target);
  return { ok: true, plan, aircraftId };
}

/** Correlate one aircraft after its reported squawk changes. */
export function correlateFlightPlanForAircraft(
  world: {
    flightPlans: FlightPlan[];
    aircraft: Array<{
      id: string;
      callsign?: string;
      reportedSquawk?: string;
      squawk?: string;
      assignedSquawk?: string;
    }>;
  },
  aircraftId: string,
): FlightPlanCorrelationResult {
  const aircraft = world.aircraft.find((item) => item.id === aircraftId);
  const planId = `aircraft-${aircraftId}`;
  if (!aircraft) {
    return {
      ok: false,
      error: correlationError("TARGET_NOT_FOUND", planId, `aircraft ${aircraftId} not found`),
    };
  }
  const existing = flightPlanForAircraft(world, aircraftId);
  if (existing) {
    existing.reportedBeacon = reportedSquawk(aircraft);
    return { ok: true, plan: existing, aircraftId };
  }
  const squawk = reportedSquawk(aircraft);
  if (squawk !== undefined && !isValidBeaconCode(squawk)) {
    return {
      ok: false,
      error: correlationError(
        "INVALID_SQUAWK",
        planId,
        `aircraft ${aircraftId} reports invalid squawk ${squawk}`,
      ),
    };
  }
  const candidates = world.flightPlans.filter(
    (plan) =>
      plan.status === "pending" &&
      isValidBeaconCode(plan.assignedBeacon ?? "") &&
      plan.assignedBeacon !== "1200" &&
      plan.assignedBeacon === squawk &&
      plan.associatedAircraftId === undefined,
  );
  if (candidates.length !== 1) {
    return {
      ok: false,
      error: correlationError(
        candidates.length === 0 ? "NO_MATCH" : "AMBIGUOUS_MATCH",
        candidates[0]?.id ?? planId,
        candidates.length === 0
          ? `no pending plan matches aircraft ${aircraftId} squawk ${squawk ?? ""}`
          : `multiple pending plans match aircraft ${aircraftId} squawk ${squawk}`,
        candidates.map((plan) => plan.id),
      ),
    };
  }
  return associateFlightPlan(world, candidates[0]!.id, aircraftId);
}

export interface AircraftSquawkUpdate {
  aircraftId: string;
  squawk: string;
  correlation: FlightPlanCorrelationResult;
}

/** Set reported squawk and run correlation only for this aircraft. */
export function updateAircraftSquawk(
  world: {
    flightPlans: FlightPlan[];
    aircraft: Array<{
      id: string;
      reportedSquawk?: string;
      squawk?: string;
    }>;
  },
  aircraftId: string,
  squawk: string,
): AircraftSquawkUpdate | undefined {
  const aircraft = world.aircraft.find((item) => item.id === aircraftId);
  if (!aircraft) return undefined;
  const normalized = squawk.trim().toUpperCase();
  aircraft.squawk = normalized;
  aircraft.reportedSquawk = normalized;
  return {
    aircraftId,
    squawk: normalized,
    correlation: correlateFlightPlanForAircraft(world, aircraftId),
  };
}

/** Create and immediately associate an active plan from an explicitly slewed target. */
export function createActiveFlightPlanFromTarget(
  world: {
    flightPlans: FlightPlan[];
    aircraft: Array<{
      id: string;
      callsign: string;
      squawk?: string;
      reportedSquawk?: string;
      assignedSquawk?: string;
    }>;
  },
  aircraftId: string,
): FlightPlanCorrelationResult {
  const target = world.aircraft.find((item) => item.id === aircraftId);
  if (!target) {
    return {
      ok: false,
      error: correlationError(
        "TARGET_NOT_FOUND",
        `target-${aircraftId}`,
        `aircraft ${aircraftId} not found`,
      ),
    };
  }
  const id = `fp-active-${target.id}`;
  const created = createFlightPlan(
    {
      id,
      status: "active",
      acid: target.callsign,
      assignedBeacon: target.assignedSquawk ?? reportedSquawk(target),
      reportedBeacon: reportedSquawk(target),
      fixes: [],
      scratchpads: [],
    },
    world.flightPlans,
  );
  if (!created.ok) {
    return {
      ok: false,
      error: correlationError("TARGET_ALREADY_ASSOCIATED", id, created.error.message),
    };
  }
  world.flightPlans.push(created.value);
  return associateFlightPlan(world, id, target.id);
}
