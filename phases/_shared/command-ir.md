# Command IR (v0)

Frozen for phases 0–3. Phase 4 may add instruction types; it must not rename these.

**Research:** Typed tokens are vice-inspired (**R08** in `references.md`). Spoken forms and readbacks follow FAA JO 7110.65 (**R01**), not ICAO Doc 4444 (**R10**).

Voice and text **compile** to `Command`. The pilot agent is the only module allowed to change aircraft intent from a `Command`. The scope never calls kinematics directly.

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
| `APP ILS27` | `CLEARED_APPROACH` (phase 1 may accept and no-op fly-through) |

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

Until then, `CLEARED_APPROACH` / `EXPECT_APPROACH` / `DIRECT` exist in the union but phase 1 may no-op their kinematics.

## Events

Every accepted or rejected command emits `command.accepted` or `command.rejected` on the session event log (see phase 0 logging ticket). Payload includes `Command` plus reject reason.
