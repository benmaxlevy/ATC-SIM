/**
 * T04-42 — operator docs must record frozen CRC paths, pack commands, and
 * the no-runtime-vNAS rule. CI fails if root or converter README regress.
 */
import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
// @ts-expect-error tsconfig has no @types/node
import { dirname, join } from "node:path";
// @ts-expect-error tsconfig has no @types/node
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../..");

const METADATA = "C:\\Users\\Ben\\AppData\\Local\\CRC\\ARTCCs\\ZTL.json";
const GEOMETRY_DIR = "C:\\Users\\Ben\\AppData\\Local\\CRC\\VideoMaps\\ZTL";
const PACK_OUT = "src/scenario/video-maps/KATL";

function assertOperatorDocs(text: string, label: string): void {
  expect(text, `${label} metadata`).toContain(METADATA);
  expect(text, `${label} geometry dir`).toContain(GEOMETRY_DIR);
  expect(text, `${label} A80`).toContain("A80");
  expect(text, `${label} --dry-run`).toContain("--dry-run");
  expect(text, `${label} pack`).toContain("pack");
  expect(text, `${label} output`).toContain(PACK_OUT);
  expect(text, `${label} no runtime CRC`).toMatch(/never reads CRC/i);
  expect(text, `${label} no vNAS`).toMatch(/never (calls|fetches) vNAS/i);
  expect(text, `${label} no src import`).toMatch(
    /src\/`? must not import|Do not import it from `src`/i,
  );
}

test("T04-42 — converter and root READMEs record pack how-to and forbid runtime vNAS", () => {
  const converter = readFileSync(join(here, "README.md"), "utf8");
  const root = readFileSync(join(repoRoot, "README.md"), "utf8");
  assertOperatorDocs(converter, "tools/crc-videomap-import/README.md");
  assertOperatorDocs(root, "README.md");
  expect(converter).toContain("How to convert / pack A80");
  expect(converter).toContain("facility.childFacilities[0]");
  expect(root).toContain("facility.childFacilities[0]");
});
