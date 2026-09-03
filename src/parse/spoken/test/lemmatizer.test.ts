import { describe, expect, test } from "vitest";
import {
  lemmatizeToken,
  lemmatizeTokens,
  normalizeOrthography,
  normalizeSpoken,
} from "../normalizer";
import { parseCommand } from "../../parse-command";

describe("lemmatizer and orthographic normalizer", () => {
  test("past tense / past participle suffix reduction (-ed)", () => {
    expect(lemmatizeToken("maintained")).toBe("maintain");
    expect(lemmatizeToken("turned")).toBe("turn");
    expect(lemmatizeToken("climbed")).toBe("climb");
    expect(lemmatizeToken("descended")).toBe("descend");
    expect(lemmatizeToken("intercepted")).toBe("intercept");
    expect(lemmatizeToken("cleared")).toBe("clear");
    expect(lemmatizeToken("reduced")).toBe("reduce");
    expect(lemmatizeToken("increased")).toBe("increase");
    expect(lemmatizeToken("expedited")).toBe("expedite");
    expect(lemmatizeToken("proceeded")).toBe("proceed");
    expect(lemmatizeToken("contacted")).toBe("contact");
    expect(lemmatizeToken("squawked")).toBe("squawk");
    expect(lemmatizeToken("slowed")).toBe("slow");
    expect(lemmatizeToken("resumed")).toBe("resume");
    expect(lemmatizeToken("joined")).toBe("join");
    expect(lemmatizeToken("stopped")).toBe("stop");
  });

  test("progressive suffix reduction (-ing)", () => {
    expect(lemmatizeToken("descending")).toBe("descend");
    expect(lemmatizeToken("turning")).toBe("turn");
    expect(lemmatizeToken("climbing")).toBe("climb");
    expect(lemmatizeToken("proceeding")).toBe("proceed");
    expect(lemmatizeToken("maintaining")).toBe("maintain");
    expect(lemmatizeToken("intercepting")).toBe("intercept");
    expect(lemmatizeToken("reducing")).toBe("reduce");
    expect(lemmatizeToken("increasing")).toBe("increase");
    expect(lemmatizeToken("expediting")).toBe("expedite");
    expect(lemmatizeToken("slowing")).toBe("slow");
    expect(lemmatizeToken("stopping")).toBe("stop");
  });

  test("3rd person singular (-s, -es)", () => {
    expect(lemmatizeToken("maintains")).toBe("maintain");
    expect(lemmatizeToken("crosses")).toBe("cross");
    expect(lemmatizeToken("turns")).toBe("turn");
    expect(lemmatizeToken("climbs")).toBe("climb");
    expect(lemmatizeToken("descends")).toBe("descend");
    expect(lemmatizeToken("reduces")).toBe("reduce");
    expect(lemmatizeToken("increases")).toBe("increase");
    expect(lemmatizeToken("expedites")).toBe("expedite");
    expect(lemmatizeToken("proceeds")).toBe("proceed");
    expect(lemmatizeToken("flies")).toBe("fly");
  });

  test("common irregulars", () => {
    expect(lemmatizeToken("flew")).toBe("fly");
    expect(lemmatizeToken("sped")).toBe("speed");
    expect(lemmatizeToken("held")).toBe("hold");
    expect(lemmatizeToken("went")).toBe("go");
  });

  test("guardrail: preserves numbers, flight numbers, runways, fixes, and ATC keywords", () => {
    // Numbers & words
    expect(lemmatizeToken("26")).toBe("26");
    expect(lemmatizeToken("270")).toBe("270");
    expect(lemmatizeToken("5000")).toBe("5000");
    expect(lemmatizeToken("one")).toBe("one");
    expect(lemmatizeToken("two")).toBe("two");
    expect(lemmatizeToken("three")).toBe("three");
    expect(lemmatizeToken("four")).toBe("four");

    // Flight numbers & runway designations
    expect(lemmatizeToken("dal123")).toBe("dal123");
    expect(lemmatizeToken("aal456")).toBe("aal456");
    expect(lemmatizeToken("26l")).toBe("26l");
    expect(lemmatizeToken("26r")).toBe("26r");
    expect(lemmatizeToken("rw26r")).toBe("rw26r");

    // Navaids / fixes
    expect(lemmatizeToken("bosox", new Set(["BOSOX"]))).toBe("bosox");
    expect(lemmatizeToken("merit", new Set(["MERIT"]))).toBe("merit");

    // Protected ATC keywords
    expect(lemmatizeToken("heading")).toBe("heading");
    expect(lemmatizeToken("degrees")).toBe("degrees");
    expect(lemmatizeToken("knots")).toBe("knots");
    expect(lemmatizeToken("miles")).toBe("miles");
    expect(lemmatizeToken("speed")).toBe("speed");
    expect(lemmatizeToken("proceed")).toBe("proceed");
    expect(lemmatizeToken("feet")).toBe("feet");
    expect(lemmatizeToken("established")).toBe("established");

    // Telephony callsigns
    expect(lemmatizeToken("united")).toBe("united");
    expect(lemmatizeToken("american")).toBe("american");
  });

  test("orthographic normalization (-our -> -or)", () => {
    expect(normalizeOrthography("endeavour")).toBe("endeavor");
    expect(normalizeOrthography("colour")).toBe("color");
    expect(normalizeOrthography("harbour")).toBe("harbor");
    expect(normalizeOrthography("favour")).toBe("favor");
    expect(normalizeOrthography("honour")).toBe("honor");
    expect(normalizeOrthography("centre")).toBe("center");

    // Protected words with our
    expect(normalizeOrthography("four")).toBe("four");
    expect(normalizeOrthography("hour")).toBe("hour");
    expect(normalizeOrthography("our")).toBe("our");
    expect(normalizeOrthography("tour")).toBe("tour");
    expect(normalizeOrthography("sour")).toBe("sour");
    expect(normalizeOrthography("pour")).toBe("pour");
  });

  test("normalizeSpoken canonicalizes Endeavour to endeavor and lemmatizes verbs", () => {
    expect(
      normalizeSpoken("Endeavour one two three maintained heading two seven zero"),
    ).toBe("endeavor one two three maintain heading two seven zero");

    expect(
      normalizeSpoken("United one two three descending and maintaining three thousand"),
    ).toBe("united one two three descend and maintain three thousand");

    expect(
      normalizeSpoken("Delta four five six turned left heading zero niner zero and sped to two one zero"),
    ).toBe("delta four five six turn left heading zero nine zero and speed two one zero");
  });

  test("Endeavour matches EDV telephony in parseCommand", async () => {
    const res = await parseCommand("Endeavour one two three turn left heading two seven zero", {
      source: "voice",
      pathC: false,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.callsignToken).toBe("EDV123");
    expect(res.instructions).toEqual([
      { type: "FLY_HEADING", headingDeg: 270, turn: "LEFT" },
    ]);
  });
});
