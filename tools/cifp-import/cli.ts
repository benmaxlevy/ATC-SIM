/**
 * Developer CLI for the CIFP subset importer (T04-08).
 * Not imported by `stepWorld` or the Vite app. Offline files only.
 */
import { parseCifpSubset, type CifpSkipStats } from "./parse.ts";
// @ts-expect-error tsconfig has no @types/node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
// @ts-expect-error tsconfig has no @types/node
import { dirname, resolve } from "node:path";
// @ts-expect-error tsconfig has no @types/node
import { argv, exit, stderr, stdout } from "node:process";
// @ts-expect-error tsconfig has no @types/node
import { pathToFileURL } from "node:url";

export interface CliArgs {
  inPath: string;
  outPath: string | null;
}

export function parseCliArgs(args: string[]): CliArgs {
  let inPath: string | undefined;
  let outPath: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--in") {
      inPath = requireValue(args, ++i, "--in");
      continue;
    }
    if (arg === "--out") {
      outPath = requireValue(args, ++i, "--out");
      continue;
    }
    if (arg.startsWith("--in=")) {
      inPath = arg.slice("--in=".length);
      continue;
    }
    if (arg.startsWith("--out=")) {
      outPath = arg.slice("--out=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (inPath === undefined || inPath.length === 0) {
    throw new Error("Missing --in <path> (see tools/cifp-import/README.md)");
  }
  return { inPath, outPath };
}

export function formatSkipLog(skipped: CifpSkipStats): string {
  const parts = Object.keys(skipped.byType)
    .sort()
    .map((type) => `${type}=${skipped.byType[type]}`);
  const detail = parts.length > 0 ? `: ${parts.join(" ")}` : "";
  return `cifp-import: skipped ${skipped.count} record(s)${detail}\n`;
}

export interface CliIo {
  readFile: (path: string) => string;
  writeFile: (path: string, body: string) => void;
  stdout: (body: string) => void;
  stderr: (body: string) => void;
}

export function runCli(args: string[], io: CliIo = defaultIo()): void {
  const parsed = parseCliArgs(args);
  const text = io.readFile(parsed.inPath);
  const result = parseCifpSubset(text);
  const json = `${JSON.stringify(result.catalog, null, 2)}\n`;
  io.stderr(formatSkipLog(result.skipped));
  if (parsed.outPath === null) {
    io.stdout(json);
    return;
  }
  io.writeFile(parsed.outPath, json);
}

function defaultIo(): CliIo {
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

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
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
    runCli(argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stderr.write(`cifp-import: ${message}\n`);
    exit(1);
  }
}
