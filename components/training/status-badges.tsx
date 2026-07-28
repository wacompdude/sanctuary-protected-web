import { Badge } from "@/components/ui/badge";
import {
  TRAINING_ATTENDANCE_STATUS_LABELS,
  TRAINING_COMPLETION_STATUS_LABELS,
  TRAINING_EVENT_STATUS_LABELS,
} from "@/lib/training/constants";
import type { TrainingRenewalStatus } from "@/lib/training/types";

const RENEWAL_VARIANT: Record<
  TrainingRenewalStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  current: "default",
  due_soon: "secondary",
  due: "secondary",
  overdue: "destructive",
  exempt: "outline",
};

const RENEWAL_LABEL: Record<TrainingRenewalStatus, string> = {
  current: "Current",
  due_soon: "Due soon",
  due: "Due today",
  overdue: "Overdue",
  exempt: "Exempt",
};

export function EventStatusBadge({ status }: { status: string }) {
  const variant =
    status === "cancelled" || status === "archived"
      ? "outline"
      : status === "completed"
        ? "default"
        : status === "draft"
          ? "secondary"
          : "default";
  return (
    <Badge variant={variant}>
      {TRAINING_EVENT_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function AttendanceStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "present" ? "default" : "secondary"}>
      {TRAINING_ATTENDANCE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function CompletionStatusBadge({ status }: { status: string }) {
  const variant =
    status === "completed" || status === "passed"
      ? "default"
      : status === "failed" || status === "cancelled"
        ? "destructive"
        : "secondary";
  return (
    <Badge variant={variant}>
      {TRAINING_COMPLETION_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function RenewalStatusBadge({ status }: { status: TrainingRenewalStatus }) {
  return (
    <Badge variant={RENEWAL_VARIANT[status]}>{RENEWAL_LABEL[status]}</Badge>
  );
}
