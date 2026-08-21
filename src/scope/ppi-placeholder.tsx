export const PpiPlaceholderId = "ppi-placeholder";

/**
 * Analog: CRC STARS display (docs.virtualnas.net/crc/stars).
 * Trainer delta: full-area Canvas2D PPI host; ticks + callsign text, no maps
 * or datablocks. Click pick is T01-11. Not NAS STARS.
 */
export function PpiPlaceholder() {
  return (
    <div className="ppi-host">
      <canvas id={PpiPlaceholderId} className="ppi-canvas" aria-label="PPI" />
    </div>
  );
}
