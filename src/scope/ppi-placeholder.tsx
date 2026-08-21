import type { MouseEvent, PointerEvent, ReactNode, WheelEvent } from "react";

export const PpiPlaceholderId = "ppi-placeholder";

export interface PpiPlaceholderProps {
  children?: ReactNode;
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
 * Trainer delta: full-area Canvas2D PPI host below DCB-lite; range/center via
 * keys, wheel, and the lite bar (not CRC). Middle-drag pan (not CRC). Click
 * selects a track and focuses the PPI so scope-focus H toggles history.
 * Not NAS STARS.
 */
export function PpiPlaceholder({
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
