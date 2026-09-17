/** Collapse near-duplicate course names (e.g. system topic + church workshop). */
export function normalizeTrainingCourseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(
      /\b(workshop|lab|briefing|course|practice|documentation|provider|orientation|review|training|procedures?|awareness|basics?)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function courseDedupeRank(course: {
  is_system?: boolean;
  required?: boolean;
  name: string;
}): number {
  let rank = 0;
  if (!course.is_system) rank += 100;
  if (course.required) rank += 10;
  rank += Math.min(course.name.length, 40);
  return rank;
}

/**
 * Prefer church/custom courses over overlapping system starter topics.
 * Dedupes within each category by normalized name.
 */
export function dedupeTrainingCoursesByCategory<
  T extends {
    id: string;
    name: string;
    training_category_id?: string | null;
    is_system?: boolean;
    required?: boolean;
  },
>(courses: T[]): T[] {
  const byCategory = new Map<string, T[]>();
  for (const course of courses) {
    const key = course.training_category_id ?? "__none__";
    const list = byCategory.get(key) ?? [];
    list.push(course);
    byCategory.set(key, list);
  }

  const result: T[] = [];
  for (const list of byCategory.values()) {
    const winners = new Map<string, T>();
    for (const course of list) {
      const norm = normalizeTrainingCourseName(course.name) || course.id;
      const existing = winners.get(norm);
      if (
        !existing ||
        courseDedupeRank(course) > courseDedupeRank(existing)
      ) {
        winners.set(norm, course);
      }
    }
    result.push(
      ...[...winners.values()].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }
  return result;
}
