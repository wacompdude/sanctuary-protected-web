import { AuditAction, AuditEntityType } from "@/lib/audit/actions";
import { writePlatformAdminAction } from "@/lib/platform/audit";
import { PlatformAccessError } from "@/lib/platform/errors";
import type { PlatformContext } from "@/lib/platform/types";
import type {
  PlatformAccessSessionStatus,
  PlatformAccessSessionType,
} from "@/lib/platform/types";
import { requirePlatformAdminClient } from "@/lib/platform/queries";
import {
  clearPlatformSupportSessionCookie,
  readPlatformSupportSessionCookie,
  writePlatformSupportSessionCookie,
} from "@/lib/platform/support-session-cookie";

export {
  SUPPORT_SESSION_ACCESS_TYPES,
  SUPPORT_SESSION_DURATION_OPTIONS,
} from "@/lib/platform/support-session-options";

export type PlatformSupportSessionRecord = {
  id: string;
  platform_account_id: string;
  church_id: string;
  church_name: string | null;
  access_type: PlatformAccessSessionType;
  reason: string;
  ticket_reference: string | null;
  status: PlatformAccessSessionStatus;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
};

function parseAccessType(value: string): PlatformAccessSessionType {
  if (
    value === "read_only" ||
    value === "support" ||
    value === "administrative" ||
    value === "emergency"
  ) {
    return value;
  }
  throw new Error("Invalid support access type.");
}

function assertAccessTypeAllowed(
  context: PlatformContext,
  accessType: PlatformAccessSessionType,
) {
  if (accessType === "administrative") {
    if (!context.permissions.has("churches.update_all")) {
      throw new PlatformAccessError(
        "Administrative support sessions require churches.update_all.",
        "FORBIDDEN_PERMISSION",
      );
    }
  }
  if (accessType === "emergency") {
    if (!context.permissions.has("platform.super_admin.manage")) {
      throw new PlatformAccessError(
        "Emergency support sessions require platform.super_admin.manage.",
        "FORBIDDEN_PERMISSION",
      );
    }
  }
}

async function expireStaleSessionsForAccount(
  platformAccountId: string,
): Promise<void> {
  const admin = requirePlatformAdminClient();
  await admin
    .from("platform_access_sessions")
    .update({
      status: "expired",
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("platform_account_id", platformAccountId)
    .eq("status", "active")
    .lt("expires_at", new Date().toISOString());
}

export async function startPlatformSupportSession(params: {
  context: PlatformContext;
  churchId: string;
  reason: string;
  ticketReference?: string | null;
  accessType?: string;
  durationMinutes?: number;
}): Promise<PlatformSupportSessionRecord> {
  if (!params.context.permissions.has("churches.support_access")) {
    throw new PlatformAccessError(
      "You do not have permission to start support sessions.",
      "FORBIDDEN_PERMISSION",
    );
  }

  const reason = params.reason.trim();
  if (reason.length < 8) {
    throw new Error("Support reason must be at least 8 characters.");
  }

  const durationMinutes = Math.min(
    240,
    Math.max(15, Number(params.durationMinutes) || 60),
  );
  const accessType = parseAccessType(params.accessType ?? "read_only");
  assertAccessTypeAllowed(params.context, accessType);

  const admin = requirePlatformAdminClient();
  const { data: church, error: churchError } = await admin
    .from("churches")
    .select("id, name")
    .eq("id", params.churchId)
    .maybeSingle();

  if (churchError || !church) {
    throw new Error(churchError?.message || "Church not found.");
  }

  await expireStaleSessionsForAccount(params.context.account.id);

  // End any other active sessions for this account (one active focus at a time).
  await admin
    .from("platform_access_sessions")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      ended_by: params.context.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("platform_account_id", params.context.account.id)
    .eq("status", "active");

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + durationMinutes * 60_000);

  const { data: session, error } = await admin
    .from("platform_access_sessions")
    .insert({
      platform_account_id: params.context.account.id,
      church_id: church.id,
      access_type: accessType,
      reason,
      ticket_reference: params.ticketReference?.trim() || null,
      status: "active",
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select(
      "id, platform_account_id, church_id, access_type, reason, ticket_reference, status, started_at, expires_at, ended_at",
    )
    .single();

  if (error || !session) {
    throw new Error(error?.message || "Unable to start support session.");
  }

  await writePlatformSupportSessionCookie(String(session.id), expiresAt);

  await writePlatformAdminAction(
    {
      platformAccountId: params.context.account.id,
      actorUserId: params.context.user.id,
      action: AuditAction.PLATFORM_SUPPORT_SESSION_STARTED,
      targetType: AuditEntityType.PLATFORM_ACCESS_SESSION,
      targetId: String(session.id),
      churchId: String(church.id),
      reason,
      metadata: {
        access_type: accessType,
        duration_minutes: durationMinutes,
        ticket_reference: params.ticketReference?.trim() || null,
        church_name: church.name,
      },
    },
    { client: admin },
  );

  return {
    id: String(session.id),
    platform_account_id: String(session.platform_account_id),
    church_id: String(session.church_id),
    church_name: String(church.name),
    access_type: session.access_type as PlatformAccessSessionType,
    reason: String(session.reason),
    ticket_reference: (session.ticket_reference as string | null) ?? null,
    status: session.status as PlatformAccessSessionStatus,
    started_at: String(session.started_at),
    expires_at: String(session.expires_at),
    ended_at: (session.ended_at as string | null) ?? null,
  };
}

export async function endPlatformSupportSession(params: {
  context: PlatformContext;
  sessionId?: string | null;
  reason?: string | null;
}): Promise<void> {
  const admin = requirePlatformAdminClient();
  await expireStaleSessionsForAccount(params.context.account.id);

  const cookieSessionId = await readPlatformSupportSessionCookie();
  const sessionId = (params.sessionId || cookieSessionId || "").trim();
  if (!sessionId) {
    await clearPlatformSupportSessionCookie();
    return;
  }

  const { data: session } = await admin
    .from("platform_access_sessions")
    .select("id, platform_account_id, church_id, status, access_type")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    await clearPlatformSupportSessionCookie();
    return;
  }

  if (session.platform_account_id !== params.context.account.id) {
    if (!params.context.permissions.has("platform.accounts.update")) {
      throw new PlatformAccessError(
        "You can only end your own support sessions.",
        "FORBIDDEN_PERMISSION",
      );
    }
  }

  if (session.status === "active") {
    await admin
      .from("platform_access_sessions")
      .update({
        status: "ended",
        ended_at: new Date().toISOString(),
        ended_by: params.context.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    await writePlatformAdminAction(
      {
        platformAccountId: params.context.account.id,
        actorUserId: params.context.user.id,
        action: AuditAction.PLATFORM_SUPPORT_SESSION_ENDED,
        targetType: AuditEntityType.PLATFORM_ACCESS_SESSION,
        targetId: String(session.id),
        churchId: String(session.church_id),
        reason: params.reason?.trim() || "Support session ended",
        metadata: {
          access_type: session.access_type,
        },
      },
      { client: admin },
    );
  }

  if (cookieSessionId === sessionId) {
    await clearPlatformSupportSessionCookie();
  }
}

async function hydrateSession(
  row: Record<string, unknown>,
  churchName?: string | null,
): Promise<PlatformSupportSessionRecord> {
  return {
    id: String(row.id),
    platform_account_id: String(row.platform_account_id),
    church_id: String(row.church_id),
    church_name: churchName ?? null,
    access_type: row.access_type as PlatformAccessSessionType,
    reason: String(row.reason ?? ""),
    ticket_reference: (row.ticket_reference as string | null) ?? null,
    status: row.status as PlatformAccessSessionStatus,
    started_at: String(row.started_at),
    expires_at: String(row.expires_at),
    ended_at: (row.ended_at as string | null) ?? null,
  };
}

export async function getActivePlatformSupportSession(
  context: PlatformContext,
): Promise<PlatformSupportSessionRecord | null> {
  await expireStaleSessionsForAccount(context.account.id);
  const admin = requirePlatformAdminClient();
  const cookieSessionId = await readPlatformSupportSessionCookie();

  const result = cookieSessionId
    ? await admin
        .from("platform_access_sessions")
        .select(
          "id, platform_account_id, church_id, access_type, reason, ticket_reference, status, started_at, expires_at, ended_at",
        )
        .eq("id", cookieSessionId)
        .eq("platform_account_id", context.account.id)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()
    : await admin
        .from("platform_access_sessions")
        .select(
          "id, platform_account_id, church_id, access_type, reason, ticket_reference, status, started_at, expires_at, ended_at",
        )
        .eq("platform_account_id", context.account.id)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  const session = result.data;
  if (!session) {
    if (cookieSessionId) await clearPlatformSupportSessionCookie();
    return null;
  }

  const { data: church } = await admin
    .from("churches")
    .select("name")
    .eq("id", session.church_id)
    .maybeSingle();

  return hydrateSession(
    session as Record<string, unknown>,
    church?.name ? String(church.name) : null,
  );
}

export async function requireActiveSupportSessionForChurch(
  context: PlatformContext,
  churchId: string,
): Promise<PlatformSupportSessionRecord> {
  const session = await getActivePlatformSupportSession(context);
  if (!session || session.church_id !== churchId) {
    throw new PlatformAccessError(
      "An active support session for this church is required.",
      "FORBIDDEN_PERMISSION",
    );
  }
  return session;
}

/**
 * Church console access: either churches.read_all, or an active support session
 * for this church (developers / temporary scoped access).
 */
export async function assertPlatformChurchReadable(
  context: PlatformContext,
  churchId: string,
): Promise<void> {
  if (context.permissions.has("churches.read_all")) return;
  if (!context.permissions.has("churches.support_access")) {
    throw new PlatformAccessError(
      "You do not have permission to view this church.",
      "FORBIDDEN_PERMISSION",
    );
  }
  await requireActiveSupportSessionForChurch(context, churchId);
}

export async function lookupChurchesForSupportAccess(params: {
  context: PlatformContext;
  query: string;
}): Promise<Array<{ id: string; name: string; slug: string | null; status: string | null }>> {
  if (!params.context.permissions.has("churches.support_access")) {
    throw new PlatformAccessError(
      "You do not have permission to look up churches for support.",
      "FORBIDDEN_PERMISSION",
    );
  }

  const q = params.query.trim();
  if (q.length < 2) return [];

  const admin = requirePlatformAdminClient();
  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      q,
    );

  if (uuidLike) {
    const { data } = await admin
      .from("churches")
      .select("id, name, slug, status")
      .eq("id", q)
      .maybeSingle();
    return data
      ? [
          {
            id: String(data.id),
            name: String(data.name),
            slug: (data.slug as string | null) ?? null,
            status: (data.status as string | null) ?? null,
          },
        ]
      : [];
  }

  const { data, error } = await admin
    .from("churches")
    .select("id, name, slug, status")
    .or(
      `name.ilike.%${q.replaceAll(",", " ")}%,slug.ilike.%${q.replaceAll(",", " ")}%`,
    )
    .order("name", { ascending: true })
    .limit(10);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    slug: (row.slug as string | null) ?? null,
    status: (row.status as string | null) ?? null,
  }));
}

export async function listRecentSupportSessionsForAccount(
  context: PlatformContext,
  limit = 20,
): Promise<PlatformSupportSessionRecord[]> {
  await expireStaleSessionsForAccount(context.account.id);
  const admin = requirePlatformAdminClient();
  const { data, error } = await admin
    .from("platform_access_sessions")
    .select(
      "id, platform_account_id, church_id, access_type, reason, ticket_reference, status, started_at, expires_at, ended_at",
    )
    .eq("platform_account_id", context.account.id)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const churchIds = [
    ...new Set((data ?? []).map((row) => String(row.church_id))),
  ];
  const nameById = new Map<string, string>();
  if (churchIds.length) {
    const { data: churches } = await admin
      .from("churches")
      .select("id, name")
      .in("id", churchIds);
    for (const church of churches ?? []) {
      nameById.set(String(church.id), String(church.name));
    }
  }

  return Promise.all(
    (data ?? []).map((row) =>
      hydrateSession(
        row as Record<string, unknown>,
        nameById.get(String(row.church_id)) ?? null,
      ),
    ),
  );
}
