import type { MembershipRole } from "@/lib/church/types";
import type {
  TrainingCompletionRecord,
  TrainingCourse,
  TrainingRequirement,
} from "@/lib/training/types";

/** Roles expected to complete church required security training. */
const REQUIRED_TRAINING_ROLES: MembershipRole[] = [
  "owner",
  "co_owner",
  "administrator",
  "security_leader",
  "security_member",
];

export function isRequiredTrainingAudienceRole(
  role: MembershipRole,
): boolean {
  return REQUIRED_TRAINING_ROLES.includes(role);
}

export function collectRequiredCourseIds(params: {
  requirements: TrainingRequirement[];
  courses: TrainingCourse[];
}): Set<string> {
  const ids = new Set<string>();
  for (const req of params.requirements) {
    if (req.active && req.training_course_id) {
      ids.add(req.training_course_id);
    }
  }
  for (const course of params.courses) {
    if (course.required && course.id) ids.add(course.id);
  }
  return ids;
}

function isSatisfyingCompletion(
  status: TrainingCompletionRecord["completion_status"],
): boolean {
  return (
    status === "completed" || status === "passed" || status === "exempt"
  );
}

/** Audience members who still need a satisfying completion for one course. */
export function userIdsMissingCourseCompletion(params: {
  teamMembers: Array<{ userId: string; role?: MembershipRole }>;
  courseId: string;
  completions: TrainingCompletionRecord[];
}): Set<string> {
  const completed = new Set<string>();
  for (const record of params.completions) {
    if (record.training_course_id !== params.courseId) continue;
    if (!isSatisfyingCompletion(record.completion_status)) continue;
    completed.add(record.user_id);
  }

  const missing = new Set<string>();
  for (const member of params.teamMembers) {
    if (member.role && !isRequiredTrainingAudienceRole(member.role)) {
      continue;
    }
    if (!completed.has(member.userId)) {
      missing.add(member.userId);
    }
  }
  return missing;
}

/** Unique members missing at least one required course completion. */
export function countMembersMissingRequiredTraining(params: {
  teamMembers: Array<{ userId: string; role?: MembershipRole }>;
  requiredCourseIds: Set<string>;
  completions: TrainingCompletionRecord[];
}): number {
  if (params.requiredCourseIds.size === 0) return 0;

  const completedByUser = new Map<string, Set<string>>();
  for (const record of params.completions) {
    if (!record.training_course_id) continue;
    if (!params.requiredCourseIds.has(record.training_course_id)) continue;
    if (!isSatisfyingCompletion(record.completion_status)) continue;
    const set = completedByUser.get(record.user_id) ?? new Set<string>();
    set.add(record.training_course_id);
    completedByUser.set(record.user_id, set);
  }

  let missing = 0;
  for (const member of params.teamMembers) {
    if (member.role && !isRequiredTrainingAudienceRole(member.role)) {
      continue;
    }
    const completed = completedByUser.get(member.userId) ?? new Set<string>();
    for (const courseId of params.requiredCourseIds) {
      if (!completed.has(courseId)) {
        missing += 1;
        break;
      }
    }
  }
  return missing;
}
