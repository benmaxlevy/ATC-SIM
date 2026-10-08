import { describe, expect, test } from "vitest";
import katlJson from "../katl.json";
import katl08Json from "../katl-08.json";
import kdemJson from "../kdem.json";
import { assertScenario } from "../load";
import { loadPlayableScenario } from "../playableScenarios";

describe("T04-70 regional scenario loading and KDEM/KATL boot", () => {
  test("AC6: KATL west/east scenario data references regionalPack and boots cleanly", () => {
    // Both KATL configurations declare regionalPack: "katl"
    expect(katlJson.regionalPack).toBe("katl");
    expect(katl08Json.regionalPack).toBe("katl");

    // Both KATL flows boot through generic assertScenario
    const katl = assertScenario(katlJson, { arrivalCountMin: 1, arrivalCountMax: 10 });
    expect(katl.icao).toBe("KATL");
    expect(katl.regionalPack).toBe("katl");

    const katl08 = assertScenario(katl08Json, { arrivalCountMin: 1, arrivalCountMax: 10 });
    expect(katl08.icao).toBe("KATL");
    expect(katl08.regionalPack).toBe("katl");

    // Both playable scenarios load through inventory
    expect(loadPlayableScenario("katl").icao).toBe("KATL");
    expect(loadPlayableScenario("katl-08").icao).toBe("KATL");
  });

  test("AC6: KDEM remains default and has no regional dependency", () => {
    // KDEM JSON has no regionalPack property
    expect((kdemJson as Record<string, unknown>).regionalPack).toBeUndefined();

    // Boots with no regional data
    const kdem = assertScenario(kdemJson);
    expect(kdem.icao).toBe("KDEM");
    expect(kdem.regionalPack).toBeUndefined();
    expect(kdem.regional).toBeUndefined();

    // Default playable scenario is KDEM
    const defaultScenario = loadPlayableScenario();
    expect(defaultScenario.icao).toBe("KDEM");
    expect(defaultScenario.regional).toBeUndefined();
  });

  test("Rejects unknown pack in strict mode or center mismatch", () => {
    // Unknown pack in strict mode throws before boot
    const unknownPackScenario = {
      ...katlJson,
      id: "katl-unknown",
      regionalPack: "nonexistent_pack",
    };
    expect(() => assertScenario(unknownPackScenario, { strictRegional: true })).toThrow(
      /Scenario regionalPack 'nonexistent_pack' was not found/,
    );
  });
});
