import type { IncidentSeverity, IncidentStatus } from "@/lib/incidents/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusVariant: Record<
  IncidentStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  open: "destructive",
  investigating: "secondary",
  resolved: "outline",
  closed: "outline",
};

/** Soft wash behind list rows / cards — severity color “masked” into the background. */
export const incidentSeveritySurfaceClass: Record<IncidentSeverity, string> = {
  low: "bg-emerald-500/15 hover:bg-emerald-500/25 dark:bg-emerald-500/20 dark:hover:bg-emerald-500/30",
  medium:
    "bg-yellow-400/25 hover:bg-yellow-400/35 dark:bg-yellow-400/20 dark:hover:bg-yellow-400/30",
  high: "bg-orange-500/20 hover:bg-orange-500/30 dark:bg-orange-500/25 dark:hover:bg-orange-500/35",
  // Fire-engine red (#CE2029) — slightly stronger than the first wash, still soft
  critical:
    "bg-[#CE2029]/20 hover:bg-[#CE2029]/28 dark:bg-[#CE2029]/28 dark:hover:bg-[#CE2029]/36",
};

const severityClass: Record<IncidentSeverity, string> = {
  low: "font-medium text-emerald-700 dark:text-emerald-400",
  medium: "font-medium text-yellow-700 dark:text-yellow-300",
  high: "font-medium text-orange-700 dark:text-orange-400",
  critical: "font-semibold text-[#CE2029] dark:text-red-400",
};

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return <Badge variant={statusVariant[status]}>{status}</Badge>;
}

export function IncidentSeverityText({
  severity,
}: {
  severity: IncidentSeverity;
}) {
  return <span className={cn("capitalize", severityClass[severity])}>{severity}</span>;
}

export const selectClassName =
  "flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:h-9 md:min-h-0 md:py-1 md:text-sm";

export const textareaClassName =
  "flex min-h-[7.5rem] w-full rounded-md border border-input bg-transparent px-3 py-3 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:py-2 md:text-sm";
