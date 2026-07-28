/**
 * Training Management foundation self-check (no database required).
 * Run: npx --yes tsx lib/training/foundation.selfcheck.ts
 */
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";
import { EXPECTED_PLAN_ENTITLEMENTS } from "@/lib/subscriptions/expected-matrix";
import { PLAN_KEYS } from "@/lib/subscriptions/plan-keys";
import { TRAINING_UPGRADE_MESSAGE } from "@/lib/training/constants";
import {
  canManageEvents,
  canRecordAttendance,
  canViewSensitive,
  canViewTraining,
} from "@/lib/training/permissions";
import {
  buildCompletionRecordPayload,
  classifyRenewalStatus,
  computeRenewalDueAt,
  shouldCreateCompletion,
} from "@/lib/training/renewal";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// Feature key + tier matrix
assert(
  FEATURE_KEYS.TRAINING_MANAGEMENT === "training.management.enabled",
  "training feature key",
);
assert(
  EXPECTED_PLAN_ENTITLEMENTS[PLAN_KEYS.SERVANT_STANDARD][
    FEATURE_KEYS.TRAINING_MANAGEMENT
  ] === false,
  "servant_standard cannot access training",
);
assert(
  EXPECTED_PLAN_ENTITLEMENTS[PLAN_KEYS.STEWARD_PRO][
    FEATURE_KEYS.TRAINING_MANAGEMENT
  ] === true,
  "steward_pro can access training",
);
assert(
  EXPECTED_PLAN_ENTITLEMENTS[PLAN_KEYS.SHEPHERD_PLUS][
    FEATURE_KEYS.TRAINING_MANAGEMENT
  ] === true,
  "shepherd_plus can access training",
);
assert(
  EXPECTED_PLAN_ENTITLEMENTS[PLAN_KEYS.OMNI_ENTERPRISE][
    FEATURE_KEYS.TRAINING_MANAGEMENT
  ] === true,
  "omni_enterprise can access training",
);

assert(
  TRAINING_UPGRADE_MESSAGE.includes("Steward Pro") &&
    TRAINING_UPGRADE_MESSAGE.includes("Shepherd Plus") &&
    TRAINING_UPGRADE_MESSAGE.includes("Omni Enterprise"),
  "upgrade message names eligible plans",
);

// Role gates
assert(canViewTraining("security_member"), "security_member can view");
assert(!canManageEvents("security_member"), "member cannot manage events");
assert(canManageEvents("security_leader"), "leader can manage events");
assert(canRecordAttendance("security_leader"), "leader can record attendance");
assert(!canViewSensitive("security_leader"), "leader cannot view sensitive");
assert(canViewSensitive("administrator"), "admin can view sensitive");

// Renewal calculations
assert(computeRenewalDueAt("2026-01-15T12:00:00.000Z", null) === null, "no renewal");
assert(
  computeRenewalDueAt("2026-01-15T12:00:00.000Z", 12) === "2027-01-15",
  "annual renewal",
);

const now = new Date("2026-06-01T12:00:00.000Z");
assert(
  classifyRenewalStatus({
    dueAt: "2026-01-01",
    dueSoonDays: 30,
    now,
    exempt: true,
  }) === "exempt",
  "exempt status",
);
assert(
  classifyRenewalStatus({ dueAt: "2026-05-01", dueSoonDays: 30, now }) ===
    "overdue",
  "overdue status",
);
assert(
  classifyRenewalStatus({ dueAt: "2026-06-20", dueSoonDays: 30, now }) ===
    "due_soon",
  "due soon status",
);
assert(
  classifyRenewalStatus({ dueAt: "2026-06-01", dueSoonDays: 30, now }) ===
    "due",
  "due status",
);
assert(
  classifyRenewalStatus({ dueAt: "2026-12-01", dueSoonDays: 30, now }) ===
    "current",
  "current status",
);

// Completion rules
assert(
  shouldCreateCompletion("cancelled", "completed") === false,
  "cancelled events do not create completions",
);
assert(
  shouldCreateCompletion("completed", "cancelled") === false,
  "cancelled completion status skipped",
);
assert(
  shouldCreateCompletion("completed", "passed") === true,
  "passed creates completion",
);
assert(
  shouldCreateCompletion("in_progress", "completed") === true,
  "completed creates history",
);

const payload = buildCompletionRecordPayload({
  churchId: "church-1",
  userId: "user-1",
  courseName: "Radio Communication",
  categoryName: "Policies and Communication",
  eventName: "January Workshop",
  completionStatus: "completed",
  trainingHours: 2,
  renewalDueAt: "2027-01-15",
  sensitive: false,
});
assert(payload.church_id === "church-1", "completion church scoped");
assert(payload.course_name === "Radio Communication", "denormalized course name");
assert(payload.renewal_due_at === "2027-01-15", "renewal stored");
assert(payload.source_type === "event", "default source event");

console.log("Training foundation self-check passed.");
