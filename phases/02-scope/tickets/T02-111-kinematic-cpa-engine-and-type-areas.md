# T02-111: Kinematic CPA Detection Engine & 4-Tier Airspace Type Area Standards

**Phase:** 02 Scope — Conflict Alert (CA) STARS Alignment  
**Priority:** P0  
**Size:** M  
**Depends on:** None  
**Blocks:** T02-112, T02-113, T02-114, T02-115  

## Goal

Replace the instantaneous 0-second Euclidean distance check in `src/core/alerts/conflictAlert.ts` with an authentic STARS kinematic Closest Point of Approach (CPA) prediction engine and 4-tier Airspace Type Area classification per Raytheon STARS manual (TI 6191.409 Section 2.16.3).

## Research & Standards

Per TI 6191.409 Section 2.16.3 (Airspace Type Areas & Alert Volume Parameters):
- Area Type 1 (Runway Corridor): $\pm 0.5\text{ NM}$ centerline, runway surface to $100\text{ ft}$. $D_{\text{sep}} = 0.5\text{ NM}$, $H_{\text{sep}} = 100\text{ ft}$, $T_{\text{look}} = 15\text{ s}$.
- Area Type 2 (Runway Capture Box / Final Approach): Final approach corridor within $6\text{ NM}$, $< 2500\text{ ft}$. $D_{\text{sep}} = 2.5\text{ NM}$, $H_{\text{sep}} = 500\text{ ft}$, $T_{\text{look}} = 25\text{ s}$.
- Area Type 3 (Core Terminal): $\le 12\text{ NM}$ from primary airport / radar. $D_{\text{sep}} = 3.0\text{ NM}$, $H_{\text{sep}} = 1000\text{ ft}$, $T_{\text{look}} = 35\text{ s}$.
- Area Type 4 (Outer Terminal): $> 12\text{ NM}$ to facility boundary. $D_{\text{sep}} = 3.0\text{ NM}$, $H_{\text{sep}} = 1000\text{ ft}$, $T_{\text{look}} = 45\text{ s}$.

For any pair of aircraft $(A, B)$, the minimum area tier between them governs the separation criteria:
$$\text{Tier}(A, B) = \min(\text{Tier}(A), \text{Tier}(B))$$

Kinematic CPA Calculation:
$$\Delta \mathbf{r} = \mathbf{r}_B - \mathbf{r}_A, \quad \Delta \mathbf{v} = \mathbf{v}_B - \mathbf{v}_A$$
$$t_{\text{CPA}} = -\frac{\Delta \mathbf{r} \cdot \Delta \mathbf{v}}{\|\Delta \mathbf{v}\|^2}$$
An alert is declared if:
1. Currently violating: $\|\Delta \mathbf{r}\| < D_{\text{sep}}$ and $|\Delta z| < H_{\text{sep}}$, OR
2. Approaching violation: $0 < t_{\text{CPA}} \le T_{\text{look}}$, horizontal separation at $t_{\text{CPA}} < D_{\text{sep}}$, and predicted vertical separation at $t_{\text{CPA}} < H_{\text{sep}}$ (extrapolating vertical rate $\dot{z}$ or assuming level if steady). Diverging tracks ($t_{\text{CPA}} \le 0$) do not trigger predictive alerts.

## Scope

- Create pure functions in `src/core/alerts/conflictAlert.ts` for:
  - Airspace area classification based on track positions relative to airport runways and facility origin.
  - Linear horizontal and vertical CPA projection.
  - Pair conflict detection returning alert records including conflict type, current distance, time to CPA, and minimum separation distance.
- Ensure generic data-driven geometry: consume runway coordinates and airport reference points from scenario/catalog data without hardcoded airport branches.

## Non-goals

- Supervisor commands (`CA A`, `CA M`, etc.).
- Mode C unverified / pilot-reported altitude suppression exclusions.
- Display or audio painting (handled in subsequent tickets).

## Acceptance Criteria

- [ ] Evaluates tracks into Type 1, 2, 3, or 4 based on 3D geometry relative to runway corridors and airport reference point.
- [ ] Uses pair-minimum tier parameters for $D_{\text{sep}}$, $H_{\text{sep}}$, and $T_{\text{look}}$.
- [ ] Accurately detects converging tracks penetrating protected volumes within $T_{\text{look}}$ seconds.
- [ ] Correctly ignores diverging tracks even when close, provided separation is increasing and boundaries are not currently breached.
- [ ] Detects active violations immediately ($t_{\text{CPA}} = 0$).
- [ ] Comprehensive unit tests cover all 4 tiers, converging vs diverging vectors, and vertical climbing/descending profiles.

## Files

- `src/core/alerts/conflictAlert.ts`
- `src/core/alerts/test/conflictAlert.test.ts`
