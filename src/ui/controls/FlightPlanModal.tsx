import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { saveFlightPlanDraft, type FlightPlan, type FlightPlanDraftInput, type World } from "@core";

export interface FlightPlanModalProps {
  open: boolean;
  acid: string;
  plan?: FlightPlan;
  world: World;
  onCancel: () => void;
  onSaved: () => void;
}

type Draft = Record<string, string>;

function draftFromPlan(acid: string, plan?: FlightPlan): Draft {
  return {
    acid: plan?.acid ?? acid,
    cid: plan?.cid ?? "",
    assignedBeacon: plan?.assignedBeacon ?? "",
    tcp: plan?.tcp ?? "",
    flightType: plan?.flightType ?? "",
    route: plan?.filedRoute?.text ?? plan?.route ?? "",
    fixes: plan?.fixes.join(", ") ?? "",
    scratchpads: plan?.scratchpads.join(", ") ?? "",
    requestedAltitudeFt: plan?.requestedAltitudeFt?.toString() ?? "",
    assignedAltitudeFt: plan?.assignedAltitudeFt?.toString() ?? "",
    aircraftType: plan?.aircraftType ?? "",
    aircraftCount: plan?.aircraftCount?.toString() ?? "",
    equipment: plan?.equipment ?? "",
    departureAirport: plan?.departureAirport ?? "",
    airportId: plan?.airportId ?? "",
    flightRules: plan?.flightRules ?? "",
    eta: plan?.eta ?? "",
    ptd: plan?.ptd ?? "",
    remarks: plan?.remarks ?? "",
    previousFix: plan?.previousFix ?? "",
    coordinationFix: plan?.coordinationFix ?? "",
    minimumFuel: plan?.minimumFuel ?? "",
    source: plan?.source ?? "",
  };
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Number(trimmed) : undefined;
}

function splitList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function FlightPlanModal({
  open,
  acid,
  plan,
  world,
  onCancel,
  onSaved,
}: FlightPlanModalProps) {
  const openerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});
  const [draft, setDraft] = useState<Draft>(() => draftFromPlan(acid, plan));
  const [error, setError] = useState<{ field: string; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    setDraft(draftFromPlan(acid, plan));
    setError(null);
    dialogRef.current?.focus();
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
    const input: FlightPlanDraftInput = {
      ...(plan?.id ? { id: plan.id } : {}),
      acid: draft.acid ?? "",
      cid: optionalText(draft.cid ?? ""),
      assignedBeacon: optionalText(draft.assignedBeacon ?? ""),
      tcp: optionalText(draft.tcp ?? ""),
      flightType: optionalText(draft.flightType ?? "") as FlightPlanDraftInput["flightType"],
      filedRoute: draft.route ?? "",
      ...(splitList(draft.fixes ?? "").length > 0 ? { fixes: splitList(draft.fixes ?? "") } : {}),
      scratchpads: splitList(draft.scratchpads ?? ""),
      requestedAltitudeFt: optionalNumber(draft.requestedAltitudeFt ?? ""),
      assignedAltitudeFt: optionalNumber(draft.assignedAltitudeFt ?? ""),
      aircraftType: optionalText(draft.aircraftType ?? ""),
      aircraftCount: optionalNumber(draft.aircraftCount ?? ""),
      equipment: optionalText(draft.equipment ?? ""),
      departureAirport: optionalText(draft.departureAirport ?? ""),
      airportId: optionalText(draft.airportId ?? ""),
      flightRules: optionalText(draft.flightRules ?? ""),
      eta: optionalText(draft.eta ?? ""),
      ptd: optionalText(draft.ptd ?? ""),
      remarks: optionalText(draft.remarks ?? ""),
      previousFix: optionalText(draft.previousFix ?? ""),
      coordinationFix: optionalText(draft.coordinationFix ?? ""),
      minimumFuel: optionalText(draft.minimumFuel ?? ""),
      source: optionalText(draft.source ?? ""),
    };
    const result = saveFlightPlanDraft(world, input);
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
    ["cid", "CID"],
    ["assignedBeacon", "Assigned beacon"],
    ["tcp", "Owning TCP"],
    ["route", "Filed route"],
    ["fixes", "Fixes"],
    ["scratchpads", "Scratchpads"],
    ["requestedAltitudeFt", "Requested altitude (ft)"],
    ["assignedAltitudeFt", "Assigned altitude (ft)"],
    ["aircraftType", "Aircraft type"],
    ["aircraftCount", "Aircraft count"],
    ["equipment", "Equipment"],
    ["departureAirport", "Departure airport"],
    ["airportId", "Airport ID"],
    ["flightRules", "Flight rules"],
    ["eta", "ETA"],
    ["ptd", "PTD"],
    ["remarks", "Remarks"],
    ["previousFix", "Previous fix"],
    ["coordinationFix", "Coordination fix"],
    ["minimumFuel", "Minimum fuel"],
    ["source", "Source"],
  ] as const;

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
        <p className="flight-plan-modal-note">
          Filed metadata only; it does not activate aircraft guidance.
        </p>
        <form onSubmit={save}>
          <label>
            ACID
            <input autoFocus {...inputProps("acid")} />
          </label>
          <label>
            Flight type
            <select {...inputProps("flightType")}>
              <option value="">Unspecified</option>
              <option value="IFR">IFR</option>
              <option value="VFR">VFR</option>
              <option value="DVFR">DVFR</option>
              <option value="SVFR">SVFR</option>
            </select>
          </label>
          {textFields.map(([field, label]) => (
            <label key={field}>
              {label}
              <input {...inputProps(field)} />
            </label>
          ))}
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
