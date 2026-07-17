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

const severityClass: Record<IncidentSeverity, string> = {
  low: "text-muted-foreground",
  medium: "text-amber-600 dark:text-amber-400",
  high: "text-orange-600 dark:text-orange-400",
  critical: "text-red-600 dark:text-red-400",
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
