import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEMO_CHURCH_EMAIL,
  DEMO_CHURCH_NAME,
  DEMO_CHURCH_SLUG,
  DEMO_CHURCH_TIMEZONE,
  DEMO_EXTRA_MEMBERS,
  DEMO_NAMED_USERS,
  DEMO_NOTIFICATION_TYPES_FOR_EMAIL,
  DEMO_OWNER_PLATFORM_EMAIL,
  DEMO_PRIMARY_CAMPUS,
  DEMO_ROLE_MAP,
  DEMO_SUNSHINE_CAMPUS,
  DEMO_WEEK_STARTS_ON,
} from "@/lib/demo-seed/constants";
import {
  getRegisteredId,
  registerSeedRecord,
  track,
} from "@/lib/demo-seed/registry";
import type { DemoSeedContext, DemoSeedSummary } from "@/lib/demo-seed/types";
import { log, warn } from "@/lib/demo-seed/types";
import { changeChurchSubscriptionPlan } from "@/lib/subscriptions/mutations";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";

function digitsPhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 20);
}

async function lookupUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc("get_auth_user_id_by_email", {
    p_email: email.toLowerCase(),
  });
  if (error) {
    // Fallback: list users is expensive; try profiles via auth admin list
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const match = listed.data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    return match?.id ?? null;
  }
  return data ? String(data) : null;
}

async function ensureAuthUser(params: {
  admin: SupabaseClient;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
}): Promise<{ userId: string; created: boolean; updated: boolean }> {
  const existingId = await lookupUserIdByEmail(params.admin, params.email);
  const fullName = `${params.firstName} ${params.lastName}`.trim();
  const metadata = {
    first_name: params.firstName,
    last_name: params.lastName,
    full_name: fullName,
    phone: digitsPhone(params.phone),
    seed_source: "first-church-demo",
  };

  if (existingId) {
    await params.admin.auth.admin.updateUserById(existingId, {
      password: params.password,
      email_confirm: true,
      user_metadata: metadata,
    });
    await params.admin.from("profiles").upsert({
      id: existingId,
      first_name: params.firstName,
      last_name: params.lastName,
      full_name: fullName,
      phone: digitsPhone(params.phone),
      updated_at: new Date().toISOString(),
    });
    return { userId: existingId, created: false, updated: true };
  }

  const { data, error } = await params.admin.auth.admin.createUser({
    email: params.email.toLowerCase(),
    password: params.password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) {
    throw new Error(
      `Unable to create user ${params.email}: ${error?.message ?? "unknown"}`,
    );
  }

  await params.admin.from("profiles").upsert({
    id: data.user.id,
    first_name: params.firstName,
    last_name: params.lastName,
    full_name: fullName,
    phone: digitsPhone(params.phone),
    updated_at: new Date().toISOString(),
  });

  return { userId: data.user.id, created: true, updated: false };
}

async function ensureMembership(params: {
  admin: SupabaseClient;
  churchId: string;
  userId: string;
  role: string;
  seedSource: string;
}): Promise<{ membershipId: string; created: boolean }> {
  // Direct church_memberships writes fail without auth.uid(); the trigger
  // allows mutations only when app.bypass_membership_guards is set.
  // demo_seed_upsert_membership is service_role-only and sets that flag.
  const { data, error } = await params.admin.rpc("demo_seed_upsert_membership", {
    p_church_id: params.churchId,
    p_user_id: params.userId,
    p_role: params.role,
    p_seed_source: params.seedSource,
  });

  if (error) {
    throw new Error(
      `Membership failed for ${params.userId}: ${error.message}`,
    );
  }

  const membershipId =
    data &&
    typeof data === "object" &&
    "membership_id" in data &&
    (data as { membership_id?: unknown }).membership_id
      ? String((data as { membership_id: string }).membership_id)
      : null;

  if (!membershipId) {
    throw new Error(
      `Membership failed for ${params.userId}: missing membership_id in RPC response`,
    );
  }

  const created =
    Boolean(
      data &&
        typeof data === "object" &&
        "created" in data &&
        (data as { created?: unknown }).created,
    );

  return { membershipId, created };
}

export async function seedChurchCore(params: {
  admin: SupabaseClient;
  seedSource: string;
  tempPassword: string;
  summary: DemoSeedSummary;
}): Promise<DemoSeedContext> {
  const { admin, seedSource, tempPassword, summary } = params;
  summary.roleMapping = { ...DEMO_ROLE_MAP };

  const ownerUserId = await lookupUserIdByEmail(
    admin,
    DEMO_OWNER_PLATFORM_EMAIL,
  );
  if (!ownerUserId) {
    throw new Error(
      `Platform owner account ${DEMO_OWNER_PLATFORM_EMAIL} was not found. Bootstrap the super admin first.`,
    );
  }
  log(summary, `Using platform owner ${DEMO_OWNER_PLATFORM_EMAIL}`);

  // Church upsert by seed_source
  let churchId = (
    await admin
      .from("churches")
      .select("id")
      .eq("seed_source", seedSource)
      .maybeSingle()
  ).data?.id as string | undefined;

  const churchPayload = {
    name: DEMO_CHURCH_NAME,
    slug: DEMO_CHURCH_SLUG,
    primary_email: DEMO_CHURCH_EMAIL,
    phone: "1234567890",
    address_line_1: DEMO_PRIMARY_CAMPUS.address_line_1,
    city: DEMO_PRIMARY_CAMPUS.city,
    state: DEMO_PRIMARY_CAMPUS.state,
    postal_code: DEMO_PRIMARY_CAMPUS.postal_code,
    country: "United States",
    timezone: DEMO_CHURCH_TIMEZONE,
    week_starts_on: DEMO_WEEK_STARTS_ON,
    status: "active",
    seed_source: seedSource,
    emergency_contact_name: "John Doe",
    emergency_contact_phone: "1234567890",
    settings: {
      is_test_data: true,
      seed_source: seedSource,
      demo_label: DEMO_CHURCH_NAME,
    },
    updated_at: new Date().toISOString(),
  };

  if (churchId) {
    const { error } = await admin
      .from("churches")
      .update(churchPayload)
      .eq("id", churchId);
    if (error) throw new Error(`Church update failed: ${error.message}`);
    await track(summary, "church", "updated", `Updated church ${DEMO_CHURCH_NAME}`);
  } else {
    const { data, error } = await admin
      .from("churches")
      .insert({
        ...churchPayload,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`Church create failed: ${error?.message ?? "unknown"}`);
    }
    churchId = String(data.id);
    await track(summary, "church", "created", `Created church ${DEMO_CHURCH_NAME}`);
  }

  await registerSeedRecord({
    admin,
    seedSource,
    entityTable: "churches",
    entityId: churchId,
    seedKey: "church.root",
    metadata: { slug: DEMO_CHURCH_SLUG },
  });

  summary.churchId = churchId;

  // Campuses
  async function upsertCampus(
    def: typeof DEMO_PRIMARY_CAMPUS | typeof DEMO_SUNSHINE_CAMPUS,
  ): Promise<string> {
    const registered = await getRegisteredId(admin, seedSource, def.seedKey);
    const payload = {
      church_id: churchId!,
      name: def.name,
      slug: def.slug,
      address_line_1: def.address_line_1,
      city: def.city,
      state: def.state,
      postal_code: def.postal_code,
      country: def.country,
      timezone: def.timezone,
      is_primary: def.is_primary,
      status: "active",
      campus_type: def.is_primary ? "main" : "satellite",
      updated_at: new Date().toISOString(),
    };

    if (registered) {
      const { error } = await admin
        .from("campuses")
        .update(payload)
        .eq("id", registered);
      if (error) throw new Error(`Campus update failed: ${error.message}`);
      await track(summary, "campuses", "updated", `Updated campus ${def.name}`);
      return registered;
    }

    const { data: bySlug } = await admin
      .from("campuses")
      .select("id")
      .eq("church_id", churchId!)
      .eq("slug", def.slug)
      .maybeSingle();

    if (bySlug?.id) {
      await admin.from("campuses").update(payload).eq("id", bySlug.id);
      await registerSeedRecord({
        admin,
        seedSource,
        entityTable: "campuses",
        entityId: String(bySlug.id),
        seedKey: def.seedKey,
      });
      await track(summary, "campuses", "updated", `Linked campus ${def.name}`);
      return String(bySlug.id);
    }

    const { data, error } = await admin
      .from("campuses")
      .insert(payload)
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`Campus create failed: ${error?.message ?? "unknown"}`);
    }
    await registerSeedRecord({
      admin,
      seedSource,
      entityTable: "campuses",
      entityId: String(data.id),
      seedKey: def.seedKey,
    });
    await track(summary, "campuses", "created", `Created campus ${def.name}`);
    return String(data.id);
  }

  const primaryCampusId = await upsertCampus(DEMO_PRIMARY_CAMPUS);
  const sunshineCampusId = await upsertCampus(DEMO_SUNSHINE_CAMPUS);

  // Omni Enterprise
  try {
    await changeChurchSubscriptionPlan({
      churchId,
      planKey: PLAN_KEYS.OMNI_ENTERPRISE,
      status: "active",
      userId: ownerUserId,
      source: "demo_seed_first_church",
      reason: "First Church of the First Church demo seed — Omni Enterprise",
      allowDowngrade: true,
    });
    await track(
      summary,
      "subscription",
      "updated",
      "Assigned Omni Enterprise subscription",
    );
  } catch (error) {
    warn(
      summary,
      `Subscription assignment warning: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  // Owner membership
  const ownerMembership = await ensureMembership({
    admin,
    churchId,
    userId: ownerUserId,
    role: "owner",
    seedSource,
  });
  await registerSeedRecord({
    admin,
    seedSource,
    entityTable: "church_memberships",
    entityId: ownerMembership.membershipId,
    seedKey: "membership.owner",
  });
  await track(
    summary,
    "memberships",
    ownerMembership.created ? "created" : "updated",
    "Owner membership for platform admin",
  );

  summary.testAccounts.push({
    name: "Platform Admin (Owner)",
    email: DEMO_OWNER_PLATFORM_EMAIL,
    role: "owner",
    status: "active",
  });

  const userIds = new Map<string, string>();
  const membershipIds = new Map<string, string>();
  userIds.set("user.owner", ownerUserId);
  membershipIds.set("membership.owner", ownerMembership.membershipId);

  // Named users
  for (const person of DEMO_NAMED_USERS) {
    const ensured = await ensureAuthUser({
      admin,
      email: person.email,
      password: tempPassword,
      firstName: person.firstName,
      lastName: person.lastName,
      phone: person.phone,
    });
    userIds.set(person.seedKey, ensured.userId);
    await registerSeedRecord({
      admin,
      seedSource,
      entityTable: "profiles",
      entityId: ensured.userId,
      seedKey: person.seedKey,
      metadata: { email: person.email.toLowerCase() },
    });
    await track(
      summary,
      "users",
      ensured.created ? "created" : "updated",
      `${ensured.created ? "Created" : "Updated"} user ${person.email.toLowerCase()}`,
    );

    const membership = await ensureMembership({
      admin,
      churchId,
      userId: ensured.userId,
      role: person.role,
      seedSource,
    });
    membershipIds.set(`membership.${person.seedKey}`, membership.membershipId);
    await registerSeedRecord({
      admin,
      seedSource,
      entityTable: "church_memberships",
      entityId: membership.membershipId,
      seedKey: `membership.${person.seedKey}`,
    });
    await track(
      summary,
      "memberships",
      membership.created ? "created" : "updated",
      `${person.role} membership for ${person.email.toLowerCase()}`,
    );

    summary.testAccounts.push({
      name: `${person.firstName} ${person.lastName}`,
      email: person.email.toLowerCase(),
      role: person.role,
      status: "active",
    });

    if (person.enableEmailNotifications) {
      for (const notificationType of DEMO_NOTIFICATION_TYPES_FOR_EMAIL) {
        const prefKey = `pref.${person.seedKey}.${notificationType}`;
        const existingPrefId = await getRegisteredId(admin, seedSource, prefKey);
        const prefPayload = {
          church_id: churchId,
          user_id: ensured.userId,
          notification_type: notificationType,
          email_enabled: true,
          sms_enabled: false,
          push_enabled: false,
          in_app_enabled: true,
          minimum_severity: "informational",
          digest_frequency: "immediate",
          timezone: DEMO_CHURCH_TIMEZONE,
          updated_at: new Date().toISOString(),
        };
        if (existingPrefId) {
          await admin
            .from("notification_preferences")
            .update(prefPayload)
            .eq("id", existingPrefId);
          await track(summary, "notification_preferences", "updated", prefKey);
        } else {
          const { data: existing } = await admin
            .from("notification_preferences")
            .select("id")
            .eq("church_id", churchId)
            .eq("user_id", ensured.userId)
            .eq("notification_type", notificationType)
            .maybeSingle();
          if (existing?.id) {
            await admin
              .from("notification_preferences")
              .update(prefPayload)
              .eq("id", existing.id);
            await registerSeedRecord({
              admin,
              seedSource,
              entityTable: "notification_preferences",
              entityId: String(existing.id),
              seedKey: prefKey,
            });
            await track(summary, "notification_preferences", "updated", prefKey);
          } else {
            const { data: inserted, error } = await admin
              .from("notification_preferences")
              .insert(prefPayload)
              .select("id")
              .single();
            if (error || !inserted) {
              warn(
                summary,
                `Pref insert failed ${prefKey}: ${error?.message ?? "unknown"}`,
              );
            } else {
              await registerSeedRecord({
                admin,
                seedSource,
                entityTable: "notification_preferences",
                entityId: String(inserted.id),
                seedKey: prefKey,
              });
              await track(
                summary,
                "notification_preferences",
                "created",
                prefKey,
              );
            }
          }
        }
      }
    }
  }

  // Extra security members
  for (const person of DEMO_EXTRA_MEMBERS) {
    const ensured = await ensureAuthUser({
      admin,
      email: person.email,
      password: tempPassword,
      firstName: person.firstName,
      lastName: person.lastName,
      phone: person.phone,
    });
    userIds.set(person.seedKey, ensured.userId);
    await registerSeedRecord({
      admin,
      seedSource,
      entityTable: "profiles",
      entityId: ensured.userId,
      seedKey: person.seedKey,
      metadata: { email: person.email, no_outbound_email: true },
    });
    await track(
      summary,
      "users",
      ensured.created ? "created" : "updated",
      `${ensured.created ? "Created" : "Updated"} extra member ${person.email}`,
    );

    const membership = await ensureMembership({
      admin,
      churchId,
      userId: ensured.userId,
      role: "security_member",
      seedSource,
    });
    membershipIds.set(`membership.${person.seedKey}`, membership.membershipId);
    await registerSeedRecord({
      admin,
      seedSource,
      entityTable: "church_memberships",
      entityId: membership.membershipId,
      seedKey: `membership.${person.seedKey}`,
    });
    await track(
      summary,
      "memberships",
      membership.created ? "created" : "updated",
      `security_member membership for ${person.email}`,
    );

    summary.testAccounts.push({
      name: `${person.firstName} ${person.lastName}`,
      email: person.email,
      role: "security_member",
      status: "active",
    });
  }

  // Emergency contact via church fields already set; also church_contacts if useful
  const contactKey = "contact.primary_emergency";
  const existingContact = await getRegisteredId(admin, seedSource, contactKey);
  // Prefer head_of_security contact row as a visible directory entry
  const contactPayload = {
    church_id: churchId,
    contact_type: "head_of_security",
    organization_name: DEMO_CHURCH_NAME,
    full_name: "John Doe",
    phone: "1234567890",
    email: DEMO_CHURCH_EMAIL,
    notes: "Primary Emergency Contact (demo seed — fictitious)",
    sort_order: 1,
    updated_at: new Date().toISOString(),
  };
  if (existingContact) {
    await admin
      .from("church_contacts")
      .update(contactPayload)
      .eq("id", existingContact);
    await track(summary, "contacts", "updated", "Primary emergency contact");
  } else {
    const { data, error } = await admin
      .from("church_contacts")
      .insert(contactPayload)
      .select("id")
      .single();
    if (!error && data) {
      await registerSeedRecord({
        admin,
        seedSource,
        entityTable: "church_contacts",
        entityId: String(data.id),
        seedKey: contactKey,
      });
      await track(summary, "contacts", "created", "Primary emergency contact");
    } else {
      warn(
        summary,
        `church_contacts insert skipped: ${error?.message ?? "unknown"}`,
      );
    }
  }

  return {
    admin,
    seedSource,
    tempPassword,
    ownerUserId,
    summary,
    churchId,
    primaryCampusId,
    sunshineCampusId,
    userIds,
    membershipIds,
    ids: new Map([
      ["campus.primary", primaryCampusId],
      ["campus.sunshine", sunshineCampusId],
    ]),
  };
}
