/**
 * Isolated pattern / slot matcher (island parsing) for spoken ATC commands.
 * Searches token spans for independent commands (callsign, heading/turn,
 * altitude, speed, direct, procedure, approach, etc.), tracks claimed token
 * spans to avoid collisions/double-counting, and returns instructions in
 * transmission order.
 */

import type { Instruction, SpeedUntil, TurnDir } from "@core";
import type { ParseResult } from "../parseRadioText";
import { formatParseError, PARSE_ERROR } from "../tokens";
import { parseFacilityName } from "../contact";

function isRequestControlInstruction(instruction: Instruction): boolean {
  return (
    instruction.type === "REQUEST_DETAILS" ||
    instruction.type === "STANDBY_REQUEST" ||
    instruction.type === "APPROVE_FLIGHT_FOLLOWING" ||
    instruction.type === "DECLINE_REQUEST" ||
    instruction.type === "RADAR_CONTACT" ||
    instruction.type === "TERMINATE_RADAR_SERVICE" ||
    instruction.type === "ACKNOWLEDGE_IFR_CANCELLATION" ||
    instruction.type === "CONTACT_TOWER" ||
    instruction.type === "CONTACT_CENTER"
  );
}

function isClassBInstruction(instruction: Instruction): boolean {
  return (
    instruction.type === "CLASS_B_CLEARANCE" ||
    instruction.type === "CLASS_B_CLEARANCE_AS_REQUESTED" ||
    instruction.type === "REMAIN_OUTSIDE_BRAVO" ||
    instruction.type === "RESUME_APPROPRIATE_VFR_ALTITUDES"
  );
}
import {
  parseAltitudeFt,
  parseHeadingDeg,
  parseDistanceNmValue,
  parseSpeedKt,
  parseTurnDegreesValue,
  singleDigit,
  squawkDigit,
} from "./numbers";
import {
  EIGHT_POINT_CARDINALS,
  groundAirportPhraseToCatalog,
  groundAirportToCatalog,
  groundApproachToCatalog,
  groundFixPhraseToCatalog,
  groundFixToCatalog,
  groundProcedureToCatalog,
  groundReferenceToCatalog,
  looksLikeSpokenTransition,
  matchSpokenStarTransition,
  type CatalogAirport,
  type CatalogFixInput,
  type CatalogApproach,
  type CatalogProcedure,
} from "./catalog-ground";
import { parseSpokenCallsign, PHONETIC_TO_LETTER, RESERVED_SPOKEN } from "./telephony";
import { acceptIfrClearanceField, newIfrClearanceFieldOrder } from "../ifr-clearance-syntax";
import { scanIfrClearanceRouteWindow } from "../ifr-clearance-route-window";
import { cancelApproachSequenceError } from "../instruction-order";

const PROCEDURE_TRAILING = new Set(["arrival", "star", "sid", "departure", "procedure"]);

const COMMAND_TRIGGERS = new Set([
  "turn",
  "fly",
  "climb",
  "descend",
  "proceed",
  "direct",
  "join",
  "cleared",
  "clear",
  "intercept",
  "cross",
  "heading",
  "speed",
  "delete",
  "squawk",
  "ident",
  "iden",
  "say",
  "cancel",
  "stand",
  "standby",
  "approve",
  "unable",
  "radar",
  "contact",
  "visual",
  "remain",
  "resume",
]);

function runwaySide(tok: string | undefined): string | null {
  if (tok === "left" || tok === "lima") {
    return "L";
  }
  if (tok === "right" || tok === "romeo") {
    return "R";
  }
  if (tok === "center" || tok === "centre" || tok === "charlie") {
    return "C";
  }
  return null;
}

function matchRunway(
  tokens: readonly string[],
  i: number,
  requireRunwayWord = false,
): { id: string; next: number } | null {
  let j = i;
  const hasRunwayWord = tokens[j] === "runway";
  if (hasRunwayWord) {
    j += 1;
  } else if (requireRunwayWord) {
    return null;
  }

  const tok = tokens[j];
  if (tok !== undefined && /^\d{1,2}[lrc]?$/i.test(tok)) {
    const match = tok.match(/^(\d{1,2})([lrc])?$/i);
    if (match) {
      const num = match[1]!.padStart(2, "0");
      if (match[2]) {
        return { id: `${num}${match[2].toUpperCase()}`, next: j + 1 };
      }
      const side = runwaySide(tokens[j + 1]);
      if (side) {
        return { id: `${num}${side}`, next: j + 2 };
      }
      return { id: num, next: j + 1 };
    }
  }

  const d1 = singleDigit(tokens[j]);
  const d2 = singleDigit(tokens[j + 1]);
  if (d1 !== null && d2 !== null) {
    j += 2;
    const side = runwaySide(tokens[j]);
    if (side) {
      return { id: `${d1}${d2}${side}`, next: j + 1 };
    }
    return { id: `${d1}${d2}`, next: j };
  }

  const single = singleDigit(tokens[j]);
  if (single !== null) {
    const side = runwaySide(tokens[j + 1]);
    if (side) {
      return { id: `0${single}${side}`, next: j + 2 };
    }
  }

  return null;
}

function ilsApproachIdFromRunway(rwy: string): string {
  const numeric = rwy.replace(/[LRC]$/i, "");
  const padded = numeric.padStart(2, "0");
  const side = rwy.slice(numeric.length).toUpperCase();
  return `ILS${padded}${side}`;
}

function parseFlightLevel(
  tokens: readonly string[],
  i: number,
): { value: number; next: number } | null {
  let j = i;
  if (tokens[j] === "flight" && tokens[j + 1] === "level") {
    j += 2;
  } else if (tokens[j] === "fl") {
    j += 1;
  } else if (tokens[j] !== undefined && /^fl\d{2,3}$/i.test(tokens[j]!)) {
    const val = Number(tokens[j]!.slice(2));
    return { value: val * 100, next: j + 1 };
  } else {
    return null;
  }

  const compact = tokens[j];
  if (compact !== undefined && /^\d{2,3}$/.test(compact)) {
    return { value: Number(compact) * 100, next: j + 1 };
  }

  const d1 = singleDigit(tokens[j]);
  const d2 = singleDigit(tokens[j + 1]);
  const d3 = singleDigit(tokens[j + 2]);
  if (d1 !== null && d2 !== null && d3 !== null) {
    return { value: (d1 * 100 + d2 * 10 + d3) * 100, next: j + 3 };
  }
  if (d1 !== null && d2 !== null) {
    return { value: (d1 * 10 + d2) * 100, next: j + 2 };
  }

  return null;
}

function parseFixIdFrom(
  tokens: readonly string[],
  i: number,
  catalog: readonly CatalogFixInput[],
  protectedIds?: ReadonlySet<string>,
): { fixId: string; next: number } | null {
  let j = i;
  const phonetics: string[] = [];
  while (phonetics.length < 5 && tokens[j] !== undefined && tokens[j]! in PHONETIC_TO_LETTER) {
    phonetics.push(PHONETIC_TO_LETTER[tokens[j]!]!);
    j += 1;
  }
  if (phonetics.length >= 2) {
    const id = phonetics.join("");
    if (protectedIds?.has(id)) return { fixId: id, next: j };
    return { fixId: groundFixToCatalog(id, catalog) ?? id, next: j };
  }

  for (let n = Math.min(3, tokens.length - i); n >= 1; n -= 1) {
    const slice = tokens.slice(i, i + n).join("");
    if (protectedIds?.has(slice.toUpperCase())) {
      return { fixId: slice.toUpperCase(), next: i + n };
    }
    const hit = groundFixToCatalog(slice, catalog);
    if (hit) {
      return { fixId: hit, next: i + n };
    }
  }

  const tok = tokens[i];
  if (tok !== undefined && !RESERVED_SPOKEN.has(tok)) {
    if (protectedIds?.has(tok.toUpperCase())) {
      return { fixId: tok.toUpperCase(), next: i + 1 };
    }
    return { fixId: groundFixToCatalog(tok, catalog) ?? tok.toUpperCase(), next: i + 1 };
  }

  return null;
}

function matchProcedure(
  tokens: readonly string[],
  i: number,
  procedures: readonly CatalogProcedure[],
): { id: string; next: number } | null {
  for (let n = Math.min(4, tokens.length - i); n >= 1; n -= 1) {
    const slice = tokens.slice(i, i + n).join(" ");
    const hit = groundProcedureToCatalog(slice, procedures);
    if (hit) {
      return { id: hit, next: i + n };
    }
  }

  const tok = tokens[i];
  if (tok !== undefined && !RESERVED_SPOKEN.has(tok)) {
    return { id: groundProcedureToCatalog(tok, procedures) ?? tok.toUpperCase(), next: i + 1 };
  }

  return null;
}

function matchCatalogApproach(
  tokens: readonly string[],
  i: number,
  approaches: readonly CatalogApproach[],
): { id: string; next: number } | null {
  for (let n = Math.min(3, tokens.length - i); n >= 1; n -= 1) {
    const slice = tokens.slice(i, i + n).join(" ");
    const hit = groundApproachToCatalog(slice, approaches);
    if (hit) {
      return { id: hit, next: i + n };
    }
  }

  const tok = tokens[i];
  if (tok !== undefined) {
    const hit = groundApproachToCatalog(tok, approaches);
    if (hit) {
      return { id: hit, next: i + 1 };
    }
  }

  return null;
}

function matchCross(
  tokens: readonly string[],
  i: number,
  catalog: readonly CatalogFixInput[],
): { instruction: Instruction; next: number } | null {
  if (tokens[i] !== "cross") {
    return null;
  }
  let j = i + 1;
  const fix = parseFixIdFrom(tokens, j, catalog);
  if (!fix) {
    return null;
  }
  j = fix.next;

  let restriction: "AT" | "AT_OR_ABOVE" | "AT_OR_BELOW" = "AT";
  if (tokens[j] === "at") {
    if (tokens[j + 1] === "or" && tokens[j + 2] === "above") {
      restriction = "AT_OR_ABOVE";
      j += 3;
    } else if (tokens[j + 1] === "or" && tokens[j + 2] === "below") {
      restriction = "AT_OR_BELOW";
      j += 3;
    } else if (tokens[j + 1] === "and" && tokens[j + 2] === "maintain") {
      restriction = "AT";
      j += 3;
    } else {
      restriction = "AT";
      j += 1;
    }
  } else if (tokens[j] === "maintain") {
    restriction = "AT";
    j += 1;
  } else {
    return null;
  }

  if (tokens[j] === "altitude") {
    j += 1;
  }

  let altitudeFt: number | null = null;
  const fl = parseFlightLevel(tokens, j);
  if (fl) {
    altitudeFt = fl.value;
    j = fl.next;
  } else {
    const alt = parseAltitudeFt(tokens, j);
    if (!alt) {
      return null;
    }
    altitudeFt = alt.value;
    j = alt.next;
  }

  return {
    instruction: {
      type: "CROSS",
      fixId: fix.fixId,
      altitudeFt,
      restriction,
    },
    next: j,
  };
}

function matchClassBRoute(
  tokens: readonly string[],
  i: number,
  catalog: readonly CatalogFixInput[],
): { route: Array<{ type: "DIRECT"; fixId: string }>; next: number } | null {
  if (tokens[i] !== "via" || catalog.length === 0) {
    return tokens[i] === "via" ? null : { route: [], next: i };
  }
  let j = i + 1;
  const route: Array<{ type: "DIRECT"; fixId: string }> = [];
  while (true) {
    let hit: string | null = null;
    let consumed = 0;
    for (let n = Math.min(3, tokens.length - j); n >= 1; n -= 1) {
      const phrase = tokens.slice(j, j + n);
      if (phrase.includes("then") || phrase.includes("maintain")) {
        continue;
      }
      const candidate = groundFixPhraseToCatalog(phrase, catalog);
      if (candidate !== null) {
        hit = candidate;
        consumed = n;
        break;
      }
    }
    if (hit === null) {
      return null;
    }
    route.push({ type: "DIRECT", fixId: hit });
    j += consumed;
    if (tokens[j] !== "then") {
      return { route, next: j };
    }
    j += 1;
    if (tokens[j] === undefined || tokens[j] === "maintain") {
      return null;
    }
  }
}

function matchClassBClearance(
  tokens: readonly string[],
  i: number,
  catalog: readonly CatalogFixInput[],
): { instruction: Instruction; next: number } | null {
  if (tokens[i] !== "cleared") {
    return null;
  }
  let j = i + 1;
  let operation: "THROUGH" | "TO_ENTER" | "OUT_OF" | null = null;
  if (tokens[j] === "through") {
    operation = "THROUGH";
    j += 1;
  } else if (tokens[j] === "out" && tokens[j + 1] === "of") {
    operation = "OUT_OF";
    j += 2;
  } else if (tokens[j] === "into") {
    operation = "TO_ENTER";
    j += 1;
  } else if (tokens[j] === "to" && tokens[j + 1] === "enter") {
    operation = "TO_ENTER";
    j += 2;
  }
  if (operation === null) {
    return null;
  }
  if (operation === "TO_ENTER") {
    if (tokens[j] === "the") j += 1;
    if (tokens[j] === "class") j += 1;
  }
  if (tokens[j] !== "bravo" || tokens[j + 1] !== "airspace") {
    return null;
  }
  j += 2;
  const routeMatch = matchClassBRoute(tokens, j, catalog);
  if (routeMatch === null) {
    return null;
  }
  j = routeMatch.next;
  let altitudeFt: number | undefined;
  if (tokens[j] === "maintain") {
    const altitude = parseFlightLevel(tokens, j + 1) ?? parseAltitudeAt(tokens, j + 1);
    if (
      altitude === null ||
      tokens[altitude.next] !== "while" ||
      tokens[altitude.next + 1] !== "in" ||
      tokens[altitude.next + 2] !== "bravo" ||
      tokens[altitude.next + 3] !== "airspace"
    ) {
      return null;
    }
    altitudeFt = altitude.value;
    j = altitude.next + 4;
  }
  const next = tokens[j];
  if (next !== undefined && next !== "and" && next !== "then" && !COMMAND_TRIGGERS.has(next)) {
    return null;
  }
  return {
    instruction: {
      type: "CLASS_B_CLEARANCE",
      operation,
      ...(routeMatch.route.length > 0 ? { route: routeMatch.route } : {}),
      ...(altitudeFt === undefined ? {} : { altitudeFt }),
    },
    next: j,
  };
}

function parseAltitudeAt(
  tokens: readonly string[],
  i: number,
): { value: number; next: number } | null {
  const parsed = parseFlightLevel(tokens, i);
  if (parsed !== null) return parsed;
  return parseAltitudeFt(tokens, i);
}

function matchRemainOutsideBravo(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (
    tokens[i] === "remain" &&
    tokens[i + 1] === "outside" &&
    tokens[i + 2] === "bravo" &&
    tokens[i + 3] === "airspace"
  ) {
    return { instruction: { type: "REMAIN_OUTSIDE_BRAVO" }, next: i + 4 };
  }
  return null;
}

function matchResumeAppropriateVfrAltitudes(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (
    tokens[i] === "resume" &&
    tokens[i + 1] === "appropriate" &&
    tokens[i + 2] === "vfr" &&
    tokens[i + 3] === "altitudes"
  ) {
    const next = tokens[i + 4];
    if (next !== undefined && next !== "and" && next !== "then" && !COMMAND_TRIGGERS.has(next)) {
      return null;
    }
    return { instruction: { type: "RESUME_APPROPRIATE_VFR_ALTITUDES" }, next: i + 4 };
  }
  return null;
}

function matchClearedApproach(
  tokens: readonly string[],
  i: number,
  approaches: readonly CatalogApproach[],
): { instruction: Instruction; next: number } | null {
  if (tokens[i] !== "cleared" && tokens[i] !== "clear") {
    return null;
  }
  let j = i + 1;
  if (tokens[j] === "for" && tokens[j + 1] === "the") {
    j += 2;
  } else if (tokens[j] === "for" || tokens[j] === "to") {
    j += 1;
  }

  if (tokens[j] === "visual") {
    let vj = j + 1;
    if (tokens[vj] === "approach") {
      vj += 1;
    }
    const rwy = matchRunway(tokens, vj, false);
    if (rwy) {
      let rj = rwy.next;
      if (tokens[rj] === "approach") {
        rj += 1;
      }
      return {
        instruction: {
          type: "CLEARED_VISUAL",
          runwayId: rwy.id,
        },
        next: rj,
      };
    }
    return null;
  }

  if (tokens[j] === "ils") {
    j += 1;
    if (tokens[j] === "approach") {
      j += 1;
    }
    const rwy = matchRunway(tokens, j, false);
    if (rwy) {
      j = rwy.next;
      if (tokens[j] === "approach") {
        j += 1;
      }
      return {
        instruction: {
          type: "CLEARED_APPROACH",
          approachId: ilsApproachIdFromRunway(rwy.id),
        },
        next: j,
      };
    }
    if (tokens[j] === "approach") {
      j += 1;
    }
    const approachId = approaches.length === 1 ? approaches[0]!.id : "ILS";
    return {
      instruction: { type: "CLEARED_APPROACH", approachId },
      next: j,
    };
  }

  const rwyDirect = matchRunway(tokens, j, true);
  if (rwyDirect) {
    j = rwyDirect.next;
    if (tokens[j] === "ils") {
      j += 1;
    }
    if (tokens[j] === "approach") {
      j += 1;
    }
    return {
      instruction: {
        type: "CLEARED_APPROACH",
        approachId: ilsApproachIdFromRunway(rwyDirect.id),
      },
      next: j,
    };
  }

  if (tokens[j] === "approach") {
    j += 1;
    const rwyAfter = matchRunway(tokens, j, false);
    if (rwyAfter) {
      return {
        instruction: {
          type: "CLEARED_APPROACH",
          approachId: ilsApproachIdFromRunway(rwyAfter.id),
        },
        next: rwyAfter.next,
      };
    }
    const cat = matchCatalogApproach(tokens, j, approaches);
    if (cat) {
      return {
        instruction: { type: "CLEARED_APPROACH", approachId: cat.id },
        next: cat.next,
      };
    }
    const approachId = approaches.length === 1 ? approaches[0]!.id : "APPROACH";
    return {
      instruction: { type: "CLEARED_APPROACH", approachId },
      next: j,
    };
  }

  const catDirect = matchCatalogApproach(tokens, j, approaches);
  if (catDirect) {
    j = catDirect.next;
    if (tokens[j] === "approach") {
      j += 1;
    }
    return {
      instruction: { type: "CLEARED_APPROACH", approachId: catDirect.id },
      next: j,
    };
  }

  return null;
}

function matchExpectApproach(
  tokens: readonly string[],
  i: number,
  approaches: readonly CatalogApproach[],
): { instruction: Instruction; next: number } | null {
  if (tokens[i] !== "expect") {
    return null;
  }
  let j = i + 1;
  if (tokens[j] === "the") {
    j += 1;
  }

  if (tokens[j] === "ils") {
    j += 1;
    if (tokens[j] === "approach") {
      j += 1;
    }
    const rwy = matchRunway(tokens, j, false);
    if (rwy) {
      j = rwy.next;
      if (tokens[j] === "approach") {
        j += 1;
      }
      return {
        instruction: {
          type: "EXPECT_APPROACH",
          approachId: ilsApproachIdFromRunway(rwy.id),
        },
        next: j,
      };
    }
    if (tokens[j] === "approach") {
      j += 1;
    }
    const approachId = approaches.length === 1 ? approaches[0]!.id : "ILS";
    return {
      instruction: { type: "EXPECT_APPROACH", approachId },
      next: j,
    };
  }

  const rwyDirect = matchRunway(tokens, j, true);
  if (rwyDirect) {
    j = rwyDirect.next;
    if (tokens[j] === "ils") {
      j += 1;
    }
    if (tokens[j] === "approach") {
      j += 1;
    }
    return {
      instruction: {
        type: "EXPECT_APPROACH",
        approachId: ilsApproachIdFromRunway(rwyDirect.id),
      },
      next: j,
    };
  }

  if (tokens[j] === "approach") {
    j += 1;
    const rwyAfter = matchRunway(tokens, j, false);
    if (rwyAfter) {
      return {
        instruction: {
          type: "EXPECT_APPROACH",
          approachId: ilsApproachIdFromRunway(rwyAfter.id),
        },
        next: rwyAfter.next,
      };
    }
    const cat = matchCatalogApproach(tokens, j, approaches);
    if (cat) {
      return {
        instruction: { type: "EXPECT_APPROACH", approachId: cat.id },
        next: cat.next,
      };
    }
    const approachId = approaches.length === 1 ? approaches[0]!.id : "APPROACH";
    return {
      instruction: { type: "EXPECT_APPROACH", approachId },
      next: j,
    };
  }

  const catDirect = matchCatalogApproach(tokens, j, approaches);
  if (catDirect) {
    j = catDirect.next;
    if (tokens[j] === "approach") {
      j += 1;
    }
    return {
      instruction: { type: "EXPECT_APPROACH", approachId: catDirect.id },
      next: j,
    };
  }

  return null;
}

function matchInterceptLocalizer(
  tokens: readonly string[],
  i: number,
  approaches: readonly CatalogApproach[],
): { instruction: Instruction; next: number } | null {
  if (tokens[i] !== "intercept") {
    return null;
  }
  let j = i + 1;
  if (tokens[j] === "the") {
    j += 1;
  }

  const rwyFirst = matchRunway(tokens, j, false);
  if (rwyFirst) {
    if (tokens[rwyFirst.next] === "localizer" || tokens[rwyFirst.next] === "loc") {
      return {
        instruction: {
          type: "INTERCEPT_LOCALIZER",
          approachId: ilsApproachIdFromRunway(rwyFirst.id),
        },
        next: rwyFirst.next + 1,
      };
    }
  }

  if (
    tokens[j] === "localizer" ||
    tokens[j] === "loc" ||
    (tokens[j] === "ils" && (tokens[j + 1] === "localizer" || tokens[j + 1] === "loc"))
  ) {
    j = tokens[j] === "ils" ? j + 2 : j + 1;
    if (tokens[j] === "for") {
      j += 1;
    }
    const rwyAfter = matchRunway(tokens, j, false);
    if (rwyAfter) {
      return {
        instruction: {
          type: "INTERCEPT_LOCALIZER",
          approachId: ilsApproachIdFromRunway(rwyAfter.id),
        },
        next: rwyAfter.next,
      };
    }
    const approachId = approaches.length === 1 ? approaches[0]!.id : "ILS";
    return {
      instruction: { type: "INTERCEPT_LOCALIZER", approachId },
      next: j,
    };
  }

  if (tokens[j] === "ils") {
    j += 1;
    const rwy = matchRunway(tokens, j, false);
    if (rwy) {
      j = rwy.next;
      if (tokens[j] === "localizer" || tokens[j] === "loc") {
        j += 1;
      }
      return {
        instruction: {
          type: "INTERCEPT_LOCALIZER",
          approachId: ilsApproachIdFromRunway(rwy.id),
        },
        next: rwy.next,
      };
    }
  }

  return null;
}

function matchGoAround(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if ((tokens[i] === "go" || tokens[i] === "going") && tokens[i + 1] === "around") {
    return { instruction: { type: "GO_AROUND" }, next: i + 2 };
  }
  if (tokens[i] === "go-around" || tokens[i] === "ga") {
    return { instruction: { type: "GO_AROUND" }, next: i + 1 };
  }
  return null;
}

function matchCancelApproach(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (tokens[i] === "cancel" && tokens[i + 1] === "approach" && tokens[i + 2] === "clearance") {
    return { instruction: { type: "CANCEL_APPROACH" }, next: i + 3 };
  }
  return null;
}

function matchVia(
  tokens: readonly string[],
  i: number,
  procedures: readonly CatalogProcedure[],
): { instruction: Instruction; next: number } | null {
  let isClimb = false;
  if (tokens[i] === "climb") {
    isClimb = true;
  } else if (tokens[i] === "descend") {
    isClimb = false;
  } else {
    return null;
  }

  let j = i + 1;
  if (tokens[j] !== "via") {
    return null;
  }
  j += 1;

  if (tokens[j] === "the") {
    j += 1;
  }

  const proc = matchProcedure(tokens, j, procedures);
  if (!proc) {
    return null;
  }
  j = proc.next;

  if (tokens[j] !== undefined && PROCEDURE_TRAILING.has(tokens[j]!)) {
    j += 1;
  }

  if (isClimb) {
    return attachSpokenStarTransition(tokens, j, proc.id, procedures, {
      type: "CLIMB_VIA",
      procedureId: proc.id,
    });
  }
  const trans = attachSpokenStarTransition(tokens, j, proc.id, procedures, {
    type: "DESCEND_VIA",
    procedureId: proc.id,
  });
  if (!trans) {
    return null;
  }
  return trans;
}

function matchJoinProcedure(
  tokens: readonly string[],
  i: number,
  procedures: readonly CatalogProcedure[],
): { instruction: Instruction; next: number } | null {
  if (tokens[i] !== "join") {
    return null;
  }
  let j = i + 1;
  if (tokens[j] === "the") {
    j += 1;
  }

  const proc = matchProcedure(tokens, j, procedures);
  if (!proc) {
    return null;
  }
  j = proc.next;

  if (tokens[j] !== undefined && PROCEDURE_TRAILING.has(tokens[j]!)) {
    j += 1;
  }

  return attachSpokenStarTransition(tokens, j, proc.id, procedures, {
    type: "JOIN_PROCEDURE",
    procedureId: proc.id,
  });
}

function attachSpokenStarTransition(
  tokens: readonly string[],
  i: number,
  procedureId: string,
  procedures: readonly CatalogProcedure[],
  instruction: Extract<Instruction, { type: "DESCEND_VIA" | "CLIMB_VIA" | "JOIN_PROCEDURE" }>,
): { instruction: Instruction; next: number } | null {
  const match = matchSpokenStarTransition(tokens, i, procedureId, procedures);
  if (match.kind === "hit") {
    return { instruction: { ...instruction, transitionId: match.id }, next: match.next };
  }
  if (match.kind === "ambiguous") {
    return null;
  }
  if (looksLikeSpokenTransition(tokens, i)) {
    return null;
  }
  return { instruction, next: i };
}

function matchDirect(
  tokens: readonly string[],
  i: number,
  catalog: readonly CatalogFixInput[],
): { instruction: Instruction; next: number } | null {
  let j = i;
  if (
    (tokens[j] === "proceed" || tokens[j] === "cleared" || tokens[j] === "clear") &&
    tokens[j + 1] === "direct"
  ) {
    j += 2;
  } else if (tokens[j] === "direct") {
    j += 1;
  } else if (tokens[j] === "proceed" && tokens[j + 1] === "to") {
    j += 2;
  } else {
    return null;
  }

  if (tokens[j] === "to") {
    j += 1;
  }

  const fix = parseFixIdFrom(tokens, j, catalog);
  if (!fix) {
    return null;
  }

  return {
    instruction: { type: "DIRECT", fixId: fix.fixId },
    next: fix.next,
  };
}

function matchIfrClearance(
  tokens: readonly string[],
  i: number,
  catalog: readonly CatalogFixInput[],
  procedures: readonly CatalogProcedure[],
  protectedIds?: ReadonlySet<string>,
): { instruction: Instruction; next: number } | null {
  if ((tokens[i] !== "cleared" && tokens[i] !== "clear") || tokens[i + 1] !== "to") {
    return null;
  }
  let j = i + 2;
  const limit = parseFixIdFrom(tokens, j, catalog, protectedIds);
  if (!limit) return null;
  j = limit.next;
  if (["airport", "fix", "waypoint", "navaid"].includes(tokens[j] ?? "")) j += 1;
  let access: Extract<Instruction, { type: "IFR_CLEARANCE" }>["access"] | undefined;
  if (tokens[j] === "asfiled") {
    access = { type: "AS_FILED" };
    j += 1;
  } else if (tokens[j] === "as" && tokens[j + 1] === "filed") {
    access = { type: "AS_FILED" };
    j += 2;
  } else if (tokens[j] === "via") {
    j += 1;
    if (tokens[j] === "radar" && tokens[j + 1] === "vectors") {
      access = { type: "RADAR_VECTORS" };
      j += 2;
    } else {
      const route = scanIfrClearanceRouteWindow(tokens, j, {
        fixes: catalog,
        procedures,
      });
      if (!route) return null;
      access = { type: "EXPLICIT_ROUTE", segments: route.segments };
      j = route.nextIndex;
    }
  } else {
    return null;
  }
  const optional: Pick<
    Extract<Instruction, { type: "IFR_CLEARANCE" }>,
    "altitudeFt" | "climbVia" | "frequency" | "squawk"
  > = {};
  const order = newIfrClearanceFieldOrder();
  while (j < tokens.length) {
    const field = tokens[j];
    if (!field) return null;
    const fieldKind = acceptIfrClearanceField(order, field);
    if (!fieldKind) return null;
    if (fieldKind === "CVIA") {
      optional.climbVia = true;
      j += 1;
    } else if (fieldKind === "ALT") {
      j += 1;
      if (tokens[j] === "maintain") j += 1;
      const alt = parseAltitudeFt(tokens, j);
      if (!alt) return null;
      optional.altitudeFt = alt.value < 1000 ? alt.value * 100 : alt.value;
      j = alt.next;
    } else if (fieldKind === "FREQ") {
      j += 1;
      const whole = tokens[j];
      if (whole && /^\d{3}$/.test(whole)) {
        let value = whole;
        j += 1;
        if (tokens[j] === "point") {
          const fraction = tokens[j + 1];
          if (!fraction || !/^\d{1,3}$/.test(fraction)) return null;
          value += `.${fraction}`;
          j += 2;
        }
        optional.frequency = value;
      } else {
        // Frequencies are decimal, unlike Mode 3/A squawk codes.
        const d1 = singleDigit(tokens[j]);
        const d2 = singleDigit(tokens[j + 1]);
        const d3 = singleDigit(tokens[j + 2]);
        if (d1 === null || d2 === null || d3 === null) return null;
        optional.frequency = `${d1}${d2}${d3}`;
        j += 3;
        if (tokens[j] === "point") {
          const fraction = singleDigit(tokens[j + 1]);
          if (fraction === null) return null;
          optional.frequency += `.${fraction}`;
          j += 2;
        }
      }
    } else if (fieldKind === "SQ") {
      const digits: number[] = [];
      for (let n = 0; n < 4; n += 1) {
        const digit = squawkDigit(tokens[j + n + 1]);
        if (digit === null) return null;
        digits.push(digit);
      }
      optional.squawk = digits.join("");
      j += 5;
    } else {
      return null;
    }
  }
  return {
    instruction: { type: "IFR_CLEARANCE", limitId: limit.fixId, access, ...optional },
    next: j,
  };
}

function matchPresentHeading(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (
    (tokens[i] === "continue" || tokens[i] === "fly" || tokens[i] === "maintain") &&
    tokens[i + 1] === "present" &&
    tokens[i + 2] === "heading"
  ) {
    return { instruction: { type: "PRESENT_HEADING" }, next: i + 3 };
  }
  if (tokens[i] === "present" && tokens[i + 1] === "heading") {
    return { instruction: { type: "PRESENT_HEADING" }, next: i + 2 };
  }
  return null;
}

function matchMaintainVfr(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (tokens[i] !== "maintain" || tokens[i + 1] !== "vfr") {
    return null;
  }
  // Keep the exact command closed: "VFR ON TOP" must not become MAINTAIN_VFR.
  const next = tokens[i + 2];
  if (next !== undefined && next !== "and" && next !== "then" && !COMMAND_TRIGGERS.has(next)) {
    return null;
  }
  return { instruction: { type: "MAINTAIN_VFR" }, next: i + 2 };
}

function matchRequestDetails(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (tokens[i] === "say" && tokens[i + 1] === "request") {
    return { instruction: { type: "REQUEST_DETAILS" }, next: i + 2 };
  }
  return null;
}

function matchClassBClearanceAsRequested(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (
    tokens[i] === "cleared" &&
    tokens[i + 1] === "as" &&
    tokens[i + 2] === "requested" &&
    tokens[i + 3] === undefined
  ) {
    return { instruction: { type: "CLASS_B_CLEARANCE_AS_REQUESTED" }, next: i + 3 };
  }
  return null;
}

function matchStandby(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (tokens[i] === "stand" && tokens[i + 1] === "by") {
    return { instruction: { type: "STANDBY_REQUEST" }, next: i + 2 };
  }
  if (tokens[i] === "standby") {
    return { instruction: { type: "STANDBY_REQUEST" }, next: i + 1 };
  }
  return null;
}

function matchApproveFlightFollowing(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (tokens[i] === "approve" && tokens[i + 1] === "flight" && tokens[i + 2] === "following") {
    return { instruction: { type: "APPROVE_FLIGHT_FOLLOWING" }, next: i + 3 };
  }
  return null;
}

function matchDeclineRequest(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (tokens[i] === "unable") {
    if (tokens[i + 1] === "flight" && tokens[i + 2] === "following") {
      return {
        instruction: { type: "DECLINE_REQUEST", service: "FLIGHT_FOLLOWING" },
        next: i + 3,
      };
    }
    if (
      tokens[i + 1] === "to" &&
      tokens[i + 2] === "provide" &&
      tokens[i + 3] === "flight" &&
      tokens[i + 4] === "following"
    ) {
      return {
        instruction: { type: "DECLINE_REQUEST", service: "FLIGHT_FOLLOWING" },
        next: i + 5,
      };
    }
    if (tokens[i + 1] === "class" && tokens[i + 2] === "b" && tokens[i + 3] === "clearance") {
      return {
        instruction: { type: "DECLINE_REQUEST", service: "CLASS_B_ACCESS" },
        next: i + 4,
      };
    }
    if (
      tokens[i + 1] === "to" &&
      tokens[i + 2] === "provide" &&
      tokens[i + 3] === "class" &&
      tokens[i + 4] === "b" &&
      tokens[i + 5] === "clearance"
    ) {
      return {
        instruction: { type: "DECLINE_REQUEST", service: "CLASS_B_ACCESS" },
        next: i + 6,
      };
    }
    if (tokens[i + 1] === "ifr" && tokens[i + 2] === "pickup") {
      return {
        instruction: { type: "DECLINE_REQUEST", service: "IFR_PICKUP" },
        next: i + 3,
      };
    }
    if (
      tokens[i + 1] === "to" &&
      tokens[i + 2] === "provide" &&
      tokens[i + 3] === "ifr" &&
      tokens[i + 4] === "pickup"
    ) {
      return {
        instruction: { type: "DECLINE_REQUEST", service: "IFR_PICKUP" },
        next: i + 5,
      };
    }
  }
  return null;
}

function matchRadarServiceTerminated(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (tokens[i] === "radar" && tokens[i + 1] === "service" && tokens[i + 2] === "terminated") {
    return { instruction: { type: "TERMINATE_RADAR_SERVICE" }, next: i + 3 };
  }
  return null;
}

function matchAcknowledgeIfrCancellation(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (tokens[i] === "ifr" && tokens[i + 1] === "cancellation" && tokens[i + 2] === "received") {
    return { instruction: { type: "ACKNOWLEDGE_IFR_CANCELLATION" }, next: i + 3 };
  }
  return null;
}

function matchContact(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (tokens[i] !== "contact") return null;
  const facilityTokens: string[] = [];
  let j = i + 1;
  while (j < tokens.length && tokens[j] !== "tower" && tokens[j] !== "center") {
    facilityTokens.push(tokens[j]!);
    j += 1;
    if (facilityTokens.length > 4) return null;
  }
  const terminal = tokens[j];
  const facilityName = parseFacilityName(facilityTokens);
  if ((terminal !== "tower" && terminal !== "center") || !facilityName) return null;
  const next = j + 1;
  if (next < tokens.length && !COMMAND_TRIGGERS.has(tokens[next]!)) return null;
  return {
    instruction: {
      type: terminal === "tower" ? "CONTACT_TOWER" : "CONTACT_CENTER",
      facilityName,
    },
    next,
  };
}

function matchRadarContact(
  tokens: readonly string[],
  i: number,
  catalog: readonly CatalogFixInput[],
  airports: readonly CatalogAirport[] = [],
): { instruction: Instruction; next: number } | null {
  if (tokens[i] !== "radar" || tokens[i + 1] !== "contact") {
    return null;
  }
  const dist = parseDistanceNmValue(tokens, i + 2);
  if (!dist) {
    // Bare `radar contact`: identification with no position report.
    return { instruction: { type: "RADAR_CONTACT" }, next: i + 2 };
  }
  if (dist.value <= 0) {
    return null;
  }
  let j = dist.next;
  if (tokens[j] !== "miles" && tokens[j] !== "mile") {
    return null;
  }
  j += 1;
  // Optional direction (`25 miles southeast of KATL`, split `south east`
  // included); the stored reference is position only.
  if (tokens[j] === "north" || tokens[j] === "south") {
    j += 1;
    if (tokens[j] === "east" || tokens[j] === "west") {
      j += 1;
    }
  } else if (tokens[j] !== undefined && EIGHT_POINT_CARDINALS.has(tokens[j]!)) {
    j += 1;
  }
  if (tokens[j] !== "from" && tokens[j] !== "of") {
    return null;
  }
  j += 1;

  let end = j;
  while (end < tokens.length && !COMMAND_TRIGGERS.has(tokens[end] ?? "")) {
    end += 1;
  }
  if (end <= j) {
    return null;
  }
  const refTokens = tokens.slice(j, end);
  const rawRef = refTokens.join(" ");
  // Spoken references arrive as NATO runs (`delta echo mike`); translate to
  // the id before grounding, mirroring parseFixIdFrom. Falls through to
  // phrase grounding for catalog aliases when the run does not resolve.
  const phonetics: string[] = [];
  let phoneticEnd = j;
  while (
    phonetics.length < 5 &&
    tokens[phoneticEnd] !== undefined &&
    tokens[phoneticEnd]! in PHONETIC_TO_LETTER
  ) {
    phonetics.push(PHONETIC_TO_LETTER[tokens[phoneticEnd]!]!);
    phoneticEnd += 1;
  }
  if (phonetics.length >= 2) {
    const phoneticId = phonetics.join("");
    const phoneticGrounded = groundReferenceToCatalog(phoneticId, catalog);
    if (phoneticGrounded) {
      return {
        instruction: {
          type: "RADAR_CONTACT",
          distanceNm: dist.value,
          referenceId: phoneticGrounded.referenceId,
          referenceKind: phoneticGrounded.referenceKind,
        },
        next: phoneticEnd,
      };
    }
    const phoneticAirport = groundAirportToCatalog(phoneticId, airports);
    if (phoneticAirport) {
      return {
        instruction: {
          type: "RADAR_CONTACT",
          distanceNm: dist.value,
          referenceId: phoneticAirport,
          referenceKind: "AIRPORT",
        },
        next: phoneticEnd,
      };
    }
  }
  const grounded = groundReferenceToCatalog(rawRef, catalog);
  if (grounded) {
    return {
      instruction: {
        type: "RADAR_CONTACT",
        distanceNm: dist.value,
        referenceId: grounded.referenceId,
        referenceKind: grounded.referenceKind,
      },
      next: end,
    };
  }
  for (let k = end; k > j; k -= 1) {
    const subRef = tokens.slice(j, k).join(" ");
    const subGrounded = groundReferenceToCatalog(subRef, catalog);
    if (subGrounded) {
      return {
        instruction: {
          type: "RADAR_CONTACT",
          distanceNm: dist.value,
          referenceId: subGrounded.referenceId,
          referenceKind: subGrounded.referenceKind,
        },
        next: k,
      };
    }
  }
  // Airport names and aliases (`atlanta international airport` → KATL).
  const airportHit = groundAirportPhraseToCatalog(tokens.slice(j, end).join(" "), airports);
  if (airportHit) {
    return {
      instruction: {
        type: "RADAR_CONTACT",
        distanceNm: dist.value,
        referenceId: airportHit.icao,
        referenceKind: "AIRPORT",
      },
      next: j + airportHit.length,
    };
  }
  return null;
}

function matchTurnDegrees(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  // Case 1: "turn left 20 degrees", "turn right 20 degrees"
  if (tokens[i] === "turn" && (tokens[i + 1] === "left" || tokens[i + 1] === "right")) {
    const direction = tokens[i + 1] === "left" ? "LEFT" : "RIGHT";
    const deg = parseTurnDegreesValue(tokens, i + 2);
    if (deg && tokens[deg.next] === "degrees") {
      return {
        instruction: { type: "TURN_DEGREES", direction, degrees: deg.value },
        next: deg.next + 1,
      };
    }
  }

  // Case 2: "turn 20 degrees left", "turn 20 degrees right"
  if (tokens[i] === "turn") {
    const deg = parseTurnDegreesValue(tokens, i + 1);
    if (
      deg &&
      tokens[deg.next] === "degrees" &&
      (tokens[deg.next + 1] === "left" || tokens[deg.next + 1] === "right")
    ) {
      const direction = tokens[deg.next + 1] === "left" ? "LEFT" : "RIGHT";
      return {
        instruction: { type: "TURN_DEGREES", direction, degrees: deg.value },
        next: deg.next + 2,
      };
    }
  }

  // Case 3: "20 degrees left", "20 degrees right"
  const deg3 = parseTurnDegreesValue(tokens, i);
  if (
    deg3 &&
    tokens[deg3.next] === "degrees" &&
    (tokens[deg3.next + 1] === "left" || tokens[deg3.next + 1] === "right")
  ) {
    const direction = tokens[deg3.next + 1] === "left" ? "LEFT" : "RIGHT";
    return {
      instruction: { type: "TURN_DEGREES", direction, degrees: deg3.value },
      next: deg3.next + 2,
    };
  }

  // Case 4: "turn 30 right", "turn 20 left", "30 right", "20 left"
  let degIdx = i;
  if (tokens[i] === "turn") {
    degIdx = i + 1;
  }
  const deg4 = parseTurnDegreesValue(tokens, degIdx);
  if (deg4 && deg4.value > 0 && deg4.value <= 180) {
    const dirTok = tokens[deg4.next];
    if (dirTok === "left" || dirTok === "right") {
      const direction = dirTok === "left" ? "LEFT" : "RIGHT";
      return {
        instruction: { type: "TURN_DEGREES", direction, degrees: deg4.value },
        next: deg4.next + 1,
      };
    }
  }

  return null;
}

function matchFlyHeading(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  // Case 1: "turn left/right [to] heading <hdg>" or "turn left/right [to] <hdg>"
  if (tokens[i] === "turn" && (tokens[i + 1] === "left" || tokens[i + 1] === "right")) {
    const turn: TurnDir = tokens[i + 1] === "left" ? "LEFT" : "RIGHT";
    let j = i + 2;
    if (tokens[j] === "to") {
      j += 1;
    }
    if (tokens[j] === "heading") {
      j += 1;
    }
    const hdg = parseHeadingDeg(tokens, j);
    if (hdg) {
      return {
        instruction: { type: "FLY_HEADING", headingDeg: hdg.value, turn },
        next: hdg.next,
      };
    }
  }

  // Case 2: "fly heading <hdg>", "turn heading <hdg>", "turn to heading <hdg>", "fly to heading <hdg>"
  if (tokens[i] === "fly" || tokens[i] === "turn") {
    let j = i + 1;
    if (tokens[j] === "to") {
      j += 1;
    }
    if (tokens[j] === "heading") {
      j += 1;
      const hdg = parseHeadingDeg(tokens, j);
      if (hdg) {
        return {
          instruction: { type: "FLY_HEADING", headingDeg: hdg.value, turn: "SHORTEST" },
          next: hdg.next,
        };
      }
    }
  }

  // Case 3: "heading <hdg>"
  if (tokens[i] === "heading") {
    const hdg = parseHeadingDeg(tokens, i + 1);
    if (hdg) {
      return {
        instruction: { type: "FLY_HEADING", headingDeg: hdg.value, turn: "SHORTEST" },
        next: hdg.next,
      };
    }
  }

  return null;
}

function matchAltitude(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  let j = i;
  let expediteBefore = false;
  if (tokens[j] === "expedite") {
    expediteBefore = true;
    j += 1;
  } else if (tokens[j] === "without" && tokens[j + 1] === "delay") {
    expediteBefore = true;
    j += 2;
  }

  let verb: "CLIMB" | "DESCEND" | "MAINTAIN" | null = null;
  if (tokens[j] === "climb") {
    verb = "CLIMB";
    j += 1;
  } else if (tokens[j] === "descend") {
    verb = "DESCEND";
    j += 1;
  } else if (tokens[j] === "maintain" || tokens[j] === "altitude") {
    verb = "MAINTAIN";
    j += 1;
  } else {
    return null;
  }

  if (tokens[j] === "to") {
    j += 1;
  }
  if (tokens[j] === "and" && tokens[j + 1] === "maintain") {
    j += 2;
  }
  if (tokens[j] === "altitude") {
    j += 1;
  }

  let altitudeFt: number | null = null;
  const fl = parseFlightLevel(tokens, j);
  if (fl) {
    altitudeFt = fl.value;
    j = fl.next;
  } else {
    const alt = parseAltitudeFt(tokens, j);
    if (!alt) {
      return null;
    }
    altitudeFt = alt.value;
    j = alt.next;
  }

  let untilEstablished = false;
  let expediteAfter = false;

  let changed = true;
  while (changed) {
    changed = false;
    if (tokens[j] === "until" && tokens[j + 1] === "established") {
      untilEstablished = true;
      j += 2;
      if (tokens[j] === "on" && tokens[j + 1] === "the" && tokens[j + 2] === "localizer") {
        j += 3;
      }
      changed = true;
    }
    if (tokens[j] === "expedite") {
      expediteAfter = true;
      j += 1;
      changed = true;
    } else if (tokens[j] === "without" && tokens[j + 1] === "delay") {
      expediteAfter = true;
      j += 2;
      changed = true;
    }
  }

  const inst: Instruction = {
    type: "ALTITUDE",
    altitudeFt,
    verb,
    ...(expediteBefore || expediteAfter ? { expedite: true } : {}),
    ...(untilEstablished ? { untilEstablished: true } : {}),
  };
  return { instruction: inst, next: j };
}

function matchDeleteSpeedRestrictions(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (tokens[i] === "delete" && tokens[i + 1] === "speed") {
    if (tokens[i + 2] === "restrictions" || tokens[i + 2] === "restriction") {
      return {
        instruction: { type: "DELETE_SPEED_RESTRICTIONS" },
        next: i + 3,
      };
    }
  }
  return null;
}

function matchSpeedUntil(
  tokens: readonly string[],
  i: number,
  catalog: readonly CatalogFixInput[],
): { until: SpeedUntil; next: number } | null {
  if (tokens[i] !== "until") {
    return null;
  }
  let j = i + 1;
  if (tokens[j] === "the") {
    j += 1;
  }

  // 1. Final approach fix / FAF
  if (tokens[j] === "final" && tokens[j + 1] === "approach" && tokens[j + 2] === "fix") {
    return { until: { type: "FAF" }, next: j + 3 };
  }
  if (tokens[j] === "faf") {
    return { until: { type: "FAF" }, next: j + 1 };
  }

  // 2. <n> DME / <n> miles
  const dist = parseTurnDegreesValue(tokens, j);
  if (dist !== null && dist.value >= 0) {
    const nextWord = tokens[dist.next];
    if (nextWord === "dme") {
      return { until: { type: "DME", distanceNm: dist.value }, next: dist.next + 1 };
    }
    if (
      nextWord === "miles" ||
      nextWord === "mile" ||
      nextWord === "nm" ||
      nextWord === "nautical"
    ) {
      let nextIdx = dist.next + 1;
      if (nextWord === "nautical" && (tokens[nextIdx] === "miles" || tokens[nextIdx] === "mile")) {
        nextIdx += 1;
      }
      if (tokens[nextIdx] === "dme") {
        nextIdx += 1;
      }
      return { until: { type: "DME", distanceNm: dist.value }, next: nextIdx };
    }
  }

  // 3. <fix>
  const fix = parseFixIdFrom(tokens, j, catalog);
  if (fix !== null) {
    return { until: { type: "FIX", fixId: fix.fixId }, next: fix.next };
  }

  return null;
}

function matchSpeed(
  tokens: readonly string[],
  i: number,
  catalog: readonly CatalogFixInput[],
): { instruction: Instruction; next: number } | null {
  // Case 1: reduce / slow
  if (tokens[i] === "reduce" || tokens[i] === "slow") {
    let j = i + 1;
    if (tokens[j] === "speed") {
      j += 1;
    }
    if (tokens[j] === "to" || tokens[j] === "two") {
      const checkSpd = parseSpeedKt(tokens, j + 1);
      if (checkSpd) {
        j += 1;
      } else if (tokens[j] === "to") {
        j += 1;
      }
    }
    const spd = parseSpeedKt(tokens, j);
    if (spd) {
      j = spd.next;
      if (tokens[j] === "knots") {
        j += 1;
      }
      const untilMatch = matchSpeedUntil(tokens, j, catalog);
      if (untilMatch) {
        return {
          instruction: {
            type: "SPEED",
            speedKt: spd.value,
            verb: "REDUCE",
            until: untilMatch.until,
          },
          next: untilMatch.next,
        };
      }
      return {
        instruction: { type: "SPEED", speedKt: spd.value, verb: "REDUCE" },
        next: j,
      };
    }
  }

  // Case 2: increase
  if (tokens[i] === "increase") {
    let j = i + 1;
    if (tokens[j] === "speed") {
      j += 1;
    }
    if (tokens[j] === "to" || tokens[j] === "two") {
      const checkSpd = parseSpeedKt(tokens, j + 1);
      if (checkSpd) {
        j += 1;
      } else if (tokens[j] === "to") {
        j += 1;
      }
    }
    const spd = parseSpeedKt(tokens, j);
    if (spd) {
      j = spd.next;
      if (tokens[j] === "knots") {
        j += 1;
      }
      const untilMatch = matchSpeedUntil(tokens, j, catalog);
      if (untilMatch) {
        return {
          instruction: {
            type: "SPEED",
            speedKt: spd.value,
            verb: "INCREASE",
            until: untilMatch.until,
          },
          next: untilMatch.next,
        };
      }
      return {
        instruction: { type: "SPEED", speedKt: spd.value, verb: "INCREASE" },
        next: j,
      };
    }
  }

  // Case 3: maintain speed <spd> [knots], maintain <spd> knots
  if (tokens[i] === "maintain") {
    let j = i + 1;
    const hasSpeedWord = tokens[j] === "speed";
    if (hasSpeedWord) {
      j += 1;
    }
    const spd = parseSpeedKt(tokens, j);
    if (spd) {
      const hasKnots = tokens[spd.next] === "knots";
      if (hasKnots || hasSpeedWord) {
        const nextIdx = hasKnots ? spd.next + 1 : spd.next;
        const untilMatch = matchSpeedUntil(tokens, nextIdx, catalog);
        if (untilMatch) {
          return {
            instruction: {
              type: "SPEED",
              speedKt: spd.value,
              verb: "MAINTAIN",
              until: untilMatch.until,
            },
            next: untilMatch.next,
          };
        }
        return {
          instruction: { type: "SPEED", speedKt: spd.value, verb: "MAINTAIN" },
          next: nextIdx,
        };
      }
    }
  }

  // Case 4: speed <spd> [knots]
  if (tokens[i] === "speed") {
    let j = i + 1;
    if (tokens[j] === "to" || tokens[j] === "two") {
      const checkSpd = parseSpeedKt(tokens, j + 1);
      if (checkSpd) {
        j += 1;
      } else if (tokens[j] === "to") {
        j += 1;
      }
    }
    const spd = parseSpeedKt(tokens, j);
    if (spd) {
      j = spd.next;
      if (tokens[j] === "knots") {
        j += 1;
      }
      const untilMatch = matchSpeedUntil(tokens, j, catalog);
      if (untilMatch) {
        return {
          instruction: {
            type: "SPEED",
            speedKt: spd.value,
            verb: "MAINTAIN",
            until: untilMatch.until,
          },
          next: untilMatch.next,
        };
      }
      return {
        instruction: { type: "SPEED", speedKt: spd.value, verb: "MAINTAIN" },
        next: j,
      };
    }
  }

  return null;
}

function matchIdent(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (tokens[i] === "squawk" && (tokens[i + 1] === "ident" || tokens[i + 1] === "iden")) {
    return { instruction: { type: "IDENT" }, next: i + 2 };
  }
  if (tokens[i] === "ident" || tokens[i] === "iden") {
    return { instruction: { type: "IDENT" }, next: i + 1 };
  }
  return null;
}

function matchSquawk(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (tokens[i] !== "squawk") {
    return null;
  }
  if (tokens[i + 1] === "vfr") {
    return {
      instruction: { type: "ASSIGN_SQUAWK", code: "1200", source: "VFR" },
      next: i + 2,
    };
  }
  const digits: number[] = [];
  for (let offset = 1; offset <= 4; offset += 1) {
    const digit = squawkDigit(tokens[i + offset]);
    if (digit === null) {
      return null;
    }
    digits.push(digit);
  }
  return {
    instruction: { type: "ASSIGN_SQUAWK", code: digits.join(""), source: "DISCRETE" },
    next: i + 5,
  };
}

function matchSay(
  tokens: readonly string[],
  i: number,
): { instruction: Instruction; next: number } | null {
  if (tokens[i] === "say") {
    if (tokens[i + 1] === "heading") {
      return { instruction: { type: "SAY_HEADING" }, next: i + 2 };
    }
    if (tokens[i + 1] === "altitude") {
      return { instruction: { type: "SAY_ALTITUDE" }, next: i + 2 };
    }
  }
  return null;
}

export function matchSpokenPatterns(
  normalized: string,
  selectedCallsign: string | null | undefined,
  sourceText: string,
  catalogFixes?: readonly CatalogFixInput[],
  catalogProcedures?: readonly CatalogProcedure[],
  catalogApproaches?: readonly CatalogApproach[],
  clearanceLimitIds?: ReadonlySet<string>,
  catalogAirports?: readonly CatalogAirport[],
): ParseResult {
  const tokens = normalized.split(" ").filter((tok) => tok.length > 0);
  if (tokens.length === 0) {
    return { ok: false, error: formatParseError(PARSE_ERROR.EMPTY), sourceText };
  }

  const catalog = catalogFixes ?? [];
  const procedures = catalogProcedures ?? [];
  const approaches = catalogApproaches ?? [];
  const airports = catalogAirports ?? [];

  const claimed = new Array(tokens.length).fill(false);
  const collectedInstructions: Array<{ start: number; instruction: Instruction }> = [];
  let foundCallsign: string | null = null;
  let unknownTelephonyWord: string | null = null;

  for (let i = 0; i < tokens.length; i += 1) {
    if (claimed[i]) {
      continue;
    }

    // Try instructions first
    const match =
      matchCross(tokens, i, catalog) ??
      matchClassBClearance(tokens, i, catalog) ??
      matchRemainOutsideBravo(tokens, i) ??
      matchResumeAppropriateVfrAltitudes(tokens, i) ??
      matchClearedApproach(tokens, i, approaches) ??
      matchExpectApproach(tokens, i, approaches) ??
      matchInterceptLocalizer(tokens, i, approaches) ??
      matchCancelApproach(tokens, i) ??
      matchGoAround(tokens, i) ??
      matchVia(tokens, i, procedures) ??
      matchJoinProcedure(tokens, i, procedures) ??
      matchIfrClearance(tokens, i, catalog, procedures, clearanceLimitIds) ??
      matchDirect(tokens, i, catalog) ??
      matchPresentHeading(tokens, i) ??
      matchMaintainVfr(tokens, i) ??
      matchRequestDetails(tokens, i) ??
      matchClassBClearanceAsRequested(tokens, i) ??
      matchStandby(tokens, i) ??
      matchApproveFlightFollowing(tokens, i) ??
      matchDeclineRequest(tokens, i) ??
      matchRadarServiceTerminated(tokens, i) ??
      matchAcknowledgeIfrCancellation(tokens, i) ??
      matchContact(tokens, i) ??
      matchRadarContact(tokens, i, catalog, airports) ??
      matchTurnDegrees(tokens, i) ??
      matchFlyHeading(tokens, i) ??
      matchAltitude(tokens, i) ??
      matchSpeed(tokens, i, catalog) ??
      matchDeleteSpeedRestrictions(tokens, i) ??
      matchSquawk(tokens, i) ??
      matchIdent(tokens, i) ??
      matchSay(tokens, i);

    if (match) {
      let canClaim = true;
      for (let k = i; k < match.next; k += 1) {
        if (claimed[k]) {
          canClaim = false;
          break;
        }
      }
      if (canClaim) {
        for (let k = i; k < match.next; k += 1) {
          claimed[k] = true;
        }
        collectedInstructions.push({ start: i, instruction: match.instruction });
        i = match.next - 1;
        continue;
      }
    }

    // Try callsign if no instruction matched at i
    const cs = parseSpokenCallsign(tokens, i);
    if (cs.kind === "ok") {
      let canClaim = true;
      for (let k = i; k < cs.next; k += 1) {
        if (claimed[k]) {
          canClaim = false;
          break;
        }
      }
      if (canClaim) {
        for (let k = i; k < cs.next; k += 1) {
          claimed[k] = true;
        }
        if (!foundCallsign) {
          foundCallsign = cs.callsign;
        }
        i = cs.next - 1;
        continue;
      }
    } else if (cs.kind === "unknown_telephony") {
      if (!unknownTelephonyWord) {
        unknownTelephonyWord = cs.word;
      }
    }
  }

  // If there are unconsumed command triggers, a command in the utterance failed to parse
  let hasUnparsedCommandTrigger = false;
  for (let i = 0; i < tokens.length; i += 1) {
    if (
      !claimed[i] &&
      (COMMAND_TRIGGERS.has(tokens[i]!) ||
        /^[hlrcdas]\d+$/i.test(tokens[i]!) ||
        /^t\d+[lr]?$/i.test(tokens[i]!))
    ) {
      hasUnparsedCommandTrigger = true;
      break;
    }
  }

  if (unknownTelephonyWord) {
    return {
      ok: false,
      error: formatParseError(PARSE_ERROR.UNKNOWN_TELEPHONY, unknownTelephonyWord),
      sourceText,
    };
  }

  if (hasUnparsedCommandTrigger || collectedInstructions.length === 0) {
    return { ok: false, error: formatParseError(PARSE_ERROR.PARSE_MISS), sourceText };
  }

  collectedInstructions.sort((a, b) => a.start - b.start);
  const instructions = collectedInstructions.map((item) => item.instruction);
  if (instructions.some(isClassBInstruction) && instructions.length !== 1) {
    return {
      ok: false,
      error: formatParseError(PARSE_ERROR.BAD_CLEARANCE),
      sourceText,
    };
  }
  if (instructions.some(isRequestControlInstruction) && instructions.length !== 1) {
    return {
      ok: false,
      error: formatParseError(
        PARSE_ERROR.BAD_CLEARANCE,
        "request instruction must be the only instruction",
      ),
      sourceText,
    };
  }
  const cancellationError = cancelApproachSequenceError(instructions);
  if (cancellationError !== null) {
    return {
      ok: false,
      error: formatParseError(PARSE_ERROR.BAD_CLEARANCE, cancellationError),
      sourceText,
    };
  }
  const callsignToken = foundCallsign ?? selectedCallsign ?? null;

  return {
    ok: true,
    callsignToken,
    instructions,
    sourceText,
  };
}
