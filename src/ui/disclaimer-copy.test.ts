import { expect, test } from "vitest";
import { DISCLAIMER_COPY } from "./disclaimer-copy";

const FROZEN_T00_01 =
  "ATC-SIM is a training and entertainment product. It is not an FAA training device, is not certified for operational or NAS use, and is not affiliated with the FAA or any STARS vendor. The display is a STARS-like visual analog only.";

test("DISCLAIMER_COPY equals the T00-01 frozen paragraph character-for-character (AC3)", () => {
  expect(DISCLAIMER_COPY).toBe(FROZEN_T00_01);
});
