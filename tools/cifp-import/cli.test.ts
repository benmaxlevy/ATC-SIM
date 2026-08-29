import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import expectedCatalog from "../../testdata/cifp/frozen-subset.expected.json";
import { formatSkipLog, parseCliArgs, runCli } from "./cli.ts";
import { buildFixedWidthSubset } from "./fixedWidthRecords.ts";
import { CATALOG_PACK_FILES } from "./pack.ts";

test("parseCliArgs requires --in and accepts --out", () => {
  expect(parseCliArgs(["--in", "a.cifp"])).toEqual({ inPath: "a.cifp", outPath: null });
  expect(parseCliArgs(["--in", "a.cifp", "--out", "b.json"])).toEqual({
    inPath: "a.cifp",
    outPath: "b.json",
  });
  expect(() => parseCliArgs([])).toThrow(/Missing --in/);
});

test("CLI writes catalog JSON matching the frozen snapshot", () => {
  const fixture = readFileSync(
    new URL("../../testdata/cifp/frozen-subset.cifp", import.meta.url),
    "utf8",
  );
  const files = new Map<string, string>([["in.cifp", fixture]]);
  let stderr = "";
  runCli(["--in", "in.cifp", "--out", "out.json"], {
    readFile: (path) => {
      const body = files.get(path);
      if (body === undefined) {
        throw new Error(`missing ${path}`);
      }
      return body;
    },
    writeFile: (path, body) => {
      files.set(path, body);
    },
    stdout: () => {
      throw new Error("stdout should not be used when --out is set");
    },
    stderr: (body) => {
      stderr += body;
    },
  });
  expect(JSON.parse(files.get("out.json")!)).toEqual(expectedCatalog);
  expect(stderr).toMatch(/skipped 3 record\(s\): ER=1 GARBAGE=1 PD=1/);
});

test("pack subcommand writes catalog files without breaking import args", () => {
  const files = new Map<string, string>([["in.cifp", buildFixedWidthSubset()]]);
  let stderr = "";
  runCli(["pack", "--in", "in.cifp", "--airport", "KSYN", "--radius", "40", "--out", "out/ksyn"], {
    readFile: (path) => {
      const body = files.get(path);
      if (body === undefined) {
        throw new Error(`missing ${path}`);
      }
      return body;
    },
    writeFile: (path, body) => {
      files.set(path, body);
    },
    stdout: () => {
      throw new Error("stdout should not be used when pack --out is set");
    },
    stderr: (body) => {
      stderr += body;
    },
  });
  expect(stderr).toMatch(/cifp-pack: write/);
  for (const name of CATALOG_PACK_FILES) {
    expect(files.has(`out/ksyn/${name}`)).toBe(true);
  }
});

test("formatSkipLog prints type counts", () => {
  expect(formatSkipLog({ count: 0, byType: {} })).toBe("cifp-import: skipped 0 record(s)\n");
  expect(formatSkipLog({ count: 2, byType: { ER: 1, PD: 1 } })).toBe(
    "cifp-import: skipped 2 record(s): ER=1 PD=1\n",
  );
});
