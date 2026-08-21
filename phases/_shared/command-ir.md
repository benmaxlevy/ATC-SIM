# Command IR (v0)

Frozen for phases 0–3. Phase 4 may add instruction types; it must not rename these.

**Research:** Typed tokens are vice-inspired (**R08** in `references.md`). Spoken forms and readbacks follow FAA JO 7110.65 (**R01**), not ICAO Doc 4444 (**R10**).

Voice and text **compile** to `Command` through the **same** stage list (`phases/_shared/parse-pipeline.md`). The pilot agent is the only module allowed to change aircraft intent from a `Command`. The scope never calls kinematics directly. `source` is the channel (keyboard vs PTT). `parseStage` is which compiler won.

## Types

```ts
/** One radio transmission. May contain several instructions. */
export interface Command {
  id: string;
  issuedAtSimMs: number;
  /** Resolved after callsign matching. */
  callsign: string;
  instructions: Instruction[];
  /** Raw text after ASR or the typed line, for logs and scoring. */
  sourceText: string;
  source: "text" | "voice";
  /**
   * Which parse stage produced `instructions` (phase 3+).
   * Omit only on pre-phase-3 fixtures.
   */
  parseStage?: "typed" | "spoken_a" | "spoken_b" | "llm_c";
}

export type TurnDir = "LEFT" | "RIGHT" | "SHORTEST";

export type Instruction =
  | { type: "FLY_HEADING"; headingDeg: number; turn: TurnDir }
  | { type: "TURN_DEGREES"; direction: "LEFT" | "RIGHT"; degrees: number }
  | { type: "PRESENT_HEADING" }
  | {
      type: "ALTITUDE";
      altitudeFt: number;
      verb: "CLIMB" | "DESCEND" | "MAINTAIN";
      expedite?: boolean;
      /**
       * Phase 4 ILS: hold this altitude until established on the localizer
       * (7110.65 “maintain (alt) until established”). Omit before T04-05.
       */
      untilEstablished?: boolean;
    }
  | {
      type: "SPEED";
      speedKt: number;
      verb: "MAINTAIN" | "INCREASE" | "REDUCE";
    }
  | { type: "DIRECT"; fixId: string }
  | { type: "EXPECT_APPROACH"; approachId: string }
  | { type: "CLEARED_APPROACH"; approachId: string }
  | { type: "IDENT" }
  | { type: "SAY_HEADING" }
  | { type: "SAY_ALTITUDE" };
```

## Parser rules (text, phase 1)

Phase 1 implements **stage 1 only** (`parseRadioText`). Phase 3 `parseCommand` runs normalize → typed → Path A → Path B → optional Path C for **both** channels. Typed English in the command line is a tokenizer miss then Path A (`parseStage: "spoken_a"`, `source: "text"`). Do not teach this token table spoken English.

Typed commands are **vice-inspired, not vice-compatible**. Document every token in phase 1 tickets.

Suggested v1 tokens (callsign optional if a track is selected):

| Typed | IR |
| --- | --- |
| `H270` or `H 270` | `FLY_HEADING 270 SHORTEST` |
| `L090` | `FLY_HEADING 90 LEFT` |
| `R180` | `FLY_HEADING 180 RIGHT` |
| `T20L` | `TURN_DEGREES LEFT 20` |
| `C30` / `D30` / `A30` | climb / descend / maintain 3000 ft |
| `S210` | `SPEED MAINTAIN 210` |
| `PH` | `PRESENT_HEADING` |
| `I` | `IDENT` |
| `APP ILS27` | `CLEARED_APPROACH` (phase 1 may accept and no-op fly-through; phase 4 fly-through) |
| `R240 A20 APP ILS27` | `FLY_HEADING 240 RIGHT` + `ALTITUDE MAINTAIN 2000 untilEstablished` + `CLEARED_APPROACH ILS27` (phase 4; same-line heading+alt+APP) |

Callsign: full (`DAL123`) or unambiguous suffix (`123`). Ambiguous suffix → reject, no aircraft moves.

## Validation (pilot agent)

Reject (no intent change, error readback) when:

- Callsign unknown or ambiguous.
- Heading not in `[0, 360)`.
- Altitude not a multiple of 100 ft, or outside `[1000, 18000]` for v1.
- Speed outside `[150, 280]` KIAS for v1 jets (tune per type later).
- Empty instruction list.

`SAY_*` and `IDENT` do not change intent; they only produce a readback / flash.

## Readback templates (phase 1)

Deterministic. Example:

- `FLY_HEADING 270 SHORTEST` → `{callsign} heading two seven zero`
- `ALTITUDE DESCEND 3000` → `{callsign} descend and maintain three thousand`
- Combined: join with comma, callsign once at the start.
- Phase 4 ILS (7110.65 vector to final): `{callsign} turn right heading two four zero, maintain two thousand until established, cleared i l s runway two seven approach`

Use FAA digit grouping (eleven, twelve, … thousand). Spell callsign as airline telephony if mapped, else char-by-char.

## Reserved additions (phase 4 only)

Do **not** implement these before `phases/04-procedures/tickets/T04-04-descend-climb-via-crossing-alts.md`. That ticket must patch this file in the same PR if it adds types.

```ts
| { type: "DESCEND_VIA"; procedureId: string }
| { type: "CLIMB_VIA"; procedureId: string }
| {
    type: "CROSS";
    fixId: string;
    altitudeFt: number;
    restriction: "AT" | "AT_OR_ABOVE" | "AT_OR_BELOW";
  }
| { type: "GO_AROUND" } // optional; T04-07
```

**ILS combined clearance (phase 4 — T04-05 patches Path A + readback in the same PR):** one `Command` with three instructions, in this order:

1. `FLY_HEADING` (turn left/right as spoken)
2. `ALTITUDE` `MAINTAIN` (or climb/descend and maintain) with `untilEstablished: true`
3. `CLEARED_APPROACH` `{ approachId: "ILS27" }`

Spoken (Path A must accept both runway wordings):

> turn right heading two four zero maintain two thousand until established cleared ils approach runway two seven

> turn right heading two four zero maintain two thousand until established on the localizer cleared ils runway two seven approach

Aircraft (must match the words): fly the heading, **hold assigned altitude until `nav.loc.captured` (established)**, then intercept GS from below (T04-06). `APP ILS27` alone still arms intercept from the current heading and holds the **already assigned** altitude until established.

Until T04-04/T04-05, `CLEARED_APPROACH` / `EXPECT_APPROACH` / `DIRECT` exist in the union but phase 1 may no-op their kinematics.

## Events

Every accepted or rejected command emits `command.accepted` or `command.rejected` on the session event log (see phase 0 logging ticket). Payload includes `Command` plus reject reason.
