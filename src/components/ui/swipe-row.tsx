import { useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const REVEAL = 88; // px the delete button occupies when snapped open
const OPEN_THRESHOLD = 44; // px dragged before it snaps open
const DELETE_RATIO = 0.5; // drag past half the row width to delete on release

/**
 * Swipe a row left to reveal a red delete zone. Drag past halfway and release
 * to delete outright; release before that to snap the delete button open (still
 * tappable). Tapping the row while open closes it. Touch-only for the mobile PWA.
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
  const [deleting, setDeleting] = useState(false);
  const startX = useRef(0);
  const base = useRef(0);
  const wrap = useRef<HTMLDivElement>(null);

  const width = () => wrap.current?.offsetWidth ?? 320;

  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation(); // isolate nested rows (item inside routine card)
    startX.current = e.touches[0].clientX;
    setDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    const delta = e.touches[0].clientX - startX.current;
    setDx(Math.max(-width(), Math.min(0, base.current + delta)));
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    setDragging(false);
    // Dragged far enough — animate fully off-screen, then delete.
    if (dx < -width() * DELETE_RATIO) {
      setDeleting(true);
      setDx(-width());
      window.setTimeout(onDelete, 200);
      return;
    }
    const open = dx < -OPEN_THRESHOLD;
    base.current = open ? -REVEAL : 0;
    setDx(base.current);
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

  // Red zone is only as wide as the content is dragged aside. At rest its width
  // is 0, so nothing peeks through the rounded corners behind the card.
  const revealed = Math.max(0, -dx);

  return (
    <div ref={wrap} className={cn("relative overflow-hidden", rounded, className)}>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Löschen"
        className="absolute inset-y-0 right-0 flex items-center justify-center overflow-hidden bg-red-500 text-white active:bg-red-600"
        style={{ width: revealed }}
      >
        <Trash2 className="h-5 w-5 shrink-0" />
      </button>
      <div
        // overflow-hidden establishes a BFC so children's bottom margins (e.g. a
        // routine's progress bar) stay inside the card instead of collapsing out
        // and clipping against the rounded bottom edge.
        className={cn("relative overflow-hidden", surface)}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : "transform 0.2s ease-out",
          opacity: deleting ? 0 : 1,
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
