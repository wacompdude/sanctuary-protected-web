import { DEMO_THREAT_WEEK_LEVELS } from "@/lib/demo-seed/constants";
import {
  getRegisteredId,
  registerSeedRecord,
  track,
} from "@/lib/demo-seed/registry";
import { seedPoliciesAndProcedures } from "@/lib/demo-seed/seed-policies";
import type { DemoSeedContext } from "@/lib/demo-seed/types";
import { log, warn } from "@/lib/demo-seed/types";

type UpsertResult = { id: string; created: boolean };

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
function sundayOfWeek(from = new Date()): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}
function overlaps(a0: Date, a1: Date, b0: Date, b1: Date): boolean {
  return a0 < b1 && b0 < a1;
}
function userId(ctx: DemoSeedContext, key: string): string {
  const id = ctx.userIds.get(key);
  if (!id) throw new Error(`Missing seeded user ${key}`);
  return id;
}
function membershipId(ctx: DemoSeedContext, userKey: string): string {
  const key = userKey === "user.owner" ? "membership.owner" : `membership.${userKey}`;
  const id = ctx.membershipIds.get(key);
  if (!id) throw new Error(`Missing seeded membership ${key}`);
  return id;
}

async function upsertRow(params: {
  ctx: DemoSeedContext;
  seedKey: string;
  table: string;
  domain: string;
  payload: Record<string, unknown>;
  label: string;
}): Promise<UpsertResult> {
  const { ctx, seedKey, table, domain, payload, label } = params;
  const existingId = await getRegisteredId(ctx.admin, ctx.seedSource, seedKey);
  if (existingId) {
    const { error } = await ctx.admin
      .from(table)
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", existingId);
    if (error) throw new Error(`${table} update (${seedKey}): ${error.message}`);
    ctx.ids.set(seedKey, existingId);
    await track(ctx.summary, domain, "updated", `Updated ${label}`);
    return { id: existingId, created: false };
  }
  const { data, error } = await ctx.admin.from(table).insert(payload).select("id").single();
  if (error || !data?.id) {
    throw new Error(`${table} insert (${seedKey}): ${error?.message ?? "unknown"}`);
  }
  const id = String(data.id);
  await registerSeedRecord({
    admin: ctx.admin,
    seedSource: ctx.seedSource,
    entityTable: table,
    entityId: id,
    seedKey,
  });
  ctx.ids.set(seedKey, id);
  await track(ctx.summary, domain, "created", `Created ${label}`);
  return { id, created: true };
}

async function seedCampusLocations(ctx: DemoSeedContext): Promise<void> {
  const P = ctx.primaryCampusId;
  const S = ctx.sunshineCampusId;
  const defs: Array<{
    k: string;
    campus: string;
    name: string;
    type: string;
    parent?: string;
    building?: string;
    room?: string;
    zone?: string;
    desc?: string;
  }> = [
    { k: "loc.primary.main_building", campus: P, name: "Main Building", type: "building", building: "Main Building", desc: "Primary campus main building" },
    { k: "loc.primary.main_lobby", campus: P, name: "Main Lobby", type: "room", parent: "loc.primary.main_building", building: "Main Building", room: "Main Lobby" },
    { k: "loc.primary.worship_center", campus: P, name: "Worship Center", type: "worship_area", parent: "loc.primary.main_building", building: "Main Building", room: "Worship Center" },
    { k: "loc.primary.security_office", campus: P, name: "Security Office", type: "security_office", parent: "loc.primary.main_building", building: "Main Building", room: "Security Office" },
    { k: "loc.primary.medical_supply_room", campus: P, name: "Medical Supply Room", type: "storage", parent: "loc.primary.main_building", building: "Main Building", room: "Medical Supply Room" },
    { k: "loc.primary.childrens_wing", campus: P, name: "Children's Wing", type: "zone", parent: "loc.primary.main_building", building: "Main Building", zone: "Children's Wing" },
    { k: "loc.primary.main_entrance", campus: P, name: "Main Entrance", type: "entrance", building: "Main Building", desc: "Exterior main entrance" },
    { k: "loc.primary.north_parking_lot", campus: P, name: "North Parking Lot", type: "parking_area", zone: "North Parking Lot" },
    { k: "loc.sunshine.main_building", campus: S, name: "Main Building", type: "building", building: "Main Building" },
    { k: "loc.sunshine.lobby", campus: S, name: "Lobby", type: "room", parent: "loc.sunshine.main_building", building: "Main Building", room: "Lobby" },
    { k: "loc.sunshine.worship_center", campus: S, name: "Worship Center", type: "worship_area", parent: "loc.sunshine.main_building", building: "Main Building", room: "Worship Center" },
    { k: "loc.sunshine.main_parking_lot", campus: S, name: "Main Parking Lot", type: "parking_area", zone: "Main Parking Lot" },
  ];

  for (const d of defs) {
    const parentId = d.parent
      ? (ctx.ids.get(d.parent) ?? (await getRegisteredId(ctx.admin, ctx.seedSource, d.parent)))
      : null;
    await upsertRow({
      ctx,
      seedKey: d.k,
      table: "campus_locations",
      domain: "campus_locations",
      label: `location ${d.name}`,
      payload: {
        organization_id: ctx.organizationId,
        campus_id: d.campus,
        parent_location_id: parentId,
        name: d.name,
        location_type: d.type,
        building: d.building ?? null,
        room: d.room ?? null,
        zone: d.zone ?? null,
        description: d.desc ?? null,
        status: "active",
        created_by: ctx.ownerUserId,
        updated_by: ctx.ownerUserId,
      },
    });
  }
}

async function seedThreatLevels(ctx: DemoSeedContext): Promise<void> {
  const sunday = sundayOfWeek();
  const notes: Record<string, string> = {
    green: "Routine conditions; no elevated community or campus concerns.",
    blue: "Slightly elevated awareness due to nearby community activity.",
    yellow: "Moderate concern from recent disturbances and visitor volume.",
    orange: "Heightened posture after a serious campus security incident.",
    red: "Immediate high-risk conditions requiring command posture.",
  };

  for (let i = 0; i < DEMO_THREAT_WEEK_LEVELS.length; i++) {
    const level = DEMO_THREAT_WEEK_LEVELS[i]!;
    const weekStart = ymd(addDays(sunday, -(9 - i) * 7));
    const seedKey = `threat.week.${weekStart}`;
    const payload = {
      organization_id: ctx.organizationId,
      week_start: weekStart,
      threat_level: level,
      notes: notes[level] ?? `Demo threat level ${level}.`,
      changed_by: ctx.ownerUserId,
      updated_by: ctx.ownerUserId,
      updated_at: new Date().toISOString(),
    };

    const registered = await getRegisteredId(ctx.admin, ctx.seedSource, seedKey);
    if (registered) {
      const { error } = await ctx.admin.from("organization_threat_levels").update(payload).eq("id", registered);
      if (error) throw new Error(`Threat update: ${error.message}`);
      ctx.ids.set(seedKey, registered);
      await track(ctx.summary, "organization_threat_levels", "updated", `Updated threat ${weekStart}=${level}`);
      continue;
    }

    const { data: existing } = await ctx.admin
      .from("organization_threat_levels")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await ctx.admin.from("organization_threat_levels").update(payload).eq("id", existing.id);
      if (error) throw new Error(`Threat link-update: ${error.message}`);
      await registerSeedRecord({
        admin: ctx.admin,
        seedSource: ctx.seedSource,
        entityTable: "organization_threat_levels",
        entityId: String(existing.id),
        seedKey,
      });
      ctx.ids.set(seedKey, String(existing.id));
      await track(ctx.summary, "organization_threat_levels", "updated", `Linked threat ${weekStart}=${level}`);
      continue;
    }

    const { data, error } = await ctx.admin
      .from("organization_threat_levels")
      .insert({
        organization_id: ctx.organizationId,
        week_start: weekStart,
        threat_level: level,
        notes: payload.notes,
        changed_by: ctx.ownerUserId,
      })
      .select("id")
      .single();
    if (error || !data?.id) throw new Error(`Threat insert: ${error?.message ?? "unknown"}`);
    await registerSeedRecord({
      admin: ctx.admin,
      seedSource: ctx.seedSource,
      entityTable: "organization_threat_levels",
      entityId: String(data.id),
      seedKey,
    });
    ctx.ids.set(seedKey, String(data.id));
    await track(ctx.summary, "organization_threat_levels", "created", `Created threat ${weekStart}=${level}`);
  }
}

async function seedIncidents(ctx: DemoSeedContext): Promise<void> {
  const L = userId(ctx, "user.security_leader");
  const H = userId(ctx, "user.security_member_hannibal");
  const A = userId(ctx, "user.security_member_angus");
  const now = new Date();

  // n, title, type, severity, status, location, campus, by, daysAgo, hour, followUp?, description
  const rows: Array<[number, string, string, string, string, string, string, string, number, number, boolean, string]> = [
    [1, "Visitor fainting in Main Lobby", "medical", "high", "open", "Main Lobby", ctx.primaryCampusId, L, 2, 10, true, "Adult visitor became lightheaded after service. EMS contacted."],
    [2, "Minor laceration in Children's Wing", "medical", "medium", "resolved", "Children's Wing", ctx.primaryCampusId, A, 12, 11, false, "Child cut finger on craft supplies; cleaned and bandaged on site."],
    [3, "Chest pain during Sunshine worship", "medical", "critical", "investigating", "Worship Center", ctx.sunshineCampusId, L, 5, 9, true, "Congregant reported chest pain mid-service. AED staged."],
    [4, "Aggressive confrontation at Main Entrance", "security", "high", "open", "Main Entrance", ctx.primaryCampusId, H, 1, 18, false, "Individual refused to leave after being asked to step outside."],
    [5, "Loud disruption during announcements", "disturbance", "medium", "resolved", "Worship Center", ctx.primaryCampusId, A, 20, 10, false, "Guest shouted during announcements; escorted to lobby and calmed."],
    [6, "Purse reported missing from lobby", "theft", "low", "closed", "Main Lobby", ctx.primaryCampusId, L, 30, 12, false, "Purse recovered from lost-and-found; no suspect identified."],
    [7, "Graffiti on north lot fence", "vandalism", "medium", "resolved", "North Parking Lot", ctx.primaryCampusId, H, 18, 7, false, "Spray paint discovered on perimeter fencing; cleaned same day."],
    [8, "Smoke odor near utility closet", "fire", "critical", "investigating", "Main Building utility corridor", ctx.primaryCampusId, L, 3, 14, true, "Staff reported smoke odor; HVAC inspected."],
    [9, "Unattended package near Security Office", "security", "medium", "open", "Security Office hallway", ctx.primaryCampusId, A, 0, 8, false, "Box left unmarked outside security office; currently isolated."],
    [10, "Parking dispute in north lot", "disturbance", "low", "closed", "North Parking Lot", ctx.primaryCampusId, H, 40, 9, false, "Two drivers argued over a space; both left after mediation."],
    [11, "False alarm from children's door sensor", "other", "medium", "resolved", "Children's Wing", ctx.primaryCampusId, L, 15, 16, false, "Door sensor tripped repeatedly; maintenance reset hardware."],
    [12, "Laptop taken from media booth", "theft", "high", "open", "Worship Center media booth", ctx.primaryCampusId, A, 4, 20, false, "Church laptop missing after midweek rehearsal; cameras requested."],
    [13, "Suspicious vehicle circling campus", "security", "low", "closed", "North Parking Lot", ctx.primaryCampusId, H, 25, 21, false, "Vehicle circled twice then left; plate noted for awareness."],
    [14, "Damaged exterior light fixture", "vandalism", "medium", "investigating", "Main Entrance", ctx.primaryCampusId, L, 7, 6, false, "Entrance light housing cracked overnight; no witnesses."],
    [15, "Heated argument in fellowship hallway", "disturbance", "medium", "resolved", "Main Building hallway", ctx.primaryCampusId, A, 9, 11, false, "Two members argued loudly; separated and debriefed with leaders."],
  ];

  for (const [n, title, type, severity, status, location, campusId, createdBy, daysAgo, hour, followUp, desc] of rows) {
    const seedKey = `incident.${n}`;
    const occurred = addDays(now, -daysAgo);
    occurred.setHours(hour, 15, 0, 0);
    const description = followUp ? `${desc} Follow-up required: yes` : desc;
    const result = await upsertRow({
      ctx,
      seedKey,
      table: "incidents",
      domain: "incidents",
      label: `incident ${n}: ${title}`,
      payload: {
        organization_id: ctx.organizationId,
        campus_id: campusId,
        created_by: createdBy,
        title,
        type,
        severity,
        status,
        location,
        description,
        occurred_at: occurred.toISOString(),
      },
    });

    if (!result.created) continue;
    const { data: updateRow, error } = await ctx.admin
      .from("incident_updates")
      .insert({
        incident_id: result.id,
        organization_id: ctx.organizationId,
        created_by: createdBy,
        update_type: "created",
        content: `Incident created: ${title}`,
        new_status: status,
      })
      .select("id")
      .single();
    if (error || !updateRow?.id) {
      warn(ctx.summary, `Incident update failed for ${seedKey}: ${error?.message ?? "unknown"}`);
      continue;
    }
    await registerSeedRecord({
      admin: ctx.admin,
      seedSource: ctx.seedSource,
      entityTable: "incident_updates",
      entityId: String(updateRow.id),
      seedKey: `incident.${n}.update.created`,
    });
    await track(ctx.summary, "incident_updates", "created", `Created update for incident ${n}`);
  }
}

async function seedSafetyConcerns(ctx: DemoSeedContext): Promise<void> {
  warn(
    ctx.summary,
    "Skipping safety_concern_photos — no placeholder image/storage upload in demo seed.",
  );

  const defs = [
    {
      seedKey: "safety.marcus",
      display_name: "Marcus Reed",
      risk_context: "documented_threat",
      profile_status: "active",
      scope_type: "campus_specific",
      primary_campus_id: ctx.primaryCampusId,
      campusIds: [ctx.primaryCampusId],
      short_note: "Prior verbal threats toward greeters.",
      response_guidance: "Do not engage alone; notify security leadership immediately.",
      restriction_type: "none",
      restriction_status: "not_applicable",
    },
    {
      seedKey: "safety.elaine",
      display_name: "Elaine Foster",
      risk_context: "disruptive_behavior",
      profile_status: "under_review",
      scope_type: "church_wide",
      primary_campus_id: null as string | null,
      campusIds: [] as string[],
      short_note: "Repeated hallway confrontations during services.",
      response_guidance: "Calm verbal redirect; escalate if volume increases.",
      restriction_type: "none",
      restriction_status: "not_applicable",
    },
    {
      seedKey: "safety.victor",
      display_name: "Victor Hale",
      risk_context: "restricted_access",
      profile_status: "active",
      scope_type: "campus_specific",
      primary_campus_id: ctx.sunshineCampusId,
      campusIds: [ctx.sunshineCampusId],
      short_note: "Previous unauthorized access attempts at Sunshine campus.",
      response_guidance: "Contact the Security Leader if observed; do not escort alone.",
      restriction_type: "limited_access",
      restriction_status: "active",
    },
  ];

  for (const d of defs) {
    const result = await upsertRow({
      ctx,
      seedKey: d.seedKey,
      table: "safety_concern_profiles",
      domain: "safety_concern_profiles",
      label: `safety profile ${d.display_name}`,
      payload: {
        organization_id: ctx.organizationId,
        scope_type: d.scope_type,
        primary_campus_id: d.primary_campus_id,
        display_name: d.display_name,
        profile_status: d.profile_status,
        risk_context: d.risk_context,
        restriction_type: d.restriction_type,
        restriction_status: d.restriction_status,
        short_note: d.short_note,
        response_guidance: d.response_guidance,
        general_notes: "FICTITIOUS TEST RECORD — synthetic demo data only; not a real person.",
        last_known_context: "Demo seed awareness profile for training.",
        approved_by: ctx.ownerUserId,
        approved_at: new Date().toISOString(),
        reviewed_by: ctx.ownerUserId,
        last_reviewed_at: new Date().toISOString(),
        next_review_date: ymd(addDays(new Date(), 180)),
        created_by: ctx.ownerUserId,
        updated_by: ctx.ownerUserId,
      },
    });

    for (const campusId of d.campusIds) {
      const linkKey = `${d.seedKey}.campus.${campusId === ctx.primaryCampusId ? "primary" : "sunshine"}`;
      const existingLink = await getRegisteredId(ctx.admin, ctx.seedSource, linkKey);
      if (existingLink) {
        await track(ctx.summary, "safety_concern_profile_campuses", "updated", `Campus link exists ${linkKey}`);
        continue;
      }
      const { data: existing } = await ctx.admin
        .from("safety_concern_profile_campuses")
        .select("id")
        .eq("profile_id", result.id)
        .eq("campus_id", campusId)
        .maybeSingle();
      if (existing?.id) {
        await registerSeedRecord({
          admin: ctx.admin,
          seedSource: ctx.seedSource,
          entityTable: "safety_concern_profile_campuses",
          entityId: String(existing.id),
          seedKey: linkKey,
        });
        await track(ctx.summary, "safety_concern_profile_campuses", "updated", `Linked campus ${linkKey}`);
        continue;
      }
      const { data, error } = await ctx.admin
        .from("safety_concern_profile_campuses")
        .insert({ organization_id: ctx.organizationId, profile_id: result.id, campus_id: campusId })
        .select("id")
        .single();
      if (error || !data?.id) {
        warn(ctx.summary, `Safety campus link failed ${linkKey}: ${error?.message ?? "unknown"}`);
        continue;
      }
      await registerSeedRecord({
        admin: ctx.admin,
        seedSource: ctx.seedSource,
        entityTable: "safety_concern_profile_campuses",
        entityId: String(data.id),
        seedKey: linkKey,
      });
      await track(ctx.summary, "safety_concern_profile_campuses", "created", `Created campus link ${linkKey}`);
    }
  }

  // Link two concerns to related demo incidents when both exist.
  const links: Array<[string, string, string]> = [
    ["safety.marcus", "incident.4", "person_observed"],
    ["safety.victor", "incident.9", "follow_up"],
  ];
  for (const [profileKey, incidentKey, relationship_type] of links) {
    const linkKey = `${profileKey}.incident.${incidentKey}`;
    if (await getRegisteredId(ctx.admin, ctx.seedSource, linkKey)) {
      await track(ctx.summary, "safety_concern_incidents", "skipped", `Link exists ${linkKey}`);
      continue;
    }
    const profileId = ctx.ids.get(profileKey);
    const incidentId = ctx.ids.get(incidentKey);
    if (!profileId || !incidentId) {
      warn(ctx.summary, `Skipping safety-incident link ${linkKey}; missing ids`);
      continue;
    }
    const { data, error } = await ctx.admin
      .from("safety_concern_incidents")
      .insert({
        organization_id: ctx.organizationId,
        profile_id: profileId,
        incident_id: incidentId,
        relationship_type,
        notes: "FICTITIOUS demo link for training workflows.",
        linked_by: ctx.ownerUserId,
      })
      .select("id")
      .single();
    if (error || !data?.id) {
      warn(ctx.summary, `Safety-incident link failed ${linkKey}: ${error?.message ?? "unknown"}`);
      continue;
    }
    await registerSeedRecord({
      admin: ctx.admin,
      seedSource: ctx.seedSource,
      entityTable: "safety_concern_incidents",
      entityId: String(data.id),
      seedKey: linkKey,
    });
    await track(ctx.summary, "safety_concern_incidents", "created", `Linked ${linkKey}`);
  }
}

async function seedCertifications(ctx: DemoSeedContext): Promise<void> {
  const members = [
    ["team.john_smith", "John Smith", "sc_security_leader@sanctuaryprotected.com", "Security Leader", "user.security_leader"],
    ["team.hannibal", "Hannibal Smith", "sc_security_member@sanctuaryprotected.com", "Security Member", "user.security_member_hannibal"],
    ["team.angus", "Angus McGyver", "sc_member@sanctuaryprotected.com", "Security Member", "user.security_member_angus"],
    ["team.sarah_mitchell", "Sarah Mitchell", "sarah.mitchell@fcotfc.test", "Security Member", "user.extra.sarah_mitchell"],
  ] as const;

  for (const [seedKey, full_name, email, title] of members) {
    await upsertRow({
      ctx,
      seedKey,
      table: "team_members",
      domain: "team_members",
      label: `team member ${full_name}`,
      payload: {
        organization_id: ctx.organizationId,
        full_name,
        email,
        title,
        is_active: true,
        created_by: ctx.ownerUserId,
      },
    });
  }

  const today = new Date();
  const d11 = Math.round(11 * 30.4);
  const d5 = Math.round(5 * 30.4);
  const d18 = Math.round(18 * 30.4);
  const certs: Array<[string, string, string, string, number]> = [
    ["cert.john.first_aid", "team.john_smith", "user.security_leader", "First Aid", d11],
    ["cert.john.cpr", "team.john_smith", "user.security_leader", "CPR", d11],
    ["cert.john.aed", "team.john_smith", "user.security_leader", "AED", d11],
    ["cert.hannibal.cpr", "team.hannibal", "user.security_member_hannibal", "CPR", d5],
    ["cert.hannibal.aed", "team.hannibal", "user.security_member_hannibal", "AED", d5],
    ["cert.angus.first_aid", "team.angus", "user.security_member_angus", "First Aid", 45],
    ["cert.sarah.stop_bleed", "team.sarah_mitchell", "user.extra.sarah_mitchell", "Stop the Bleed", d18],
  ];

  for (const [seedKey, teamKey, userKey, type, expiresInDays] of certs) {
    const teamMemberId = ctx.ids.get(teamKey);
    if (!teamMemberId) {
      warn(ctx.summary, `Skipping cert ${seedKey}; missing ${teamKey}`);
      continue;
    }
    await upsertRow({
      ctx,
      seedKey,
      table: "certifications",
      domain: "certifications",
      label: `${type} for ${teamKey}`,
      payload: {
        organization_id: ctx.organizationId,
        team_member_id: teamMemberId,
        user_id: userId(ctx, userKey),
        certification_type: type,
        issuer: "American Red Cross (demo)",
        issue_date: ymd(addMonths(today, -12)),
        expiration_date: ymd(addDays(today, expiresInDays)),
        certificate_number: `DEMO-${seedKey.toUpperCase().replace(/\./g, "-")}`,
        created_by: ctx.ownerUserId,
      },
    });
  }
}

async function seedUnavailability(ctx: DemoSeedContext): Promise<{ start: Date; end: Date }> {
  const start = addDays(new Date(), 21);
  start.setHours(0, 0, 0, 0);
  // Inclusive 14-day window: start day 0 through end of day 13.
  const end = addDays(start, 13);
  end.setHours(23, 59, 59, 0);

  await upsertRow({
    ctx,
    seedKey: "unavail.hannibal.travel",
    table: "member_unavailability",
    domain: "member_unavailability",
    label: "Hannibal Smith 14-day unavailability",
    payload: {
      organization_id: ctx.organizationId,
      membership_id: membershipId(ctx, "user.security_member_hannibal"),
      user_id: userId(ctx, "user.security_member_hannibal"),
      title: "Family travel",
      reason_category: "travel",
      notes: "Demo seed: Hannibal unavailable for 14 consecutive days.",
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      all_day: true,
      timezone: "America/Los_Angeles",
      status: "active",
      created_by: userId(ctx, "user.security_member_hannibal"),
      approved_by: ctx.ownerUserId,
    },
  });
  return { start, end };
}

async function seedSchedule(
  ctx: DemoSeedContext,
  hannibalOff: { start: Date; end: Date },
): Promise<void> {
  const pool = [
    "user.security_leader",
    "user.security_member_hannibal",
    "user.security_member_angus",
    "user.extra.michael_carter",
    "user.extra.sarah_mitchell",
    "user.extra.david_thompson",
    "user.extra.rebecca_lewis",
    "user.extra.thomas_walker",
  ] as const;

  // n, title, type, status, campus, dayOffset, startHour, hours, location, worshipLike
  const events: Array<[number, string, string, string, "primary" | "sunshine", number, number, number, string, boolean]> = [
    [1, "Sunday Worship Service", "worship_service", "completed", "primary", -21, 9, 2, "Worship Center", true],
    [2, "Sunday Worship Service", "worship_service", "completed", "primary", -14, 9, 2, "Worship Center", true],
    [3, "Sunday Worship Service", "worship_service", "scheduled", "primary", 0, 9, 2, "Worship Center", true],
    [4, "Sunday Worship Service", "worship_service", "scheduled", "primary", 7, 9, 2, "Worship Center", true],
    [5, "Sunday Worship — Sunshine", "worship_service", "completed", "sunshine", -7, 10, 2, "Worship Center", true],
    [6, "Sunday Worship — Sunshine", "worship_service", "scheduled", "sunshine", 14, 10, 2, "Worship Center", true],
    [7, "Midweek Prayer Gathering", "special_service", "confirmed", "primary", 3, 19, 1.5, "Worship Center", true],
    [8, "Good Friday Service", "special_service", "scheduled", "primary", 35, 18, 2, "Worship Center", true],
    [9, "Security Team Training", "training", "completed", "primary", -10, 18, 2, "Security Office", false],
    [10, "Leadership Safety Meeting", "meeting", "scheduled", "primary", 5, 17, 1, "Security Office", false],
    [11, "Community Outreach Night", "community_event", "scheduled", "sunshine", 12, 16, 3, "Main Parking Lot", false],
    [12, "Youth Lock-In Coverage", "youth_event", "confirmed", "primary", 28, 20, 4, "Children's Wing", false],
    [13, "Facility Maintenance Window", "maintenance", "cancelled", "primary", 2, 8, 3, "Main Building", false],
    [14, "Active Shooter Drill", "security_drill", "scheduled", "primary", 42, 9, 2, "Main Building", false],
    [15, "Wedding Security Detail", "wedding", "scheduled", "primary", 49, 14, 4, "Worship Center", false],
  ];

  const busy = new Map<string, Array<{ start: Date; end: Date }>>();

  for (const [n, title, event_type, status, campus, dayOffset, startHour, hours, location_name, worshipLike] of events) {
    const campusId = campus === "sunshine" ? ctx.sunshineCampusId : ctx.primaryCampusId;
    const tz = campus === "sunshine" ? "America/New_York" : "America/Los_Angeles";
    const startAt = addDays(new Date(), dayOffset);
    startAt.setHours(Math.floor(startHour), Math.round((startHour % 1) * 60), 0, 0);
    const endAt = new Date(startAt.getTime() + hours * 3600_000);

    const event = await upsertRow({
      ctx,
      seedKey: `event.${n}`,
      table: "schedule_events",
      domain: "schedule_events",
      label: `event ${n}: ${title}`,
      payload: {
        organization_id: ctx.organizationId,
        campus_id: campusId,
        title,
        description: worshipLike ? "Demo worship/service coverage event." : "Demo operational/security coverage event.",
        event_type,
        status,
        location_name,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        timezone: tz,
        security_coverage_required: true,
        estimated_attendance: worshipLike ? 350 : 80,
        risk_level: event_type === "security_drill" ? "high" : "medium",
        created_by: ctx.ownerUserId,
        updated_by: ctx.ownerUserId,
      },
    });

    const shift = await upsertRow({
      ctx,
      seedKey: `shift.${n}`,
      table: "schedule_shifts",
      domain: "schedule_shifts",
      label: `shift for event ${n}`,
      payload: {
        organization_id: ctx.organizationId,
        campus_id: campusId,
        event_id: event.id,
        title: `${title} — Security`,
        description: "Primary security coverage shift",
        shift_type: "security",
        status: status === "completed" ? "completed" : status === "cancelled" ? "cancelled" : "fully_staffed",
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        timezone: tz,
        location_name,
        required_member_count: 2,
        priority: "normal",
        created_by: ctx.ownerUserId,
        updated_by: ctx.ownerUserId,
      },
    });

    // Cancelled shifts reject new assignments in the DB trigger.
    if (status === "cancelled") {
      await track(
        ctx.summary,
        "shift_assignments",
        "skipped",
        `Skipped assignments for cancelled event ${n}`,
      );
      continue;
    }

    const assignees: string[] = [];
    const hannibalBlocked = overlaps(startAt, endAt, hannibalOff.start, hannibalOff.end);
    for (const uk of pool) {
      if (assignees.length >= 2) break;
      if (uk === "user.security_member_hannibal" && hannibalBlocked) continue;
      const slots = busy.get(uk) ?? [];
      if (slots.some((s) => overlaps(startAt, endAt, s.start, s.end))) continue;
      assignees.push(uk);
      slots.push({ start: startAt, end: endAt });
      busy.set(uk, slots);
    }
    for (const uk of pool) {
      if (assignees.length >= 2) break;
      if (assignees.includes(uk)) continue;
      if (uk === "user.security_member_hannibal" && hannibalBlocked) continue;
      assignees.push(uk);
    }

    for (let i = 0; i < assignees.length; i++) {
      const uk = assignees[i]!;
      await upsertRow({
        ctx,
        seedKey: `assign.${n}.${i === 0 ? "a" : "b"}`,
        table: "shift_assignments",
        domain: "shift_assignments",
        label: `assignment event ${n} ${i === 0 ? "a" : "b"}`,
        payload: {
          organization_id: ctx.organizationId,
          shift_id: shift.id,
          membership_id: membershipId(ctx, uk),
          user_id: userId(ctx, uk),
          assignment_role: i === 0 ? "team_lead" : "security_member",
          status: "accepted",
          assigned_by: ctx.ownerUserId,
          assigned_at: new Date().toISOString(),
          responded_at: new Date().toISOString(),
          notes: "Demo seed assignment",
        },
      });
    }
  }
}

async function seedMedicalSupplies(ctx: DemoSeedContext): Promise<void> {
  // seedKey, name, category, unit, qty, min, location — 20 types with varied stock
  const defs: Array<[string, string, string, string, number, number, string]> = [
    ["med.gloves_nitrile", "Nitrile Gloves (M)", "gloves", "box", 24, 4, "Medical Supply Room"],
    ["med.gloves_nitrile_l", "Nitrile Gloves (L)", "gloves", "box", 3, 4, "Sunshine Supply Closet"],
    ["med.bandages_assorted", "Adhesive Bandages Assorted", "bandages", "box", 2, 5, "Medical Supply Room"],
    ["med.elastic_bandage", "Elastic Bandages (Ace)", "bandages", "each", 8, 3, "Medical Supply Room"],
    ["med.gauze_pads", "Sterile Gauze Pads 4x4", "dressings", "pack", 18, 3, "Medical Supply Room"],
    ["med.trauma_dressing", "Trauma Dressings", "dressings", "each", 6, 2, "Stop the Bleed Kit"],
    ["med.antiseptic_wipes", "Antiseptic Wipes", "antiseptic", "box", 0, 2, "Main Lobby AED Cabinet"],
    ["med.medical_tape", "Medical Tape", "other", "roll", 10, 3, "Medical Supply Room"],
    ["med.aspirin", "Aspirin Packets", "medications", "box", 20, 10, "Medical Supply Room"],
    ["med.glucose_gel", "Oral Glucose Gel", "medications", "tube", 1, 3, "Medical Supply Room"],
    ["med.cpr_masks", "CPR Face Shields", "respiratory", "each", 6, 2, "Security Office"],
    ["med.oxygen_cannula", "Nasal Cannula", "respiratory", "each", 3, 2, "Medical Supply Room"],
    ["med.sam_splint", "SAM Splint", "splints", "each", 2, 1, "Medical Supply Room"],
    ["med.tourniquet", "Combat Application Tourniquet", "bleeding_control", "each", 4, 2, "Stop the Bleed Kit"],
    ["med.israeli_bandage", "Israeli Emergency Bandage", "bleeding_control", "each", 0, 4, "Stop the Bleed Kit"],
    ["med.eye_protection", "Protective Eyewear", "protective_equipment", "each", 5, 2, "Medical Supply Room"],
    ["med.ice_packs", "Instant Cold Packs", "other", "each", 15, 6, "Children's Wing"],
    ["med.burn_dressings", "Burn Dressings", "dressings", "pack", 4, 2, "Medical Supply Room"],
    ["med.emergency_blankets", "Emergency Blankets", "other", "each", 12, 4, "Sunshine Supply Closet"],
    ["med.saline_eyewash", "Saline Eyewash Bottles", "other", "each", 2, 3, "Security Office"],
  ];

  const usageSeeded = Boolean(await getRegisteredId(ctx.admin, ctx.seedSource, "medusage.1"));

  for (const [seedKey, name, category, unit, qty, min, location_name] of defs) {
    const existingId = await getRegisteredId(ctx.admin, ctx.seedSource, seedKey);
    const payload: Record<string, unknown> = {
      organization_id: ctx.organizationId,
      name,
      category,
      unit,
      minimum_quantity: min,
      location_name,
      vendor_name: "Demo Medical Supply Co.",
      notes: "FICTITIOUS demo inventory item",
      created_by: ctx.ownerUserId,
      updated_by: ctx.ownerUserId,
    };
    if (!existingId || !usageSeeded) payload.quantity_on_hand = qty;

    await upsertRow({
      ctx,
      seedKey,
      table: "medical_supplies",
      domain: "medical_supplies",
      label: `supply ${name}`,
      payload,
    });
  }

  const usages: Array<[string, string, string, number, string]> = [
    ["medusage.1", "med.gloves_nitrile", "incident.1", 1, "Used during lobby medical response"],
    ["medusage.2", "med.gauze_pads", "incident.2", 1, "Children's Wing laceration dressing"],
    ["medusage.3", "med.aspirin", "incident.3", 1, "Sunshine campus chest-pain response"],
  ];

  for (const [seedKey, supplyKey, incidentKey, qty, notes] of usages) {
    if (await getRegisteredId(ctx.admin, ctx.seedSource, seedKey)) {
      await track(ctx.summary, "medical_supply_usage", "skipped", `Skipped existing usage ${seedKey}`);
      continue;
    }
    const supplyId = ctx.ids.get(supplyKey);
    const incidentId = ctx.ids.get(incidentKey);
    if (!supplyId || !incidentId) {
      warn(ctx.summary, `Skipping ${seedKey}; missing supply/incident ids`);
      continue;
    }
    const { data, error } = await ctx.admin
      .from("medical_supply_usage")
      .insert({
        organization_id: ctx.organizationId,
        incident_id: incidentId,
        medical_supply_id: supplyId,
        quantity_used: qty,
        recorded_by: userId(ctx, "user.security_leader"),
        notes,
      })
      .select("id")
      .single();
    if (error || !data?.id) {
      warn(ctx.summary, `Medical usage insert failed ${seedKey}: ${error?.message ?? "unknown"}`);
      continue;
    }
    await registerSeedRecord({
      admin: ctx.admin,
      seedSource: ctx.seedSource,
      entityTable: "medical_supply_usage",
      entityId: String(data.id),
      seedKey,
    });
    ctx.ids.set(seedKey, String(data.id));
    await track(ctx.summary, "medical_supply_usage", "created", `Created usage ${seedKey}`);
  }
}

async function seedSecurityEquipment(ctx: DemoSeedContext): Promise<void> {
  const categories = [
    "camera", "radio", "access_control", "sensor", "network_device", "computer",
    "alarm_system", "panic_button", "video_recorder", "power_backup", "first_response",
    "mobile_device", "other", "camera", "radio", "sensor", "access_control", "computer",
    "network_device", "other",
  ] as const;
  const statuses = ["active", "active", "maintenance", "active", "out_of_service", "active", "planned", "active"] as const;

  for (let i = 1; i <= 20; i++) {
    const category = categories[i - 1]!;
    const status = statuses[(i - 1) % statuses.length]!;
    const campusId = i % 4 === 0 ? ctx.sunshineCampusId : ctx.primaryCampusId;
    const purchase = addMonths(new Date(), -(12 + i));
    // Warranties: some expired, some expiring within 6 months, some healthy.
    let warrantyMonths = 36;
    if (i <= 2) warrantyMonths = 6; // already outside warranty (purchased 12+ months ago)
    else if (i <= 5) warrantyMonths = 14; // expiring within ~6 months of now
    await upsertRow({
      ctx,
      seedKey: `equip.${i}`,
      table: "security_equipment",
      domain: "security_equipment",
      label: `equipment ${i}`,
      payload: {
        organization_id: ctx.organizationId,
        campus_id: campusId,
        category,
        subcategory: category === "camera" ? "fixed" : null,
        name: `Demo ${category.replace(/_/g, " ")} #${i}`,
        description: "FICTITIOUS demo security equipment asset",
        asset_tag: `DEMO-EQ-${String(i).padStart(3, "0")}`,
        manufacturer: i % 2 === 0 ? "Axis" : "Motorola",
        model: `MODEL-${100 + i}`,
        serial_number: `SN-DEMO-${1000 + i}`,
        status,
        criticality: i % 5 === 0 ? "critical" : i % 3 === 0 ? "high" : "medium",
        location_name: campusId === ctx.sunshineCampusId ? "Sunshine Lobby" : "Main Building",
        building: "Main Building",
        purchase_date: ymd(purchase),
        warranty_expiration: ymd(addMonths(purchase, warrantyMonths)),
        installed_date: status === "planned" ? null : ymd(addDays(purchase, 14)),
        expected_replacement_date: ymd(addMonths(purchase, 60)),
        notes: "Demo seed inventory row",
        created_by: ctx.ownerUserId,
        updated_by: ctx.ownerUserId,
        responsible_user_id: userId(ctx, "user.security_leader"),
      },
    });
  }
}

export async function seedChurchOperations(ctx: DemoSeedContext): Promise<void> {
  log(ctx.summary, "Seeding church operations (locations → equipment)");
  await seedCampusLocations(ctx);
  await seedThreatLevels(ctx);
  await seedIncidents(ctx);
  await seedSafetyConcerns(ctx);
  await seedCertifications(ctx);
  const hannibalOff = await seedUnavailability(ctx);
  await seedSchedule(ctx, hannibalOff);
  await seedMedicalSupplies(ctx);
  await seedSecurityEquipment(ctx);
  await seedPoliciesAndProcedures(ctx);
  log(ctx.summary, "Finished church operations seed");
}
