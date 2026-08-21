export const PpiPlaceholderId = "ppi-placeholder";

/** Empty PPI host. Analog: CRC STARS display; trainer delta: labeled region only, no maps or tracks. */
export function PpiPlaceholder() {
  return (
    <div id={PpiPlaceholderId} className="ppi-placeholder">
      <span className="ppi-label">PPI</span>
    </div>
  );
}
