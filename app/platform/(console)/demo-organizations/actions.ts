"use server";

import { revalidatePath } from "next/cache";
import { AuditAction } from "@/lib/audit/actions";
import { writePlatformAdminAction } from "@/lib/platform/audit";
import {
  findOrganizationBySeedSource,
  getDemoOrganizationById,
  requireDemoOrganization,
} from "@/lib/platform/demo-snapshots/guardrails";
import {
  acquireRestoreLock,
  releaseRestoreLock,
} from "@/lib/platform/demo-snapshots/locks";
import { requirePlatformPermission } from "@/lib/platform/auth";
import { requirePlatformAdminClient } from "@/lib/platform/queries";
import { DEMO_SEED_SOURCE } from "@/lib/demo-seed/constants";

export type DemoOrgActionState = {
  error?: string;
  success?: string;
};

function readBool(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1";
}

export async function markFirstChurchAsDemoAction(
  _prev: DemoOrgActionState,
  formData: FormData,
): Promise<DemoOrgActionState> {
  try {
    const ctx = await requirePlatformPermission("demo_organizations.manage");
    const label =
      String(formData.get("demo_environment_label") || "production-demo").trim() ||
      "production-demo";

    const found = await findOrganizationBySeedSource(DEMO_SEED_SOURCE);
    if (!found) {
      return {
        error:
          "First Church demo was not found by seed_source. Run Demo seed first.",
      };
    }

    const admin = requirePlatformAdminClient();
    const { error } = await admin
      .from("organizations")
      .update({
        is_demo_organization: true,
        demo_restore_enabled: true,
        demo_restore_locked: false,
        demo_maintenance_mode: false,
        demo_environment_label: label.slice(0, 80),
      })
      .eq("id", found.id);

    if (error) return { error: error.message };

    await writePlatformAdminAction({
      platformAccountId: ctx.account.id,
      actorUserId: ctx.user.id,
      action: AuditAction.DEMO_ORGANIZATION_MARKED_DEMO,
      targetType: "organization",
      targetId: found.id,
      organizationId: found.id,
      metadata: { seed_source: DEMO_SEED_SOURCE, label },
    });

    revalidatePath("/platform/demo-organizations");
    revalidatePath(`/platform/demo-organizations/${found.id}`);
    return { success: `Marked “${found.name}” as a demo church.` };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to mark demo church.",
    };
  }
}

export async function updateDemoOrganizationFlagsAction(
  _prev: DemoOrgActionState,
  formData: FormData,
): Promise<DemoOrgActionState> {
  try {
    const ctx = await requirePlatformPermission("demo_organizations.manage");
    const organizationId = String(formData.get("organization_id") || "").trim();
    if (!organizationId) return { error: "Organization id is required." };

    const org = await requireDemoOrganization(organizationId);
    const restoreEnabled = readBool(formData, "demo_restore_enabled");
    const restoreLocked = readBool(formData, "demo_restore_locked");
    const maintenance = readBool(formData, "demo_maintenance_mode");
    const labelRaw = String(formData.get("demo_environment_label") || "").trim();
    const label = labelRaw ? labelRaw.slice(0, 80) : null;

    const admin = requirePlatformAdminClient();
    const { error } = await admin
      .from("organizations")
      .update({
        demo_restore_enabled: restoreEnabled,
        demo_restore_locked: restoreLocked,
        demo_maintenance_mode: maintenance,
        demo_environment_label: label,
      })
      .eq("id", org.id)
      .eq("is_demo_organization", true);

    if (error) return { error: error.message };

    if (org.demo_restore_enabled !== restoreEnabled) {
      await writePlatformAdminAction({
        platformAccountId: ctx.account.id,
        actorUserId: ctx.user.id,
        action: restoreEnabled
          ? AuditAction.DEMO_ORGANIZATION_RESTORE_ENABLED
          : AuditAction.DEMO_ORGANIZATION_RESTORE_DISABLED,
        targetType: "organization",
        targetId: org.id,
        organizationId: org.id,
      });
    }

    if (org.demo_restore_locked !== restoreLocked) {
      await writePlatformAdminAction({
        platformAccountId: ctx.account.id,
        actorUserId: ctx.user.id,
        action: restoreLocked
          ? AuditAction.DEMO_ORGANIZATION_LOCKED
          : AuditAction.DEMO_ORGANIZATION_UNLOCKED,
        targetType: "organization",
        targetId: org.id,
        organizationId: org.id,
      });
    }

    if (org.demo_maintenance_mode !== maintenance) {
      await writePlatformAdminAction({
        platformAccountId: ctx.account.id,
        actorUserId: ctx.user.id,
        action: maintenance
          ? AuditAction.DEMO_ORGANIZATION_MAINTENANCE_ON
          : AuditAction.DEMO_ORGANIZATION_MAINTENANCE_OFF,
        targetType: "organization",
        targetId: org.id,
        organizationId: org.id,
      });
    }

    revalidatePath("/platform/demo-organizations");
    revalidatePath(`/platform/demo-organizations/${org.id}`);
    return { success: "Demo church flags updated." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to update flags.",
    };
  }
}

/** Test lock acquire/release for Phase 3 validation (manage permission). */
export async function testDemoRestoreLockAction(
  _prev: DemoOrgActionState,
  formData: FormData,
): Promise<DemoOrgActionState> {
  try {
    const ctx = await requirePlatformPermission("demo_organizations.manage");
    const organizationId = String(formData.get("organization_id") || "").trim();
    const mode = String(formData.get("mode") || "acquire").trim();
    const org = await getDemoOrganizationById(organizationId);
    if (!org?.is_demo_organization) {
      return { error: "Not a demo organization." };
    }

    if (mode === "release") {
      await releaseRestoreLock({ organizationId: org.id });
      await writePlatformAdminAction({
        platformAccountId: ctx.account.id,
        actorUserId: ctx.user.id,
        action: AuditAction.DEMO_ORGANIZATION_UNLOCKED,
        targetType: "organization",
        targetId: org.id,
        organizationId: org.id,
        reason: "Phase 3 lock test release",
      });
      revalidatePath(`/platform/demo-organizations/${org.id}`);
      return { success: "Restore lock released; maintenance cleared." };
    }

    await acquireRestoreLock({
      organizationId: org.id,
      platformAccountId: ctx.account.id,
      ttlMinutes: 15,
    });
    await writePlatformAdminAction({
      platformAccountId: ctx.account.id,
      actorUserId: ctx.user.id,
      action: AuditAction.DEMO_ORGANIZATION_LOCKED,
      targetType: "organization",
      targetId: org.id,
      organizationId: org.id,
      reason: "Phase 3 lock test acquire",
    });
    revalidatePath(`/platform/demo-organizations/${org.id}`);
    return { success: "Restore lock acquired; maintenance mode on." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Lock operation failed.",
    };
  }
}
