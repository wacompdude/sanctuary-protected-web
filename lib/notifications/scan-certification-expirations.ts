import { createAdminClient, isServiceRoleConfigured } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications/create-notification";
import { getChurchNotificationSettings } from "@/lib/notifications/settings";

export interface CertificationScanResult {
  churchesScanned: number;
  certificationsScanned: number;
  notificationsQueued: number;
  duplicatesSkipped: number;
  errors: string[];
}

/**
 * Scan all churches for certifications that are expiring soon or already expired,
 * and enqueue a notification for each that hasn't already been sent (deduplication key).
 *
 * Designed to be called once per day from a cron job.
 */
export async function scanCertificationExpirations(options?: {
  churchId?: string;
  now?: Date;
}): Promise<CertificationScanResult> {
  const result: CertificationScanResult = {
    churchesScanned: 0,
    certificationsScanned: 0,
    notificationsQueued: 0,
    duplicatesSkipped: 0,
    errors: [],
  };

  if (!isServiceRoleConfigured()) {
    result.errors.push(
      "SUPABASE_SERVICE_ROLE_KEY is not configured; certification scan requires admin access.",
    );
    return result;
  }

  const admin = createAdminClient();
  const now = options?.now ?? new Date();

  // Load all churches (or a single one when testing).
  const churchQuery = admin.from("churches").select("id, name").eq("is_active", true);
  if (options?.churchId) {
    churchQuery.eq("id", options.churchId);
  }
  const { data: churches, error: churchError } = await churchQuery;
  if (churchError || !churches?.length) {
    if (churchError) result.errors.push(`Failed to load churches: ${churchError.message}`);
    return result;
  }

  for (const church of churches) {
    result.churchesScanned++;

    // Load per-church notification settings to get certification_warning_days.
    const settings = await getChurchNotificationSettings(admin, church.id).catch(
      () => null,
    );
    const warningDays = settings?.certification_warning_days ?? 60;

    // Calculate the threshold date: certs expiring within warningDays from now.
    const warningThreshold = new Date(now);
    warningThreshold.setDate(warningThreshold.getDate() + warningDays);
    const thresholdStr = warningThreshold.toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);

    // Fetch certifications for this church that are expiring or already expired.
    const { data: certs, error: certError } = await admin
      .from("certifications")
      .select(
        "id, certification_type, expiration_date, team_member_id, team_members(id, full_name, email)",
      )
      .eq("church_id", church.id)
      .lte("expiration_date", thresholdStr) // on or before the warning threshold
      .order("expiration_date", { ascending: true });

    if (certError) {
      result.errors.push(
        `Church ${church.id}: failed to load certifications: ${certError.message}`,
      );
      continue;
    }

    for (const cert of certs ?? []) {
      result.certificationsScanned++;

      const isExpired = cert.expiration_date < todayStr;
      const notificationType = isExpired ? "certification.expired" : "certification.expiring";
      const severity = isExpired ? "high" : "medium";

      // Deduplication key includes the expiration_date so re-updated certs get a fresh notice.
      const deduplicationKey = `${notificationType}:${cert.id}:${cert.expiration_date}`;

      const memberData = Array.isArray(cert.team_members)
        ? cert.team_members[0]
        : cert.team_members;
      const memberName: string = (memberData as { full_name?: string } | null)?.full_name ?? "Team member";

      const notifyResult = await createNotification(
        {
          churchId: church.id,
          notificationType,
          severity,
          entityType: "certification",
          entityId: cert.id,
          actionUrl: "/certifications",
          deduplicationKey,
          templateVariables: {
            certification_type: cert.certification_type ?? "Unknown",
            expiration_date: cert.expiration_date,
            holder_name: memberName,
          },
        },
        { dispatchNow: false },
      );

      if (notifyResult.status === "duplicate") {
        result.duplicatesSkipped++;
      } else if (notifyResult.status === "queued") {
        result.notificationsQueued++;
      } else if (notifyResult.error) {
        result.errors.push(
          `Cert ${cert.id} (${church.id}): ${notifyResult.error}`,
        );
      }
    }
  }

  return result;
}
