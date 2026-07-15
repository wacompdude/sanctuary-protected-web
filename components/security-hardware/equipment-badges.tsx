import { Badge } from "@/components/ui/badge";
import {
  labelForEquipmentCriticality,
  labelForEquipmentStatus,
} from "@/lib/security-hardware/constants";
import type {
  EquipmentCriticality,
  EquipmentStatus,
} from "@/lib/security-hardware/types";

export function EquipmentStatusBadge({ status }: { status: EquipmentStatus }) {
  const variant =
    status === "active"
      ? "default"
      : status === "maintenance" || status === "ordered" || status === "received"
        ? "secondary"
        : status === "out_of_service" ||
            status === "lost" ||
            status === "stolen"
          ? "destructive"
          : "outline";

  return <Badge variant={variant}>{labelForEquipmentStatus(status)}</Badge>;
}

export function EquipmentCriticalityBadge({
  criticality,
}: {
  criticality: EquipmentCriticality;
}) {
  const variant =
    criticality === "critical"
      ? "destructive"
      : criticality === "high"
        ? "default"
        : criticality === "medium"
          ? "secondary"
          : "outline";

  return (
    <Badge variant={variant}>
      {labelForEquipmentCriticality(criticality)}
    </Badge>
  );
}
