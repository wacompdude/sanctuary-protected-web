/**
 * lib/demo-seed/seed-training.ts
 * Demo Training Management data for First Church of the First Church.
 *
 * Seeds:
 * - 20 church courses (varied categories / delivery methods)
 * - 10 training events with calendar dates (50% required)
 * - Requirements for required courses
 * - Participants + completion history (~33% of team completed required training)
 */
import {
  getRegisteredId,
  registerSeedRecord,
  track,
} from "@/lib/demo-seed/registry";
import type { DemoSeedContext } from "@/lib/demo-seed/types";
import { log, warn } from "@/lib/demo-seed/types";

type UpsertResult = { id: string; created: boolean };

type CourseDef = {
  seedKey: string;
  categorySystemKey: string;
  name: string;
  courseCode: string;
  deliveryMethod:
    | "in_person_classroom"
    | "online"
    | "webinar"
    | "practical_exercise"
    | "drill"
    | "scenario_based"
    | "self_paced"
    | "external_provider"
    | "hybrid"
    | "other";
  durationMinutes: number;
  required: boolean;
  renewalMonths: number | null;
  createsCertification: boolean;
  certificationType: string | null;
};

type EventDef = {
  seedKey: string;
  courseSeedKey: string;
  name: string;
  /** Days from today (negative = past). */
  startOffsetDays: number;
  durationHours: number;
  required: boolean;
  status:
    | "scheduled"
    | "registration_open"
    | "completed"
    | "in_progress"
    | "cancelled";
  campus: "primary" | "sunshine";
  format: CourseDef["deliveryMethod"];
  isDrill: boolean;
  location: string;
};

const DEMO_COURSES: CourseDef[] = [
  {
    seedKey: "training_course.verbal_deesc",
    categorySystemKey: "deescalation_response",
    name: "Verbal De-escalation Workshop",
    courseCode: "DE-101",
    deliveryMethod: "in_person_classroom",
    durationMinutes: 120,
    required: true,
    renewalMonths: 12,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.conflict_recognition",
    categorySystemKey: "deescalation_response",
    name: "Conflict Recognition Lab",
    courseCode: "DE-102",
    deliveryMethod: "scenario_based",
    durationMinutes: 90,
    required: true,
    renewalMonths: 12,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.situational_awareness",
    categorySystemKey: "physical_environmental_safety",
    name: "Situational Awareness Walk-Through",
    courseCode: "PE-201",
    deliveryMethod: "practical_exercise",
    durationMinutes: 60,
    required: true,
    renewalMonths: 12,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.parking_lot",
    categorySystemKey: "physical_environmental_safety",
    name: "Parking Lot Safety Briefing",
    courseCode: "PE-202",
    deliveryMethod: "in_person_classroom",
    durationMinutes: 45,
    required: false,
    renewalMonths: 24,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.radio_comm",
    categorySystemKey: "policies_communication",
    name: "Radio Communication and Emergency Terminology",
    courseCode: "PC-301",
    deliveryMethod: "hybrid",
    durationMinutes: 90,
    required: true,
    renewalMonths: 12,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.incident_reporting",
    categorySystemKey: "policies_communication",
    name: "Incident Reporting Procedures",
    courseCode: "PC-302",
    deliveryMethod: "online",
    durationMinutes: 60,
    required: true,
    renewalMonths: 12,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.chain_of_command",
    categorySystemKey: "policies_communication",
    name: "Chain of Command Orientation",
    courseCode: "PC-303",
    deliveryMethod: "webinar",
    durationMinutes: 45,
    required: false,
    renewalMonths: null,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.defensive_policy",
    categorySystemKey: "lethal_nonlethal",
    name: "Defensive Equipment Policy Review",
    courseCode: "LN-401",
    deliveryMethod: "in_person_classroom",
    durationMinutes: 120,
    required: false,
    renewalMonths: 12,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.use_of_force_docs",
    categorySystemKey: "lethal_nonlethal",
    name: "Use-of-Force Decision Documentation",
    courseCode: "LN-402",
    deliveryMethod: "scenario_based",
    durationMinutes: 150,
    required: false,
    renewalMonths: 12,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.escape_disengage",
    categorySystemKey: "unarmed_self_defense",
    name: "Escape and Disengagement Practice",
    courseCode: "USD-501",
    deliveryMethod: "practical_exercise",
    durationMinutes: 120,
    required: false,
    renewalMonths: 12,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.personal_safety",
    categorySystemKey: "unarmed_self_defense",
    name: "Personal Safety Awareness",
    courseCode: "USD-502",
    deliveryMethod: "self_paced",
    durationMinutes: 40,
    required: false,
    renewalMonths: 24,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.fire_extinguisher",
    categorySystemKey: "building_fire_safety",
    name: "Fire Extinguisher Awareness",
    courseCode: "BF-601",
    deliveryMethod: "practical_exercise",
    durationMinutes: 60,
    required: true,
    renewalMonths: 12,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.fire_drill_proc",
    categorySystemKey: "building_fire_safety",
    name: "Fire Drill Procedures",
    courseCode: "BF-602",
    deliveryMethod: "drill",
    durationMinutes: 45,
    required: true,
    renewalMonths: 6,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.evac_routes",
    categorySystemKey: "building_evacuation",
    name: "Evacuation Routes and Assembly Areas",
    courseCode: "EV-701",
    deliveryMethod: "in_person_classroom",
    durationMinutes: 75,
    required: true,
    renewalMonths: 12,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.evac_drill",
    categorySystemKey: "building_evacuation",
    name: "Campus Evacuation Drill",
    courseCode: "EV-702",
    deliveryMethod: "drill",
    durationMinutes: 60,
    required: true,
    renewalMonths: 6,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.child_checkin",
    categorySystemKey: "child_protective",
    name: "Child Check-In and Checkout Procedures",
    courseCode: "CP-801",
    deliveryMethod: "hybrid",
    durationMinutes: 90,
    required: true,
    renewalMonths: 12,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.two_adult",
    categorySystemKey: "child_protective",
    name: "Two-Adult Supervision Practices",
    courseCode: "CP-802",
    deliveryMethod: "online",
    durationMinutes: 50,
    required: false,
    renewalMonths: 12,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.stop_bleed",
    categorySystemKey: "mass_trauma_response",
    name: "Stop-the-Bleed Documentation Course",
    courseCode: "MT-901",
    deliveryMethod: "external_provider",
    durationMinutes: 180,
    required: false,
    renewalMonths: 24,
    createsCertification: true,
    certificationType: "Stop the Bleed",
  },
  {
    seedKey: "training_course.trauma_kits",
    categorySystemKey: "mass_trauma_response",
    name: "Trauma Kit Locations and Scene Safety",
    courseCode: "MT-902",
    deliveryMethod: "practical_exercise",
    durationMinutes: 90,
    required: false,
    renewalMonths: 12,
    createsCertification: false,
    certificationType: null,
  },
  {
    seedKey: "training_course.severe_weather",
    categorySystemKey: "physical_environmental_safety",
    name: "Severe Weather Preparedness Briefing",
    courseCode: "PE-203",
    deliveryMethod: "other",
    durationMinutes: 30,
    required: false,
    renewalMonths: 12,
    createsCertification: false,
    certificationType: null,
  },
];

const DEMO_EVENTS: EventDef[] = [
  {
    seedKey: "training_event.jan_deesc",
    courseSeedKey: "training_course.verbal_deesc",
    name: "January De-escalation Workshop",
    startOffsetDays: -45,
    durationHours: 2,
    required: true,
    status: "completed",
    campus: "primary",
    format: "in_person_classroom",
    isDrill: false,
    location: "Fellowship Hall A",
  },
  {
    seedKey: "training_event.feb_radio",
    courseSeedKey: "training_course.radio_comm",
    name: "February Radio Communication Lab",
    startOffsetDays: -30,
    durationHours: 1.5,
    required: true,
    status: "completed",
    campus: "primary",
    format: "hybrid",
    isDrill: false,
    location: "Security Office",
  },
  {
    seedKey: "training_event.mar_evac",
    courseSeedKey: "training_course.evac_drill",
    name: "March Campus Evacuation Drill",
    startOffsetDays: -14,
    durationHours: 1,
    required: true,
    status: "completed",
    campus: "primary",
    format: "drill",
    isDrill: true,
    location: "Main Campus",
  },
  {
    seedKey: "training_event.apr_fire",
    courseSeedKey: "training_course.fire_drill_proc",
    name: "April Fire Drill",
    startOffsetDays: -7,
    durationHours: 0.75,
    required: true,
    status: "completed",
    campus: "sunshine",
    format: "drill",
    isDrill: true,
    location: "Sunshine Campus Lobby",
  },
  {
    seedKey: "training_event.may_child",
    courseSeedKey: "training_course.child_checkin",
    name: "May Children's Ministry Security Orientation",
    startOffsetDays: -3,
    durationHours: 1.5,
    required: true,
    status: "completed",
    campus: "primary",
    format: "hybrid",
    isDrill: false,
    location: "Children's Wing",
  },
  {
    seedKey: "training_event.jun_awareness",
    courseSeedKey: "training_course.situational_awareness",
    name: "June Situational Awareness Walk-Through",
    startOffsetDays: 3,
    durationHours: 1,
    required: false,
    status: "registration_open",
    campus: "primary",
    format: "practical_exercise",
    isDrill: false,
    location: "Parking Lot / Perimeter",
  },
  {
    seedKey: "training_event.jul_parking",
    courseSeedKey: "training_course.parking_lot",
    name: "July Parking Lot Safety Briefing",
    startOffsetDays: 10,
    durationHours: 0.75,
    required: false,
    status: "scheduled",
    campus: "sunshine",
    format: "in_person_classroom",
    isDrill: false,
    location: "Sunshine Lot B",
  },
  {
    seedKey: "training_event.aug_stopbleed",
    courseSeedKey: "training_course.stop_bleed",
    name: "August Stop-the-Bleed Provider Course",
    startOffsetDays: 21,
    durationHours: 3,
    required: false,
    status: "registration_open",
    campus: "primary",
    format: "external_provider",
    isDrill: false,
    location: "Medical Training Room",
  },
  {
    seedKey: "training_event.sep_defensive",
    courseSeedKey: "training_course.defensive_policy",
    name: "September Defensive Equipment Policy Review",
    startOffsetDays: 35,
    durationHours: 2,
    required: false,
    status: "scheduled",
    campus: "primary",
    format: "in_person_classroom",
    isDrill: false,
    location: "Conference Room 2",
  },
  {
    seedKey: "training_event.oct_weather",
    courseSeedKey: "training_course.severe_weather",
    name: "October Severe Weather Preparedness",
    startOffsetDays: 50,
    durationHours: 0.5,
    required: false,
    status: "scheduled",
    campus: "sunshine",
    format: "other",
    isDrill: false,
    location: "Sunshine Multipurpose Room",
  },
  // Future required events so compliance report can link into the calendar
  {
    seedKey: "training_event.upcoming_evac",
    courseSeedKey: "training_course.evac_drill",
    name: "Upcoming Campus Evacuation Drill",
    startOffsetDays: 14,
    durationHours: 1,
    required: true,
    status: "registration_open",
    campus: "primary",
    format: "drill",
    isDrill: true,
    location: "Main Campus",
  },
  {
    seedKey: "training_event.upcoming_child_checkin",
    courseSeedKey: "training_course.child_checkin",
    name: "Upcoming Child Check-In and Checkout Procedures",
    startOffsetDays: 18,
    durationHours: 1.5,
    required: true,
    status: "registration_open",
    campus: "primary",
    format: "hybrid",
    isDrill: false,
    location: "Children's Wing",
  },
];

/** Security-facing team members used for training participation (~15 total with owner). */
const TEAM_USER_KEYS = [
  "user.owner",
  "user.co_owner",
  "user.administrator",
  "user.security_leader",
  "user.security_member_hannibal",
  "user.security_member_angus",
  "user.extra.michael_carter",
  "user.extra.sarah_mitchell",
  "user.extra.david_thompson",
  "user.extra.rebecca_lewis",
  "user.extra.thomas_walker",
  "user.extra.emily_parker",
  "user.extra.daniel_brooks",
  "user.extra.rachel_turner",
  "user.viewer",
] as const;

/** ~33% of the 15-person team (5 members) complete required training. */
const COMPLETED_REQUIRED_USER_KEYS = [
  "user.owner",
  "user.administrator",
  "user.security_leader",
  "user.security_member_hannibal",
  "user.extra.sarah_mitchell",
] as const;

function userId(ctx: DemoSeedContext, key: string): string {
  const id = ctx.userIds.get(key);
  if (!id) throw new Error(`Missing seeded user ${key}`);
  return id;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function atLocalHour(base: Date, hour: number): Date {
  const x = new Date(base);
  x.setHours(hour, 0, 0, 0);
  return x;
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

  const { data, error } = await ctx.admin
    .from(table)
    .insert(payload)
    .select("id")
    .single();
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

export async function seedChurchTraining(ctx: DemoSeedContext): Promise<void> {
  log(ctx.summary, "Seeding Training Management demo data");

  // Settings (PK is church_id — no separate id column)
  {
    const seedKey = "training_settings.church";
    const payload = {
      church_id: ctx.churchId,
      due_soon_days: 30,
      reminder_at_assignment: true,
      reminder_days_before: [30, 14, 7, 1],
      reminder_day_of: true,
      reminder_days_after_missed: 7,
      notify_on_completion: true,
      notify_on_cancel: true,
    };
    const existingId = await getRegisteredId(ctx.admin, ctx.seedSource, seedKey);
    if (existingId) {
      const { error } = await ctx.admin
        .from("training_organization_settings")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("church_id", ctx.churchId);
      if (error) {
        throw new Error(`training_church_settings update: ${error.message}`);
      }
      await track(ctx.summary, "training_settings", "updated", "Updated training church settings");
    } else {
      const { error } = await ctx.admin
        .from("training_organization_settings")
        .upsert(payload, { onConflict: "church_id" });
      if (error) {
        throw new Error(`training_church_settings insert: ${error.message}`);
      }
      await registerSeedRecord({
        admin: ctx.admin,
        seedSource: ctx.seedSource,
        entityTable: "training_organization_settings",
        entityId: ctx.churchId,
        seedKey,
      });
      await track(ctx.summary, "training_settings", "created", "Created training church settings");
    }
  }

  // Load system categories
  const { data: systemCategories, error: catError } = await ctx.admin
    .from("training_categories")
    .select("id, system_key, name, sensitive, default_renewal_months")
    .eq("is_system", true);

  if (catError) {
    warn(
      ctx.summary,
      `Training categories unavailable (${catError.message}). Did you run migration 062? Skipping training seed.`,
    );
    return;
  }

  const categoryByKey = new Map(
    (systemCategories ?? []).map((row) => [String(row.system_key), row]),
  );

  if (categoryByKey.size === 0) {
    warn(ctx.summary, "No system training categories found. Skipping training seed.");
    return;
  }

  const instructorId = userId(ctx, "user.security_leader");
  const actorId = userId(ctx, "user.administrator");

  // Courses
  for (const course of DEMO_COURSES) {
    const category = categoryByKey.get(course.categorySystemKey);
    if (!category) {
      warn(
        ctx.summary,
        `Missing category ${course.categorySystemKey} for ${course.seedKey}`,
      );
      continue;
    }

    await upsertRow({
      ctx,
      seedKey: course.seedKey,
      table: "training_courses",
      domain: "training_courses",
      payload: {
        church_id: ctx.churchId,
        training_category_id: category.id,
        course_code: course.courseCode,
        name: course.name,
        description:
          "Demo course for First Church training documentation and readiness tracking.",
        objective:
          "Document approved security training for accountability and insurance review.",
        default_duration_minutes: course.durationMinutes,
        delivery_method: course.deliveryMethod,
        recommended_audience: "Security team and assigned volunteers",
        renewal_months: course.renewalMonths,
        required: course.required,
        creates_certification: course.createsCertification,
        certification_type: course.certificationType,
        is_system: false,
        active: true,
        created_by: actorId,
        updated_by: actorId,
      },
      label: `course ${course.courseCode}`,
    });
  }

  // Events
  const now = new Date();
  for (const event of DEMO_EVENTS) {
    const courseId = ctx.ids.get(event.courseSeedKey);
    const courseDef = DEMO_COURSES.find((c) => c.seedKey === event.courseSeedKey);
    const category = courseDef
      ? categoryByKey.get(courseDef.categorySystemKey)
      : null;
    if (!courseId || !courseDef || !category) {
      warn(ctx.summary, `Skipping event ${event.seedKey}; course not seeded`);
      continue;
    }

    const start = atLocalHour(addDays(now, event.startOffsetDays), 9);
    const end = new Date(start.getTime() + event.durationHours * 60 * 60 * 1000);
    const campusId =
      event.campus === "primary" ? ctx.primaryCampusId : ctx.sunshineCampusId;

    await upsertRow({
      ctx,
      seedKey: event.seedKey,
      table: "training_events",
      domain: "training_events",
      payload: {
        church_id: ctx.churchId,
        campus_id: campusId,
        training_course_id: courseId,
        training_category_id: category.id,
        name: event.name,
        description: `Demo training event: ${event.name}`,
        objective: courseDef.name,
        format: event.format,
        location: event.location,
        room: event.isDrill ? "Campus-wide" : "Training room",
        instructor_name: "John Smith",
        instructor_user_id: instructorId,
        provider_name: event.format === "external_provider" ? "County EMS" : "First Church Security",
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        time_zone: "America/Los_Angeles",
        duration_minutes: Math.round(event.durationHours * 60),
        maximum_participants: 40,
        required: event.required,
        status: event.status,
        allow_self_registration: event.status === "registration_open",
        is_drill: event.isDrill,
        drill_scenario: event.isDrill
          ? "Simulated facility emergency response and accountability."
          : null,
        drill_objectives: event.isDrill
          ? "Verify routes, communication, and assembly accountability."
          : null,
        drill_overall_result:
          event.isDrill && event.status === "completed"
            ? "successful_with_improvements"
            : null,
        creates_certification: courseDef.createsCertification,
        certification_type: courseDef.certificationType,
        created_by: actorId,
        updated_by: actorId,
      },
      label: `event ${event.name}`,
    });
  }

  // Requirements for required courses (5 of the 10 event courses are required;
  // also mark half of courses with required=true via DEMO_COURSES)
  const requiredCourseKeys = DEMO_COURSES.filter((c) => c.required).map(
    (c) => c.seedKey,
  );
  // Cap at ~half of event set for "50% required trainings" narrative:
  // create requirements tied to the 5 required completed/upcoming event courses.
  const requiredEventCourseKeys = [
    ...new Set(
      DEMO_EVENTS.filter((e) => e.required).map((e) => e.courseSeedKey),
    ),
  ];

  for (const courseKey of requiredEventCourseKeys) {
    const courseId = ctx.ids.get(courseKey);
    const courseDef = DEMO_COURSES.find((c) => c.seedKey === courseKey);
    const category = courseDef
      ? categoryByKey.get(courseDef.categorySystemKey)
      : null;
    if (!courseId || !courseDef || !category) continue;

    await upsertRow({
      ctx,
      seedKey: `training_requirement.${courseKey}`,
      table: "training_requirements",
      domain: "training_requirements",
      payload: {
        church_id: ctx.churchId,
        name: `Required: ${courseDef.name}`,
        training_course_id: courseId,
        training_category_id: category.id,
        assignment_type: "all_security",
        effective_at: addDays(now, -90).toISOString().slice(0, 10),
        due_at: addDays(now, 30).toISOString().slice(0, 10),
        renewal_months: courseDef.renewalMonths ?? 12,
        grace_period_days: 14,
        minimum_hours: (courseDef.durationMinutes / 60).toFixed(2),
        exemption_allowed: false,
        active: true,
        notes: "Demo required training for all security members.",
        created_by: actorId,
        updated_by: actorId,
      },
      label: `requirement ${courseDef.courseCode}`,
    });
  }

  // Participants + completions for required completed events
  const completedRequiredEvents = DEMO_EVENTS.filter(
    (e) => e.required && e.status === "completed",
  );
  const completedUserSet = new Set<string>(COMPLETED_REQUIRED_USER_KEYS);

  for (const event of completedRequiredEvents) {
    const eventId = ctx.ids.get(event.seedKey);
    const courseId = ctx.ids.get(event.courseSeedKey);
    const courseDef = DEMO_COURSES.find((c) => c.seedKey === event.courseSeedKey);
    const category = courseDef
      ? categoryByKey.get(courseDef.categorySystemKey)
      : null;
    if (!eventId || !courseId || !courseDef || !category) continue;

    const eventStart = atLocalHour(addDays(now, event.startOffsetDays), 9);
    const campusId =
      event.campus === "primary" ? ctx.primaryCampusId : ctx.sunshineCampusId;
    const hours = event.durationHours;

    for (const teamKey of TEAM_USER_KEYS) {
      const uid = userId(ctx, teamKey);
      const didComplete = completedUserSet.has(teamKey);
      const participantSeedKey = `training_participant.${event.seedKey}.${teamKey}`;

      const participant = await upsertRow({
        ctx,
        seedKey: participantSeedKey,
        table: "training_participants",
        domain: "training_participants",
        payload: {
          church_id: ctx.churchId,
          training_event_id: eventId,
          user_id: uid,
          enrollment_status: "assigned",
          attendance_status: didComplete ? "present" : "absent",
          completion_status: didComplete ? "completed" : "not_started",
          registered_at: addDays(eventStart, -7).toISOString(),
          attended_at: didComplete ? eventStart.toISOString() : null,
          completed_at: didComplete
            ? new Date(eventStart.getTime() + hours * 3600 * 1000).toISOString()
            : null,
          score: didComplete ? 95 : null,
          passed: didComplete ? true : null,
          training_hours: didComplete ? hours : null,
          recorded_by: actorId,
          recorded_at: eventStart.toISOString(),
          updated_by: actorId,
        },
        label: `participant ${teamKey} @ ${event.name}`,
      });

      if (!didComplete) continue;

      const completedAt = new Date(
        eventStart.getTime() + hours * 3600 * 1000,
      ).toISOString();
      const renewalMonths = courseDef.renewalMonths ?? 12;
      const renewalDue = addDays(eventStart, renewalMonths * 30);

      await upsertRow({
        ctx,
        seedKey: `training_completion.${event.seedKey}.${teamKey}`,
        table: "training_completion_records",
        domain: "training_completions",
        payload: {
          church_id: ctx.churchId,
          campus_id: campusId,
          user_id: uid,
          training_event_id: eventId,
          training_course_id: courseId,
          training_category_id: category.id,
          training_participant_id: participant.id,
          course_name: courseDef.name,
          category_name: category.name,
          event_name: event.name,
          instructor_name: "John Smith",
          provider_name: "First Church Security",
          training_date: eventStart.toISOString().slice(0, 10),
          completed_at: completedAt,
          training_hours: hours,
          score: 95,
          passed: true,
          completion_status: "completed",
          renewal_due_at: renewalDue.toISOString().slice(0, 10),
          source_type: "event",
          sensitive: Boolean(category.sensitive),
          notes: "Demo completion record",
          recorded_by: actorId,
        },
        label: `completion ${teamKey} / ${courseDef.courseCode}`,
      });
    }
  }

  // Upcoming optional events: invite team, no completions yet
  for (const event of DEMO_EVENTS.filter((e) => e.status !== "completed")) {
    const eventId = ctx.ids.get(event.seedKey);
    if (!eventId) continue;
    for (const teamKey of TEAM_USER_KEYS.slice(0, 8)) {
      const uid = userId(ctx, teamKey);
      await upsertRow({
        ctx,
        seedKey: `training_participant.${event.seedKey}.${teamKey}`,
        table: "training_participants",
        domain: "training_participants",
        payload: {
          church_id: ctx.churchId,
          training_event_id: eventId,
          user_id: uid,
          enrollment_status:
            event.status === "registration_open" ? "invited" : "assigned",
          attendance_status: "not_recorded",
          completion_status: "not_started",
          registered_at: null,
          updated_by: actorId,
        },
        label: `upcoming participant ${teamKey}`,
      });
    }
  }

  // One external training record (verified) for variety in reports
  const externalUser = userId(ctx, "user.security_member_angus");
  const traumaCategory = categoryByKey.get("mass_trauma_response");
  if (traumaCategory) {
    const external = await upsertRow({
      ctx,
      seedKey: "training_external.angus_cpr",
      table: "training_external_records",
      domain: "training_external",
      payload: {
        church_id: ctx.churchId,
        user_id: externalUser,
        training_category_id: traumaCategory.id,
        course_name: "Community CPR / AED Provider",
        category_name: traumaCategory.name,
        provider_name: "American Red Cross",
        instructor_name: "County Fire Dept.",
        location: "City Training Center",
        completion_date: addDays(now, -60).toISOString().slice(0, 10),
        training_hours: 4,
        score: 100,
        renewal_due_at: addDays(now, 305).toISOString().slice(0, 10),
        verification_status: "verified",
        verified_by: actorId,
        verified_at: addDays(now, -55).toISOString(),
        notes: "External provider certificate on file.",
        created_by: actorId,
        updated_by: actorId,
      },
      label: "external CPR training (Angus)",
    });

    await upsertRow({
      ctx,
      seedKey: "training_completion.external.angus_cpr",
      table: "training_completion_records",
      domain: "training_completions",
      payload: {
        church_id: ctx.churchId,
        campus_id: ctx.primaryCampusId,
        user_id: externalUser,
        training_category_id: traumaCategory.id,
        course_name: "Community CPR / AED Provider",
        category_name: traumaCategory.name,
        event_name: null,
        instructor_name: "County Fire Dept.",
        provider_name: "American Red Cross",
        training_date: addDays(now, -60).toISOString().slice(0, 10),
        completed_at: addDays(now, -60).toISOString(),
        training_hours: 4,
        score: 100,
        passed: true,
        completion_status: "completed",
        renewal_due_at: addDays(now, 305).toISOString().slice(0, 10),
        source_type: "external",
        sensitive: false,
        verified_by: actorId,
        verified_at: addDays(now, -55).toISOString(),
        notes: "Verified external training",
        recorded_by: actorId,
      },
      label: "external completion CPR",
    });

    await ctx.admin
      .from("training_external_records")
      .update({ completion_record_id: ctx.ids.get("training_completion.external.angus_cpr") })
      .eq("id", external.id);
  }

  const requiredEventCount = DEMO_EVENTS.filter((e) => e.required).length;
  log(
    ctx.summary,
    `Training seed summary: ${DEMO_COURSES.length} courses, ${DEMO_EVENTS.length} events (${requiredEventCount} required), ${COMPLETED_REQUIRED_USER_KEYS.length}/${TEAM_USER_KEYS.length} team members completed required events (~${Math.round((COMPLETED_REQUIRED_USER_KEYS.length / TEAM_USER_KEYS.length) * 100)}%)`,
  );

  // Silence unused if tree-shaken differently
  void requiredCourseKeys;
}
