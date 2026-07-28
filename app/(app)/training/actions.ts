"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequestIpAddress } from "@/lib/audit/log";
import {
  auditTrainingCompletionRecorded,
  auditTrainingEventCancelled,
  auditTrainingEventCreated,
  auditTrainingEventUpdated,
  auditTrainingExternalVerified,
  auditTrainingSettingsUpdated,
} from "@/lib/training/audit";
import {
  ChurchAccessError,
  getAuthenticatedUserWithChurch,
} from "@/lib/church/auth";
import { ensureTeamMemberForChurchMember } from "@/lib/certifications/queries";
import { listChurchTeamMemberships } from "@/lib/church/team-queries";
import { createClient } from "@/lib/supabase/server";
import { entitlementErrorMessage } from "@/lib/subscriptions/enforcement";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { EntitlementError } from "@/lib/subscriptions/errors";
import { requireFeature } from "@/lib/subscriptions/resolver";
import { trainingMigrationHintFromError } from "@/lib/training/constants";
import {
  canManageCourses,
  canManageEvents,
  canManageRequirements,
  canManageSettings,
  canRecordAttendance,
  canSubmitExternalTraining,
  canVerifyExternalTraining,
  canViewSensitive,
} from "@/lib/training/permissions";
import { ensureSettingsRow } from "@/lib/training/queries";
import {
  buildCompletionRecordPayload,
  computeRenewalDueAt,
  resolveRenewalMonths,
  shouldCreateCompletion,
} from "@/lib/training/renewal";
import { buildTrainingMetricColorPayload } from "@/lib/training/metric-colors";
import type {
  TrainingActionState,
  TrainingAttendanceStatus,
  TrainingCompletionStatus,
  TrainingDeliveryMethod,
  TrainingEventStatus,
} from "@/lib/training/types";

function isRedirectError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT"),
  );
}

async function requireTrainingContext(options?: {
  minManageEvents?: boolean;
  minRecordAttendance?: boolean;
  minManageCourses?: boolean;
  minManageRequirements?: boolean;
  minManageSettings?: boolean;
  minExternalSubmit?: boolean;
  minExternalVerify?: boolean;
  minSensitive?: boolean;
}) {
  const ctx = await getAuthenticatedUserWithChurch();
  try {
    await requireFeature({
      churchId: ctx.church.id,
      featureKey: FEATURE_KEYS.TRAINING_MANAGEMENT,
    });
  } catch (error) {
    if (error instanceof EntitlementError) throw error;
    throw error;
  }

  const role = ctx.membership.role;
  if (options?.minManageEvents && !canManageEvents(role)) {
    throw new ChurchAccessError("You do not have permission to manage training events.");
  }
  if (options?.minRecordAttendance && !canRecordAttendance(role)) {
    throw new ChurchAccessError("You do not have permission to record attendance.");
  }
  if (options?.minManageCourses && !canManageCourses(role)) {
    throw new ChurchAccessError("You do not have permission to manage courses.");
  }
  if (options?.minManageRequirements && !canManageRequirements(role)) {
    throw new ChurchAccessError("You do not have permission to manage requirements.");
  }
  if (options?.minManageSettings && !canManageSettings(role)) {
    throw new ChurchAccessError("You do not have permission to manage training settings.");
  }
  if (options?.minExternalSubmit && !canSubmitExternalTraining(role)) {
    throw new ChurchAccessError("You do not have permission to submit external training.");
  }
  if (options?.minExternalVerify && !canVerifyExternalTraining(role)) {
    throw new ChurchAccessError("You do not have permission to verify external training.");
  }
  if (options?.minSensitive && !canViewSensitive(role)) {
    throw new ChurchAccessError("You do not have permission to access sensitive training.");
  }

  return ctx;
}

function actionError(error: unknown): TrainingActionState {
  const entitlement = entitlementErrorMessage(error);
  if (entitlement) return { error: entitlement };
  if (error instanceof ChurchAccessError) return { error: error.message };
  if (error instanceof Error) {
    const hint = trainingMigrationHintFromError(error.message);
    return { error: hint ?? error.message };
  }
  return { error: "An unexpected error occurred." };
}

function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function readOptionalString(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return value || null;
}

function readNumber(formData: FormData, key: string): number | null {
  const raw = readString(formData, key);
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function readBoolean(formData: FormData, key: string): boolean {
  const value = readString(formData, key);
  return value === "true" || value === "on" || value === "1";
}

async function maybeCreateCertification(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  churchId: string;
  userId: string;
  actorUserId: string;
  certificationType: string | null | undefined;
  completedAt: string;
  memberName: string;
  memberEmail: string | null;
}) {
  const certType = params.certificationType?.trim();
  if (!certType) return;

  const teamMember = await ensureTeamMemberForChurchMember({
    churchId: params.churchId,
    createdBy: params.actorUserId,
    fullName: params.memberName,
    email: params.memberEmail,
  });

  const { data: existing } = await params.supabase
    .from("certifications")
    .select("id")
    .eq("church_id", params.churchId)
    .eq("team_member_id", teamMember.id)
    .eq("certification_type", certType)
    .maybeSingle();

  if (existing) return;

  const completedDate = params.completedAt.slice(0, 10);
  const expiration = new Date(params.completedAt);
  expiration.setFullYear(expiration.getFullYear() + 1);

  await params.supabase.from("certifications").insert({
    church_id: params.churchId,
    team_member_id: teamMember.id,
    certification_type: certType,
    issuer: "Training Management",
    issue_date: completedDate,
    expiration_date: expiration.toISOString().slice(0, 10),
    certificate_number: `TR-${Date.now()}`,
    created_by: params.actorUserId,
    user_id: params.userId,
  });
}

async function completeParticipantInternal(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  churchId: string;
  actorUserId: string;
  participantId: string;
  completionStatus?: TrainingCompletionStatus;
  score?: number | null;
  trainingHours?: number | null;
  passed?: boolean | null;
  notes?: string | null;
}) {
  const { data: participant, error: participantError } = await params.supabase
    .from("training_participants")
    .select(
      `
      *,
      event:training_events (
        id, church_id, name, status, campus_id, instructor_name, provider_name,
        creates_certification, certification_type, training_course_id, training_category_id,
        course:training_courses ( id, name, renewal_months, creates_certification, certification_type ),
        category:training_categories ( id, name, sensitive, default_renewal_months )
      )
    `,
    )
    .eq("id", params.participantId)
    .eq("church_id", params.churchId)
    .maybeSingle();

  if (participantError || !participant) {
    throw new Error("Participant not found.");
  }

  const event = participant.event as {
    id: string;
    church_id: string;
    name: string;
    status: TrainingEventStatus;
    campus_id: string | null;
    instructor_name: string | null;
    provider_name: string | null;
    creates_certification: boolean;
    certification_type: string | null;
    training_course_id: string | null;
    training_category_id: string | null;
    course?: {
      id: string;
      name: string;
      renewal_months: number | null;
      creates_certification: boolean;
      certification_type: string | null;
    } | null;
    category?: {
      id: string;
      name: string;
      sensitive: boolean;
      default_renewal_months: number | null;
    } | null;
  };

  const completionStatus =
    params.completionStatus ?? ("completed" as TrainingCompletionStatus);

  if (!shouldCreateCompletion(event.status, completionStatus)) {
    await params.supabase
      .from("training_participants")
      .update({
        completion_status: completionStatus,
        completed_at: null,
        updated_by: params.actorUserId,
      })
      .eq("id", params.participantId);
    return { created: false };
  }

  const completedAt = new Date().toISOString();
  const courseName =
    event.course?.name ?? event.name ?? "Training completion";
  const renewalMonths = resolveRenewalMonths({
    courseRenewalMonths: event.course?.renewal_months,
    categoryDefaultRenewalMonths: event.category?.default_renewal_months,
  });
  const renewalDueAt = computeRenewalDueAt(completedAt, renewalMonths);

  await params.supabase
    .from("training_participants")
    .update({
      completion_status: completionStatus,
      completed_at: completedAt,
      score: params.score ?? null,
      training_hours: params.trainingHours ?? null,
      passed: params.passed ?? null,
      instructor_notes: params.notes ?? null,
      updated_by: params.actorUserId,
      recorded_by: params.actorUserId,
      recorded_at: completedAt,
    })
    .eq("id", params.participantId);

  const payload = buildCompletionRecordPayload({
    churchId: params.churchId,
    userId: participant.user_id,
    campusId: event.campus_id,
    eventId: event.id,
    courseId: event.course?.id ?? event.training_course_id,
    categoryId: event.category?.id ?? event.training_category_id,
    participantId: params.participantId,
    courseName,
    categoryName: event.category?.name ?? null,
    eventName: event.name,
    instructorName: event.instructor_name,
    providerName: event.provider_name,
    trainingDate: completedAt.slice(0, 10),
    completedAt,
    trainingHours: params.trainingHours ?? null,
    score: params.score ?? null,
    passed: params.passed ?? null,
    completionStatus,
    renewalDueAt,
    sensitive: event.category?.sensitive ?? false,
    notes: params.notes ?? null,
    recordedBy: params.actorUserId,
    sourceType: "event",
  });

  const { data: record, error: recordError } = await params.supabase
    .from("training_completion_records")
    .insert(payload)
    .select("id")
    .single();

  if (recordError) throw new Error(recordError.message);

  const ipAddress = await getRequestIpAddress();
  await auditTrainingCompletionRecorded(params.supabase, {
    churchId: params.churchId,
    userId: params.actorUserId,
    completionRecordId: record.id,
    participantId: params.participantId,
    metadata: { course_name: courseName, event_name: event.name },
    ipAddress,
  });

  const createsCert =
    event.creates_certification || event.course?.creates_certification;
  const certType = event.certification_type || event.course?.certification_type;

  if (createsCert) {
    const members = await listChurchTeamMemberships(params.churchId);
    const member = members.find((m) => m.userId === participant.user_id);
    await maybeCreateCertification({
      supabase: params.supabase,
      churchId: params.churchId,
      userId: participant.user_id,
      actorUserId: params.actorUserId,
      certificationType: certType,
      completedAt,
      memberName: member?.name ?? "Team member",
      memberEmail: member?.email ?? null,
    });
  }

  return { created: true, recordId: record.id };
}

export async function createTrainingEvent(
  _prev: TrainingActionState,
  formData: FormData,
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minManageEvents: true,
    });
    const supabase = await createClient();

    const name = readString(formData, "name");
    if (!name) return { error: "Event name is required.", fieldErrors: { name: "Required" } };

    const payload = {
      church_id: church.id,
      name: name.slice(0, 200),
      description: readOptionalString(formData, "description"),
      objective: readOptionalString(formData, "objective"),
      format: (readString(formData, "format") ||
        "in_person_classroom") as TrainingDeliveryMethod,
      location: readOptionalString(formData, "location"),
      room: readOptionalString(formData, "room"),
      instructor_name: readOptionalString(formData, "instructor_name"),
      provider_name: readOptionalString(formData, "provider_name"),
      start_at: readOptionalString(formData, "start_at"),
      end_at: readOptionalString(formData, "end_at"),
      time_zone: church.timezone ?? "America/Chicago",
      duration_minutes: readNumber(formData, "duration_minutes"),
      maximum_participants: readNumber(formData, "maximum_participants"),
      required: readBoolean(formData, "required"),
      status: (readString(formData, "status") || "draft") as TrainingEventStatus,
      training_course_id: readOptionalString(formData, "training_course_id"),
      training_category_id: readOptionalString(formData, "training_category_id"),
      campus_id: readOptionalString(formData, "campus_id"),
      creates_certification: readBoolean(formData, "creates_certification"),
      certification_type: readOptionalString(formData, "certification_type"),
      created_by: user.id,
      updated_by: user.id,
    };

    const { data, error } = await supabase
      .from("training_events")
      .insert(payload)
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    await auditTrainingEventCreated(supabase, {
      churchId: church.id,
      userId: user.id,
      eventId: data.id,
      name: payload.name,
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/training");
    revalidatePath("/training/events");
    redirect(`/training/events/${data.id}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return actionError(error);
  }
}

export async function updateTrainingEvent(
  eventId: string,
  _prev: TrainingActionState,
  formData: FormData,
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minManageEvents: true,
    });
    const supabase = await createClient();

    const name = readString(formData, "name");
    if (!name) return { error: "Event name is required." };

    const payload = {
      name: name.slice(0, 200),
      description: readOptionalString(formData, "description"),
      objective: readOptionalString(formData, "objective"),
      format: (readString(formData, "format") ||
        "in_person_classroom") as TrainingDeliveryMethod,
      location: readOptionalString(formData, "location"),
      room: readOptionalString(formData, "room"),
      instructor_name: readOptionalString(formData, "instructor_name"),
      provider_name: readOptionalString(formData, "provider_name"),
      start_at: readOptionalString(formData, "start_at"),
      end_at: readOptionalString(formData, "end_at"),
      duration_minutes: readNumber(formData, "duration_minutes"),
      maximum_participants: readNumber(formData, "maximum_participants"),
      required: readBoolean(formData, "required"),
      status: readString(formData, "status") as TrainingEventStatus,
      training_course_id: readOptionalString(formData, "training_course_id"),
      training_category_id: readOptionalString(formData, "training_category_id"),
      campus_id: readOptionalString(formData, "campus_id"),
      creates_certification: readBoolean(formData, "creates_certification"),
      certification_type: readOptionalString(formData, "certification_type"),
      updated_by: user.id,
    };

    const { error } = await supabase
      .from("training_events")
      .update(payload)
      .eq("id", eventId)
      .eq("church_id", church.id);

    if (error) throw new Error(error.message);

    await auditTrainingEventUpdated(supabase, {
      churchId: church.id,
      userId: user.id,
      eventId,
      metadata: { name: payload.name, status: payload.status },
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/training");
    revalidatePath("/training/events");
    revalidatePath(`/training/events/${eventId}`);
    return { success: "Event updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelTrainingEvent(
  eventId: string,
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minManageEvents: true,
    });
    const supabase = await createClient();

    const { error } = await supabase
      .from("training_events")
      .update({ status: "cancelled", updated_by: user.id })
      .eq("id", eventId)
      .eq("church_id", church.id);

    if (error) throw new Error(error.message);

    await auditTrainingEventCancelled(supabase, {
      churchId: church.id,
      userId: user.id,
      eventId,
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/training/events");
    revalidatePath(`/training/events/${eventId}`);
    return { success: "Event cancelled." };
  } catch (error) {
    return actionError(error);
  }
}

export async function addParticipants(
  eventId: string,
  userIds: string[],
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minRecordAttendance: true,
    });
    const supabase = await createClient();
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueIds.length === 0) return { error: "Select at least one member." };

    const rows = uniqueIds.map((userId) => ({
      church_id: church.id,
      training_event_id: eventId,
      user_id: userId,
      enrollment_status: "assigned" as const,
      updated_by: user.id,
    }));

    const { error } = await supabase
      .from("training_participants")
      .upsert(rows, { onConflict: "training_event_id,user_id" });

    if (error) throw new Error(error.message);

    revalidatePath(`/training/events/${eventId}`);
    return { success: `${uniqueIds.length} participant(s) added.` };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateParticipantAttendance(
  participantId: string,
  attendanceStatus: TrainingAttendanceStatus,
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minRecordAttendance: true,
    });
    const supabase = await createClient();

    const { error } = await supabase
      .from("training_participants")
      .update({
        attendance_status: attendanceStatus,
        attended_at:
          attendanceStatus === "present" || attendanceStatus === "attended_remotely"
            ? new Date().toISOString()
            : null,
        updated_by: user.id,
        recorded_by: user.id,
        recorded_at: new Date().toISOString(),
      })
      .eq("id", participantId)
      .eq("church_id", church.id);

    if (error) throw new Error(error.message);
    return { success: "Attendance updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function bulkUpdateParticipantAttendance(
  eventId: string,
  updates: Array<{ participantId: string; attendanceStatus: TrainingAttendanceStatus }>,
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minRecordAttendance: true,
    });
    const supabase = await createClient();

    for (const update of updates) {
      await supabase
        .from("training_participants")
        .update({
          attendance_status: update.attendanceStatus,
          attended_at:
            update.attendanceStatus === "present" ||
            update.attendanceStatus === "attended_remotely"
              ? new Date().toISOString()
              : null,
          updated_by: user.id,
          recorded_by: user.id,
          recorded_at: new Date().toISOString(),
        })
        .eq("id", update.participantId)
        .eq("church_id", church.id)
        .eq("training_event_id", eventId);
    }

    revalidatePath(`/training/events/${eventId}`);
    return { success: "Attendance saved." };
  } catch (error) {
    return actionError(error);
  }
}

export async function completeParticipant(
  participantId: string,
  options?: {
    completionStatus?: TrainingCompletionStatus;
    score?: number | null;
    trainingHours?: number | null;
    passed?: boolean | null;
    notes?: string | null;
  },
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minRecordAttendance: true,
    });
    const supabase = await createClient();

    const result = await completeParticipantInternal({
      supabase,
      churchId: church.id,
      actorUserId: user.id,
      participantId,
      ...options,
    });

    revalidatePath("/training/records");
    return {
      success: result.created
        ? "Completion recorded."
        : "Participant updated (no completion record for cancelled event).",
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function markParticipantsComplete(
  eventId: string,
  participantIds: string[],
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minRecordAttendance: true,
    });
    const supabase = await createClient();
    let created = 0;

    for (const participantId of participantIds) {
      const result = await completeParticipantInternal({
        supabase,
        churchId: church.id,
        actorUserId: user.id,
        participantId,
        completionStatus: "completed",
      });
      if (result.created) created += 1;
    }

    revalidatePath(`/training/events/${eventId}`);
    revalidatePath("/training/records");
    return { success: `${created} completion record(s) created.` };
  } catch (error) {
    return actionError(error);
  }
}

export async function createCustomCategory(
  _prev: TrainingActionState,
  formData: FormData,
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minManageCourses: true,
    });
    const supabase = await createClient();
    const name = readString(formData, "name");
    if (!name) return { error: "Category name is required." };

    const { error } = await supabase.from("training_categories").insert({
      church_id: church.id,
      name: name.slice(0, 200),
      description: readOptionalString(formData, "description"),
      default_renewal_months: readNumber(formData, "default_renewal_months"),
      sensitive: readBoolean(formData, "sensitive"),
      is_system: false,
      created_by: user.id,
      updated_by: user.id,
    });

    if (error) throw new Error(error.message);
    revalidatePath("/training/courses");
    return { success: "Category created." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCategoryChurchState(
  categoryId: string,
  _prev: TrainingActionState,
  formData: FormData,
): Promise<TrainingActionState> {
  try {
    const { church } = await requireTrainingContext({ minManageCourses: true });
    const supabase = await createClient();

    const payload = {
      church_id: church.id,
      category_id: categoryId,
      active: readBoolean(formData, "active"),
      display_order: readNumber(formData, "display_order"),
      is_required: formData.has("is_required")
        ? readBoolean(formData, "is_required")
        : null,
      description_override: readOptionalString(formData, "description_override"),
    };

    const { error } = await supabase
      .from("training_category_church_state")
      .upsert(payload, { onConflict: "church_id,category_id" });

    if (error) throw new Error(error.message);
    revalidatePath("/training/courses");
    return { success: "Category settings updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function createCourse(
  _prev: TrainingActionState,
  formData: FormData,
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minManageCourses: true,
    });
    const supabase = await createClient();
    const name = readString(formData, "name");
    const categoryId = readString(formData, "training_category_id");
    if (!name || !categoryId) {
      return { error: "Course name and category are required." };
    }

    const { error } = await supabase.from("training_courses").insert({
      church_id: church.id,
      training_category_id: categoryId,
      name: name.slice(0, 200),
      description: readOptionalString(formData, "description"),
      objective: readOptionalString(formData, "objective"),
      delivery_method: (readString(formData, "delivery_method") ||
        "in_person_classroom") as TrainingDeliveryMethod,
      renewal_months: readNumber(formData, "renewal_months"),
      required: readBoolean(formData, "required"),
      creates_certification: readBoolean(formData, "creates_certification"),
      certification_type: readOptionalString(formData, "certification_type"),
      created_by: user.id,
      updated_by: user.id,
    });

    if (error) throw new Error(error.message);
    revalidatePath("/training/courses");
    return { success: "Course created." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCourse(
  courseId: string,
  _prev: TrainingActionState,
  formData: FormData,
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minManageCourses: true,
    });
    const supabase = await createClient();

    const { error } = await supabase
      .from("training_courses")
      .update({
        name: readString(formData, "name").slice(0, 200),
        description: readOptionalString(formData, "description"),
        objective: readOptionalString(formData, "objective"),
        delivery_method: readString(formData, "delivery_method") as TrainingDeliveryMethod,
        renewal_months: readNumber(formData, "renewal_months"),
        required: readBoolean(formData, "required"),
        active: readBoolean(formData, "active"),
        creates_certification: readBoolean(formData, "creates_certification"),
        certification_type: readOptionalString(formData, "certification_type"),
        updated_by: user.id,
      })
      .eq("id", courseId)
      .eq("church_id", church.id);

    if (error) throw new Error(error.message);
    revalidatePath("/training/courses");
    return { success: "Course updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function createRequirement(
  _prev: TrainingActionState,
  formData: FormData,
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minManageRequirements: true,
    });
    const supabase = await createClient();
    const name = readString(formData, "name");
    if (!name) return { error: "Requirement name is required." };

    const { error } = await supabase.from("training_requirements").insert({
      church_id: church.id,
      name: name.slice(0, 200),
      training_course_id: readOptionalString(formData, "training_course_id"),
      training_category_id: readOptionalString(formData, "training_category_id"),
      assignment_type: readString(formData, "assignment_type") || "all_security",
      effective_at: readString(formData, "effective_at") || new Date().toISOString().slice(0, 10),
      due_at: readOptionalString(formData, "due_at"),
      renewal_months: readNumber(formData, "renewal_months"),
      grace_period_days: readNumber(formData, "grace_period_days") ?? 0,
      active: true,
      created_by: user.id,
      updated_by: user.id,
    });

    if (error) throw new Error(error.message);
    revalidatePath("/training/required");
    return { success: "Requirement created." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateRequirement(
  requirementId: string,
  _prev: TrainingActionState,
  formData: FormData,
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minManageRequirements: true,
    });
    const supabase = await createClient();

    const { error } = await supabase
      .from("training_requirements")
      .update({
        name: readString(formData, "name").slice(0, 200),
        training_course_id: readOptionalString(formData, "training_course_id"),
        training_category_id: readOptionalString(formData, "training_category_id"),
        assignment_type: readString(formData, "assignment_type") || "all_security",
        due_at: readOptionalString(formData, "due_at"),
        renewal_months: readNumber(formData, "renewal_months"),
        grace_period_days: readNumber(formData, "grace_period_days") ?? 0,
        active: readBoolean(formData, "active"),
        notes: readOptionalString(formData, "notes"),
        updated_by: user.id,
      })
      .eq("id", requirementId)
      .eq("church_id", church.id);

    if (error) throw new Error(error.message);
    revalidatePath("/training/required");
    return { success: "Requirement updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function createExternalTraining(
  _prev: TrainingActionState,
  formData: FormData,
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minExternalSubmit: true,
    });
    const supabase = await createClient();

    const courseName = readString(formData, "course_name");
    const userId = readString(formData, "user_id") || user.id;
    const completionDate = readString(formData, "completion_date");
    if (!courseName || !completionDate) {
      return { error: "Course name and completion date are required." };
    }

    const { error } = await supabase.from("training_external_records").insert({
      church_id: church.id,
      user_id: userId,
      training_category_id: readOptionalString(formData, "training_category_id"),
      course_name: courseName.slice(0, 200),
      category_name: readOptionalString(formData, "category_name"),
      provider_name: readOptionalString(formData, "provider_name"),
      instructor_name: readOptionalString(formData, "instructor_name"),
      location: readOptionalString(formData, "location"),
      completion_date: completionDate,
      training_hours: readNumber(formData, "training_hours"),
      score: readNumber(formData, "score"),
      verification_status: "pending_verification",
      notes: readOptionalString(formData, "notes"),
      created_by: user.id,
      updated_by: user.id,
    });

    if (error) throw new Error(error.message);
    revalidatePath("/training/records");
    return { success: "External training submitted for verification." };
  } catch (error) {
    return actionError(error);
  }
}

export async function verifyExternalTraining(
  externalRecordId: string,
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minExternalVerify: true,
    });
    const supabase = await createClient();

    const { data: external, error: fetchError } = await supabase
      .from("training_external_records")
      .select("*")
      .eq("id", externalRecordId)
      .eq("church_id", church.id)
      .maybeSingle();

    if (fetchError || !external) throw new Error("External record not found.");

    const completedAt = new Date(`${external.completion_date}T12:00:00`).toISOString();
    let renewalDueAt: string | null = null;
    let sensitive = false;
    let categoryId = external.training_category_id;

    if (categoryId) {
      const { data: category } = await supabase
        .from("training_categories")
        .select("default_renewal_months, sensitive")
        .eq("id", categoryId)
        .maybeSingle();
      renewalDueAt = computeRenewalDueAt(
        completedAt,
        category?.default_renewal_months ?? null,
      );
      sensitive = Boolean(category?.sensitive);
    }

    const payload = buildCompletionRecordPayload({
      churchId: church.id,
      userId: external.user_id,
      categoryId,
      courseName: external.course_name,
      categoryName: external.category_name,
      providerName: external.provider_name,
      instructorName: external.instructor_name,
      trainingDate: external.completion_date,
      completedAt,
      trainingHours: external.training_hours,
      score: external.score,
      completionStatus: "completed",
      renewalDueAt,
      sensitive,
      notes: external.notes,
      recordedBy: user.id,
      sourceType: "external",
    });

    const { data: record, error: recordError } = await supabase
      .from("training_completion_records")
      .insert(payload)
      .select("id")
      .single();

    if (recordError) throw new Error(recordError.message);

    await supabase
      .from("training_external_records")
      .update({
        verification_status: "verified",
        verified_by: user.id,
        verified_at: new Date().toISOString(),
        completion_record_id: record.id,
        updated_by: user.id,
      })
      .eq("id", externalRecordId)
      .eq("church_id", church.id);

    await auditTrainingExternalVerified(supabase, {
      churchId: church.id,
      userId: user.id,
      externalRecordId,
      completionRecordId: record.id,
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/training/records");
    return { success: "External training verified." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateTrainingSettings(
  _prev: TrainingActionState,
  formData: FormData,
): Promise<TrainingActionState> {
  try {
    const { user, church } = await requireTrainingContext({
      minManageSettings: true,
    });
    const supabase = await createClient();
    await ensureSettingsRow(church.id);

    const dueSoonDays = readNumber(formData, "due_soon_days") ?? 30;

    const metricColors: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("metric_color_")) continue;
      const metricKey = key.replace("metric_color_", "");
      const hex = String(value).trim();
      if (hex) metricColors[metricKey] = hex;
    }

    const payload = {
      due_soon_days: dueSoonDays,
      reminder_at_assignment: readBoolean(formData, "reminder_at_assignment"),
      reminder_day_of: readBoolean(formData, "reminder_day_of"),
      reminder_days_after_missed:
        readNumber(formData, "reminder_days_after_missed") ?? 7,
      notify_on_completion: readBoolean(formData, "notify_on_completion"),
      notify_on_cancel: readBoolean(formData, "notify_on_cancel"),
      dashboard_metric_colors: buildTrainingMetricColorPayload(metricColors),
    };

    const { error } = await supabase
      .from("training_church_settings")
      .update(payload)
      .eq("church_id", church.id);

    if (error) throw new Error(error.message);

    await auditTrainingSettingsUpdated(supabase, {
      churchId: church.id,
      userId: user.id,
      metadata: payload,
      ipAddress: await getRequestIpAddress(),
    });

    revalidatePath("/training");
    revalidatePath("/training/settings");
    return { success: "Settings saved." };
  } catch (error) {
    return actionError(error);
  }
}

export async function cancelTrainingEventFormAction(
  eventId: string,
): Promise<void> {
  await cancelTrainingEvent(eventId);
}

export async function verifyExternalTrainingFormAction(
  externalRecordId: string,
): Promise<void> {
  await verifyExternalTraining(externalRecordId);
}

export async function ensureTrainingSettings(): Promise<TrainingActionState> {
  try {
    const { church } = await requireTrainingContext({ minManageSettings: true });
    await ensureSettingsRow(church.id);
    return { success: "Settings ready." };
  } catch (error) {
    return actionError(error);
  }
}
