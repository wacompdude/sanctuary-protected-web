import { createClient } from "@/lib/supabase/server";
import {
  campusFilterOrClause,
  type CampusFilterSelection,
} from "@/lib/campuses/filter";
import { trainingMigrationHintFromError } from "@/lib/training/constants";
import {
  classifyRenewalStatus,
  computeRenewalDueAt,
} from "@/lib/training/renewal";
import type {
  TrainingCategory,
  TrainingCategoryWithState,
  TrainingChurchSettings,
  TrainingCompletionRecord,
  TrainingCourse,
  TrainingDashboardMetrics,
  TrainingEvent,
  TrainingExternalRecord,
  TrainingParticipant,
  TrainingRequirement,
} from "@/lib/training/types";
import { DEFAULT_DUE_SOON_DAYS } from "@/lib/training/constants";
import {
  collectRequiredCourseIds,
  countMembersMissingRequiredTraining,
  loadRequiredTrainingAudience,
} from "@/lib/training/compliance";
import { parseTrainingMetricColors } from "@/lib/training/metric-colors";

function isMissingTrainingTable(message: string): boolean {
  return Boolean(trainingMigrationHintFromError(message));
}

function applyCategoryChurchState(
  categories: TrainingCategory[],
  states: Array<{
    category_id: string;
    active: boolean;
    display_order: number | null;
    is_required: boolean | null;
    description_override: string | null;
  }>,
): TrainingCategoryWithState[] {
  const stateByCategory = new Map(states.map((row) => [row.category_id, row]));

  return categories
    .map((category) => {
      const state = stateByCategory.get(category.id);
      const effectiveActive = category.is_system
        ? state?.active ?? category.active
        : category.active;
      const effectiveDisplayOrder =
        state?.display_order ?? category.display_order;
      const effectiveIsRequired =
        state?.is_required ??
        category.is_required_default ??
        false;
      const descriptionEffective =
        state?.description_override ?? category.description;

      return {
        ...category,
        effective_active: effectiveActive,
        effective_display_order: effectiveDisplayOrder,
        effective_is_required: effectiveIsRequired,
        description_effective: descriptionEffective,
      };
    })
    .filter((category) => category.effective_active)
    .sort(
      (a, b) =>
        a.effective_display_order - b.effective_display_order ||
        a.name.localeCompare(b.name),
    );
}

export async function listCategories(
  organizationId: string,
  options?: { includeSensitive?: boolean },
): Promise<TrainingCategoryWithState[]> {
  const supabase = await createClient();

  const [{ data: categories, error: catError }, { data: states, error: stateError }] =
    await Promise.all([
      supabase
        .from("training_categories")
        .select("*")
        .or(`is_system.eq.true,organization_id.eq.${organizationId}`)
        .order("display_order", { ascending: true }),
      supabase
        .from("training_category_church_state")
        .select("*")
        .eq("organization_id", organizationId),
    ]);

  if (catError) {
    if (isMissingTrainingTable(catError.message)) return [];
    throw new Error(catError.message);
  }
  if (stateError && !isMissingTrainingTable(stateError.message)) {
    throw new Error(stateError.message);
  }

  const merged = applyCategoryChurchState(
    (categories ?? []) as TrainingCategory[],
    (states ?? []) as Array<{
      category_id: string;
      active: boolean;
      display_order: number | null;
      is_required: boolean | null;
      description_override: string | null;
    }>,
  );

  if (options?.includeSensitive === false) {
    return merged.filter((category) => !category.sensitive);
  }

  return merged;
}

export async function listCourses(
  organizationId: string,
  options?: {
    categoryId?: string;
    includeSensitive?: boolean;
    activeOnly?: boolean;
  },
): Promise<TrainingCourse[]> {
  const supabase = await createClient();
  const categories = await listCategories(organizationId, {
    includeSensitive: options?.includeSensitive,
  });
  const categoryIds = categories.map((category) => category.id);
  if (categoryIds.length === 0) return [];

  let query = supabase
    .from("training_courses")
    .select(
      `
      *,
      category:training_categories ( id, name, sensitive )
    `,
    )
    .or(`is_system.eq.true,organization_id.eq.${organizationId}`)
    .in("training_category_id", categoryIds)
    .order("name", { ascending: true });

  if (options?.activeOnly !== false) {
    query = query.eq("active", true);
  }
  if (options?.categoryId) {
    query = query.eq("training_category_id", options.categoryId);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTrainingTable(error.message)) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as TrainingCourse[]).map((row) => {
    const categoryData = row.category as
      | Pick<TrainingCategory, "id" | "name" | "sensitive">
      | Pick<TrainingCategory, "id" | "name" | "sensitive">[]
      | null;
    const category = Array.isArray(categoryData)
      ? categoryData[0] ?? null
      : categoryData;
    return { ...row, category };
  });
}

export async function listEvents(
  organizationId: string,
  options?: {
    campusFilter?: CampusFilterSelection;
    status?: string;
    categoryId?: string;
    from?: string;
    to?: string;
    limit?: number;
    includeSensitive?: boolean;
  },
): Promise<TrainingEvent[]> {
  const supabase = await createClient();

  let query = supabase
    .from("training_events")
    .select(
      `
      *,
      campus:campuses ( id, name ),
      course:training_courses ( id, name, renewal_months ),
      category:training_categories ( id, name, sensitive, default_renewal_months )
    `,
    )
    .eq("organization_id", organizationId)
    .order("start_at", { ascending: true, nullsFirst: false });

  if (options?.campusFilter) {
    const orClause = campusFilterOrClause(options.campusFilter);
    if (orClause) query = query.or(orClause);
  }
  if (options?.status) query = query.eq("status", options.status);
  if (options?.categoryId) {
    query = query.eq("training_category_id", options.categoryId);
  }
  if (options?.from) query = query.gte("start_at", options.from);
  if (options?.to) query = query.lte("start_at", options.to);
  if (options?.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) {
    if (isMissingTrainingTable(error.message)) return [];
    throw new Error(error.message);
  }

  let events = (data ?? []) as TrainingEvent[];
  if (options?.includeSensitive === false) {
    events = events.filter((event) => !event.category?.sensitive);
  }
  return events;
}

export async function getEvent(
  organizationId: string,
  eventId: string,
  options?: { includeSensitive?: boolean },
): Promise<TrainingEvent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_events")
    .select(
      `
      *,
      campus:campuses ( id, name ),
      course:training_courses ( id, name, renewal_months ),
      category:training_categories ( id, name, sensitive, default_renewal_months )
    `,
    )
    .eq("organization_id", organizationId)
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    if (isMissingTrainingTable(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;

  const event = data as TrainingEvent;
  if (options?.includeSensitive === false && event.category?.sensitive) {
    return null;
  }
  return event;
}

async function attachMemberNames<T extends { user_id: string }>(
  organizationId: string,
  rows: T[],
): Promise<Array<T & { member_name: string | null; member_email: string | null }>> {
  if (rows.length === 0) return [];

  const supabase = await createClient();
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const { data } = await supabase.rpc("list_organization_team_memberships", {
    p_church_id: organizationId,
  });

  const nameByUser = new Map<
    string,
    { name: string | null; email: string | null }
  >();
  const { isHiddenPlatformOperatorEmail, loadHiddenPlatformOperatorUserIds } =
    await import("@/lib/platform/hidden-from-church");
  const hiddenUserIds = await loadHiddenPlatformOperatorUserIds();

  for (const row of (data ?? []) as Array<{
    user_id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }>) {
    if (!userIds.includes(row.user_id)) continue;
    if (hiddenUserIds.has(row.user_id)) continue;
    if (isHiddenPlatformOperatorEmail(row.email)) continue;
    const name =
      row.full_name?.trim() ||
      [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
      null;
    nameByUser.set(row.user_id, { name, email: row.email });
  }

  return rows.map((row) => {
    const member = nameByUser.get(row.user_id);
    return {
      ...row,
      member_name: member?.name ?? null,
      member_email: member?.email ?? null,
    };
  });
}

export async function listParticipants(
  organizationId: string,
  eventId: string,
): Promise<TrainingParticipant[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_participants")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("training_event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingTrainingTable(error.message)) return [];
    throw new Error(error.message);
  }

  return attachMemberNames(organizationId, (data ?? []) as TrainingParticipant[]);
}

export async function listCompletionRecords(
  organizationId: string,
  options?: {
    userId?: string;
    categoryId?: string;
    courseId?: string;
    campusFilter?: CampusFilterSelection;
    includeSensitive?: boolean;
    includeArchived?: boolean;
    limit?: number;
  },
): Promise<TrainingCompletionRecord[]> {
  const supabase = await createClient();
  const settings = await getSettings(organizationId);

  let query = supabase
    .from("training_completion_records")
    .select("*")
    .eq("organization_id", organizationId)
    .order("completed_at", { ascending: false });

  if (options?.userId) query = query.eq("user_id", options.userId);
  if (options?.categoryId) {
    query = query.eq("training_category_id", options.categoryId);
  }
  if (options?.courseId) query = query.eq("training_course_id", options.courseId);
  if (options?.campusFilter) {
    const orClause = campusFilterOrClause(options.campusFilter);
    if (orClause) query = query.or(orClause);
  }
  if (!options?.includeArchived) query = query.eq("archived", false);
  if (options?.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) {
    if (isMissingTrainingTable(error.message)) return [];
    throw new Error(error.message);
  }

  let records = (data ?? []) as TrainingCompletionRecord[];
  if (options?.includeSensitive === false) {
    records = records.filter((record) => !record.sensitive);
  }

  const withNames = await attachMemberNames(organizationId, records);
  return withNames.map((record) => ({
    ...record,
    renewal_status: classifyRenewalStatus({
      dueAt: record.renewal_due_at,
      dueSoonDays: settings.due_soon_days,
      exempt: record.completion_status === "exempt",
    }),
  }));
}

export async function getDashboardMetrics(
  organizationId: string,
  options?: {
    campusFilter?: CampusFilterSelection;
    includeSensitive?: boolean;
  },
): Promise<TrainingDashboardMetrics> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const settings = await getSettings(organizationId);

  const [events, completions, requirements, external, courses, audience] =
    await Promise.all([
      listEvents(organizationId, {
        campusFilter: options?.campusFilter,
        from: now.toISOString(),
        includeSensitive: options?.includeSensitive,
      }),
      listCompletionRecords(organizationId, {
        campusFilter: options?.campusFilter,
        includeSensitive: options?.includeSensitive,
      }),
      listRequirements(organizationId),
      listExternalRecords(organizationId, { pendingOnly: true }),
      listCourses(organizationId, {
        includeSensitive: options?.includeSensitive,
      }),
      loadRequiredTrainingAudience(organizationId),
    ]);

  const upcomingEvents = events.filter(
    (event) =>
      event.status !== "cancelled" &&
      event.status !== "archived" &&
      event.status !== "completed",
  ).length;

  const completedThisMonth = completions.filter(
    (record) => record.completed_at >= monthStart,
  ).length;

  let overdueRenewals = 0;
  let dueSoonRenewals = 0;
  for (const record of completions) {
    const status = classifyRenewalStatus({
      dueAt: record.renewal_due_at,
      dueSoonDays: settings.due_soon_days,
      exempt: record.completion_status === "exempt",
    });
    if (status === "overdue" || status === "due") overdueRenewals += 1;
    if (status === "due_soon") dueSoonRenewals += 1;
  }

  const requiredCourseIds = collectRequiredCourseIds({
    requirements,
    courses,
  });
  const uncompletedTrainings = countMembersMissingRequiredTraining({
    teamMembers: audience,
    requiredCourseIds,
    completions,
  });

  return {
    upcomingEvents,
    completedThisMonth,
    uncompletedTrainings,
    overdueRenewals,
    dueSoonRenewals,
    activeRequirements: requirements.filter((req) => req.active).length,
    pendingExternalVerification: external.length,
  };
}

export async function listRequirements(
  organizationId: string,
): Promise<TrainingRequirement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_requirements")
    .select(
      `
      *,
      course:training_courses ( id, name ),
      category:training_categories ( id, name )
    `,
    )
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) {
    if (isMissingTrainingTable(error.message)) return [];
    throw new Error(error.message);
  }

  return (data ?? []) as TrainingRequirement[];
}

export async function getSettings(
  organizationId: string,
): Promise<TrainingChurchSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_organization_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error && !isMissingTrainingTable(error.message)) {
    throw new Error(error.message);
  }

  if (data) {
    const row = data as TrainingChurchSettings & {
      dashboard_metric_colors?: unknown;
    };
    return {
      ...row,
      dashboard_metric_colors: parseTrainingMetricColors(
        row.dashboard_metric_colors,
      ),
    };
  }

  return {
    organization_id: organizationId,
    due_soon_days: DEFAULT_DUE_SOON_DAYS,
    reminder_at_assignment: true,
    reminder_days_before: [30, 14, 7, 1],
    reminder_day_of: true,
    reminder_days_after_missed: 7,
    notify_on_completion: true,
    notify_on_cancel: true,
    dashboard_metric_colors: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function ensureSettingsRow(
  organizationId: string,
): Promise<TrainingChurchSettings> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("training_organization_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (existing) return existing as TrainingChurchSettings;

  const defaults = await getSettings(organizationId);
  const { data, error } = await supabase
    .from("training_organization_settings")
    .upsert(
      {
        organization_id: organizationId,
        due_soon_days: defaults.due_soon_days,
      },
      { onConflict: "organization_id" },
    )
    .select("*")
    .single();

  if (error) {
    if (isMissingTrainingTable(error.message)) return defaults;
    throw new Error(error.message);
  }

  return data as TrainingChurchSettings;
}

export async function getMemberTranscript(
  organizationId: string,
  userId: string,
  options?: { includeSensitive?: boolean },
): Promise<TrainingCompletionRecord[]> {
  return listCompletionRecords(organizationId, {
    userId,
    includeSensitive: options?.includeSensitive,
  });
}

export async function listExternalRecords(
  organizationId: string,
  options?: { pendingOnly?: boolean; userId?: string },
): Promise<TrainingExternalRecord[]> {
  const supabase = await createClient();
  let query = supabase
    .from("training_external_records")
    .select("*")
    .eq("organization_id", organizationId)
    .order("completion_date", { ascending: false });

  if (options?.userId) query = query.eq("user_id", options.userId);
  if (options?.pendingOnly) {
    query = query.in("verification_status", [
      "not_reviewed",
      "pending_verification",
    ]);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTrainingTable(error.message)) return [];
    throw new Error(error.message);
  }

  return attachMemberNames(organizationId, (data ?? []) as TrainingExternalRecord[]);
}

export async function listCampusesForTraining(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campuses")
    .select("id, name, short_name, is_primary, status")
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export { computeRenewalDueAt, classifyRenewalStatus };
