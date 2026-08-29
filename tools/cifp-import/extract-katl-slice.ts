/**
 * Thin KATL compatibility wrapper (T04-34).
 *
 * Defaults `--airport KATL` and a documented radius only. All parse, radius
 * seed, closure, and catalog emit go through the generic pack. There is no
 * KATL-specific parser branch.
 *
 * No committed KATL trainer pack ships in this repo. Point `--in` at a local
 * CIFP file the developer already has; do not commit the cycle.
 */
import { runPackCli, type PackIo } from "./pack.ts";
// @ts-expect-error tsconfig has no @types/node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
// @ts-expect-error tsconfig has no @types/node
import { dirname, resolve } from "node:path";
// @ts-expect-error tsconfig has no @types/node
import { argv, exit, stderr, stdout } from "node:process";
// @ts-expect-error tsconfig has no @types/node
import { pathToFileURL } from "node:url";

/** Documented default radius around KATL ARP for a local pack (NM). */
export const KATL_DEFAULT_RADIUS_NM = 40;
export const KATL_DEFAULT_AIRPORT = "KATL";

export function applyKatlPackDefaults(args: string[]): string[] {
  const out = [...args];
  if (!hasFlag(out, "--airport")) {
    out.push("--airport", KATL_DEFAULT_AIRPORT);
  }
  if (!hasFlag(out, "--radius")) {
    out.push("--radius", String(KATL_DEFAULT_RADIUS_NM));
  }
  return out;
}

export function runKatlSlice(args: string[], io: PackIo): void {
  runPackCli(applyKatlPackDefaults(args), io);
}

function hasFlag(args: readonly string[], flag: string): boolean {
  return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

function defaultIo(): PackIo {
  return {
    readFile: (path) => readFileSync(path, "utf8"),
    writeFile: (path, body) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, body);
    },
    stdout: (body) => {
      stdout.write(body);
    },
    stderr: (body) => {
      stderr.write(body);
    },
  };
}

function isDirectRun(): boolean {
  const entry = argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  try {
    runKatlSlice(argv.slice(2), defaultIo());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stderr.write(`cifp-pack: ${message}\n`);
    exit(1);
  }
}
