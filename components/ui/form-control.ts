import { cn } from "@/lib/utils";

/**
 * Shared native form control classes.
 * 16px text on small screens avoids iOS Safari focus-zoom without disabling pinch-zoom.
 * Background/foreground are theme tokens so Light and Dark both stay readable.
 */
export const nativeSelectClassName =
  "flex min-h-11 w-full max-w-full cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-base text-foreground shadow-sm outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 dark:[color-scheme:dark] md:h-9 md:min-h-0 md:py-1 md:text-sm";

export const textareaClassName =
  "flex min-h-[7.5rem] w-full max-w-full rounded-md border border-input bg-background px-3 py-3 text-base text-foreground shadow-sm placeholder:text-muted-foreground outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 md:py-2 md:text-sm";

/** Alias used across incident, campus, and notification forms. */
export const selectClassName = nativeSelectClassName;

export function nativeSelectClasses(...extra: Array<string | undefined | false>) {
  return cn(nativeSelectClassName, ...extra);
}
