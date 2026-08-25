import { cn } from "@/lib/utils";

export const modalOverlayClassName =
  "fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:items-center";

export const modalPanelClassName =
  "w-full max-w-md max-h-[min(90dvh,40rem)] overflow-y-auto overscroll-contain rounded-lg border border-border bg-card p-5 text-card-foreground shadow-lg";

export function modalOverlayClasses(...extra: Array<string | undefined | false>) {
  return cn(modalOverlayClassName, ...extra);
}

export function modalPanelClasses(...extra: Array<string | undefined | false>) {
  return cn(modalPanelClassName, ...extra);
}
