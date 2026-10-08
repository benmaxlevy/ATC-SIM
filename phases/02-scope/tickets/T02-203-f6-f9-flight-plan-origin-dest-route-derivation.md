# T02-203 F6 and F9 Flight Plan Origin, Destination, and Route Derivation

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-168, T02-170  
**Blocks:** None  
**Merge target:** `feature/sattelite-traffic`  
**Launch:** Implement this ticket only.

## Mission

Populate flight plan origin (`departureAirport`), destination (`airportId`), and intermediate filed route (`route`) when creating or modifying flight plans via `<F6>` (FLT DATA) and `<F9>` (VFR DATA). Derive the fields from the asterisk-delimited fix token (`[origin]*[fixes...]*[dest]`) so that `<F7>FP <ACID>` (`*FP`) modal displays Origin, Destination, and Filed Route accurately.

## Research

- **FAA STARS Manual (TI 6191.409 §5.5.5, §5.5.7, Table 5-7):**
  Flight-data creation accepts route and fix strings formatted with delimiter asterisks (`<F7>` key).
- **ATC-SIM Trainer Architecture:**
  - `<F7>` inserts an asterisk (`*`) into the preview area buffer.
  - In `<F6> <ACID> [fields]` and `<F9> <ACID> [route] [fields]`, route tokens use asterisks.
  - `FlightPlan` holds `departureAirport` (Origin), `airportId` (Destination), and `route` / `filedRoute` (Filed route).
  - `<F7>FP <ACID>` (`*FP`) opens `FlightPlanModal`, reading `plan.departureAirport`, `plan.airportId`, and `plan.filedRoute.text ?? plan.route`.

Trainer delta: Simplified derivation rule:
- First item is origin (`departureAirport`). If empty (e.g. `*KPIM`), origin is undefined.
- Last item is destination (`airportId`).
- Any intermediate items between first and last are joined with space into `route`.
- Supports arbitrary multi-element asterisk chains (e.g. `KLZU*AJAAY*PDK*KPIM`).

## Scope

### 1. Fix/Route Grammar & Derivation (`src/scope/previewParse.ts`)

- Update regex for route/fix tokens in both `parseFlightPlanCreation` (F6) and `parseVfrFlightPlanCommand` (F9) to support multi-fix chains:
  - Pattern: `^(?:[A-Z0-9]{1,4})?(?:\*[A-Z0-9]{1,4})+$`
- Implement helper function `deriveOriginDestRoute(token: string)`:
  - Splits on `*`.
  - First element (if non-empty) -> `departureAirport`.
  - Last element (if non-empty) -> `airportId`.
  - Intermediate elements -> joined by `" "` -> `route` (if non-empty).
  - Raw token still stored in `fixes` for backwards compatibility.
- Add `departureAirport?: string` and `route?: string` to `PreviewArmedAction`'s `createFlightPlan` type.
- Set `fields.departureAirport`, `fields.airportId`, and `fields.route` in both F6 and F9 parsers.

### 2. Flight Plan Creation & Modification (`src/scope/scopeKeys.ts`)

- In `applyPreviewArmedAction` (`case "createFlightPlan"`):
  - Pass `departureAirport: action.departureAirport`, `airportId: action.airportId`, and `route: action.route` to `createFlightPlan`.
  - On existing VFR flight plan modification, support editing `departureAirport`, `airportId`, and `route`.

### 3. Flight Plan Modal Sync

- Verify `<F7>FP <ACID>` (`*FP <ACID>`) renders Origin (`departureAirport`), Destination (`airportId`), and Filed route (`route`).

## Acceptance Contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `<F9> N123 KLZU*KPIM Enter` | Creates VFR plan with origin KLZU and dest KPIM | `departureAirport: "KLZU"`, `airportId: "KPIM"`, `route: undefined` | Malformed route -> `ILL ROUTE` | Table 5-7 |
| `<F6> N123 KLZU*KPIM 250 B738 Enter` | Creates IFR plan with origin KLZU and dest KPIM | `departureAirport: "KLZU"`, `airportId: "KPIM"`, `route: undefined` | Malformed fix -> `FORMAT` | Table 5-7 |
| `<F9> N123 KLZU*AJAAY*PDK*KPIM Enter` | Creates VFR plan with origin KLZU, dest KPIM, route AJAAY PDK | `departureAirport: "KLZU"`, `airportId: "KPIM"`, `route: "AJAAY PDK"` | Invalid tokens -> `ILL ROUTE` | Table 5-7 |
| `<F6> N123 *KPIM Enter` | Creates IFR plan with dest KPIM, omitted origin | `departureAirport: undefined`, `airportId: "KPIM"`, `route: undefined` | Missing dest -> `FORMAT` | Table 5-7 |
| `*FP N123 Enter` | Opens FlightPlanModal | Modal displays Origin, Destination, and Filed Route accurately | ACID not found -> `ILL ACID` | §5.5.5 |

## Tests

- Add unit tests in `src/scope/test/flightPlanCreation.test.ts` for F6 origin, destination, and intermediate route extraction.
- Add unit tests in `src/scope/test/vfrFlightPlanCommands.integration.test.ts` for F9 origin, destination, and multi-fix route extraction.
- Verify full `npm run ci`.
