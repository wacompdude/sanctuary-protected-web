import {
  deriveDashboardBoxPalette,
  normalizeHexColor,
} from "@/lib/dashboard/colors";

export const TRAINING_METRIC_CARD_KEYS = [
  "upcoming_events",
  "completed_this_month",
  "uncompleted_trainings",
  "overdue_renewals",
  "due_soon",
  "active_requirements",
  "pending_external_verification",
] as const;

export type TrainingMetricCardKey =
  (typeof TRAINING_METRIC_CARD_KEYS)[number];

export const TRAINING_METRIC_CARD_LABELS: Record<
  TrainingMetricCardKey,
  string
> = {
  upcoming_events: "Upcoming events",
  completed_this_month: "Completed this month",
  uncompleted_trainings: "Uncompleted trainings",
  overdue_renewals: "Overdue renewals",
  due_soon: "Due soon",
  active_requirements: "Active requirements",
  pending_external_verification: "Pending external verification",
};

export const TRAINING_METRIC_CARD_DEFAULT_COLORS: Record<
  TrainingMetricCardKey,
  string
> = {
  upcoming_events: "#93C5FD",
  completed_this_month: "#86EFAC",
  uncompleted_trainings: "#FB7185",
  overdue_renewals: "#FCA5A5",
  due_soon: "#FDE68A",
  active_requirements: "#C4B5FD",
  pending_external_verification: "#FDBA74",
};

export type TrainingMetricColorMap = Partial<
  Record<TrainingMetricCardKey, string>
>;

export function isTrainingMetricCardKey(
  value: string,
): value is TrainingMetricCardKey {
  return (TRAINING_METRIC_CARD_KEYS as readonly string[]).includes(value);
}

export function parseTrainingMetricColors(
  value: unknown,
): TrainingMetricColorMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: TrainingMetricColorMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isTrainingMetricCardKey(key)) continue;
    if (typeof raw !== "string") continue;
    const hex = normalizeHexColor(raw);
    if (hex) result[key] = hex;
  }
  return result;
}

export function resolveTrainingMetricBackground(
  key: TrainingMetricCardKey,
  colors: TrainingMetricColorMap | null | undefined,
): string {
  return (
    normalizeHexColor(colors?.[key] ?? "") ??
    TRAINING_METRIC_CARD_DEFAULT_COLORS[key]
  );
}

export function resolveTrainingMetricPalette(
  key: TrainingMetricCardKey,
  colors: TrainingMetricColorMap | null | undefined,
) {
  return deriveDashboardBoxPalette(resolveTrainingMetricBackground(key, colors));
}

/** Merge form/partial values onto defaults for a complete save payload. */
export function buildTrainingMetricColorPayload(
  input: TrainingMetricColorMap,
): Record<TrainingMetricCardKey, string> {
  const payload = { ...TRAINING_METRIC_CARD_DEFAULT_COLORS };
  for (const key of TRAINING_METRIC_CARD_KEYS) {
    const hex = normalizeHexColor(input[key] ?? "");
    if (hex) payload[key] = hex;
  }
  return payload;
}
