import { expect, test } from "vitest";
import {
  DISCLAIMER_COPY,
  DISCLAIMER_DISMISSED_KEY,
  dismissDisclaimer,
  isDisclaimerDismissed,
} from "./disclaimer";

const FROZEN_T00_01 =
  "ATC-SIM is a training and entertainment product. It is not an FAA training device, is not certified for operational or NAS use, and is not affiliated with the FAA or any STARS vendor. The display is a STARS-like visual analog only.";

function memoryStorage(): Storage {
  const mem = new Map<string, string>();
  return {
    get length() {
      return mem.size;
    },
    clear() {
      mem.clear();
    },
    getItem(key) {
      return mem.get(key) ?? null;
    },
    key(index) {
      return [...mem.keys()][index] ?? null;
    },
    removeItem(key) {
      mem.delete(key);
    },
    setItem(key, value) {
      mem.set(key, value);
    },
  };
}

test("DISCLAIMER_COPY equals the T00-01 frozen paragraph character-for-character (AC3)", () => {
  expect(DISCLAIMER_COPY).toBe(FROZEN_T00_01);
});

test("T02-15 — dismiss once per browser profile; helpers do not paraphrase copy", () => {
  const store = memoryStorage();
  expect(isDisclaimerDismissed(store)).toBe(false);
  dismissDisclaimer(store);
  expect(isDisclaimerDismissed(store)).toBe(true);
  expect(store.getItem(DISCLAIMER_DISMISSED_KEY)).toBe("1");
  expect(DISCLAIMER_COPY).toBe(FROZEN_T00_01);
});
