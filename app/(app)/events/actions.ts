"use server";

import { revalidatePath } from "next/cache";
import { getOperationalChurchContext } from "@/lib/church/auth";
import type { ActionState } from "@/lib/church/types";

export async function acknowledgeEvent(
  eventId: string,
): Promise<ActionState> {
  try {
    const { supabase, user, profile } = await getOperationalChurchContext();

    const { data: event, error: fetchError } = await supabase
      .from("events")
      .select("id, church_id, acknowledgment_status")
      .eq("id", eventId)
      .maybeSingle();

    if (fetchError || !event || event.church_id !== profile.church_id) {
      return { error: "Event not found." };
    }

    if (event.acknowledgment_status === "acknowledged") {
      return { success: true };
    }

    const { error } = await supabase
      .from("events")
      .update({
        acknowledgment_status: "acknowledged",
        acknowledged_by: user.id,
        acknowledged_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .eq("church_id", profile.church_id);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/events");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to acknowledge event.",
    };
  }
}

export async function createTestEvent(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { supabase, profile, canManageCertifications } =
      await getOperationalChurchContext();

    if (!canManageCertifications) {
      return {
        error: "Only administrators and security leaders can create events.",
      };
    }

    const device = String(formData.get("device") ?? "").trim();
    const event_type = String(formData.get("event_type") ?? "other");
    const severity = String(formData.get("severity") ?? "low");
    const location = String(formData.get("location") ?? "").trim();
    const event_timestamp = String(formData.get("event_timestamp") ?? "");

    if (!device || !location || !event_timestamp) {
      return { error: "Device, location, and timestamp are required." };
    }

    const { error } = await supabase.from("events").insert({
      church_id: profile.church_id,
      device,
      event_type,
      severity,
      location,
      event_timestamp: new Date(event_timestamp).toISOString(),
      acknowledgment_status: "unacknowledged",
    });

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/events");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to create event.",
    };
  }
}
