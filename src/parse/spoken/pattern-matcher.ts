/**
 * Isolated pattern / slot matcher (island parsing) for spoken ATC commands.
 * Searches token spans for independent commands (callsign, heading/turn,
 * altitude, speed, direct, procedure, approach, etc.), tracks claimed token
 * spans to avoid collisions/double-counting, and returns instructions in
 * transmission order.
 */

import type { Instruction, TurnDir } from "@core";
import type { ParseResult } from "../parseRadioText";
import { formatParseError, PARSE_ERROR } from "../tokens";
import {
  parseAltitudeFt,
  parseHeadingDeg,
  parseSpeedKt,
  parseTurnDegreesValue,
  singleDigit,
} from "./numbers";
import {
  groundApproachToCatalog,
  groundFixToCatalog,
  groundProcedureToCatalog,
  type CatalogApproach,
  type CatalogProcedure,
} from "./catalog-ground";
import {
  parseSpokenCallsign,
  PHONETIC_TO_LETTER,
  RESERVED_SPOKEN,
} from "./telephony";

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
  "intercept",
  "cross",
  "heading",
  "speed",
  "squawk",
  "ident",
  "iden",
  "say",
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
  catalog: readonly string[],
): { fixId: string; next: number } | null {
  let j = i;
  const phonetics: string[] = [];
  while (phonetics.length < 5 && tokens[j] !== undefined && tokens[j]! in PHONETIC_TO_LETTER) {
    phonetics.push(PHONETIC_TO_LETTER[tokens[j]!]!);
    j += 1;
  }
  if (phonetics.length >= 2) {
    const id = phonetics.join("");
    return { fixId: groundFixToCatalog(id, catalog) ?? id, next: j };
  }

  for (let n = Math.min(3, tokens.length - i); n >= 1; n -= 1) {
    const slice = tokens.slice(i, i + n).join("");
    const hit = groundFixToCatalog(slice, catalog);
    if (hit) {
      return { fixId: hit, next: i + n };
    }
  }

  const tok = tokens[i];
  if (tok !== undefined && !RESERVED_SPOKEN.has(tok)) {
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
  catalog: readonly string[],
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

function matchClearedApproach(
  tokens: readonly string[],
  i: number,
  approaches: readonly CatalogApproach[],
): { instruction: Instruction; next: number } | null {
  if (tokens[i] !== "cleared") {
    return null;
  }
  let j = i + 1;
  if (tokens[j] === "for" && tokens[j + 1] === "the") {
    j += 2;
  } else if (tokens[j] === "for" || tokens[j] === "to") {
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

  return {
    instruction: isClimb
      ? { type: "CLIMB_VIA", procedureId: proc.id }
      : { type: "DESCEND_VIA", procedureId: proc.id },
    next: j,
  };
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

  return {
    instruction: { type: "JOIN_PROCEDURE", procedureId: proc.id },
    next: j,
  };
}

function matchDirect(
  tokens: readonly string[],
  i: number,
  catalog: readonly string[],
): { instruction: Instruction; next: number } | null {
  let j = i;
  if (
    (tokens[j] === "proceed" || tokens[j] === "cleared") &&
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

function matchSpeed(
  tokens: readonly string[],
  i: number,
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
        return {
          instruction: { type: "SPEED", speedKt: spd.value, verb: "MAINTAIN" },
          next: hasKnots ? spd.next + 1 : spd.next,
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
  catalogFixes?: readonly string[],
  catalogProcedures?: readonly CatalogProcedure[],
  catalogApproaches?: readonly CatalogApproach[],
): ParseResult {
  const tokens = normalized.split(" ").filter((tok) => tok.length > 0);
  if (tokens.length === 0) {
    return { ok: false, error: formatParseError(PARSE_ERROR.EMPTY), sourceText };
  }

  const catalog = catalogFixes ?? [];
  const procedures = catalogProcedures ?? [];
  const approaches = catalogApproaches ?? [];

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
      matchClearedApproach(tokens, i, approaches) ??
      matchExpectApproach(tokens, i, approaches) ??
      matchInterceptLocalizer(tokens, i, approaches) ??
      matchGoAround(tokens, i) ??
      matchVia(tokens, i, procedures) ??
      matchJoinProcedure(tokens, i, procedures) ??
      matchDirect(tokens, i, catalog) ??
      matchPresentHeading(tokens, i) ??
      matchTurnDegrees(tokens, i) ??
      matchFlyHeading(tokens, i) ??
      matchAltitude(tokens, i) ??
      matchSpeed(tokens, i) ??
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
    if (!claimed[i] && COMMAND_TRIGGERS.has(tokens[i]!)) {
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
  const callsignToken = foundCallsign ?? selectedCallsign ?? null;

  return {
    ok: true,
    callsignToken,
    instructions,
    sourceText,
  };
}
