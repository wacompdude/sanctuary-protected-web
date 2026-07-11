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
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export const textareaClassName =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
