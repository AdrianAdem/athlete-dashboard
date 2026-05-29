import { useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const REVEAL = 88; // px the delete button occupies
const OPEN_THRESHOLD = 44; // px dragged before it snaps open

/**
 * Swipe a row to the left to reveal a red delete button. Tapping the row while
 * open (or swiping back) closes it. Touch-only gesture for the mobile PWA;
 * the delete button stays tappable for non-touch fallback.
 */
export function SwipeRow({
  children,
  onDelete,
  className,
  surface = "bg-card",
  rounded = "rounded-xl",
}: {
  children: ReactNode;
  onDelete: () => void;
  className?: string;
  surface?: string;
  rounded?: string;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const base = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation(); // isolate nested rows (item inside routine card)
    startX.current = e.touches[0].clientX;
    setDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    const delta = e.touches[0].clientX - startX.current;
    setDx(Math.max(-REVEAL, Math.min(0, base.current + delta)));
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    const open = dx < -OPEN_THRESHOLD;
    base.current = open ? -REVEAL : 0;
    setDx(base.current);
    setDragging(false);
  };

  // While open, a tap anywhere on the content closes it instead of activating
  // whatever is underneath.
  const closeOnTap = (e: React.MouseEvent) => {
    if (base.current < 0) {
      e.preventDefault();
      e.stopPropagation();
      base.current = 0;
      setDx(0);
    }
  };

  return (
    <div className={cn("relative overflow-hidden", rounded, className)}>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Löschen"
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 text-white active:bg-red-600"
        style={{ width: REVEAL }}
      >
        <Trash2 className="h-5 w-5" />
      </button>
      <div
        className={cn("relative", surface)}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : "transform 0.2s ease-out",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClickCapture={closeOnTap}
      >
        {children}
      </div>
    </div>
  );
}
