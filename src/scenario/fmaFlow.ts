import { deriveFmaAmzs } from "../core/alerts/fmaGeometry";
import type { FmaAmz } from "../core/alerts/fmaGeometry";
import type { ProcedureCatalog } from "./procedures/types";

export type FmaFlowResolution = {
  amzs: FmaAmz[];
  selectedAmzId: string | null;
  diagnostics: string[];
};

/**
 * Resolve all authored AMZs independently of the scenario's active runway flow.
 * A valid current selection wins, then scenario initial selection, then an
 * initial runway-containing or stable catalog fallback.
 */
export function resolveFmaFlow(
  catalog: ProcedureCatalog,
  activeRunwayId: string,
  options: {
    initialAmzId?: string;
    preferredAmzId?: string | null;
    excludeDerived?: boolean;
  } = {},
): FmaFlowResolution {
  const derived = deriveFmaAmzs(catalog);
  const diagnostics = derived.diagnostics.map((item) => `${item.path}: ${item.message}`);
  const runway = activeRunwayId.trim().toUpperCase();
  const amzs = [...derived.amzs].sort((a, b) => a.id.localeCompare(b.id));
  const initial = options.initialAmzId;
  const preferred = options.preferredAmzId;
  const preferredMatch = preferred ? amzs.find((amz) => amz.id === preferred) : undefined;
  const initialMatch = initial ? amzs.find((amz) => amz.id === initial) : undefined;
  if (initial && !initialMatch) diagnostics.push(`scenario initial AMZ ${initial} is stale`);
  const containsActiveRunway = amzs.find((amz) =>
    amz.members.some((member) => member.runwayId.trim().toUpperCase() === runway),
  );
  const selected = preferredMatch ?? initialMatch ?? containsActiveRunway ?? amzs[0];
  return { amzs, selectedAmzId: selected?.id ?? null, diagnostics };
}
