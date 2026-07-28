import { describe, it, expect } from "vitest";
import {
  buildCompletionRecordPayload,
  shouldCreateCompletion,
} from "@/lib/training/renewal";

describe("shouldCreateCompletion", () => {
  it("does not create completion for cancelled events", () => {
    expect(shouldCreateCompletion("cancelled", "completed")).toBe(false);
    expect(shouldCreateCompletion("cancelled", "passed")).toBe(false);
  });

  it("does not create completion when participant completion is cancelled", () => {
    expect(shouldCreateCompletion("completed", "cancelled")).toBe(false);
  });

  it("creates completion for completed or passed statuses on active events", () => {
    expect(shouldCreateCompletion("completed", "completed")).toBe(true);
    expect(shouldCreateCompletion("scheduled", "passed")).toBe(true);
    expect(shouldCreateCompletion("in_progress", "failed")).toBe(false);
  });
});

describe("buildCompletionRecordPayload", () => {
  it("builds denormalized completion history shape", () => {
    const payload = buildCompletionRecordPayload({
      churchId: "church-1",
      userId: "user-1",
      eventId: "event-1",
      courseId: "course-1",
      categoryId: "category-1",
      participantId: "participant-1",
      courseName: "Verbal de-escalation",
      categoryName: "De-escalation and Response",
      eventName: "January refresher",
      instructorName: "Trainer A",
      completedAt: "2026-03-01T18:00:00.000Z",
      completionStatus: "completed",
      renewalDueAt: "2027-03-01",
      sensitive: false,
      recordedBy: "admin-1",
    });

    expect(payload).toMatchObject({
      church_id: "church-1",
      user_id: "user-1",
      training_event_id: "event-1",
      training_course_id: "course-1",
      training_category_id: "category-1",
      training_participant_id: "participant-1",
      course_name: "Verbal de-escalation",
      category_name: "De-escalation and Response",
      event_name: "January refresher",
      instructor_name: "Trainer A",
      completion_status: "completed",
      renewal_due_at: "2027-03-01",
      source_type: "event",
      sensitive: false,
      recorded_by: "admin-1",
    });
  });
});
