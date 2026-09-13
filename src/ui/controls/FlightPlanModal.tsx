import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  flightPlanCid,
  saveFlightPlanDraft,
  type FlightPlan,
  type FlightPlanDraftInput,
  type World,
} from "@core";

export type FlightPlanOperation = "arrival" | "departure";

export interface FlightPlanModalProps {
  open: boolean;
  acid: string;
  plan?: FlightPlan;
  world: World;
  operation?: FlightPlanOperation;
  onCancel: () => void;
  onSaved: () => void;
}

export type FlightPlanModalDraft = Record<string, string>;

function flightTypeFromRules(flightRules?: string): FlightPlan["flightType"] | undefined {
  const rules = flightRules?.trim().toUpperCase();
  if (rules === "VFR") return "VFR";
  if (rules === "IFR" || rules === "I") return "IFR";
  return undefined;
}

export function flightPlanModalDraftFromPlan(
  acid: string,
  plan?: FlightPlan,
): FlightPlanModalDraft {
  return {
    acid: plan?.acid ?? acid,
    cid: flightPlanCid(plan?.acid ?? acid, plan?.cid),
    assignedBeacon: plan?.assignedBeacon ?? "",
    flightType: plan?.flightType ?? flightTypeFromRules(plan?.flightRules) ?? "",
    route: plan?.filedRoute?.text ?? plan?.route ?? "",
    requestedAltitudeFt: plan?.requestedAltitudeFt?.toString() ?? "",
    aircraftType: plan?.aircraftType ?? "",
    equipment: plan?.equipment ?? "",
    departureAirport: plan?.departureAirport ?? "",
    airportId: plan?.airportId ?? "",
    eta: plan?.eta ?? "",
    ptd: plan?.ptd ?? "",
    remarks: plan?.remarks ?? "",
  };
}

function operationForPlan(plan?: FlightPlan, operation?: FlightPlanOperation): FlightPlanOperation {
  return operation ?? (plan?.departureAirport || plan?.ptd ? "departure" : "arrival");
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Number(trimmed) : undefined;
}

/**
 * Submit the same normalized draft used by the rendered modal.  Keeping this
 * handler exportable gives integration tests a DOM-free equivalent of the
 * browser form submit while preserving one production save path.
 */
export function submitFlightPlanModalDraft(
  world: World,
  plan: FlightPlan | undefined,
  draft: FlightPlanModalDraft,
  operation?: FlightPlanOperation,
) {
  const acid = plan?.acid ?? draft.acid ?? "";
  const mode = operationForPlan(plan, operation);
  const input: FlightPlanDraftInput = {
    ...(plan?.id ? { id: plan.id } : {}),
    acid,
    cid: flightPlanCid(acid, plan?.cid),
    assignedBeacon: optionalText(draft.assignedBeacon ?? ""),
    flightType: optionalText(draft.flightType ?? "") as FlightPlanDraftInput["flightType"],
    filedRoute: draft.route ?? "",
    requestedAltitudeFt: optionalNumber(draft.requestedAltitudeFt ?? ""),
    aircraftType: optionalText(draft.aircraftType ?? ""),
    equipment: optionalText(draft.equipment ?? ""),
    departureAirport: optionalText(draft.departureAirport ?? ""),
    airportId: optionalText(draft.airportId ?? ""),
    ...(mode === "arrival"
      ? { eta: optionalText(draft.eta ?? "") }
      : { ptd: optionalText(draft.ptd ?? "") }),
    remarks: optionalText(draft.remarks ?? ""),
  };
  return saveFlightPlanDraft(world, input);
}

export function FlightPlanModal({
  open,
  acid,
  plan,
  world,
  operation,
  onCancel,
  onSaved,
}: FlightPlanModalProps) {
  const openerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});
  const [draft, setDraft] = useState<FlightPlanModalDraft>(() =>
    flightPlanModalDraftFromPlan(acid, plan),
  );
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    // Capture the opener before moving focus into the dialog.  Do not use
    // automatic focus here: React applies it during mount, before this effect can
    // remember the command line/PPI that opened the modal.
    openerRef.current = document.activeElement as HTMLElement | null;
    setDraft(flightPlanModalDraftFromPlan(acid, plan));
    setError(null);
    fieldRefs.current.acid?.focus();
    return () => openerRef.current?.focus();
  }, [acid, open, plan]);

  if (!open) return null;

  function update(field: string, value: string): void {
    setDraft((current) => ({ ...current, [field]: value }));
    if (error?.field === field) setError(null);
  }

  function inputProps(field: string) {
    return {
      ref: (element: HTMLInputElement | HTMLSelectElement | null) => {
        fieldRefs.current[field] = element;
      },
      id: `flight-plan-${field}`,
      name: field,
      value: draft[field] ?? "",
      "aria-invalid": error?.field === field ? true : undefined,
      "aria-describedby": error?.field === field ? "flight-plan-error" : undefined,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        update(field, event.target.value),
    };
  }

  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = submitFlightPlanModalDraft(world, plan, draft, operation);
    if (!result.ok) {
      const field =
        result.error.field === "altitude"
          ? "requestedAltitudeFt"
          : result.error.field === "plan"
            ? "route"
            : result.error.field;
      const nextError = { field, message: result.error.message };
      setError(nextError);
      requestAnimationFrame(() => fieldRefs.current[nextError.field]?.focus());
      return;
    }
    onSaved();
  }

  function trapFocus(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])",
      ) ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const textFields = [
    ["assignedBeacon", "Assigned beacon"],
    ["route", "Filed route"],
    ["requestedAltitudeFt", "Requested altitude (ft)"],
    ["aircraftType", "Aircraft type"],
    ["equipment", "Equipment"],
    ["departureAirport", "Origin"],
    ["airportId", "Destination"],
  ] as const;
  const mode = operationForPlan(plan, operation);

  return (
    <div className="flight-plan-modal-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="flight-plan-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="flight-plan-modal-title"
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <h2 id="flight-plan-modal-title">{plan ? "Amend flight plan" : "Create flight plan"}</h2>
        <form onSubmit={save}>
          <label htmlFor="flight-plan-acid">
            ACID
            <input {...inputProps("acid")} readOnly />
          </label>
          <label htmlFor="flight-plan-cid">
            CID
            <input {...inputProps("cid")} readOnly />
          </label>
          <label htmlFor="flight-plan-flightType">
            Flight rules
            <select {...inputProps("flightType")}>
              <option value="">Unspecified</option>
              <option value="IFR">IFR</option>
              <option value="VFR">VFR</option>
              <option value="DVFR">DVFR</option>
              <option value="SVFR">SVFR</option>
            </select>
          </label>
          {textFields.map(([field, label]) => (
            <label key={field} htmlFor={`flight-plan-${field}`}>
              {label}
              <input {...inputProps(field)} />
            </label>
          ))}
          <label htmlFor={`flight-plan-${mode === "arrival" ? "eta" : "ptd"}`}>
            {mode === "arrival" ? "ETA" : "PTD"}
            <input {...inputProps(mode === "arrival" ? "eta" : "ptd")} />
          </label>
          <label htmlFor="flight-plan-remarks">
            Remarks
            <input {...inputProps("remarks")} />
          </label>
          {error ? (
            <p id="flight-plan-error" className="flight-plan-modal-error" role="alert">
              {error.message}
            </p>
          ) : null}
          <div className="flight-plan-modal-actions">
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
