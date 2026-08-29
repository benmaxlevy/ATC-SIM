import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
// @ts-expect-error tsconfig has no @types/node
import { dirname, join } from "node:path";
// @ts-expect-error tsconfig has no @types/node
import { fileURLToPath } from "node:url";
import {
  applyKatlPackDefaults,
  KATL_DEFAULT_AIRPORT,
  KATL_DEFAULT_RADIUS_NM,
  runKatlSlice,
} from "./extract-katl-slice.ts";
import { buildIcaoFixedWidthSubset } from "./fixedWidthRecords.ts";
import { parsePackCliArgs, type PackIo } from "./pack.ts";

const here = dirname(fileURLToPath(import.meta.url));

test("wrapper defaults airport KATL and radius 40 without a parse branch", () => {
  const applied = applyKatlPackDefaults(["--in", "local.cifp", "--out", "out/katl"]);
  expect(parsePackCliArgs(applied)).toMatchObject({
    inPath: "local.cifp",
    airportId: KATL_DEFAULT_AIRPORT,
    radiusNm: KATL_DEFAULT_RADIUS_NM,
    outDir: "out/katl",
  });
  const src = readFileSync(join(here, "extract-katl-slice.ts"), "utf8");
  expect(src).not.toMatch(/parseFixedWidth|parseCifpSubset|selectByRadius/);
  expect(src).not.toMatch(/if\s*\([^)]*KATL/);
});

test("AC2 — wrapper packs a KATL-shaped fixture through generic pack", () => {
  const files = new Map<string, string>([["in.cifp", buildIcaoFixedWidthSubset("KATL")]]);
  const writes: string[] = [];
  const io: PackIo = {
    readFile: (path) => {
      const body = files.get(path);
      if (body === undefined) {
        throw new Error(`missing ${path}`);
      }
      return body;
    },
    writeFile: (path, body) => {
      writes.push(path);
      files.set(path, body);
    },
    stdout: () => {
      throw new Error("stdout unused");
    },
    stderr: () => {},
  };
  runKatlSlice(["--in", "in.cifp", "--out", "out/katl"], io);
  const catalog = JSON.parse(files.get("out/katl/catalog.json")!) as {
    airportId: string;
  };
  expect(catalog.airportId).toBe("KATL");
  expect(writes.some((path) => path.endsWith("procedures.json"))).toBe(true);
  expect(writes.some((path) => path.endsWith("sids.json"))).toBe(true);
});
