/**
 * Opt-in bench traffic. Default student scenario stays 4–8 from KDEM JSON.
 * Enable with `?traffic=30` (any positive integer). Does not change Command IR.
 *
 * Phase 4 ILS demo: `?scenario=kdem-ils27` (aliases `phase4`, `ils27`).
 */

/** Parse `?traffic=30`. Invalid / missing → null (use the default 4–8 scenario). */
export function parseTrafficCount(search: string): number | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const raw = new URLSearchParams(query).get("traffic");
  if (raw === null || raw === "") {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) {
    return null;
  }
  return n;
}

export type ScenarioChoice = "kdem" | "kdem-ils27";

/**
 * `?scenario=kdem-ils27` (or `phase4` / `ils27`) loads the STAR/ILS demo.
 * Missing / unknown → default KDEM downwind pack.
 */
export function parseScenarioChoice(search: string): ScenarioChoice {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const raw = new URLSearchParams(query).get("scenario")?.trim().toLowerCase();
  if (raw === "kdem-ils27" || raw === "phase4" || raw === "ils27") {
    return "kdem-ils27";
  }
  return "kdem";
}
