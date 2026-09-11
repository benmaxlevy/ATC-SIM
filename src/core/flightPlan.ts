/**
 * Local trainer flight plans are operational records, not surveillance
 * tracks.  Reported beacon data is evidence attached to a plan and never
 * changes its ACID.
 */

export type FlightPlanStatus = "pending" | "active" | "suspended" | "deleted";

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
  source?: string;
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

const ACID_PATTERN = /^[A-Z][A-Z0-9]{1,6}$/;
const BEACON_PATTERN = /^[0-7]{4}$/;

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
): FlightPlanResult<FlightPlan> {
  if (plan.status === "deleted") {
    return {
      ok: false,
      error: error(
        "INVALID_STATUS_TRANSITION",
        "status",
        plan.status,
        "deleted flight plans cannot transition to another state",
      ),
    };
  }
  return { ok: true, value: { ...plan, status } };
}

export function deleteFlightPlan(plan: FlightPlan): FlightPlan {
  return { ...plan, status: "deleted" };
}
