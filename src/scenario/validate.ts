/**
 * Shared validation assertions and type guards for scenario loaders.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertFinite(value: unknown, path: string, prefix = "Scenario"): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${prefix} ${path} must be a finite number`);
  }
  return value;
}

export const assertNumber = assertFinite;

export function assertString(
  value: unknown,
  path: string,
  prefix = "Scenario",
  options?: boolean | { nonEmpty?: boolean },
): string {
  const nonEmpty = typeof options === "boolean" ? options : options?.nonEmpty === true;
  if (typeof value !== "string" || (nonEmpty && value.length === 0)) {
    const requirement = nonEmpty ? "a non-empty string" : "a string";
    throw new Error(`${prefix} ${path} must be ${requirement}`);
  }
  return value;
}

export function assertArray(value: unknown, path: string, prefix = "Scenario"): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${prefix} ${path} must be an array`);
  }
  return value;
}
