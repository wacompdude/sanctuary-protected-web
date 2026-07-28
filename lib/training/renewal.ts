import type {
  TrainingCompletionStatus,
  TrainingEventStatus,
  TrainingRenewalStatus,
} from "@/lib/training/types";

export function computeRenewalDueAt(
  completedAt: Date | string,
  renewalMonths: number | null | undefined,
): string | null {
  if (!renewalMonths || renewalMonths < 1) return null;

  const base =
    completedAt instanceof Date ? completedAt : new Date(completedAt);
  if (Number.isNaN(base.getTime())) return null;

  const due = new Date(base);
  due.setMonth(due.getMonth() + renewalMonths);
  return due.toISOString().slice(0, 10);
}

export function classifyRenewalStatus(params: {
  dueAt: string | null | undefined;
  dueSoonDays: number;
  now?: Date;
  exempt?: boolean;
}): TrainingRenewalStatus {
  if (params.exempt) return "exempt";
  if (!params.dueAt) return "current";

  const now = params.now ?? new Date();
  const due = new Date(`${params.dueAt}T00:00:00`);
  if (Number.isNaN(due.getTime())) return "current";

  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffMs = dueDay.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "due";
  if (diffDays <= params.dueSoonDays) return "due_soon";
  return "current";
}

export function shouldCreateCompletion(
  eventStatus: TrainingEventStatus,
  completionStatus: TrainingCompletionStatus,
): boolean {
  if (eventStatus === "cancelled") return false;
  if (completionStatus === "cancelled") return false;
  return completionStatus === "completed" || completionStatus === "passed";
}

export type CompletionRecordShapeInput = {
  churchId: string;
  userId: string;
  campusId?: string | null;
  eventId?: string | null;
  courseId?: string | null;
  categoryId?: string | null;
  participantId?: string | null;
  courseName: string;
  categoryName?: string | null;
  eventName?: string | null;
  instructorName?: string | null;
  providerName?: string | null;
  trainingDate?: string | null;
  completedAt?: string;
  trainingHours?: number | null;
  score?: number | null;
  passed?: boolean | null;
  completionStatus: TrainingCompletionStatus;
  renewalDueAt?: string | null;
  sensitive?: boolean;
  notes?: string | null;
  recordedBy?: string | null;
  sourceType?: "event" | "external" | "manual_correction" | "import";
};

/** Pure helper for building completion record insert payloads. */
export function buildCompletionRecordPayload(input: CompletionRecordShapeInput) {
  return {
    church_id: input.churchId,
    campus_id: input.campusId ?? null,
    user_id: input.userId,
    training_event_id: input.eventId ?? null,
    training_course_id: input.courseId ?? null,
    training_category_id: input.categoryId ?? null,
    training_participant_id: input.participantId ?? null,
    course_name: input.courseName,
    category_name: input.categoryName ?? null,
    event_name: input.eventName ?? null,
    instructor_name: input.instructorName ?? null,
    provider_name: input.providerName ?? null,
    training_date: input.trainingDate ?? null,
    completed_at: input.completedAt ?? new Date().toISOString(),
    training_hours: input.trainingHours ?? null,
    score: input.score ?? null,
    passed: input.passed ?? null,
    completion_status: input.completionStatus,
    renewal_due_at: input.renewalDueAt ?? null,
    source_type: input.sourceType ?? "event",
    sensitive: input.sensitive ?? false,
    notes: input.notes ?? null,
    recorded_by: input.recordedBy ?? null,
  };
}

export function resolveRenewalMonths(params: {
  courseRenewalMonths?: number | null;
  categoryDefaultRenewalMonths?: number | null;
}): number | null {
  if (params.courseRenewalMonths != null) return params.courseRenewalMonths;
  return params.categoryDefaultRenewalMonths ?? null;
}
