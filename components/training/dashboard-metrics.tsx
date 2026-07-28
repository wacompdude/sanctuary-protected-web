import Link from "next/link";
import type { TrainingDashboardMetrics } from "@/lib/training/types";
import type { TrainingMetricColorMap } from "@/lib/training/metric-colors";
import {
  resolveTrainingMetricPalette,
  type TrainingMetricCardKey,
} from "@/lib/training/metric-colors";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const METRIC_ITEMS: Array<{
  key: TrainingMetricCardKey;
  label: string;
  href: string;
  description: string;
  valueKey: keyof TrainingDashboardMetrics;
}> = [
  {
    key: "upcoming_events",
    label: "Upcoming events",
    valueKey: "upcomingEvents",
    href: "/training/calendar",
    description: "View training calendar",
  },
  {
    key: "completed_this_month",
    label: "Completed this month",
    valueKey: "completedThisMonth",
    href: "/training/records",
    description: "View training records",
  },
  {
    key: "uncompleted_trainings",
    label: "Uncompleted trainings",
    valueKey: "uncompletedTrainings",
    href: "/training/reports?type=compliance",
    description: "View required training compliance",
  },
  {
    key: "overdue_renewals",
    label: "Overdue renewals",
    valueKey: "overdueRenewals",
    href: "/training/required",
    description: "View required training",
  },
  {
    key: "due_soon",
    label: "Due soon",
    valueKey: "dueSoonRenewals",
    href: "/training/required",
    description: "View required training",
  },
  {
    key: "active_requirements",
    label: "Active requirements",
    valueKey: "activeRequirements",
    href: "/training/required",
    description: "Manage requirements",
  },
  {
    key: "pending_external_verification",
    label: "Pending external verification",
    valueKey: "pendingExternalVerification",
    href: "/training/records",
    description: "Review external training",
  },
];

export function DashboardMetrics({
  metrics,
  colors,
}: {
  metrics: TrainingDashboardMetrics;
  colors?: TrainingMetricColorMap | null;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {METRIC_ITEMS.map((item) => {
        const palette = resolveTrainingMetricPalette(item.key, colors);
        return (
          <Link
            key={item.key}
            href={item.href}
            className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`${item.label}: ${item.description}`}
          >
            <Card
              className="h-full border shadow-none transition-opacity hover:opacity-90"
              style={{
                backgroundColor: palette.backgroundColor,
                color: palette.textColor,
                borderColor: palette.borderColor,
              }}
            >
              <CardHeader className="pb-2">
                <CardTitle
                  className="text-sm font-medium"
                  style={{ color: palette.mutedTextColor }}
                >
                  {item.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">
                  {metrics[item.valueKey]}
                </p>
                <p
                  className="mt-2 text-xs underline-offset-2 group-hover:underline"
                  style={{ color: palette.mutedTextColor }}
                >
                  {item.description} →
                </p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
