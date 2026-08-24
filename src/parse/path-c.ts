/**
 * Path C: optional POST /parse on our speech-api after typed/A/B miss.
 * Schema-checks Command IR v0. Illegal type (e.g. CHAT) → miss, no dispatch.
 * DOM-free: inject fetch. Never throws through the sim tick.
 */

import { INSTRUCTION_TYPES, type Instruction, type TurnDir } from "@core";

export const PATH_C_SCHEMA_VERSION = "command-ir-v0" as const;
export const DEFAULT_PARSE_URL = "http://127.0.0.1:8090/parse";
export const DEFAULT_PARSE_TIMEOUT_MS = 15000;

export interface PathCContext {
  callsigns: string[];
  selectedCallsign?: string | null;
  /** Facility catalog ids. Optional; never kinematics, n-best, or STT confidence. */
  fixes?: string[];
  /** STAR/SID ids + published names. Optional. */
  procedures?: Array<{ id: string; name?: string }>;
  /** Approach ids + published names/runways. Optional. */
  approaches?: Array<{ id: string; name?: string; runway?: string }>;
}

export interface PathCRequest {
  text: string;
  source: "text" | "voice";
  schemaVersion: typeof PATH_C_SCHEMA_VERSION;
  /** Live strips + selection. Optional; never n-best or STT confidence. */
  context?: PathCContext;
}

export interface PathCSuccess {
  callsignToken: string | null;
  instructions: Instruction[];
}

export interface ParsePathCDeps {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  url?: string;
  timeoutMs?: number;
}

export type ParsePathCFn = (req: PathCRequest) => Promise<PathCSuccess | null>;

const TURN_DIRS = new Set<TurnDir>(["LEFT", "RIGHT", "SHORTEST"]);
const LR = new Set(["LEFT", "RIGHT"]);
const ALT_VERBS = new Set(["CLIMB", "DESCEND", "MAINTAIN"]);
const SPEED_VERBS = new Set(["MAINTAIN", "INCREASE", "REDUCE"]);
const CROSS_RESTRICTIONS = new Set(["AT", "AT_OR_ABOVE", "AT_OR_BELOW"]);
const LEGAL_TYPES = new Set<string>(INSTRUCTION_TYPES);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function keysOk(
  obj: object,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(obj);
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      return false;
    }
  }
  for (const key of keys) {
    if (!allowed.has(key)) {
      return false;
    }
  }
  return true;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Closed Instruction union. Extra keys or unknown type → miss. */
export function isLegalInstruction(value: unknown): value is Instruction {
  const obj = asRecord(value);
  if (obj === null) {
    return false;
  }
  const type = obj.type;
  if (typeof type !== "string" || !LEGAL_TYPES.has(type)) {
    return false;
  }
  if (type === "FLY_HEADING") {
    return (
      keysOk(obj, ["type", "headingDeg", "turn"]) &&
      isFiniteNumber(obj.headingDeg) &&
      typeof obj.turn === "string" &&
      TURN_DIRS.has(obj.turn as TurnDir)
    );
  }
  if (type === "TURN_DEGREES") {
    return (
      keysOk(obj, ["type", "direction", "degrees"]) &&
      typeof obj.direction === "string" &&
      LR.has(obj.direction) &&
      isFiniteNumber(obj.degrees)
    );
  }
  if (
    type === "PRESENT_HEADING" ||
    type === "IDENT" ||
    type === "SAY_HEADING" ||
    type === "SAY_ALTITUDE" ||
    type === "GO_AROUND"
  ) {
    return keysOk(obj, ["type"]);
  }
  if (type === "ALTITUDE") {
    if (
      !keysOk(obj, ["type", "altitudeFt", "verb"], ["expedite", "untilEstablished"]) ||
      !isFiniteNumber(obj.altitudeFt) ||
      typeof obj.verb !== "string" ||
      !ALT_VERBS.has(obj.verb)
    ) {
      return false;
    }
    if ("expedite" in obj && typeof obj.expedite !== "boolean") {
      return false;
    }
    if ("untilEstablished" in obj && typeof obj.untilEstablished !== "boolean") {
      return false;
    }
    return true;
  }
  if (type === "SPEED") {
    return (
      keysOk(obj, ["type", "speedKt", "verb"]) &&
      isFiniteNumber(obj.speedKt) &&
      typeof obj.verb === "string" &&
      SPEED_VERBS.has(obj.verb)
    );
  }
  if (type === "DIRECT") {
    return keysOk(obj, ["type", "fixId"]) && typeof obj.fixId === "string" && obj.fixId.length > 0;
  }
  if (type === "EXPECT_APPROACH" || type === "CLEARED_APPROACH" || type === "INTERCEPT_LOCALIZER") {
    return (
      keysOk(obj, ["type", "approachId"]) &&
      typeof obj.approachId === "string" &&
      obj.approachId.length > 0
    );
  }
  if (type === "DESCEND_VIA" || type === "CLIMB_VIA" || type === "JOIN_PROCEDURE") {
    return (
      keysOk(obj, ["type", "procedureId"]) &&
      typeof obj.procedureId === "string" &&
      obj.procedureId.length > 0
    );
  }
  if (type === "CROSS") {
    return (
      keysOk(obj, ["type", "fixId", "altitudeFt", "restriction"]) &&
      typeof obj.fixId === "string" &&
      obj.fixId.length > 0 &&
      isFiniteNumber(obj.altitudeFt) &&
      typeof obj.restriction === "string" &&
      CROSS_RESTRICTIONS.has(obj.restriction)
    );
  }
  return false;
}

export function schemaCheckPathC(body: unknown): PathCSuccess | null {
  const obj = asRecord(body);
  if (obj === null) {
    return null;
  }
  if (obj.ok !== true) {
    return null;
  }
  const tokenRaw = obj.callsignToken;
  if (tokenRaw !== null && tokenRaw !== undefined && typeof tokenRaw !== "string") {
    return null;
  }
  const callsignToken = typeof tokenRaw === "string" && tokenRaw.trim() !== "" ? tokenRaw : null;
  const list = obj.instructions;
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }
  const instructions: Instruction[] = [];
  for (const item of list) {
    if (!isLegalInstruction(item)) {
      return null;
    }
    instructions.push(item);
  }
  return { callsignToken, instructions };
}

function defaultFetch():
  ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null {
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }
  return null;
}

/**
 * POST /parse. Timeout / network / 503 / SCHEMA → null (miss). Never throws.
 */
export async function fetchParsePathC(
  req: PathCRequest,
  deps: ParsePathCDeps = {},
): Promise<PathCSuccess | null> {
  const runFetch = deps.fetch ?? defaultFetch();
  if (runFetch === null) {
    return null;
  }
  const url = deps.url ?? DEFAULT_PARSE_URL;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_PARSE_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, timeoutMs);
  });
  try {
    const raced = await Promise.race([
      runFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: req.text,
          source: req.source,
          schemaVersion: PATH_C_SCHEMA_VERSION,
          ...(req.context &&
          (req.context.callsigns.length > 0 ||
            req.context.selectedCallsign ||
            (req.context.fixes?.length ?? 0) > 0 ||
            (req.context.procedures?.length ?? 0) > 0 ||
            (req.context.approaches?.length ?? 0) > 0)
            ? {
                context: {
                  callsigns: req.context.callsigns,
                  ...(req.context.selectedCallsign
                    ? { selectedCallsign: req.context.selectedCallsign }
                    : {}),
                  ...(req.context.fixes && req.context.fixes.length > 0
                    ? { fixes: req.context.fixes }
                    : {}),
                  ...(req.context.procedures && req.context.procedures.length > 0
                    ? { procedures: req.context.procedures }
                    : {}),
                  ...(req.context.approaches && req.context.approaches.length > 0
                    ? { approaches: req.context.approaches }
                    : {}),
                },
              }
            : {}),
        }),
        signal: controller.signal,
      })
        .then((response) => ({ kind: "res" as const, response }))
        .catch(() => ({ kind: "err" as const })),
      timeout,
    ]);
    if (raced === "timeout" || raced.kind === "err") {
      return null;
    }
    const response = raced.response;
    if (!response.ok) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = (await response.json()) as unknown;
    } catch {
      return null;
    }
    return schemaCheckPathC(parsed);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export function createParsePathC(deps: ParsePathCDeps = {}): ParsePathCFn {
  return (req) => fetchParsePathC(req, deps);
}
