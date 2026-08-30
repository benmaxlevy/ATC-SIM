# T04-41 Videomap rendering and performance acceptance

**Goal:** Render converted CRC geometry safely and measure full-pack behavior
before adding optimization.

## Acceptance criteria

- [ ] Line, polygon-outline, and converted text geometry render with existing canvas paths.
- [ ] A/B brightness uses existing MPA/MPB channels; BRITE does not alter availability or track colors.
- [ ] Null, empty, and invalid source geometry cannot reach canvas rendering.
- [ ] Full A80 inventory load and worst-case visible-map draw have recorded measurements.
- [ ] `*D ALL` is tested explicitly against the full pack.
- [ ] Any culling/simplification/lazy loading is data-driven, measured, optional, and preserves unsimplified reproducibility.
- [ ] No proprietary STARS font or raster map asset is added.

## Out of scope

New renderer architecture, weather, ERAM, tower, ASDE-X, and unrelated PPI work.

## Test plan

Run renderer tests, performance checks, and `npm run ci` before each commit.
