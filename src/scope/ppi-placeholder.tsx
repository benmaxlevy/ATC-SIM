import type { MouseEvent, PointerEvent, ReactNode, WheelEvent } from "react";

export const PpiPlaceholderId = "ppi-placeholder";

export interface PpiPlaceholderProps {
  children?: ReactNode;
  /** DCB cell grid sits on this glass, above the drawable canvas. */
  header?: ReactNode;
  onCanvasClick?: (event: MouseEvent<HTMLCanvasElement>) => void;
  onCanvasDoubleClick?: (event: MouseEvent<HTMLCanvasElement>) => void;
  onCanvasWheel?: (event: WheelEvent<HTMLCanvasElement>) => void;
  onCanvasPointerDown?: (event: PointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerMove?: (event: PointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerUp?: (event: PointerEvent<HTMLCanvasElement>) => void;
  onCanvasContextMenu?: (event: MouseEvent<HTMLCanvasElement>) => void;
}

/**
 * Analog: CRC STARS display (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: DCB cells are on the PPI glass; the canvas below is the
 * drawable PPI (T02-01 camera view size already minus DCB height so the
 * range circle is not under the cells). Range/center via keys, wheel, and
 * DCB RANGE (not CRC). Middle-drag pan (not CRC). Click selects a track and
 * focuses the PPI so scope-focus H toggles history.
 * Not NAS STARS.
 */
export function PpiPlaceholder({
  header,
  children,
  onCanvasClick,
  onCanvasDoubleClick,
  onCanvasWheel,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onCanvasContextMenu,
}: PpiPlaceholderProps) {
  return (
    <div className="ppi-host">
      {header}
      <canvas
        id={PpiPlaceholderId}
        className="ppi-canvas"
        tabIndex={0}
        aria-label="PPI"
        onClick={onCanvasClick}
        onDoubleClick={onCanvasDoubleClick}
        onWheel={onCanvasWheel}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onContextMenu={onCanvasContextMenu}
      />
      {children}
    </div>
  );
}
