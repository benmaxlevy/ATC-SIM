/**
 * O(1) lookup from a facility catalog id to local-NM position.
 *
 * Analog: CIFP / NASR fix and navaid identifiers (R11). Trainer delta: one
 * namespace for STAR/FAF/threshold fixes **and** VOR/NDB/ILS component ids.
 * Key by `id` only — never by name phrase ("DEMO") and never by airport ICAO
 * (do not invent `DCT KDEM` / ARP as a fix).
 *
 * `@core` stays catalog-schema-free: pass `{ navaids, fixes }` (ProcedureCatalog
 * is structurally compatible). Rebuild only on scenario load.
 */

export interface RegisteredFix {
  readonly id: string;
  readonly xNm: number;
  readonly yNm: number;
  readonly kind: string;
}

/** Minimal catalog shape. `ProcedureCatalog` from `@scenario` satisfies this. */
export interface FixRegistrySource {
  navaids: ReadonlyArray<{
    id: string;
    xNm: number;
    yNm: number;
    kind: string;
  }>;
  fixes: ReadonlyArray<{
    id: string;
    xNm: number;
    yNm: number;
    kind: string;
  }>;
}

export interface FixRegistry {
  get(id: string): RegisteredFix | undefined;
  require(id: string): RegisteredFix;
  has(id: string): boolean;
  ids(): readonly string[];
}

export class UnknownFixError extends Error {
  readonly code = "unknown-fix" as const;
  readonly fixId: string;

  constructor(fixId: string) {
    super(`Unknown fix ${fixId}`);
    this.name = "UnknownFixError";
    this.fixId = fixId;
  }
}

function normalizeId(id: string): string {
  return id.trim().toUpperCase();
}

function register(
  byId: Map<string, RegisteredFix>,
  raw: { id: string; xNm: number; yNm: number; kind: string },
  path: string,
): void {
  const id = normalizeId(raw.id);
  if (id.length === 0) {
    throw new Error(`Fix registry ${path} has an empty id`);
  }
  if (!Number.isFinite(raw.xNm) || !Number.isFinite(raw.yNm)) {
    throw new Error(`Fix registry ${id} needs finite xNm/yNm`);
  }
  if (byId.has(id)) {
    throw new Error(`Fix registry duplicate id ${id} (${path})`);
  }
  byId.set(
    id,
    Object.freeze({
      id,
      xNm: raw.xNm,
      yNm: raw.yNm,
      kind: raw.kind,
    }),
  );
}

export function buildFixRegistry(catalog: FixRegistrySource): FixRegistry {
  const byId = new Map<string, RegisteredFix>();
  for (const navaid of catalog.navaids) {
    register(byId, navaid, `navaid ${navaid.kind}`);
  }
  for (const fix of catalog.fixes) {
    register(byId, fix, "fix");
  }
  const idList: readonly string[] = Object.freeze([...byId.keys()]);

  const get = (id: string): RegisteredFix | undefined => {
    const key = normalizeId(id);
    if (key.length === 0) {
      return undefined;
    }
    return byId.get(key);
  };

  return {
    get,
    require(id: string): RegisteredFix {
      const found = get(id);
      if (found === undefined) {
        throw new UnknownFixError(normalizeId(id));
      }
      return found;
    },
    has(id: string): boolean {
      return get(id) !== undefined;
    },
    ids(): readonly string[] {
      return idList;
    },
  };
}
