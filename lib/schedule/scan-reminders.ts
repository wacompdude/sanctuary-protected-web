import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications/create-notification";
import { formatChurchDateTime } from "@/lib/datetime/format";
import { CONFIRMED_STAFFING_STATUSES } from "@/lib/schedule/constants";

export type ScheduleScanResult = {
  churchesScanned: number;
  remindersQueued: number;
  unfilledWarningsQueued: number;
  duplicatesSkipped: number;
  errors: string[];
};

async function claimReminderKey(input: {
  churchId: string;
  dedupeKey: string;
  reminderKind: string;
  shiftId?: string | null;
  assignmentId?: string | null;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("schedule_reminder_keys").insert({
    church_id: input.churchId,
    dedupe_key: input.dedupeKey,
    reminder_kind: input.reminderKind,
    shift_id: input.shiftId ?? null,
    assignment_id: input.assignmentId ?? null,
  });
  if (error) {
    if (error.code === "23505") return false;
    throw new Error(error.message);
  }
  return true;
}

/**
 * Process upcoming assignment reminders and unfilled-shift warnings.
 * Uses schedule_reminder_keys for idempotent dedupe.
 */
export async function scanScheduleReminders(options?: {
  churchId?: string;
  now?: Date;
}): Promise<ScheduleScanResult> {
  const result: ScheduleScanResult = {
    churchesScanned: 0,
    remindersQueued: 0,
    unfilledWarningsQueued: 0,
    duplicatesSkipped: 0,
    errors: [],
  };

  if (!isServiceRoleConfigured()) {
    result.errors.push(
      "SUPABASE_SERVICE_ROLE_KEY is not configured; schedule scan requires admin access.",
    );
    return result;
  }

  const admin = createAdminClient();
  const now = options?.now ?? new Date();

  let churchQuery = admin
    .from("churches")
    .select("id, name, timezone")
    .in("status", ["trial", "active"]);
  if (options?.churchId) {
    churchQuery = churchQuery.eq("id", options.churchId);
  }

  const { data: churches, error: churchError } = await churchQuery;
  if (churchError) {
    result.errors.push(`Failed to load churches: ${churchError.message}`);
    return result;
  }

  for (const church of churches ?? []) {
    result.churchesScanned += 1;

    const { data: settings } = await admin
      .from("church_schedule_settings")
      .select(
        "default_first_reminder_minutes, default_second_reminder_minutes, unfilled_shift_warning_minutes, assignment_invitation_email_enabled, timezone",
      )
      .eq("church_id", church.id)
      .maybeSingle();

    const firstMinutes = settings?.default_first_reminder_minutes ?? 1440;
    const secondMinutes = settings?.default_second_reminder_minutes ?? 120;
    const unfilledMinutes = settings?.unfilled_shift_warning_minutes ?? 2880;
    const tz =
      settings?.timezone ||
      church.timezone ||
      "America/Los_Angeles";

    // Load upcoming non-cancelled shifts in the farthest reminder window
    const horizonMs =
      Math.max(firstMinutes, secondMinutes, unfilledMinutes) * 60 * 1000;
    const horizonEnd = new Date(now.getTime() + horizonMs).toISOString();

    const { data: shifts, error: shiftError } = await admin
      .from("schedule_shifts")
      .select(
        "id, title, start_at, end_at, status, required_member_count, confirmed_assignment_count, location_name",
      )
      .eq("church_id", church.id)
      .neq("status", "cancelled")
      .neq("status", "completed")
      .gte("start_at", now.toISOString())
      .lte("start_at", horizonEnd);

    if (shiftError) {
      result.errors.push(
        `Church ${church.id}: shifts load failed: ${shiftError.message}`,
      );
      continue;
    }

    for (const shift of shifts ?? []) {
      const startMs = new Date(shift.start_at as string).getTime();
      const minutesUntil = (startMs - now.getTime()) / 60000;

      // Assignment reminders
      const { data: assignments } = await admin
        .from("shift_assignments")
        .select("id, user_id, status")
        .eq("church_id", church.id)
        .eq("shift_id", shift.id)
        .in("status", [...CONFIRMED_STAFFING_STATUSES, "invited", "pending"]);

      for (const assignment of assignments ?? []) {
        if (!assignment.user_id) continue;

        const windows: Array<{ kind: string; minutes: number }> = [
          { kind: "24h", minutes: firstMinutes },
          { kind: "2h", minutes: secondMinutes },
        ];

        for (const window of windows) {
          if (window.minutes <= 0) continue;
          // Fire when within 60 minutes after the reminder threshold
          if (
            minutesUntil > window.minutes ||
            minutesUntil < window.minutes - 60
          ) {
            continue;
          }

          const dedupeKey = `shift-reminder:${shift.id}:${assignment.id}:${window.kind}`;
          let claimed = false;
          try {
            claimed = await claimReminderKey({
              churchId: church.id,
              dedupeKey,
              reminderKind: `assignment_reminder_${window.kind}`,
              shiftId: shift.id as string,
              assignmentId: assignment.id as string,
            });
          } catch (error) {
            result.errors.push(
              error instanceof Error ? error.message : String(error),
            );
            continue;
          }

          if (!claimed) {
            result.duplicatesSkipped += 1;
            continue;
          }

          const notifyResult = await createNotification({
            churchId: church.id,
            notificationType: "schedule.assignment_reminder",
            severity: "medium",
            entityType: "shift_assignment",
            entityId: assignment.id as string,
            actionUrl: `/schedule/my-schedule`,
            recipientUserIds: [assignment.user_id as string],
            channels: ["in_app", "email"],
            deduplicationKey: dedupeKey,
            templateVariables: {
              shift_title: shift.title as string,
              shift_start: formatChurchDateTime(shift.start_at as string, {
                timeZone: tz,
              }),
              shift_end: formatChurchDateTime(shift.end_at as string, {
                timeZone: tz,
              }),
              location_name: (shift.location_name as string | null) ?? "",
              custom_message: "",
            },
            metadata: {
              shift_id: shift.id,
              assignment_id: assignment.id,
              reminder_kind: window.kind,
            },
          });

          if (notifyResult.notificationId) {
            result.remindersQueued += 1;
            await admin
              .from("schedule_reminder_keys")
              .update({ notification_id: notifyResult.notificationId })
              .eq("church_id", church.id)
              .eq("dedupe_key", dedupeKey);
          } else if (notifyResult.error) {
            result.errors.push(notifyResult.error);
          }
        }
      }

      // Unfilled shift warnings to schedule managers
      const required = Number(shift.required_member_count ?? 0);
      const confirmed = Number(shift.confirmed_assignment_count ?? 0);
      const open = Math.max(0, required - confirmed);
      if (
        open > 0 &&
        unfilledMinutes > 0 &&
        minutesUntil <= unfilledMinutes &&
        minutesUntil >= unfilledMinutes - 60
      ) {
        const dedupeKey = `unfilled-shift:${shift.id}:${unfilledMinutes}m`;
        let claimed = false;
        try {
          claimed = await claimReminderKey({
            churchId: church.id,
            dedupeKey,
            reminderKind: "unfilled_shift_warning",
            shiftId: shift.id as string,
          });
        } catch (error) {
          result.errors.push(
            error instanceof Error ? error.message : String(error),
          );
          continue;
        }

        if (!claimed) {
          result.duplicatesSkipped += 1;
          continue;
        }

        const { data: managers } = await admin
          .from("church_memberships")
          .select("user_id")
          .eq("church_id", church.id)
          .eq("status", "active")
          .in("role", [
            "owner",
            "co_owner",
            "administrator",
            "security_leader",
          ]);

        const managerIds = [
          ...new Set(
            (managers ?? [])
              .map((row) => row.user_id as string)
              .filter(Boolean),
          ),
        ];

        if (managerIds.length === 0) continue;

        const notifyResult = await createNotification({
          churchId: church.id,
          notificationType: "schedule.unfilled_shift_warning",
          severity: "high",
          entityType: "schedule_shift",
          entityId: shift.id as string,
          actionUrl: `/schedule/shifts/${shift.id}`,
          recipientUserIds: managerIds,
          channels: ["in_app", "email"],
          deduplicationKey: dedupeKey,
          templateVariables: {
            shift_title: shift.title as string,
            shift_start: formatChurchDateTime(shift.start_at as string, {
              timeZone: tz,
            }),
            shift_end: formatChurchDateTime(shift.end_at as string, {
              timeZone: tz,
            }),
            required_count: required,
            confirmed_count: confirmed,
            open_positions: open,
          },
        });

        if (notifyResult.notificationId) {
          result.unfilledWarningsQueued += 1;
          await admin
            .from("schedule_reminder_keys")
            .update({ notification_id: notifyResult.notificationId })
            .eq("church_id", church.id)
            .eq("dedupe_key", dedupeKey);
        } else if (notifyResult.error) {
          result.errors.push(notifyResult.error);
        }
      }
    }
  }

  return result;
}
