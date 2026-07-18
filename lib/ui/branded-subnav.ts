import { cn } from "@/lib/utils";

/** Shared active/inactive styles for settings-style submenu shells. */
export function brandedSubnavItemClass(
  active: boolean,
  options?: { nested?: boolean; pill?: boolean },
) {
  if (options?.pill) {
    return cn(
      "shrink-0 rounded-md px-2.5 py-1.5 text-xs transition-colors",
      active
        ? "bg-primary text-primary-foreground font-medium"
        : "bg-muted/50 text-muted-foreground hover:bg-[hsl(var(--nav-hover))] hover:text-accent-foreground",
    );
  }

  return cn(
    "block rounded-md transition-colors",
    options?.nested ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm",
    active
      ? "bg-primary font-medium text-primary-foreground"
      : "text-muted-foreground hover:bg-[hsl(var(--nav-hover))] hover:text-accent-foreground",
  );
}

export function brandedSubnavShellClassName(className?: string) {
  return cn(
    "flex gap-1 overflow-x-auto border-b border-border pb-px md:flex-col md:overflow-visible md:border-b-0 md:border-r md:border-r-primary/25 md:pr-4 md:pb-0",
    className,
  );
}
