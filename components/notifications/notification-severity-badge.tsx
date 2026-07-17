import { Badge } from "@/components/ui/badge";
import type { NotificationSeverity } from "@/lib/notifications";

function variantForSeverity(severity: NotificationSeverity) {
  switch (severity) {
    case "critical":
      return "destructive" as const;
    case "high":
      return "secondary" as const;
    case "medium":
      return "outline" as const;
    case "low":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

export function NotificationSeverityBadge({
  severity,
}: {
  severity: NotificationSeverity;
}) {
  return (
    <Badge variant={variantForSeverity(severity)} className="capitalize">
      {severity}
    </Badge>
  );
}
