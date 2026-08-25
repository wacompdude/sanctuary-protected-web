import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Horizontal scroll wrapper for wide tables on small screens.
 * Keeps page-level overflow hidden while preserving access to every column.
 */
export function TableScroll({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "w-full max-w-full overflow-x-auto overscroll-x-contain rounded-md [-webkit-overflow-scrolling:touch]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
